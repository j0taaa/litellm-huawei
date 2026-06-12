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
  model_info?: {
    key?: string;
    db_model?: boolean;
    input_cost_per_token?: number;
    output_cost_per_token?: number;
    huawei_maas?: {
      id: string;
      name: string;
      tiered_pricing: boolean;
      currency: string;
      pricing: {
        input: Array<{ start: number; end: number; tokenPriceUsdPerMillion: number }>;
        output: Array<{ start: number; end: number; tokenPriceUsdPerMillion: number }>;
      };
    };
  };
};

export type StatsSummary = {
  totals: {
    spend: number;
    requests: number;
    keys: number;
    teams: number;
    models: number;
  };
  byModel: Array<{ name: string; spend: number; requests: number }>;
  byKey: Array<{ name: string; spend: number; requests: number }>;
  byTeam: Array<{ name: string; spend: number; requests: number }>;
  recent: Array<Record<string, unknown>>;
};
