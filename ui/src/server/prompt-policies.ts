import { randomUUID } from "node:crypto";
import pg from "pg";
import { z } from "zod";
import { LiteLLMClient } from "./litellm.js";

const { Pool } = pg;

export const ruleSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  pattern: z.string().min(1),
  flags: z.array(z.enum(["ignore_case", "multiline", "dotall"])).default([]),
  action: z.enum(["block", "redact", "append"]),
  replacement: z.string().optional(),
  append_text: z.string().optional()
}).superRefine((value, ctx) => {
  if (value.action === "redact" && value.replacement === "") {
    ctx.addIssue({ code: "custom", message: "replacement cannot be empty", path: ["replacement"] });
  }
  if (value.action === "append" && !value.append_text) {
    ctx.addIssue({ code: "custom", message: "append text is required", path: ["append_text"] });
  }
});

export const policyInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  enabled: z.boolean().default(true),
  rules: z.array(ruleSchema).default([])
});

export const assignmentInputSchema = z.object({
  assignments: z.array(z.object({
    target_type: z.enum(["key", "team"]),
    target_id: z.string().min(1)
  })).default([])
});

export type PromptPolicyInput = z.infer<typeof policyInputSchema>;
export type PromptPolicyAssignment = z.infer<typeof assignmentInputSchema>["assignments"][number];

type PromptPolicyRow = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rules: unknown;
  created_at: Date;
  updated_at: Date;
};

type AssignmentRow = {
  policy_id: string;
  target_type: "key" | "team";
  target_id: string;
};

type LiteLLMKey = {
  token?: string;
  key_name?: string;
  key_alias?: string;
  team_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export class PromptPolicyStore {
  private pool: pg.Pool | null;

  constructor(databaseUrl: string, private litellm: LiteLLMClient) {
    this.pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
  }

  async ready() {
    const pool = this.requirePool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prompt_policies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        rules JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prompt_policy_assignments (
        policy_id TEXT NOT NULL REFERENCES prompt_policies(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK (target_type IN ('key', 'team')),
        target_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (policy_id, target_type, target_id)
      )
    `);
  }

  async list() {
    const [policies, assignments] = await Promise.all([this.policyRows(), this.assignmentRows()]);
    return policies.map((policy) => serializePolicy(policy, assignments.filter((assignment) => assignment.policy_id === policy.id)));
  }

  async create(input: PromptPolicyInput, litellmKey: string) {
    const policy = normalizePolicyInput(input);
    const id = `policy-${randomUUID()}`;
    const row = await this.requirePool().query<PromptPolicyRow>(
      `INSERT INTO prompt_policies (id, name, description, enabled, rules)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [id, policy.name, policy.description, policy.enabled, JSON.stringify(policy.rules)]
    );
    await this.syncAllEffectivePolicies(litellmKey);
    return serializePolicy(row.rows[0], []);
  }

  async update(id: string, input: PromptPolicyInput, litellmKey: string) {
    const policy = normalizePolicyInput(input);
    const row = await this.requirePool().query<PromptPolicyRow>(
      `UPDATE prompt_policies
       SET name = $2, description = $3, enabled = $4, rules = $5::jsonb, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, policy.name, policy.description, policy.enabled, JSON.stringify(policy.rules)]
    );
    if (!row.rows[0]) throw Object.assign(new Error("policy_not_found"), { statusCode: 404 });
    await this.syncAllEffectivePolicies(litellmKey);
    const assignments = await this.assignmentRows();
    return serializePolicy(row.rows[0], assignments.filter((assignment) => assignment.policy_id === id));
  }

  async delete(id: string, litellmKey: string) {
    await this.requirePool().query("DELETE FROM prompt_policies WHERE id = $1", [id]);
    await this.syncAllEffectivePolicies(litellmKey);
    return { ok: true };
  }

  async setAssignments(id: string, assignments: PromptPolicyAssignment[], litellmKey: string) {
    const exists = await this.requirePool().query("SELECT id FROM prompt_policies WHERE id = $1", [id]);
    if (!exists.rows[0]) throw Object.assign(new Error("policy_not_found"), { statusCode: 404 });
    const pool = this.requirePool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM prompt_policy_assignments WHERE policy_id = $1", [id]);
      for (const assignment of assignments) {
        await client.query(
          `INSERT INTO prompt_policy_assignments (policy_id, target_type, target_id)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [id, assignment.target_type, assignment.target_id]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await this.syncAllEffectivePolicies(litellmKey);
    const policy = (await this.policyRows()).find((item) => item.id === id);
    return serializePolicy(policy!, await this.assignmentRowsForPolicy(id));
  }

  async setKeyPolicyAssignments(keyId: string, policyIds: string[], litellmKey: string) {
    const pool = this.requirePool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM prompt_policy_assignments WHERE target_type = 'key' AND target_id = $1", [keyId]);
      for (const policyId of policyIds) {
        await client.query(
          `INSERT INTO prompt_policy_assignments (policy_id, target_type, target_id)
           SELECT id, 'key', $2 FROM prompt_policies WHERE id = $1
           ON CONFLICT DO NOTHING`,
          [policyId, keyId]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const key = (await this.litellmKeys(litellmKey)).find((row) => keyIdentifier(row) === keyId);
    if (key) await this.syncKey(key, litellmKey);
    return { ok: true };
  }

  async metadataForKey(keyId: string | null, teamId: string | null, existingMetadata: Record<string, unknown> | null | undefined) {
    const policies = await this.effectivePolicySnapshot(keyId, teamId);
    return mergePolicyMetadata(existingMetadata, policies);
  }

  async syncAllEffectivePolicies(litellmKey: string) {
    const keys = await this.litellmKeys(litellmKey);
    await Promise.all(keys.map((key) => this.syncKey(key, litellmKey)));
  }

  async syncKey(key: LiteLLMKey, litellmKey: string) {
    const keyId = keyIdentifier(key);
    if (!keyId) return;
    const metadata = await this.metadataForKey(keyId, key.team_id || null, key.metadata);
    await this.litellm.request("/key/update", litellmKey, {
      method: "POST",
      body: JSON.stringify({ key: keyId, metadata })
    });
  }

  private async effectivePolicySnapshot(keyId: string | null, teamId: string | null) {
    const [policies, assignments] = await Promise.all([this.policyRows(), this.assignmentRows()]);
    const policyMap = new Map(policies.map((policy) => [policy.id, policy]));
    const teamPolicies = assignments.filter((assignment) => assignment.target_type === "team" && assignment.target_id === teamId);
    const keyPolicies = assignments.filter((assignment) => assignment.target_type === "key" && assignment.target_id === keyId);
    return [...teamPolicies, ...keyPolicies]
      .map((assignment) => ({ assignment, policy: policyMap.get(assignment.policy_id) }))
      .filter((item): item is { assignment: AssignmentRow; policy: PromptPolicyRow } => Boolean(item.policy))
      .map(({ assignment, policy }) => ({
        id: policy.id,
        name: policy.name,
        source: assignment.target_type,
        enabled: policy.enabled,
        rules: policy.rules
      }));
  }

  private async litellmKeys(litellmKey: string): Promise<LiteLLMKey[]> {
    const response = await this.litellm.request<unknown>("/key/list?page=1&size=100&return_full_object=true", litellmKey);
    if (Array.isArray(response)) return response as LiteLLMKey[];
    if (response && typeof response === "object") {
      const record = response as Record<string, unknown>;
      for (const key of ["keys", "data"]) {
        if (Array.isArray(record[key])) return record[key] as LiteLLMKey[];
      }
    }
    return [];
  }

  private async policyRows() {
    const result = await this.requirePool().query<PromptPolicyRow>("SELECT * FROM prompt_policies ORDER BY created_at DESC");
    return result.rows;
  }

  private async assignmentRows() {
    const result = await this.requirePool().query<AssignmentRow>("SELECT policy_id, target_type, target_id FROM prompt_policy_assignments ORDER BY created_at ASC");
    return result.rows;
  }

  private async assignmentRowsForPolicy(policyId: string) {
    const result = await this.requirePool().query<AssignmentRow>(
      "SELECT policy_id, target_type, target_id FROM prompt_policy_assignments WHERE policy_id = $1 ORDER BY created_at ASC",
      [policyId]
    );
    return result.rows;
  }

  private requirePool() {
    if (!this.pool) throw Object.assign(new Error("ui_database_url_required"), { statusCode: 500 });
    return this.pool;
  }
}

export function keyIdentifier(row: LiteLLMKey): string {
  return row.token || row.key_name || "";
}

export function mergePolicyMetadata(existing: Record<string, unknown> | null | undefined, policies: Array<Record<string, unknown>>) {
  const metadata = { ...(existing || {}) };
  if (policies.length) {
    metadata.huawei_prompt_policies = { policies };
  } else {
    delete metadata.huawei_prompt_policies;
  }
  return metadata;
}

function serializePolicy(policy: PromptPolicyRow, assignments: AssignmentRow[]) {
  return {
    id: policy.id,
    name: policy.name,
    description: policy.description,
    enabled: policy.enabled,
    rules: policy.rules,
    assignments: assignments.map(({ target_type, target_id }) => ({ target_type, target_id })),
    created_at: policy.created_at,
    updated_at: policy.updated_at
  };
}

function normalizePolicyInput(input: PromptPolicyInput) {
  return {
    ...input,
    rules: input.rules.map((rule) => ({
      ...rule,
      id: rule.id || `rule-${randomUUID()}`,
      replacement: rule.action === "redact" ? rule.replacement || "[REDACTED]" : undefined,
      append_text: rule.action === "append" ? rule.append_text : undefined
    }))
  };
}
