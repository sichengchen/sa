import { afterEach, describe, expect, test } from "bun:test";
import {
  getMissingCredentials,
  getMissingSocketModeCredentials,
  hasSlackCredentials,
  hasSlackSocketModeCredentials,
} from "../packages/connectors-im/src/slack/config.js";

afterEach(() => {
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_SIGNING_SECRET;
  delete process.env.SLACK_APP_TOKEN;
});

describe("Slack connector credential helpers", () => {
  test("distinguishes webhook credentials from Socket Mode credentials", () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_SIGNING_SECRET = "secret";

    expect(hasSlackCredentials()).toBe(true);
    expect(getMissingCredentials()).toEqual([]);
    expect(hasSlackSocketModeCredentials()).toBe(false);
    expect(getMissingSocketModeCredentials()).toEqual(["SLACK_APP_TOKEN"]);
  });

  test("reports Socket Mode as ready when the app token is present", () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_SIGNING_SECRET = "secret";
    process.env.SLACK_APP_TOKEN = "xapp-test";

    expect(hasSlackCredentials()).toBe(true);
    expect(hasSlackSocketModeCredentials()).toBe(true);
    expect(getMissingSocketModeCredentials()).toEqual([]);
  });
});
