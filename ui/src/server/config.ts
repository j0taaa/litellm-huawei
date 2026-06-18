import crypto from "node:crypto";

export type ServerConfig = {
  port: number;
  bodyLimitBytes: number;
  litellmBaseUrl: string;
  litellmMasterKey: string;
  databaseUrl: string;
  sessionSecret: string;
  secureCookies: boolean;
  nodeEnv: string;
  catalogUrl: string;
  generatedDir: string;
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
    bodyLimitBytes: megabytesToBytes(env.UI_BODY_LIMIT_MB, 25),
    litellmBaseUrl: (env.LITELLM_BASE_URL || "http://litellm:4000").replace(/\/$/, ""),
    litellmMasterKey: env.LITELLM_MASTER_KEY,
    databaseUrl: env.UI_DATABASE_URL || env.DATABASE_URL || "",
    sessionSecret: crypto.createHash("sha256").update(sessionSecret).digest("hex"),
    secureCookies: env.UI_SECURE_COOKIES === "true",
    nodeEnv: env.NODE_ENV || "development",
    catalogUrl: env.CATALOG_URL || "https://catalog.hwctools.site/models",
    generatedDir: env.HUAWEI_GENERATED_DIR || "/app/generated"
  };
}

function megabytesToBytes(value: string | undefined, fallback: number): number {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback * 1024 * 1024;
  return Math.floor(parsed * 1024 * 1024);
}
