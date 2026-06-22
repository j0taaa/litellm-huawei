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
  metadata?: Record<string, unknown> | null;
  spend?: number;
  max_budget?: number | null;
  budget_duration?: string | null;
  rpm_limit?: number | null;
  tpm_limit?: number | null;
  max_parallel_requests?: number | null;
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
    supports_vision?: boolean;
    huawei_maas?: {
      id: string;
      name: string;
      tiered_pricing: boolean;
      supports_vision?: boolean;
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

export type PromptSkillAssignment = {
  target_type: "key" | "team";
  target_id: string;
};

export type PromptSkill = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  instructions: string;
  assignments: PromptSkillAssignment[];
};

export type ImageSupportSettings = {
  enabled: boolean;
  openrouter_api_key_present: boolean;
  openrouter_api_key_masked: string;
  vision_model: string;
  extraction_prompt: string;
  max_tokens: number;
  updated_at?: string | null;
};

export type SearchToolLiteLLMParams = {
  search_provider: string;
  api_key?: string;
  api_base?: string;
  timeout?: number;
  max_retries?: number;
  [key: string]: unknown;
};

export type SearchToolInfo = {
  description?: string;
  [key: string]: unknown;
};

export type SearchTool = {
  search_tool_id?: string;
  search_tool_name: string;
  litellm_params: SearchToolLiteLLMParams;
  search_tool_info?: SearchToolInfo;
  created_at?: string;
  updated_at?: string;
  is_from_config?: boolean;
};

export type AvailableSearchProvider = {
  provider_name: string;
  ui_friendly_name: string;
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
  timeSeries: StatsTimeSeriesRow[];
  range: {
    timeframe: StatsTimeframe;
    bucket: StatsTimeBucket;
    start: string | null;
    end: string | null;
  };
  recentTotal?: number;
  recent: Array<Record<string, unknown>>;
};

export type StatsBreakdownRow = {
  id?: string;
  name: string;
  spend: number;
  requests: number;
};

export type StatsTimeframe = "24h" | "7d" | "30d" | "90d" | "all";
export type StatsTimeBucket = "hour" | "day" | "week" | "month";

export type StatsTimeSeriesRow = {
  label: string;
  start: string;
  spend: number;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};
