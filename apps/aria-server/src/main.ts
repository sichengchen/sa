import { RUNTIME_NAME } from "@aria/server";
import { runAriaServerDaemonHost } from "./index.js";

runAriaServerDaemonHost().catch((error) => {
  console.error(`${RUNTIME_NAME} failed to start:`, error);
  process.exit(1);
});
