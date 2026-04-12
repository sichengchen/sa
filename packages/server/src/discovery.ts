import { join } from "node:path";
import { getRuntimeHome } from "@aria/server/brand";

export interface RuntimeDiscoveryPaths {
  runtimeHome: string;
  pidFile: string;
  urlFile: string;
  logFile: string;
  restartMarkerFile: string;
}

export function getRuntimeDiscoveryPaths(runtimeHome = getRuntimeHome()): RuntimeDiscoveryPaths {
  return {
    runtimeHome,
    pidFile: join(runtimeHome, "engine.pid"),
    urlFile: join(runtimeHome, "engine.url"),
    logFile: join(runtimeHome, "engine.log"),
    restartMarkerFile: join(runtimeHome, "engine.restart"),
  };
}
