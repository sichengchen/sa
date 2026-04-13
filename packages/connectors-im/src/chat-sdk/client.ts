import { createLocalAccessClient } from "@aria/access-client";

/** Create a tRPC client for Chat SDK connectors */
export function createChatSDKClient() {
  return createLocalAccessClient();
}
