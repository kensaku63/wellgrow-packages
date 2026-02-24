import { useState, useRef, useEffect, useCallback } from "react";
import { randomUUID } from "node:crypto";
import type { LanguageModel } from "ai";
import {
  createSession,
  switchAgent as switchAgentSession,
  type Session,
} from "../core/session.js";
import {
  createSessionRecorder,
  type SessionRecorder,
} from "../core/history.js";
import { getModel, getModelDisplayName } from "../ai/providers.js";
import { listAgents } from "../agents/loader.js";
import type { AgentSummary } from "../agents/types.js";
import {
  registerShutdownHandler,
  setActiveSession,
} from "../signals.js";
import { initLogger } from "../logging.js";
import { markdownReady } from "../ui/markdown.js";
import type { WellGrowConfig } from "../config/types.js";
import type { Mode } from "../tools/pipeline.js";

export interface ChatSessionState {
  session: Session | null;
  recorder: SessionRecorder | null;
  isReady: boolean;
  currentModelName: string;
  currentAgentName: string;
  currentAgentIcon: string;
  agents: AgentSummary[];
  currentModelRef: React.MutableRefObject<LanguageModel | null>;
  messageCountRef: React.MutableRefObject<number>;
  switchModel: (
    modelId: string,
  ) => { success: boolean; message: string };
  switchAgent: (
    agentName: string,
  ) => Promise<{ success: boolean; message: string }>;
  resetSession: () => Promise<void>;
}

export interface UseChatSessionOptions {
  agentName?: string;
  modelOverride?: string;
  config: WellGrowConfig;
  mode?: Mode;
  verbose?: boolean;
}

export function useChatSession({
  agentName: initialAgentName,
  modelOverride,
  config,
  mode,
  verbose,
}: UseChatSessionOptions): ChatSessionState {
  const [isReady, setIsReady] = useState(false);
  const [currentModelName, setCurrentModelName] = useState("");
  const [currentAgentName, setCurrentAgentName] = useState("");
  const [currentAgentIcon, setCurrentAgentIcon] = useState("🤖");
  const [agents, setAgents] = useState<AgentSummary[]>([]);

  const sessionRef = useRef<Session | null>(null);
  const recorderRef = useRef<SessionRecorder | null>(null);
  const messageCountRef = useRef(0);
  const currentModelRef = useRef<LanguageModel | null>(null);
  const currentAgentIdRef = useRef(initialAgentName ?? config.default.agent);

  useEffect(() => {
    let cancelled = false;
    const agentId = initialAgentName ?? config.default.agent;
    currentAgentIdRef.current = agentId;

    async function initialize(): Promise<void> {
      const [s, , agentList] = await Promise.all([
        createSession({
          agentName: agentId,
          modelOverride,
          modeOverride: mode,
        }),
        markdownReady,
        listAgents(),
      ]);

      if (cancelled) return;

      if (verbose) {
        s.ctx.logFile = await initLogger(
          randomUUID(),
          config.logging.log_dir,
        );
      }

      const recorder = await createSessionRecorder(
        getModelDisplayName(s.agent.modelId),
        agentId,
      );

      if (cancelled) return;

      sessionRef.current = s;
      recorderRef.current = recorder;
      currentModelRef.current = s.agent.model;
      setCurrentModelName(getModelDisplayName(s.agent.modelId));
      setCurrentAgentName(s.agent.name);
      setCurrentAgentIcon(s.agent.icon);
      setAgents(agentList);
      setActiveSession(s.ctx);
      registerShutdownHandler(async () => {
        if (recorderRef.current) {
          await recorderRef.current.finalize(messageCountRef.current);
        }
      });
      setIsReady(true);
    }

    void initialize().catch((error) => {
      if (cancelled) return;
      process.stderr.write(
        `セッション初期化エラー: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [initialAgentName, config, modelOverride, mode, verbose]);

  const switchModel = useCallback(
    (modelId: string): { success: boolean; message: string } => {
      try {
        const newModel = getModel(modelId, config);
        currentModelRef.current = newModel;
        setCurrentModelName(getModelDisplayName(modelId));
        if (sessionRef.current) {
          sessionRef.current.agent.model = newModel;
          (sessionRef.current.agent as { modelId: string }).modelId = modelId;
        }
        return {
          success: true,
          message: `モデルを ${modelId} に切り替えました。`,
        };
      } catch (error) {
        return {
          success: false,
          message: `モデル切り替えエラー: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
    [config],
  );

  const switchAgent = useCallback(
    async (
      newAgentName: string,
    ): Promise<{ success: boolean; message: string }> => {
      const session = sessionRef.current;
      if (!session) {
        return { success: false, message: "セッションが初期化されていません。" };
      }

      try {
        if (recorderRef.current) {
          await recorderRef.current.finalize(messageCountRef.current);
        }

        await switchAgentSession(session, newAgentName);
        currentAgentIdRef.current = newAgentName;

        currentModelRef.current = session.agent.model;
        setCurrentModelName(getModelDisplayName(session.agent.modelId));
        setCurrentAgentName(session.agent.name);
        setCurrentAgentIcon(session.agent.icon);
        setActiveSession(session.ctx);

        recorderRef.current = await createSessionRecorder(
          getModelDisplayName(session.agent.modelId),
          newAgentName,
        );
        messageCountRef.current = 0;

        return {
          success: true,
          message: `エージェントを ${session.agent.icon} ${session.agent.name} に切り替えました。`,
        };
      } catch (error) {
        return {
          success: false,
          message: `エージェント切り替えエラー: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
    [],
  );

  const resetSession = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;

    if (recorderRef.current) {
      await recorderRef.current.finalize(messageCountRef.current);
    }

    const currentAgentId = currentAgentIdRef.current;
    const newSession = await createSession({
      agentName: currentAgentId,
      modelOverride,
      modeOverride: mode,
    });
    if (verbose) {
      newSession.ctx.logFile = await initLogger(
        randomUUID(),
        config.logging.log_dir,
      );
    }
    sessionRef.current = newSession;
    currentModelRef.current = newSession.agent.model;
    setCurrentModelName(getModelDisplayName(newSession.agent.modelId));
    setCurrentAgentName(newSession.agent.name);
    setCurrentAgentIcon(newSession.agent.icon);
    setActiveSession(newSession.ctx);
    recorderRef.current = await createSessionRecorder(
      getModelDisplayName(newSession.agent.modelId),
      currentAgentId,
    );
    messageCountRef.current = 0;
  }, [verbose, config, modelOverride, mode]);

  return {
    session: sessionRef.current,
    recorder: recorderRef.current,
    isReady,
    currentModelName,
    currentAgentName,
    currentAgentIcon,
    agents,
    currentModelRef,
    messageCountRef,
    switchModel,
    switchAgent,
    resetSession,
  };
}
