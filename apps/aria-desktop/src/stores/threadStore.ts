import { create } from "zustand";
import type { AriaChatMessage, AriaChatPendingApproval, AriaChatPendingQuestion } from "@aria/access-client";

export interface ThreadState {
  connected: boolean;
  sessionId: string | null;
  sessionStatus: string;
  modelName: string;
  messages: AriaChatMessage[];
  streamingText: string;
  isStreaming: boolean;
  pendingApproval: AriaChatPendingApproval | null;
  pendingQuestion: AriaChatPendingQuestion | null;
  lastError: string | null;
}

export interface ThreadStoreState extends ThreadState {
  setConnected: (connected: boolean) => void;
  setSessionId: (sessionId: string | null) => void;
  setSessionStatus: (status: string) => void;
  setModelName: (name: string) => void;
  setMessages: (messages: AriaChatMessage[]) => void;
  addMessage: (message: AriaChatMessage) => void;
  setStreamingText: (text: string) => void;
  setIsStreaming: (streaming: boolean) => void;
  setPendingApproval: (approval: AriaChatPendingApproval | null) => void;
  setPendingQuestion: (question: AriaChatPendingQuestion | null) => void;
  setLastError: (error: string | null) => void;
  syncFromState: (state: ThreadState) => void;
}

export const useThreadStore = create<ThreadStoreState>((set) => ({
  connected: false,
  sessionId: null,
  sessionStatus: "disconnected",
  modelName: "",
  messages: [],
  streamingText: "",
  isStreaming: false,
  pendingApproval: null,
  pendingQuestion: null,
  lastError: null,

  setConnected: (connected) => set({ connected }),
  setSessionId: (sessionId) => set({ sessionId }),
  setSessionStatus: (sessionStatus) => set({ sessionStatus }),
  setModelName: (modelName) => set({ modelName }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setStreamingText: (streamingText) => set({ streamingText }),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
  setPendingApproval: (pendingApproval) => set({ pendingApproval }),
  setPendingQuestion: (pendingQuestion) => set({ pendingQuestion }),
  setLastError: (lastError) => set({ lastError }),

  syncFromState: (state) =>
    set({
      connected: state.connected,
      sessionId: state.sessionId,
      sessionStatus: state.sessionStatus,
      modelName: state.modelName,
      messages: state.messages,
      streamingText: state.streamingText,
      isStreaming: state.isStreaming,
      pendingApproval: state.pendingApproval,
      pendingQuestion: state.pendingQuestion,
      lastError: state.lastError,
    }),
}));
