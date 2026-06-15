import crypto from "node:crypto";

export type ServerConfig = {
  port: number;
  litellmBaseUrl: string;
  litellmMasterKey: string;
  databaseUrl: string;
  sessionSecret: string;
  secureCookies: boolean;
  nodeEnv: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const sessionSecret = env.UI_SESSION_SECRET || env.LITELLM_SALT_KEY || "";
  if (!env.LITELLM_MASTER_KEY) {
    throw new Error("LITELLM_MASTER_KEY is required");
  }
  if (!sessionSecret) {
    throw new Error("UI_SESSION_SECRET or LITELLM_SALT_KEY is required");
  }
  return {
    port: Number(env.UI_PORT || env.PORT || 3001),
    litellmBaseUrl: (env.LITELLM_BASE_URL || "http://litellm:4000").replace(/\/$/, ""),
    litellmMasterKey: env.LITELLM_MASTER_KEY,
    databaseUrl: env.UI_DATABASE_URL || env.DATABASE_URL || "",
    sessionSecret: crypto.createHash("sha256").update(sessionSecret).digest("hex"),
    secureCookies: env.UI_SECURE_COOKIES === "true",
    nodeEnv: env.NODE_ENV || "development"
  };
}
