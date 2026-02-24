import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { request } from "node:http";
import { CliOAuthProvider } from "../../extensions/oauth.js";
import {
  createTempWorkspace,
  type TempWorkspace,
} from "../helpers/temp-workspace.js";

function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, body }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

describe("CliOAuthProvider", () => {
  let ws: TempWorkspace;
  let provider: CliOAuthProvider;

  beforeEach(async () => {
    ws = await createTempWorkspace();
    provider = new CliOAuthProvider("test-server", "https://example.com/mcp", {
      baseDir: ws.dir,
    });
  });

  afterEach(async () => {
    await ws.cleanup();
  });

  // --- Token persistence ---

  describe("tokens", () => {
    it("returns undefined when no tokens saved", async () => {
      expect(await provider.tokens()).toBeUndefined();
    });

    it("saves and loads tokens", async () => {
      const tokens = {
        access_token: "access-123",
        token_type: "Bearer" as const,
        refresh_token: "refresh-456",
      };

      await provider.saveTokens(tokens);
      const loaded = await provider.tokens();

      expect(loaded).toEqual(tokens);
    });

    it("overwrites existing tokens", async () => {
      await provider.saveTokens({
        access_token: "old",
        token_type: "Bearer" as const,
      });
      await provider.saveTokens({
        access_token: "new",
        token_type: "Bearer" as const,
      });

      const loaded = await provider.tokens();
      expect(loaded?.access_token).toBe("new");
    });
  });

  // --- Client information persistence ---

  describe("clientInformation", () => {
    it("returns undefined when no client info saved", async () => {
      expect(await provider.clientInformation()).toBeUndefined();
    });

    it("saves and loads client information", async () => {
      const info = {
        client_id: "client-abc",
        client_secret: "secret-xyz",
      };

      await provider.saveClientInformation(info);
      const loaded = await provider.clientInformation();

      expect(loaded).toEqual(info);
    });
  });

  // --- Code verifier persistence ---

  describe("codeVerifier", () => {
    it("saves and loads code verifier", async () => {
      await provider.saveCodeVerifier("verifier-string-123");
      const loaded = await provider.codeVerifier();

      expect(loaded).toBe("verifier-string-123");
    });

    it("trims whitespace from loaded verifier", async () => {
      await provider.saveCodeVerifier("verifier-with-newline\n");
      const loaded = await provider.codeVerifier();

      expect(loaded).toBe("verifier-with-newline");
    });
  });

  // --- Computed properties ---

  describe("clientMetadata", () => {
    it("returns correct metadata", () => {
      const meta = provider.clientMetadata;

      expect(meta.client_name).toBe("WellGrow CLI");
      expect(meta.token_endpoint_auth_method).toBe("none");
      expect(meta.grant_types).toContain("authorization_code");
      expect(meta.grant_types).toContain("refresh_token");
      expect(meta.response_types).toContain("code");
    });
  });

  describe("state", () => {
    it("returns a UUID string", async () => {
      const state = await provider.state();
      expect(state).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("returns unique values each call", async () => {
      const a = await provider.state();
      const b = await provider.state();
      expect(a).not.toBe(b);
    });
  });

  // --- Credential invalidation ---

  describe("invalidateCredentials", () => {
    async function saveAll() {
      await provider.saveTokens({
        access_token: "a",
        token_type: "Bearer" as const,
      });
      await provider.saveClientInformation({ client_id: "c" });
      await provider.saveCodeVerifier("v");
    }

    it("removes only tokens when scope is 'tokens'", async () => {
      await saveAll();
      await provider.invalidateCredentials("tokens");

      expect(await provider.tokens()).toBeUndefined();
      expect(await provider.clientInformation()).toBeDefined();
      expect(await provider.codeVerifier()).toBe("v");
    });

    it("removes only client when scope is 'client'", async () => {
      await saveAll();
      await provider.invalidateCredentials("client");

      expect(await provider.tokens()).toBeDefined();
      expect(await provider.clientInformation()).toBeUndefined();
      expect(await provider.codeVerifier()).toBe("v");
    });

    it("removes only verifier when scope is 'verifier'", async () => {
      await saveAll();
      await provider.invalidateCredentials("verifier");

      expect(await provider.tokens()).toBeDefined();
      expect(await provider.clientInformation()).toBeDefined();
      await expect(provider.codeVerifier()).rejects.toThrow();
    });

    it("removes all credentials when scope is 'all'", async () => {
      await saveAll();
      await provider.invalidateCredentials("all");

      expect(await provider.tokens()).toBeUndefined();
      expect(await provider.clientInformation()).toBeUndefined();
      await expect(provider.codeVerifier()).rejects.toThrow();
    });

    it("is safe to call when no credentials exist", async () => {
      await expect(
        provider.invalidateCredentials("all"),
      ).resolves.toBeUndefined();
    });
  });

  // --- Directory isolation ---

  describe("directory isolation", () => {
    it("uses baseDir/serverName for storage", async () => {
      await provider.saveTokens({
        access_token: "test",
        token_type: "Bearer" as const,
      });

      const filePath = join(ws.dir, "test-server", "tokens.json");
      const raw = await readFile(filePath, "utf-8");
      expect(JSON.parse(raw).access_token).toBe("test");
    });

    it("isolates different server names", async () => {
      const provider2 = new CliOAuthProvider("other-server", "https://other.com", {
        baseDir: ws.dir,
      });

      await provider.saveTokens({
        access_token: "server-a",
        token_type: "Bearer" as const,
      });
      await provider2.saveTokens({
        access_token: "server-b",
        token_type: "Bearer" as const,
      });

      const a = await provider.tokens();
      const b = await provider2.tokens();
      expect(a?.access_token).toBe("server-a");
      expect(b?.access_token).toBe("server-b");
    });
  });

  // --- Callback server ---

  describe("callback server", () => {
    afterEach(async () => {
      // Force cleanup if test fails mid-way
      await provider.invalidateCredentials("all").catch(() => {});
    });

    it("starts and sets redirectUrl with dynamic port", async () => {
      await provider.startCallbackServer();

      expect(provider.redirectUrl).toMatch(
        /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
      );

      // Calling again is idempotent
      const url1 = provider.redirectUrl;
      await provider.startCallbackServer();
      expect(provider.redirectUrl).toBe(url1);
    });

    it("responds with 404 for non-callback paths", async () => {
      await provider.startCallbackServer();
      const baseUrl = provider.redirectUrl.replace("/callback", "");
      const { status } = await httpGet(`${baseUrl}/other`);
      expect(status).toBe(404);
    });

    it("responds with success HTML when code is received", async () => {
      await provider.startCallbackServer();
      const { status, body } = await httpGet(
        `${provider.redirectUrl}?code=test-auth-code`,
      );

      expect(status).toBe(200);
      expect(body).toContain("認証完了");
    });

    it("responds with error HTML when error param is present", async () => {
      await provider.startCallbackServer();
      const { status, body } = await httpGet(
        `${provider.redirectUrl}?error=access_denied`,
      );

      expect(status).toBe(200);
      expect(body).toContain("認証エラー");
      expect(body).toContain("access_denied");
    });

    it("responds with 400 when no code or error", async () => {
      await provider.startCallbackServer();
      const { status, body } = await httpGet(provider.redirectUrl);

      expect(status).toBe(400);
      expect(body).toContain("認証コードが見つかりません");
    });
  });
});
