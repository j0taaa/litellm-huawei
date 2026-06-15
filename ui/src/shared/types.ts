export type SessionUser = {
  userId: string;
  userEmail?: string | null;
  userRole: string;
};

export type ApiKeyRow = {
  token?: string;
  key_alias?: string | null;
  key_name?: string | null;
  user_id?: string | null;
  team_id?: string | null;
  models?: string[];
  metadata?: Record<string, unknown> | null;
  spend?: number;
  max_budget?: number | null;
  budget_duration?: string | null;
  rpm_limit?: number | null;
  tpm_limit?: number | null;
  max_parallel_requests?: number | null;
  expires?: string | null;
  blocked?: boolean | null;
};

export type ApiKeyListRow = ApiKeyRow | string;

export type TeamRow = {
  team_id: string;
  team_alias?: string | null;
  models?: string[];
  spend?: number;
  max_budget?: number | null;
  rpm_limit?: number | null;
  tpm_limit?: number | null;
  blocked?: boolean;
  members_with_roles?: Array<{ user_id: string; role: string }>;
};

export type ModelInfo = {
  model_name: string;
  litellm_params?: {
    model?: string;
    custom_llm_provider?: string;
    api_base?: string;
    api_key?: string;
  };
  model_info?: {
    id?: string;
    key?: string;
    db_model?: boolean;
    max_input_tokens?: number;
    max_output_tokens?: number;
    input_cost_per_token?: number;
    output_cost_per_token?: number;
    huawei_maas?: {
      id: string;
      name: string;
      tiered_pricing: boolean;
      currency: string;
      pricing_unit?: string;
      pricing: {
        input: Array<{ start: number; end: number; tokenPriceUsdPerMillion: number }>;
        output: Array<{ start: number; end: number; tokenPriceUsdPerMillion: number }>;
      };
    };
  };
};

export type PromptPolicyRule = {
  id?: string;
  name: string;
  enabled: boolean;
  pattern: string;
  flags: Array<"ignore_case" | "multiline" | "dotall">;
  action: "block" | "redact" | "append";
  replacement?: string;
  append_text?: string;
};

export type PromptPolicyAssignment = {
  target_type: "key" | "team";
  target_id: string;
};

export type PromptPolicy = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  rules: PromptPolicyRule[];
  assignments: PromptPolicyAssignment[];
};

export type StatsSummary = {
  totals: {
    spend: number;
    requests: number;
    keys: number;
    teams: number;
    models: number;
  };
  byModel: StatsBreakdownRow[];
  byKey: StatsBreakdownRow[];
  byTeam: StatsBreakdownRow[];
  recent: Array<Record<string, unknown>>;
};

export type StatsBreakdownRow = {
  id?: string;
  name: string;
  spend: number;
  requests: number;
};
