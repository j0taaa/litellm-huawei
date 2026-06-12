import { describe, expect, it } from "vitest";
import { summarizeStats } from "../src/server/stats";

describe("summarizeStats", () => {
  it("groups spend logs by model, key, and team", () => {
    const summary = summarizeStats({
      spendLogs: [
        { model: "openai/glm-5.1", api_key: "key-a", team_id: "team-a", spend: 0.1 },
        { model: "glm-5.1", api_key: "key-a", team_id: "team-b", response_cost: 0.2 },
        { model: "deepseek-v4-flash", api_key: "key-b", team_id: "team-a", spend: 0.3 }
      ],
      keys: [{}, {}],
      teams: [{}],
      models: [{}, {}, {}]
    });

    expect(summary.totals.requests).toBe(3);
    expect(summary.totals.keys).toBe(2);
    expect(summary.totals.teams).toBe(1);
    expect(summary.totals.models).toBe(3);
    expect(summary.totals.spend).toBeCloseTo(0.6);
    expect(summary.byModel[0]).toMatchObject({ name: "glm-5.1", requests: 2 });
    expect(summary.recent[0].model).toBe("glm-5.1");
    expect(summary.byKey.find((row) => row.name === "key-a")?.spend).toBeCloseTo(0.3);
    expect(summary.byTeam.find((row) => row.name === "team-a")?.requests).toBe(2);
  });
});
