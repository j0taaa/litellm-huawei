import { jwtVerify, SignJWT } from "jose";
import type { SessionUser } from "../shared/types.js";

export type UiSession = SessionUser & {
  litellmKey: string;
};

export async function signSession(session: UiSession, secret: string): Promise<string> {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(secret));
}

export async function verifySession(token: string, secret: string): Promise<UiSession> {
  const result = await jwtVerify(token, new TextEncoder().encode(secret));
  const payload = result.payload as Record<string, unknown>;
  if (typeof payload.userId !== "string" || typeof payload.userRole !== "string" || typeof payload.litellmKey !== "string") {
    throw new Error("invalid session");
  }
  return {
    userId: payload.userId,
    userEmail: typeof payload.userEmail === "string" ? payload.userEmail : null,
    userRole: payload.userRole,
    litellmKey: payload.litellmKey
  };
}

export async function verifyLiteLLMToken(token: string, masterKey: string): Promise<UiSession> {
  const result = await jwtVerify(token, new TextEncoder().encode(masterKey));
  const payload = result.payload as Record<string, unknown>;
  if (typeof payload.key !== "string" || typeof payload.user_id !== "string") {
    throw new Error("invalid LiteLLM login token");
  }
  return {
    userId: payload.user_id,
    userEmail: typeof payload.user_email === "string" ? payload.user_email : null,
    userRole: typeof payload.user_role === "string" ? payload.user_role : "unknown",
    litellmKey: payload.key
  };
}

