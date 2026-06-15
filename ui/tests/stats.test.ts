import { describe, expect, it } from "vitest";
import { filterSpendLogsByKey, filterSpendLogsByTeam, spendLogsToCsv, summarizeStats } from "../src/server/stats";

describe("summarizeStats", () => {
  it("groups spend logs by model, key, and team", () => {
    const summary = summarizeStats({
      spendLogs: [
        { model: "openai/glm-5.1", api_key: "key-a", team_id: "team-a", spend: 0.1 },
        { model: "glm-5.1", api_key: "key-a", team_id: "team-b", response_cost: 0.2 },
        { model: "deepseek-v4-flash", api_key: "key-b", team_id: "team-a", spend: 0.3 }
      ],
      keys: [{ token: "key-a", key_alias: "Production app" }, { token: "key-b", key_alias: "Batch jobs" }],
      teams: [{}],
      models: [{}, {}, {}]
    });

    expect(summary.totals.requests).toBe(3);
    expect(summary.totals.keys).toBe(2);
    expect(summary.totals.teams).toBe(1);
    expect(summary.totals.models).toBe(3);
    expect(summary.totals.spend).toBeCloseTo(0.6);
    expect(summary.recentTotal).toBe(3);
    expect(summary.byModel[0]).toMatchObject({ name: "glm-5.1", requests: 2 });
    expect(summary.recent[0].model).toBe("glm-5.1");
    expect(summary.byKey.find((row) => row.name === "Production app")?.spend).toBeCloseTo(0.3);
    expect(summary.byKey.find((row) => row.name === "Production app")?.id).toBe("key-a");
    expect(summary.recent[0].api_key).toBe("Production app");
    expect(summary.byTeam.find((row) => row.name === "team-a")?.requests).toBe(2);
  });

  it("filters spend logs by key", () => {
    const logs = [
      { api_key: "key-a", spend: 0.1 },
      { api_key: "key-b", spend: 0.2 },
      { key_alias: "key-a", spend: 0.3 }
    ];

    expect(filterSpendLogsByKey(logs, "key-a")).toEqual([logs[0], logs[2]]);
  });

  it("filters spend logs by team", () => {
    const logs = [
      { team_id: "team-a", spend: 0.1 },
      { team_id: "team-b", spend: 0.2 },
      { api_key: "key-without-team", spend: 0.3 }
    ];

    expect(filterSpendLogsByTeam(logs, "team-a")).toEqual([logs[0]]);
    expect(filterSpendLogsByTeam(logs, "none")).toEqual([logs[2]]);
  });

  it("exports normalized spend logs as safe CSV", () => {
    const csv = spendLogsToCsv({
      spendLogs: [
        {
          startTime: "2026-06-15T12:00:00Z",
          model: "openai/glm-5.1",
          api_key: "key-a",
          team_id: "team-a",
          spend: 0.1,
          prompt_tokens: 12,
          completion_tokens: 3,
          total_tokens: 15,
          end_user: "Alice, Example",
          request_id: "req-1"
        },
        {
          start_time: "2026-06-15T12:01:00Z",
          model: "openai/deepseek-v4-flash",
          api_key: "key-b",
          response_cost: 0.2,
          input_tokens: 20,
          output_tokens: 5,
          user: "=unsafe",
          id: "req-2"
        }
      ],
      keys: [
        { token: "key-a", key_alias: "Production app" },
        { token: "key-b", key_alias: "Batch \"Jobs\"" }
      ]
    });

    expect(csv).toContain("startTime,model,api_key,team_id,spend,prompt_tokens,completion_tokens,total_tokens,end_user,request_id\r\n");
    expect(csv).toContain("2026-06-15T12:00:00Z,glm-5.1,Production app,team-a,0.1,12,3,15,\"Alice, Example\",req-1\r\n");
    expect(csv).toContain("2026-06-15T12:01:00Z,deepseek-v4-flash,\"Batch \"\"Jobs\"\"\",none,0.2,20,5,,\'=unsafe,req-2\r\n");
  });
});
