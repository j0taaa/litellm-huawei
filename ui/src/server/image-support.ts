import pg from "pg";
import { z } from "zod";

const { Pool } = pg;

const defaultExtractionPrompt = "Describe all visible text, objects, layout, people, charts, and important context in the image. Be factual and detailed. Do not answer the user's task; only extract image information.";

export const imageSupportInputSchema = z.object({
  enabled: z.boolean().default(false),
  openrouter_api_key: z.string().optional(),
  clear_api_key: z.boolean().optional().default(false),
  vision_model: z.string().min(1).default("openai/gpt-4o-mini"),
  extraction_prompt: z.string().min(1).default(defaultExtractionPrompt),
  max_tokens: z.number().int().min(1).max(8192).default(1200)
});

export type ImageSupportInput = z.infer<typeof imageSupportInputSchema>;

type ImageSupportRow = {
  id: string;
  enabled: boolean;
  openrouter_api_key: string;
  vision_model: string;
  extraction_prompt: string;
  max_tokens: number;
  updated_at: Date;
};

export class ImageSupportStore {
  private pool: pg.Pool | null;

  constructor(databaseUrl: string) {
    this.pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
  }

  async ready() {
    await this.requirePool().query(`
      CREATE TABLE IF NOT EXISTS image_support_settings (
        id TEXT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        openrouter_api_key TEXT NOT NULL DEFAULT '',
        vision_model TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
        extraction_prompt TEXT NOT NULL DEFAULT '',
        max_tokens INTEGER NOT NULL DEFAULT 1200,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async get() {
    const row = await this.row();
    return serialize(row);
  }

  async update(input: ImageSupportInput) {
    const existing = await this.row();
    const apiKey = input.clear_api_key
      ? ""
      : input.openrouter_api_key && input.openrouter_api_key.trim()
        ? input.openrouter_api_key.trim()
        : existing?.openrouter_api_key || "";
    const row = await this.requirePool().query<ImageSupportRow>(
      `INSERT INTO image_support_settings (id, enabled, openrouter_api_key, vision_model, extraction_prompt, max_tokens, updated_at)
       VALUES ('global', $1, $2, $3, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         openrouter_api_key = EXCLUDED.openrouter_api_key,
         vision_model = EXCLUDED.vision_model,
         extraction_prompt = EXCLUDED.extraction_prompt,
         max_tokens = EXCLUDED.max_tokens,
         updated_at = now()
       RETURNING *`,
      [input.enabled, apiKey, input.vision_model, input.extraction_prompt, input.max_tokens]
    );
    return serialize(row.rows[0]);
  }

  private async row() {
    const result = await this.requirePool().query<ImageSupportRow>("SELECT * FROM image_support_settings WHERE id = 'global'");
    return result.rows[0] || null;
  }

  private requirePool() {
    if (!this.pool) throw Object.assign(new Error("ui_database_url_required"), { statusCode: 500 });
    return this.pool;
  }
}

function serialize(row: ImageSupportRow | null) {
  return {
    enabled: row?.enabled || false,
    openrouter_api_key_present: Boolean(row?.openrouter_api_key),
    openrouter_api_key_masked: row?.openrouter_api_key ? mask(row.openrouter_api_key) : "",
    vision_model: row?.vision_model || "openai/gpt-4o-mini",
    extraction_prompt: row?.extraction_prompt || defaultExtractionPrompt,
    max_tokens: row?.max_tokens || 1200,
    updated_at: row?.updated_at || null
  };
}

function mask(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : "configured";
}
