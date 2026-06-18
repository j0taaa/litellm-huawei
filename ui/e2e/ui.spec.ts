import { expect, test } from "@playwright/test";

function expectedLiteLLMUiUrl(pageUrl: string): string {
  const url = new URL(pageUrl);
  return `${url.protocol}//${url.hostname}:4000/ui/`;
}

test("login and navigate main MaaS UI pages", async ({ page }) => {
  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "LiteLLM Access" })).toBeVisible();
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("sk-huawei-maas-local");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.locator(".metric").filter({ hasText: "Models" })).toBeVisible();
  const litellmUi = page.getByRole("link", { name: "LiteLLM UI" });
  await expect(litellmUi).toHaveAttribute("href", expectedLiteLLMUiUrl(page.url()));
  await expect(litellmUi).toHaveAttribute("target", "_blank");

  let createPayload: Record<string, any> | undefined;
  let clonePayload: Record<string, any> | undefined;
  let togglePayload: Record<string, any> | undefined;
  let updatePayload: Record<string, any> | undefined;
  let updateUrl = "";
  let deletePayload: Record<string, any> | undefined;
  let policyCreatePayload: Record<string, any> | undefined;
  let policyAssignmentsPayload: Record<string, any> | undefined;
  let policyList = {
    policies: [{
      id: "policy-cpf",
      name: "CPF redaction",
      description: "Redacts Brazilian CPF numbers",
      enabled: true,
      rules: [],
      assignments: [{ target_type: "key", target_id: "hash-delete-test" }]
    }] as Array<Record<string, any>>
  };
  await page.route("**/api/keys**", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          keys: [{
            token: "hash-delete-test",
            key_name: "sk-...test",
            key_alias: "Delete test",
            spend: 0,
            max_budget: 25,
            rpm_limit: 120,
            tpm_limit: 1000,
            max_parallel_requests: 2,
            models: ["deepseek-v4-flash"],
            metadata: {
              huawei_time_access: { timezone: "UTC", rules: [{ days: [1, 2], start: "10:00", end: "12:00" }] }
            },
            blocked: false
          }]
        })
      });
      return;
    }
    if (method === "POST") {
      const payload = route.request().postDataJSON();
      if (createPayload) {
        clonePayload = payload;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ key: "sk-test-clone" }) });
      } else {
        createPayload = payload;
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ key: "sk-test-schedule" }) });
      }
      return;
    }
    if (method === "PATCH") {
      updateUrl = route.request().url();
      updatePayload = route.request().postDataJSON();
      if (Object.keys(updatePayload || {}).length === 1 && updatePayload?.blocked === true) {
        togglePayload = updatePayload;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    if (method === "DELETE") {
      deletePayload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ deleted_keys: ["hash-delete-test"] }) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/prompt-policies**", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(policyList) });
      return;
    }
    if (method === "POST") {
      policyCreatePayload = route.request().postDataJSON();
      const policy = { id: "policy-safe", ...policyCreatePayload, assignments: [] };
      policyList = { policies: [policy] };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(policy) });
      return;
    }
    if (method === "PUT") {
      policyAssignmentsPayload = route.request().postDataJSON();
      policyList.policies[0].assignments = policyAssignmentsPayload?.assignments || [];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(policyList.policies[0]) });
      return;
    }
    await route.continue();
  });
  await page.getByRole("link", { name: "Keys" }).click();
  await expect(page.getByRole("heading", { name: "Keys" })).toBeVisible();
  await expect(page).toHaveURL(/\/keys$/);
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByRole("dialog", { name: "Create key" })).toBeVisible();
  await expect(page.getByPlaceholder("Production app")).toBeVisible();
  await page.getByPlaceholder("Production app").fill("Schedule test");
  await expect(page.getByLabel("Team")).toBeVisible();
  await expect(page.getByLabel("Team")).toHaveValue("");
  await expect(page.getByLabel("Reset budget")).not.toBeChecked();
  await expect(page.getByText("Budget does not reset.")).toBeVisible();
  await page.getByLabel("Reset budget").check();
  await expect(page.getByLabel("Reset every")).toHaveValue("30");
  await expect(page.getByLabel("Budget reset unit")).toHaveValue("d");
  await expect(page.getByLabel("Max TPS")).toBeVisible();
  await expect(page.getByLabel("Max TPM")).toBeVisible();
  await expect(page.getByLabel("Max parallel")).toBeVisible();
  await expect(page.getByLabel("Set token quota")).not.toBeChecked();
  await expect(page.getByText("No total token quota is enforced.")).toBeVisible();
  await page.getByLabel("Set token quota").check();
  await page.getByLabel("Total token quota").fill("10000");
  await expect(page.getByLabel("Reset token quota")).not.toBeChecked();
  await page.getByLabel("Reset token quota").check();
  await expect(page.getByLabel("Token reset every")).toHaveValue("30");
  await expect(page.getByLabel("Token reset unit")).toHaveValue("d");
  await expect(page.getByLabel("Restrict access by schedule")).not.toBeChecked();
  await expect(page.getByText("This key can be used at any time.")).toBeVisible();
  await page.getByLabel("Restrict access by schedule").check();
  await expect(page.getByLabel("Access timezone")).toHaveValue("America/Sao_Paulo");
  await expect(page.getByLabel("Mon")).toBeChecked();
  await expect(page.getByLabel("Fri")).toBeChecked();
  await expect(page.getByLabel("Sat")).not.toBeChecked();
  await expect(page.getByLabel("Limit daily hours")).not.toBeChecked();
  await page.getByLabel("Limit daily hours").check();
  await expect(page.getByLabel("Start time")).toHaveValue("09:00");
  await expect(page.getByLabel("End time")).toHaveValue("17:00");
  await expect(page.getByLabel("Set expiration")).not.toBeChecked();
  await expect(page.getByText("This key will not expire.")).toBeVisible();
  await page.getByLabel("Set expiration").check();
  await expect(page.getByLabel("Expires after")).toHaveValue("30");
  await expect(page.getByLabel("Expiration unit")).toHaveValue("d");
  await expect(page.getByText("No models selected means this key can use all models.")).toBeVisible();
  await expect(page.getByLabel("deepseek-v4-flash")).toBeVisible();
  await page.getByLabel("deepseek-v4-flash").check();
  await expect(page.getByText("1 selected")).toBeVisible();
  await expect(page.getByLabel(/openai\//)).toHaveCount(0);
  await expect(page.getByLabel("CPF redaction")).toBeVisible();
  await page.getByLabel("CPF redaction").check();
  await page.getByRole("dialog").getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText("sk-test-schedule")).toBeVisible();
  const selectedPolicyIds = createPayload?.prompt_policy_ids || [];
  expect(createPayload).toMatchObject({
    key_alias: "Schedule test",
    metadata: {
      huawei_token_budget: { max_tokens: 10000, reset_duration: "30d", counts: "total_tokens" },
      huawei_time_access: {
        timezone: "America/Sao_Paulo",
        rules: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }]
      }
    },
    models: ["deepseek-v4-flash"]
  });
  expect(selectedPolicyIds).toHaveLength(1);
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Delete test")).toBeVisible();
  await page.getByRole("row", { name: /Delete test/ }).getByRole("button", { name: "Deactivate key" }).click();
  await expect.poll(() => togglePayload).toEqual({ blocked: true });
  await page.getByTitle("Edit key").first().click();
  await expect(page.getByRole("dialog", { name: "Edit key" })).toBeVisible();
  await expect(page.getByPlaceholder("Production app")).toHaveValue("Delete test");
  await expect(page.getByLabel("Budget USD")).toHaveValue("25");
  await expect(page.getByLabel("Max TPS")).toHaveValue("2");
  await expect(page.getByLabel("Max TPM")).toHaveValue("1000");
  await expect(page.getByLabel("Max parallel")).toHaveValue("2");
  await expect(page.getByLabel("Access timezone")).toHaveValue("UTC");
  await expect(page.getByLabel("CPF redaction")).toBeChecked();
  await page.getByPlaceholder("Production app").fill("Edited key");
  await page.getByLabel("Block key").check();
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  expect(updateUrl).toContain("/api/keys/hash-delete-test");
  expect(updatePayload).toMatchObject({
    key_alias: "Edited key",
    max_budget: 25,
    rpm_limit: 120,
    tpm_limit: 1000,
    max_parallel_requests: 2,
    blocked: true,
    models: ["deepseek-v4-flash"],
    metadata: {
      huawei_time_access: { timezone: "UTC", rules: [{ days: [1, 2], start: "10:00", end: "12:00" }] }
    },
    prompt_policy_ids: selectedPolicyIds
  });
  await page.getByTitle("Clone key").first().click();
  await expect(page.getByRole("dialog", { name: "Clone key" })).toBeVisible();
  await expect(page.getByPlaceholder("Production app")).toHaveValue("Delete test copy");
  await expect(page.getByLabel("Budget USD")).toHaveValue("25");
  await expect(page.getByLabel("Max TPS")).toHaveValue("2");
  await expect(page.getByLabel("Access timezone")).toHaveValue("UTC");
  await expect(page.getByLabel("CPF redaction")).toBeChecked();
  await page.getByRole("dialog").getByRole("button", { name: "Clone key" }).click();
  await expect(page.getByText("sk-test-clone")).toBeVisible();
  expect(clonePayload).toMatchObject({
    key_alias: "Delete test copy",
    max_budget: 25,
    rpm_limit: 120,
    tpm_limit: 1000,
    max_parallel_requests: 2,
    blocked: false,
    models: ["deepseek-v4-flash"],
    metadata: {
      huawei_time_access: { timezone: "UTC", rules: [{ days: [1, 2], start: "10:00", end: "12:00" }] }
    },
    prompt_policy_ids: selectedPolicyIds
  });
  expect(clonePayload).not.toHaveProperty("key");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog", { name: "Clone key" })).toBeHidden();
  await page.getByRole("row", { name: /Delete test/ }).getByTitle("Delete key").click();
  expect(deletePayload).toEqual({ keys: ["hash-delete-test"] });

  let teamCreatePayload: Record<string, any> | undefined;
  let teamUpdatePayload: Record<string, any> | undefined;
  let teamTogglePayload: Record<string, any> | undefined;
  let modelCreatePayload: Record<string, any> | undefined;
  let modelUpdatePayload: Record<string, any> | undefined;
  let modelDeleteUrl = "";
  let modelSyncCalled = false;
  await page.route("**/api/teams**", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          teams: [{
            team_id: "team-safe",
            team_alias: "Safety team",
            spend: 0,
            max_budget: 50,
            budget_duration: "7d",
            rpm_limit: 180,
            tpm_limit: 2000,
            max_parallel_requests: 4,
            models: ["glm-test"],
            metadata: {
              huawei_token_budget: { max_tokens: 25000, reset_duration: "1d", counts: "total_tokens" },
              huawei_time_access: { timezone: "UTC", rules: [{ days: [1, 2, 3], start: "08:00", end: "18:00" }] }
            },
            blocked: false
          }]
        })
      });
      return;
    }
    if (method === "POST") {
      teamCreatePayload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ team_id: "team-new", team_alias: teamCreatePayload?.team_alias }) });
      return;
    }
    if (method === "PATCH") {
      const payload = route.request().postDataJSON();
      if (Object.keys(payload || {}).length === 1 && payload?.blocked === true) teamTogglePayload = payload;
      else teamUpdatePayload = payload;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/models**", async (route) => {
    const method = route.request().method();
    if (route.request().url().endsWith("/api/models/sync")) {
      modelSyncCalled = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ models: 1, created: 1, deleted: 1 }) });
      return;
    }
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [{
            model_name: "glm-test",
            litellm_params: { model: "glm-test-upstream", custom_llm_provider: "openai", api_base: "https://example.com/v1", api_key: "os.environ/HUAWEI_MAAS_API_KEY" },
            model_info: { id: "model-glm-test", key: "glm-test-upstream", max_input_tokens: 1000, max_output_tokens: 500, input_cost_per_token: 0.000001, output_cost_per_token: 0.000002, huawei_maas: { id: "glm-test-upstream", name: "GLM Test", currency: "USD", tiered_pricing: false, pricing: { input: [], output: [] } } }
          }]
        })
      });
      return;
    }
    if (method === "POST") {
      modelCreatePayload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    if (method === "PATCH") {
      modelUpdatePayload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    if (method === "DELETE") {
      modelDeleteUrl = route.request().url();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.continue();
  });
  await page.getByRole("link", { name: "Teams" }).click();
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  await expect(page).toHaveURL(/\/teams$/);
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByRole("dialog", { name: "Create team" })).toBeVisible();
  await page.getByPlaceholder("Platform team").fill("Team modal");
  await page.getByLabel("Reset budget").check();
  await page.getByLabel("Max TPS").fill("3");
  await page.getByLabel("Max TPM").fill("1500");
  await page.getByLabel("Max parallel").fill("3");
  await page.getByLabel("Set token quota").check();
  await page.getByLabel("Total token quota").fill("30000");
  await page.getByLabel("Reset token quota").check();
  await page.getByLabel("Restrict access by schedule").check();
  await expect(page.getByLabel("Access timezone")).toHaveValue("America/Sao_Paulo");
  await page.getByLabel("Limit daily hours").check();
  await page.getByLabel("glm-test").check();
  await page.getByLabel("CPF redaction").check();
  await page.getByRole("dialog").getByRole("button", { name: "Create team" }).click();
  expect(teamCreatePayload).toMatchObject({
    team_alias: "Team modal",
    budget_duration: "30d",
    rpm_limit: 180,
    tpm_limit: 1500,
    max_parallel_requests: 3,
    metadata: {
      huawei_token_budget: { max_tokens: 30000, reset_duration: "30d", counts: "total_tokens" },
      huawei_time_access: { timezone: "America/Sao_Paulo", rules: [{ days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }] }
    },
    models: ["glm-test"],
    prompt_policy_ids: ["policy-cpf"]
  });
  await page.getByRole("row", { name: /Safety team/ }).getByRole("button", { name: "Deactivate team" }).click();
  await expect.poll(() => teamTogglePayload).toEqual({ blocked: true });
  await page.getByTitle("Edit team").click();
  await expect(page.getByRole("dialog", { name: "Edit team" })).toBeVisible();
  await expect(page.getByPlaceholder("Platform team")).toHaveValue("Safety team");
  await expect(page.getByLabel("Budget USD")).toHaveValue("50");
  await expect(page.getByLabel("Max TPS")).toHaveValue("3");
  await expect(page.getByLabel("Max TPM")).toHaveValue("2000");
  await expect(page.getByLabel("Max parallel")).toHaveValue("4");
  await expect(page.getByLabel("Total token quota")).toHaveValue("25000");
  await expect(page.getByLabel("Access timezone")).toHaveValue("UTC");
  await expect(page.getByLabel("CPF redaction")).not.toBeChecked();
  await page.getByLabel("CPF redaction").check();
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  expect(teamUpdatePayload).toMatchObject({
    team_alias: "Safety team",
    max_budget: 50,
    budget_duration: "7d",
    rpm_limit: 180,
    tpm_limit: 2000,
    max_parallel_requests: 4,
    blocked: false,
    models: ["glm-test"],
    prompt_policy_ids: ["policy-cpf"]
  });

  await page.getByRole("link", { name: "Models" }).click();
  await expect(page.getByRole("heading", { name: "Models" })).toBeVisible();
  await expect(page).toHaveURL(/\/models$/);
  await expect(page.getByRole("cell", { name: "glm-test", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sync catalog" }).click();
  await expect(page.getByText("Synced 1 Huawei MaaS models from the catalog.")).toBeVisible();
  expect(modelSyncCalled).toBe(true);
  await page.getByRole("button", { name: "Add model" }).click();
  await page.getByLabel("Model name").fill("new-model");
  await page.getByLabel("Upstream model").fill("new-upstream");
  await page.getByLabel("Provider").fill("openai");
  await page.getByLabel("API base").fill("https://example.com/v1");
  await page.getByLabel("API key reference").fill("os.environ/HUAWEI_MAAS_API_KEY");
  await page.getByLabel("Input USD / 1M").fill("1.5");
  await page.getByLabel("Output USD / 1M").fill("2.5");
  await page.getByLabel("Use pricing ranges").check();
  await expect(page.getByLabel("Range 1 from tokens")).toHaveValue("0");
  await expect(page.getByLabel("Range 1 to tokens")).toHaveValue("31999");
  await expect(page.getByLabel("Range 1 input USD per 1M")).toHaveValue("1.5");
  await expect(page.getByLabel("Range 1 output USD per 1M")).toHaveValue("2.5");
  await page.getByLabel("Range 2 input USD per 1M").fill("2");
  await page.getByLabel("Range 2 output USD per 1M").fill("3");
  await page.getByRole("dialog").getByRole("button", { name: "Add model" }).click();
  expect(modelCreatePayload).toMatchObject({
    model_name: "new-model",
    litellm_params: { model: "new-upstream", custom_llm_provider: "openai" },
    model_info: {
      id: "custom-new-model",
      key: "new-upstream",
      input_cost_per_token: 0.0000015,
      output_cost_per_token: 0.0000025,
      huawei_maas: {
        tiered_pricing: true,
        pricing: {
          input: [
            { start: 0, end: 31999, tokenPriceUsdPerMillion: 1.5 },
            { start: 32000, end: 1000000, tokenPriceUsdPerMillion: 2 }
          ],
          output: [
            { start: 0, end: 31999, tokenPriceUsdPerMillion: 2.5 },
            { start: 32000, end: 1000000, tokenPriceUsdPerMillion: 3 }
          ]
        }
      }
    }
  });
  await page.getByTitle("Edit model").first().click();
  await expect(page.getByRole("dialog", { name: "Edit model" })).toBeVisible();
  await expect(page.getByLabel("Model name")).toHaveValue("glm-test");
  await page.getByLabel("Display name").fill("GLM Edited");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  expect(modelUpdatePayload).toMatchObject({ model_name: "glm-test", model_info: { id: "model-glm-test", huawei_maas: { name: "GLM Edited" } } });
  await page.getByTitle("Delete model").first().click();
  await expect.poll(() => modelDeleteUrl).toContain("/api/models/model-glm-test");

  await page.getByRole("link", { name: "Policies" }).click();
  await expect(page.getByRole("heading", { name: "Policies" })).toBeVisible();
  await expect(page).toHaveURL(/\/policies$/);
  await page.getByRole("button", { name: "Create policy" }).click();
  await expect(page.getByRole("dialog", { name: "Create policy" })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("PII safety");
  await page.getByLabel("Description").fill("Redacts emails");
  await page.getByLabel("Rule name").fill("Email redaction");
  await page.getByLabel("Regex pattern").fill("[\\\\w.-]+@[\\\\w.-]+");
  await page.getByLabel("Replacement").fill("[EMAIL]");
  await page.getByLabel("Safety team").check();
  await page.getByLabel("Delete test").check();
  await page.getByRole("dialog").getByRole("button", { name: "Create policy" }).click();
  expect(policyCreatePayload).toMatchObject({
    name: "PII safety",
    enabled: true,
    rules: [{ name: "Email redaction", action: "redact", replacement: "[EMAIL]" }]
  });
  await expect.poll(() => policyAssignmentsPayload).toEqual({
    assignments: [
      { target_type: "team", target_id: "team-safe" },
      { target_type: "key", target_id: "hash-delete-test" }
    ]
  });
  await expect(page.getByRole("cell", { name: "PII safety" })).toBeVisible();

  let testChatPayload: Record<string, any> | undefined;
  await page.route("**/api/test/chat", async (route) => {
    testChatPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { role: "assistant", content: "Test response from model" } }] })
    });
  });
  await page.getByRole("link", { name: "Test" }).click();
  await expect(page.getByRole("heading", { name: "Test" })).toBeVisible();
  await expect(page).toHaveURL(/\/test$/);
  await expect(page.getByLabel("API key", { exact: true })).toHaveValue("hash-delete-test");
  await expect(page.getByLabel("Model")).toHaveValue("glm-test");
  await page.getByPlaceholder("Send a test prompt").fill("Hello from the test tab");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Test response from model")).toBeVisible();
  expect(testChatPayload).toMatchObject({
    api_key: "hash-delete-test",
    model: "glm-test",
    messages: [{ role: "user", content: "Hello from the test tab" }],
    max_tokens: 512
  });
});

test("direct route keeps destination after login", async ({ page }) => {
  await page.goto("/keys");
  await expect(page.getByRole("heading", { name: "LiteLLM Access" })).toBeVisible();
  await expect(page).toHaveURL(/\/keys$/);
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("sk-huawei-maas-local");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Keys" })).toBeVisible();
  await expect(page).toHaveURL(/\/keys$/);
});

test("manages LiteLLM search tools", async ({ page }) => {
  let searchTools = [{
    search_tool_id: "tool-db",
    search_tool_name: "perplexity-search",
    litellm_params: { search_provider: "perplexity", api_key: "sk-***", api_base: "https://api.perplexity.ai" },
    search_tool_info: { description: "Perplexity tool" },
    created_at: "2026-06-18T12:00:00Z",
    updated_at: "2026-06-18T12:30:00Z",
    is_from_config: false
  }, {
    search_tool_name: "config-search",
    litellm_params: { search_provider: "tavily", api_key: "tvly-***" },
    search_tool_info: { description: "Config tool" },
    is_from_config: true
  }];
  let createPayload: Record<string, any> | undefined;
  let updatePayload: Record<string, any> | undefined;
  let testPayload: Record<string, any> | undefined;
  let deleteUrl = "";

  await page.route("**/api/search-tools/**", async (route) => {
    const method = route.request().method();
    if (route.request().url().endsWith("/api/search-tools/providers")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ providers: [{ provider_name: "perplexity", ui_friendly_name: "Perplexity" }, { provider_name: "tavily", ui_friendly_name: "Tavily" }] })
      });
      return;
    }
    if (route.request().url().endsWith("/api/search-tools/test-connection")) {
      testPayload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "success", message: "Successfully connected", test_query: "test", results_count: 5 }) });
      return;
    }
    if (method === "PUT") {
      updatePayload = route.request().postDataJSON();
      searchTools = searchTools.map((tool) => tool.search_tool_id === "tool-db" ? { ...tool, ...updatePayload, updated_at: "2026-06-18T13:00:00Z" } : tool);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ search_tool_id: "tool-db", ...updatePayload }) });
      return;
    }
    if (method === "DELETE") {
      deleteUrl = route.request().url();
      searchTools = searchTools.filter((tool) => tool.search_tool_id !== "tool-db");
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "deleted" }) });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/search-tools", async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ search_tools: searchTools }) });
      return;
    }
    if (method === "POST") {
      createPayload = route.request().postDataJSON();
      searchTools = [{ search_tool_id: "tool-new", created_at: "2026-06-18T14:00:00Z", updated_at: "2026-06-18T14:00:00Z", is_from_config: false, ...createPayload }, ...searchTools];
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ search_tool_id: "tool-new", ...createPayload }) });
      return;
    }
    await route.continue();
  });

  await page.goto("/search-tools");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("sk-huawei-maas-local");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Search Tools" })).toBeVisible();
  await expect(page).toHaveURL(/\/search-tools$/);
  await expect(page.getByRole("cell", { name: "perplexity-search" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Perplexity", exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /config-search/ }).getByTitle("Edit search tool")).toBeDisabled();
  await expect(page.getByRole("row", { name: /config-search/ }).getByTitle("Delete search tool")).toBeDisabled();

  await page.getByRole("button", { name: "Create search tool" }).click();
  await expect(page.getByRole("dialog", { name: "Create search tool" })).toBeVisible();
  await page.getByLabel("Search tool name").fill("new search");
  await page.getByRole("dialog").getByRole("button", { name: "Create search tool" }).click();
  await expect(page.getByRole("dialog", { name: "Create search tool" })).toBeVisible();
  expect(createPayload).toBeUndefined();
  await page.getByLabel("Search tool name").fill("new-search");
  await page.getByLabel("Search provider").selectOption("perplexity");
  await page.getByLabel("API key").fill("pplx-test");
  await page.getByLabel("API base").fill("https://api.perplexity.ai");
  await page.getByLabel("Timeout seconds").fill("12.5");
  await page.getByLabel("Max retries").fill("2");
  await page.getByLabel("Description").fill("Search for testing");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByText("Connection successful")).toBeVisible();
  expect(testPayload).toMatchObject({
    litellm_params: { search_provider: "perplexity", api_key: "pplx-test", api_base: "https://api.perplexity.ai", timeout: 12.5, max_retries: 2 }
  });
  await page.getByRole("dialog").getByRole("button", { name: "Create search tool" }).click();
  expect(createPayload).toMatchObject({
    search_tool_name: "new-search",
    litellm_params: { search_provider: "perplexity", api_key: "pplx-test", api_base: "https://api.perplexity.ai", timeout: 12.5, max_retries: 2 },
    search_tool_info: { description: "Search for testing" }
  });
  await expect(page.getByRole("cell", { name: "new-search" })).toBeVisible();

  await page.getByRole("row", { name: /perplexity-search/ }).getByTitle("Edit search tool").click();
  await expect(page.getByRole("dialog", { name: "Edit search tool" })).toBeVisible();
  await expect(page.getByLabel("Search tool name")).toHaveValue("perplexity-search");
  await expect(page.getByLabel("Search provider")).toHaveValue("perplexity");
  await page.getByLabel("Search tool name").fill("edited-search");
  await page.getByLabel("Description").fill("Edited description");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  expect(updatePayload).toMatchObject({
    search_tool_name: "edited-search",
    litellm_params: { search_provider: "perplexity", api_base: "https://api.perplexity.ai" },
    search_tool_info: { description: "Edited description" }
  });

  await page.getByRole("row", { name: /edited-search/ }).getByTitle("Delete search tool").click();
  await expect.poll(() => deleteUrl).toContain("/api/search-tools/tool-db");
});

test("opens key and team stats from stats breakdown with paginated logs", async ({ page }) => {
  const recent = Array.from({ length: 12 }, (_, index) => ({
    startTime: `2026-06-12T18:${String(index).padStart(2, "0")}:00Z`,
    model: "glm-5.1",
    api_key: index % 2 ? "key-b" : "key-a",
    team_id: index % 2 ? "team-b" : "team-a",
    spend: 0.1
  }));
  const summary = {
    totals: { spend: 1.2, requests: 12, keys: 2, teams: 2, models: 1 },
    byModel: [{ id: "glm-5.1", name: "glm-5.1", spend: 1.2, requests: 12 }],
    byKey: [{ id: "key-a", name: "Production app", spend: 0.6, requests: 6 }, { id: "key-b", name: "Batch jobs", spend: 0.6, requests: 6 }],
    byTeam: [{ id: "team-a", name: "team-a", spend: 0.6, requests: 6 }, { id: "team-b", name: "team-b", spend: 0.6, requests: 6 }],
    recent
  };
  await page.route("**/api/stats**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) });
  });

  await page.goto("/stats");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("sk-huawei-maas-local");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Spend by team" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Spend by model %" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Spend by key" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Requests by model" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download CSV" })).toHaveAttribute("href", "/api/stats/export.csv");
  await expect(page.getByText("1-10 of 12")).toBeVisible();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("11-12 of 12")).toBeVisible();
  await expect(page.getByRole("button", { name: /Production app/ })).toBeVisible();
  await page.getByRole("button", { name: /Production app/ }).click();
  await expect(page).toHaveURL(/\/stats\/keys\/key-a$/);
  await expect(page.getByRole("heading", { name: "Key stats" })).toBeVisible();
  await expect(page.getByText("API key")).toBeVisible();
  await expect(page.locator(".detail-heading code")).toHaveText("key-a");
  await expect(page.getByRole("img", { name: "Key spend by model" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download CSV" })).toHaveAttribute("href", "/api/stats/keys/key-a/export.csv");
  await expect(page.getByText("Recent key spend logs")).toBeVisible();
  await page.getByRole("button", { name: "Back to stats" }).click();
  await page.getByRole("button", { name: /team-a/ }).click();
  await expect(page).toHaveURL(/\/stats\/teams\/team-a$/);
  await expect(page.getByRole("heading", { name: "Team stats" })).toBeVisible();
  await expect(page.locator(".detail-heading").getByText("Team", { exact: true })).toBeVisible();
  await expect(page.locator(".detail-heading code")).toHaveText("team-a");
  await expect(page.getByRole("img", { name: "Team spend by key" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Requests by model" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Download CSV" })).toHaveAttribute("href", "/api/stats/teams/team-a/export.csv");
  await expect(page.getByText("Recent team spend logs")).toBeVisible();
});
