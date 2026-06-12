import { describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { signSession, verifyLiteLLMToken, verifySession } from "../src/server/session";

describe("session helpers", () => {
  it("round-trips UI sessions", async () => {
    const token = await signSession(
      { userId: "admin", userRole: "proxy_admin", userEmail: null, litellmKey: "sk-test" },
      "session-secret"
    );
    await expect(verifySession(token, "session-secret")).resolves.toMatchObject({
      userId: "admin",
      litellmKey: "sk-test"
    });
  });

  it("verifies LiteLLM UI JWT payloads", async () => {
    const token = await new SignJWT({
      user_id: "user-1",
      user_email: "user@example.com",
      user_role: "internal_user",
      key: "sk-litellm"
    }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("master"));

    await expect(verifyLiteLLMToken(token, "master")).resolves.toEqual({
      userId: "user-1",
      userEmail: "user@example.com",
      userRole: "internal_user",
      litellmKey: "sk-litellm"
    });
  });
});

