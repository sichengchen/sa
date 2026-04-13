import { RUNTIME_NAME } from "@aria/server";
import { runAriaServerHost } from "./index.js";

runAriaServerHost().catch((error) => {
  console.error(`${RUNTIME_NAME} failed to start:`, error);
  process.exit(1);
});
