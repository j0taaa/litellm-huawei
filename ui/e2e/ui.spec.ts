import { expect, test } from "@playwright/test";

test("login and navigate main MaaS UI pages", async ({ page }) => {
  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "LiteLLM Access" })).toBeVisible();
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("sk-huawei-maas-local");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByText("Models")).toBeVisible();

  await page.getByRole("link", { name: "Keys" }).click();
  await expect(page.getByRole("heading", { name: "Keys" })).toBeVisible();
  await expect(page).toHaveURL(/\/keys$/);
  let createPayload: Record<string, any> | undefined;
  let updatePayload: Record<string, any> | undefined;
  let updateUrl = "";
  let deletePayload: Record<string, any> | undefined;
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
      createPayload = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ key: "sk-test-schedule" }) });
      return;
    }
    if (method === "PATCH") {
      updateUrl = route.request().url();
      updatePayload = route.request().postDataJSON();
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
  await expect(page.getByLabel("Set token budget")).not.toBeChecked();
  await expect(page.getByText("No total token budget is enforced.")).toBeVisible();
  await page.getByLabel("Set token budget").check();
  await page.getByLabel("Total token budget").fill("10000");
  await expect(page.getByLabel("Reset token budget")).not.toBeChecked();
  await page.getByLabel("Reset token budget").check();
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
  await page.getByRole("dialog").getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText("sk-test-schedule")).toBeVisible();
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
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Delete test")).toBeVisible();
  await page.getByTitle("Edit key").first().click();
  await expect(page.getByRole("dialog", { name: "Edit key" })).toBeVisible();
  await expect(page.getByPlaceholder("Production app")).toHaveValue("Delete test");
  await expect(page.getByLabel("Budget USD")).toHaveValue("25");
  await expect(page.getByLabel("Max TPS")).toHaveValue("2");
  await expect(page.getByLabel("Max TPM")).toHaveValue("1000");
  await expect(page.getByLabel("Max parallel")).toHaveValue("2");
  await expect(page.getByLabel("Access timezone")).toHaveValue("UTC");
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
    }
  });
  await page.getByTitle("Delete key").first().click();
  expect(deletePayload).toEqual({ keys: ["hash-delete-test"] });

  await page.getByRole("link", { name: "Teams" }).click();
  await expect(page.getByRole("heading", { name: "Teams" })).toBeVisible();
  await expect(page).toHaveURL(/\/teams$/);
  await expect(page.getByPlaceholder("Team alias")).toBeVisible();

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Keys" })).toBeVisible();
  await expect(page).toHaveURL(/\/keys$/);
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
