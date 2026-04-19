import { app, BrowserWindow, ipcMain } from "electron";
import { DesktopAriaService } from "./desktop-aria-service.js";
import { DesktopProjectsService } from "./desktop-projects-service.js";
import { ariaDesktopChannels, type AriaDesktopRuntimeInfo } from "../shared/api.js";
import { importLocalProjectThroughDesktopService } from "./desktop-ipc-handlers.js";

let registered = false;

function getRuntimeInfo(): AriaDesktopRuntimeInfo {
  return {
    productName: app.getName(),
    platform: process.platform,
    versions: {
      chrome: process.versions.chrome ?? "",
      electron: process.versions.electron ?? "",
      node: process.versions.node ?? "",
    },
  };
}

export function registerDesktopIpc(
  projectsService: DesktopProjectsService,
  ariaService: DesktopAriaService,
): void {
  if (registered) {
    return;
  }

  ipcMain.handle(ariaDesktopChannels.ping, () => "pong");
  ipcMain.handle(ariaDesktopChannels.getRuntimeInfo, () => getRuntimeInfo());
  ipcMain.handle(ariaDesktopChannels.getProjectShellState, () =>
    projectsService.getProjectShellState(),
  );
  ipcMain.handle(ariaDesktopChannels.getAriaShellState, () => ariaService.getAriaShellState());
  ipcMain.handle(ariaDesktopChannels.importLocalProjectFromDialog, () =>
    importLocalProjectThroughDesktopService(projectsService, BrowserWindow),
  );
  ipcMain.handle(ariaDesktopChannels.createThread, (_event, projectId: string) =>
    projectsService.createThread(projectId),
  );
  ipcMain.handle(ariaDesktopChannels.createAriaChatSession, () =>
    ariaService.createAriaChatSession(),
  );
  ipcMain.handle(ariaDesktopChannels.selectProject, (_event, projectId: string) =>
    projectsService.selectProject(projectId),
  );
  ipcMain.handle(ariaDesktopChannels.selectThread, (_event, projectId: string, threadId: string) =>
    projectsService.selectThread(projectId, threadId),
  );
  ipcMain.handle(ariaDesktopChannels.selectAriaChatSession, (_event, sessionId: string) =>
    ariaService.selectAriaChatSession(sessionId),
  );
  ipcMain.handle(ariaDesktopChannels.selectAriaScreen, (_event, screen) =>
    ariaService.selectAriaScreen(screen),
  );
  ipcMain.handle(
    ariaDesktopChannels.setProjectCollapsed,
    (_event, projectId: string, collapsed: boolean) =>
      projectsService.setProjectCollapsed(projectId, collapsed),
  );
  ipcMain.handle(ariaDesktopChannels.searchAriaChatSessions, (_event, query: string) =>
    ariaService.searchAriaChatSessions(query),
  );
  ipcMain.handle(ariaDesktopChannels.sendAriaChatMessage, (_event, message: string) =>
    ariaService.sendAriaChatMessage(message),
  );
  ipcMain.handle(ariaDesktopChannels.stopAriaChatSession, () => ariaService.stopAriaChatSession());
  ipcMain.handle(
    ariaDesktopChannels.approveAriaChatToolCall,
    (_event, toolCallId: string, approved: boolean) =>
      ariaService.approveAriaChatToolCall(toolCallId, approved),
  );
  ipcMain.handle(
    ariaDesktopChannels.acceptAriaChatToolCallForSession,
    (_event, toolCallId: string) => ariaService.acceptAriaChatToolCallForSession(toolCallId),
  );
  ipcMain.handle(
    ariaDesktopChannels.answerAriaChatQuestion,
    (_event, questionId: string, answer: string) =>
      ariaService.answerAriaChatQuestion(questionId, answer),
  );
  ipcMain.handle(ariaDesktopChannels.refreshAutomations, () => ariaService.refreshAutomations());
  ipcMain.handle(ariaDesktopChannels.selectAutomationTask, (_event, taskId: string) =>
    ariaService.selectAutomationTask(taskId),
  );
  ipcMain.handle(ariaDesktopChannels.searchConnectorSessions, (_event, query: string) =>
    ariaService.searchConnectorSessions(query),
  );
  ipcMain.handle(ariaDesktopChannels.selectConnectorSession, (_event, sessionId: string) =>
    ariaService.selectConnectorSession(sessionId),
  );
  ipcMain.handle(ariaDesktopChannels.sendConnectorMessage, (_event, message: string) =>
    ariaService.sendConnectorMessage(message),
  );
  ipcMain.handle(ariaDesktopChannels.stopConnectorSession, () =>
    ariaService.stopConnectorSession(),
  );
  ipcMain.handle(
    ariaDesktopChannels.approveConnectorToolCall,
    (_event, toolCallId: string, approved: boolean) =>
      ariaService.approveConnectorToolCall(toolCallId, approved),
  );
  ipcMain.handle(
    ariaDesktopChannels.acceptConnectorToolCallForSession,
    (_event, toolCallId: string) => ariaService.acceptConnectorToolCallForSession(toolCallId),
  );
  ipcMain.handle(
    ariaDesktopChannels.answerConnectorQuestion,
    (_event, questionId: string, answer: string) =>
      ariaService.answerConnectorQuestion(questionId, answer),
  );

  registered = true;
}
