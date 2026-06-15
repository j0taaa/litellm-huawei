import { describe, expect, it } from "vitest";
import { mergePolicyMetadata } from "../src/server/prompt-policies";

describe("prompt policy metadata", () => {
  it("preserves existing key metadata while setting effective policies", () => {
    expect(mergePolicyMetadata({ huawei_token_budget: { max_tokens: 10 } }, [{ id: "policy-1" }])).toEqual({
      huawei_token_budget: { max_tokens: 10 },
      huawei_prompt_policies: { policies: [{ id: "policy-1" }] }
    });
  });

  it("removes prompt policy metadata when no policies apply", () => {
    expect(mergePolicyMetadata({ huawei_prompt_policies: { policies: [{ id: "old" }] }, keep: true }, [])).toEqual({ keep: true });
  });
});
