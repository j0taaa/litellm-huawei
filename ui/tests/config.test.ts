import { describe, expect, test } from "vitest";
import { loadConfig } from "../src/server/config";

const baseEnv = {
  LITELLM_MASTER_KEY: "sk-test",
  UI_SESSION_SECRET: "secret"
};

describe("loadConfig", () => {
  test("uses a larger default body limit for image test requests", () => {
    const config = loadConfig(baseEnv);

    expect(config.bodyLimitBytes).toBe(25 * 1024 * 1024);
  });

  test("allows the UI request body limit to be configured in MB", () => {
    const config = loadConfig({ ...baseEnv, UI_BODY_LIMIT_MB: "40" });

    expect(config.bodyLimitBytes).toBe(40 * 1024 * 1024);
  });

  test("falls back to the default body limit for invalid values", () => {
    const config = loadConfig({ ...baseEnv, UI_BODY_LIMIT_MB: "-1" });

    expect(config.bodyLimitBytes).toBe(25 * 1024 * 1024);
  });
});
