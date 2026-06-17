import { randomUUID } from "node:crypto";
import pg from "pg";
import { z } from "zod";
import { LiteLLMClient } from "./litellm.js";
import { keyIdentifier } from "./prompt-policies.js";

const { Pool } = pg;

export const skillInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  enabled: z.boolean().default(true),
  instructions: z.string().min(1)
});

export const skillAssignmentInputSchema = z.object({
  assignments: z.array(z.object({
    target_type: z.enum(["key", "team"]),
    target_id: z.string().min(1)
  })).default([])
});

export type PromptSkillInput = z.infer<typeof skillInputSchema>;
export type PromptSkillAssignment = z.infer<typeof skillAssignmentInputSchema>["assignments"][number];

type SkillRow = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  instructions: string;
  created_at: Date;
  updated_at: Date;
};

type AssignmentRow = {
  skill_id: string;
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

export class PromptSkillStore {
  private pool: pg.Pool | null;

  constructor(databaseUrl: string, private litellm: LiteLLMClient) {
    this.pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
  }

  async ready() {
    const pool = this.requirePool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prompt_skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        instructions TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS prompt_skill_assignments (
        skill_id TEXT NOT NULL REFERENCES prompt_skills(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL CHECK (target_type IN ('key', 'team')),
        target_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (skill_id, target_type, target_id)
      )
    `);
  }

  async list() {
    const [skills, assignments] = await Promise.all([this.skillRows(), this.assignmentRows()]);
    return skills.map((skill) => serializeSkill(skill, assignments.filter((assignment) => assignment.skill_id === skill.id)));
  }

  async create(input: PromptSkillInput, litellmKey: string) {
    const id = `skill-${randomUUID()}`;
    const row = await this.requirePool().query<SkillRow>(
      `INSERT INTO prompt_skills (id, name, description, enabled, instructions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, input.name, input.description, input.enabled, input.instructions]
    );
    await this.syncAllEffectiveSkills(litellmKey);
    return serializeSkill(row.rows[0], []);
  }

  async update(id: string, input: PromptSkillInput, litellmKey: string) {
    const row = await this.requirePool().query<SkillRow>(
      `UPDATE prompt_skills
       SET name = $2, description = $3, enabled = $4, instructions = $5, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, input.name, input.description, input.enabled, input.instructions]
    );
    if (!row.rows[0]) throw Object.assign(new Error("skill_not_found"), { statusCode: 404 });
    await this.syncAllEffectiveSkills(litellmKey);
    const assignments = await this.assignmentRows();
    return serializeSkill(row.rows[0], assignments.filter((assignment) => assignment.skill_id === id));
  }

  async delete(id: string, litellmKey: string) {
    await this.requirePool().query("DELETE FROM prompt_skills WHERE id = $1", [id]);
    await this.syncAllEffectiveSkills(litellmKey);
    return { ok: true };
  }

  async setAssignments(id: string, assignments: PromptSkillAssignment[], litellmKey: string) {
    const exists = await this.requirePool().query("SELECT id FROM prompt_skills WHERE id = $1", [id]);
    if (!exists.rows[0]) throw Object.assign(new Error("skill_not_found"), { statusCode: 404 });
    const pool = this.requirePool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM prompt_skill_assignments WHERE skill_id = $1", [id]);
      for (const assignment of assignments) {
        await client.query(
          `INSERT INTO prompt_skill_assignments (skill_id, target_type, target_id)
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
    await this.syncAllEffectiveSkills(litellmKey);
    const skill = (await this.skillRows()).find((item) => item.id === id);
    return serializeSkill(skill!, await this.assignmentRowsForSkill(id));
  }

  async setKeySkillAssignments(keyId: string, skillIds: string[], litellmKey: string) {
    const pool = this.requirePool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM prompt_skill_assignments WHERE target_type = 'key' AND target_id = $1", [keyId]);
      for (const skillId of skillIds) {
        await client.query(
          `INSERT INTO prompt_skill_assignments (skill_id, target_type, target_id)
           SELECT id, 'key', $2 FROM prompt_skills WHERE id = $1
           ON CONFLICT DO NOTHING`,
          [skillId, keyId]
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

  async setTeamSkillAssignments(teamId: string, skillIds: string[], litellmKey: string) {
    const pool = this.requirePool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM prompt_skill_assignments WHERE target_type = 'team' AND target_id = $1", [teamId]);
      for (const skillId of skillIds) {
        await client.query(
          `INSERT INTO prompt_skill_assignments (skill_id, target_type, target_id)
           SELECT id, 'team', $2 FROM prompt_skills WHERE id = $1
           ON CONFLICT DO NOTHING`,
          [skillId, teamId]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await this.syncAllEffectiveSkills(litellmKey);
    return { ok: true };
  }

  async metadataForKey(keyId: string | null, teamId: string | null, existingMetadata: Record<string, unknown> | null | undefined) {
    const skills = await this.effectiveSkillSnapshot(keyId, teamId);
    return mergeSkillMetadata(existingMetadata, skills);
  }

  async syncAllEffectiveSkills(litellmKey: string) {
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

  private async effectiveSkillSnapshot(keyId: string | null, teamId: string | null) {
    const [skills, assignments] = await Promise.all([this.skillRows(), this.assignmentRows()]);
    const skillMap = new Map(skills.map((skill) => [skill.id, skill]));
    const teamSkills = assignments.filter((assignment) => assignment.target_type === "team" && assignment.target_id === teamId);
    const keySkills = assignments.filter((assignment) => assignment.target_type === "key" && assignment.target_id === keyId);
    return [...teamSkills, ...keySkills]
      .map((assignment) => ({ assignment, skill: skillMap.get(assignment.skill_id) }))
      .filter((item): item is { assignment: AssignmentRow; skill: SkillRow } => Boolean(item.skill))
      .map(({ assignment, skill }) => ({
        id: skill.id,
        name: skill.name,
        source: assignment.target_type,
        enabled: skill.enabled,
        instructions: skill.instructions
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

  private async skillRows() {
    const result = await this.requirePool().query<SkillRow>("SELECT * FROM prompt_skills ORDER BY created_at DESC");
    return result.rows;
  }

  private async assignmentRows() {
    const result = await this.requirePool().query<AssignmentRow>("SELECT skill_id, target_type, target_id FROM prompt_skill_assignments ORDER BY created_at ASC");
    return result.rows;
  }

  private async assignmentRowsForSkill(skillId: string) {
    const result = await this.requirePool().query<AssignmentRow>(
      "SELECT skill_id, target_type, target_id FROM prompt_skill_assignments WHERE skill_id = $1 ORDER BY created_at ASC",
      [skillId]
    );
    return result.rows;
  }

  private requirePool() {
    if (!this.pool) throw Object.assign(new Error("ui_database_url_required"), { statusCode: 500 });
    return this.pool;
  }
}

export function mergeSkillMetadata(existing: Record<string, unknown> | null | undefined, skills: Array<Record<string, unknown>>) {
  const metadata = { ...(existing || {}) };
  if (skills.length) {
    metadata.huawei_prompt_skills = { skills };
  } else {
    delete metadata.huawei_prompt_skills;
  }
  return metadata;
}

function serializeSkill(skill: SkillRow, assignments: AssignmentRow[]) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    enabled: skill.enabled,
    instructions: skill.instructions,
    assignments: assignments.map(({ target_type, target_id }) => ({ target_type, target_id })),
    created_at: skill.created_at,
    updated_at: skill.updated_at
  };
}
