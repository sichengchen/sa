import { contextBridge, ipcRenderer } from "electron";
import { ariaDesktopChannels, type AriaDesktopApi } from "../shared/api.js";

const ariaDesktopApi: AriaDesktopApi = {
  acceptAriaChatToolCallForSession: (toolCallId) =>
    ipcRenderer.invoke(ariaDesktopChannels.acceptAriaChatToolCallForSession, toolCallId),
  acceptConnectorToolCallForSession: (toolCallId) =>
    ipcRenderer.invoke(ariaDesktopChannels.acceptConnectorToolCallForSession, toolCallId),
  answerAriaChatQuestion: (questionId, answer) =>
    ipcRenderer.invoke(ariaDesktopChannels.answerAriaChatQuestion, questionId, answer),
  answerConnectorQuestion: (questionId, answer) =>
    ipcRenderer.invoke(ariaDesktopChannels.answerConnectorQuestion, questionId, answer),
  approveAriaChatToolCall: (toolCallId, approved) =>
    ipcRenderer.invoke(ariaDesktopChannels.approveAriaChatToolCall, toolCallId, approved),
  approveConnectorToolCall: (toolCallId, approved) =>
    ipcRenderer.invoke(ariaDesktopChannels.approveConnectorToolCall, toolCallId, approved),
  createAriaChatSession: () => ipcRenderer.invoke(ariaDesktopChannels.createAriaChatSession),
  createThread: (projectId) => ipcRenderer.invoke(ariaDesktopChannels.createThread, projectId),
  getAriaShellState: () => ipcRenderer.invoke(ariaDesktopChannels.getAriaShellState),
  getProjectShellState: () => ipcRenderer.invoke(ariaDesktopChannels.getProjectShellState),
  ping: () => ipcRenderer.invoke(ariaDesktopChannels.ping),
  getRuntimeInfo: () => ipcRenderer.invoke(ariaDesktopChannels.getRuntimeInfo),
  importLocalProjectFromDialog: () =>
    ipcRenderer.invoke(ariaDesktopChannels.importLocalProjectFromDialog),
  refreshAutomations: () => ipcRenderer.invoke(ariaDesktopChannels.refreshAutomations),
  searchAriaChatSessions: (query) =>
    ipcRenderer.invoke(ariaDesktopChannels.searchAriaChatSessions, query),
  searchConnectorSessions: (query) =>
    ipcRenderer.invoke(ariaDesktopChannels.searchConnectorSessions, query),
  selectProject: (projectId) => ipcRenderer.invoke(ariaDesktopChannels.selectProject, projectId),
  selectThread: (projectId, threadId) =>
    ipcRenderer.invoke(ariaDesktopChannels.selectThread, projectId, threadId),
  selectAriaChatSession: (sessionId) =>
    ipcRenderer.invoke(ariaDesktopChannels.selectAriaChatSession, sessionId),
  selectAriaScreen: (screen) => ipcRenderer.invoke(ariaDesktopChannels.selectAriaScreen, screen),
  selectAutomationTask: (taskId) =>
    ipcRenderer.invoke(ariaDesktopChannels.selectAutomationTask, taskId),
  selectConnectorSession: (sessionId) =>
    ipcRenderer.invoke(ariaDesktopChannels.selectConnectorSession, sessionId),
  sendAriaChatMessage: (message) =>
    ipcRenderer.invoke(ariaDesktopChannels.sendAriaChatMessage, message),
  sendConnectorMessage: (message) =>
    ipcRenderer.invoke(ariaDesktopChannels.sendConnectorMessage, message),
  setProjectCollapsed: (projectId, collapsed) =>
    ipcRenderer.invoke(ariaDesktopChannels.setProjectCollapsed, projectId, collapsed),
  stopAriaChatSession: () => ipcRenderer.invoke(ariaDesktopChannels.stopAriaChatSession),
  stopConnectorSession: () => ipcRenderer.invoke(ariaDesktopChannels.stopConnectorSession),
};

contextBridge.exposeInMainWorld("ariaDesktop", ariaDesktopApi);
