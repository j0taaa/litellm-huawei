import { expect, test } from "@playwright/test";

test("login and navigate main MaaS UI pages", async ({ page }) => {
  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "LiteLLM Access" })).toBeVisible();
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("sk-huawei-maas-local");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByRole("main").getByText("Models")).toBeVisible();

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

  await page.getByRole("link", { name: "Teams" }).click();
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  await expect(page).toHaveURL(/\/teams$/);
  await expect(page.getByPlaceholder("Team alias")).toBeVisible();

  let modelCreatePayload: Record<string, any> | undefined;
  let modelUpdatePayload: Record<string, any> | undefined;
  let modelDeleteUrl = "";
  await page.route("**/api/models**", async (route) => {
    const method = route.request().method();
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
  await page.getByRole("link", { name: "Models" }).click();
  await expect(page.getByRole("heading", { name: "Models" })).toBeVisible();
  await expect(page).toHaveURL(/\/models$/);
  await expect(page.getByRole("cell", { name: "glm-test", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add model" }).click();
  await page.getByLabel("Model name").fill("new-model");
  await page.getByLabel("Upstream model").fill("new-upstream");
  await page.getByLabel("Provider").fill("openai");
  await page.getByLabel("API base").fill("https://example.com/v1");
  await page.getByLabel("API key reference").fill("os.environ/HUAWEI_MAAS_API_KEY");
  await page.getByLabel("Input USD / 1M").fill("1.5");
  await page.getByLabel("Output USD / 1M").fill("2.5");
  await page.getByRole("dialog").getByRole("button", { name: "Add model" }).click();
  expect(modelCreatePayload).toMatchObject({
    model_name: "new-model",
    litellm_params: { model: "new-upstream", custom_llm_provider: "openai" },
    model_info: { id: "custom-new-model", key: "new-upstream", input_cost_per_token: 0.0000015, output_cost_per_token: 0.0000025 }
  });
  await page.getByTitle("Edit model").first().click();
  await expect(page.getByRole("dialog", { name: "Edit model" })).toBeVisible();
  await expect(page.getByLabel("Model name")).toHaveValue("glm-test");
  await page.getByLabel("Display name").fill("GLM Edited");
  await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  expect(modelUpdatePayload).toMatchObject({ model_name: "glm-test", model_info: { id: "model-glm-test", huawei_maas: { name: "GLM Edited" } } });
  await page.getByTitle("Delete model").first().click();
  await expect.poll(() => modelDeleteUrl).toContain("/api/models/model-glm-test");

  await page.route("**/api/teams**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ teams: [{ team_id: "team-safe", team_alias: "Safety team" }] })
      });
      return;
    }
    await route.continue();
  });
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

test("opens key stats from stats breakdown", async ({ page }) => {
  const summary = {
    totals: { spend: 0.3, requests: 2, keys: 1, teams: 1, models: 1 },
    byModel: [{ id: "glm-5.1", name: "glm-5.1", spend: 0.3, requests: 2 }],
    byKey: [{ id: "key-a", name: "key-a", spend: 0.3, requests: 2 }],
    byTeam: [{ id: "team-a", name: "team-a", spend: 0.3, requests: 2 }],
    recent: [{ startTime: "2026-06-12T18:00:00Z", model: "glm-5.1", api_key: "key-a", team_id: "team-a", spend: 0.3 }]
  };
  await page.route("**/api/stats**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(summary) });
  });

  await page.goto("/stats");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("sk-huawei-maas-local");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await page.getByRole("button", { name: /key-a/ }).click();
  await expect(page).toHaveURL(/\/stats\/keys\/key-a$/);
  await expect(page.getByRole("heading", { name: "Key stats" })).toBeVisible();
  await expect(page.getByText("API key")).toBeVisible();
  await expect(page.locator(".detail-heading code")).toHaveText("key-a");
  await expect(page.getByText("Recent key spend logs")).toBeVisible();
});
