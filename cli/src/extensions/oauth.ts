import { createServer, type Server } from "node:http";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type {
  OAuthClientProvider,
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthTokens,
} from "@ai-sdk/mcp";

const OAUTH_DIR = join(homedir(), ".wellgrow", "oauth");

function serverDir(serverName: string): string {
  return join(OAUTH_DIR, serverName);
}

async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return undefined;
  }
}

async function writeJson(path: string, data: unknown): Promise<void> {
  const dir = join(path, "..");
  await mkdir(dir, { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}

export class CliOAuthProvider implements OAuthClientProvider {
  private server: Server | null = null;
  private port = 0;
  private receivedCode: string | null = null;
  private codePromise: Promise<string> | null = null;
  private resolveCode: ((code: string) => void) | null = null;
  private readonly dir: string;

  constructor(
    private readonly serverName: string,
    private readonly serverUrl: string,
    options?: { baseDir?: string },
  ) {
    this.dir = options?.baseDir
      ? join(options.baseDir, serverName)
      : serverDir(serverName);
  }

  // --- Token persistence ---

  async tokens(): Promise<OAuthTokens | undefined> {
    return readJson<OAuthTokens>(join(this.dir, "tokens.json"));
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await writeJson(join(this.dir, "tokens.json"), tokens);
  }

  // --- Client registration persistence ---

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    return readJson<OAuthClientInformation>(join(this.dir, "client.json"));
  }

  async saveClientInformation(info: OAuthClientInformation): Promise<void> {
    await writeJson(join(this.dir, "client.json"), info);
  }

  // --- PKCE code verifier ---

  async codeVerifier(): Promise<string> {
    const data = await readFile(join(this.dir, "verifier.txt"), "utf-8");
    return data.trim();
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, "verifier.txt"), verifier, "utf-8");
  }

  // --- Redirect URL & client metadata ---

  get redirectUrl(): string {
    return `http://127.0.0.1:${this.port}/callback`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      client_name: "WellGrow CLI",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    };
  }

  // --- State ---

  async state(): Promise<string> {
    return randomUUID();
  }

  // --- Credential invalidation ---

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier",
  ): Promise<void> {
    const targets: string[] = [];
    if (scope === "all" || scope === "tokens")
      targets.push(join(this.dir, "tokens.json"));
    if (scope === "all" || scope === "client")
      targets.push(join(this.dir, "client.json"));
    if (scope === "all" || scope === "verifier")
      targets.push(join(this.dir, "verifier.txt"));

    await Promise.allSettled(targets.map((t) => rm(t, { force: true })));
  }

  // --- Callback server & browser redirect ---

  async startCallbackServer(): Promise<void> {
    if (this.server) return;

    this.codePromise = new Promise<string>((resolve) => {
      this.resolveCode = resolve;
    });

    this.server = createServer((req, res) => {
      if (!req.url?.startsWith("/callback")) {
        res.writeHead(404);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://127.0.0.1:${this.port}`);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<html><body><h2>認証エラー</h2><p>${error}</p><p>ターミナルに戻ってください。</p></body></html>`,
        );
        this.resolveCode?.("");
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<html><body><h2>認証完了</h2><p>このタブを閉じて、ターミナルに戻ってください。</p></body></html>",
        );
        this.resolveCode?.(code);
      } else {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<html><body><h2>エラー</h2><p>認証コードが見つかりません。</p></body></html>",
        );
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(0, "127.0.0.1", () => resolve());
      this.server!.on("error", reject);
    });

    const addr = this.server.address();
    if (addr && typeof addr === "object") {
      this.port = addr.port;
    }
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    const url = authorizationUrl.toString();
    process.stderr.write(`[OAuth] ブラウザで認証してください: ${url}\n`);

    try {
      const open = (await import("open")).default;
      await open(url);
    } catch {
      process.stderr.write(
        "[OAuth] ブラウザを自動で開けませんでした。上記の URL を手動でブラウザに貼り付けてください。\n",
      );
    }

    if (this.codePromise) {
      const code = await this.codePromise;
      if (code) {
        this.receivedCode = code;
      }
    }

    this.cleanup();
  }

  getReceivedAuthCode(): string | null {
    return this.receivedCode;
  }

  private cleanup(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.resolveCode = null;
    this.codePromise = null;
  }
}
