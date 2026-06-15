# Huawei MaaS LiteLLM Gateway

Self-hosted LiteLLM gateway for Huawei Cloud MaaS. It fetches the MaaS model catalog from `https://catalog.hwctools.site/models`, generates LiteLLM model config, stores LiteLLM state in Postgres, and adds a custom callback that computes exact Huawei tiered token costs for models such as `glm-5.1`.

## Quick Start

```sh
cp .env.example .env
# edit .env and set HUAWEI_MAAS_API_KEY, LITELLM_MASTER_KEY,
# LITELLM_SALT_KEY, and POSTGRES_PASSWORD
docker compose up -d
```

LiteLLM will listen on `http://localhost:4000` by default. The simple MaaS UI listens on `http://localhost:3002`.

```sh
curl -H "Authorization: Bearer $LITELLM_MASTER_KEY" http://localhost:4000/v1/models
```

## How It Works

- `config-sync` fetches the Huawei MaaS catalog and writes `generated/config.yaml`, `generated/huawei_catalog.json`, and `generated/model_seed.json`.
- `db` runs Postgres for LiteLLM keys, teams, budgets, usage, models, and admin state.
- `litellm` starts from a small custom image layered on `ghcr.io/berriai/litellm-database:main-latest`, adds `asyncpg` for the quota callback, and runs with `STORE_MODEL_IN_DB=True`.
- `model-seed` waits for LiteLLM health, deletes existing DB-backed Huawei MaaS models, and recreates them in LiteLLM’s DB from the latest catalog seed.
- `maas-ui` provides a simpler browser UI for LiteLLM login, key management, team management, model management, prompt policies, testing, and usage stats.
- Each Huawei model routes to the MaaS OpenAI-compatible endpoint with `model: <huawei-model-id>` and `custom_llm_provider: openai`.
- Static LiteLLM pricing is set from the first price range so standard LiteLLM metadata works.
- `custom_callbacks.py` reads the saved catalog, logs exact Huawei MaaS cost, and enforces optional Huawei token quotas and access schedules stored on keys and teams.

## Configuration

Required:

- `HUAWEI_MAAS_API_KEY`: Huawei MaaS API key sent upstream.
- `LITELLM_SALT_KEY`: stable secret used by LiteLLM to encrypt/decrypt stored credentials. Set it once before adding models or keys.

Recommended:

- `LITELLM_MASTER_KEY`: key clients use when calling this LiteLLM proxy.
- `POSTGRES_PASSWORD`: strong Postgres password.

Optional:

- `HOST_PORT`: local host port, default `4000`.
- `CATALOG_URL`: catalog source, default `https://catalog.hwctools.site/models`.
- `LITELLM_LOG`: LiteLLM log level, default `INFO`.
- `HUAWEI_TOKEN_BUDGET_DEFAULT_COMPLETION_RESERVE`: estimated completion-token reservation when a request does not set `max_tokens`, default `4096`.
- `HUAWEI_TOKEN_BUDGET_RESERVATION_TTL_SECONDS`: cleanup age for stale in-flight token reservations, default `3600`.
- `POSTGRES_DB`, `POSTGRES_USER`: Postgres database/user names.
- `UI_PORT`, `UI_SESSION_SECRET`, `UI_SECURE_COOKIES`: simple UI bind port and session cookie settings.

## Key Access Schedules

The simple UI can create keys that are only usable on selected weekdays and, optionally, selected daily hours. The same restriction can be set through LiteLLM key metadata:

```json
{
  "huawei_time_access": {
    "timezone": "America/Sao_Paulo",
    "rules": [
      { "days": [1, 2, 3, 4, 5], "start": "09:00", "end": "17:00" }
    ]
  }
}
```

Days use ISO weekdays, where `1` is Monday and `7` is Sunday. If `start` and `end` are omitted, the key is available all day on the selected days.

## Development

Generate config locally:

```sh
python -m huawei_litellm.sync
```

Run tests:

```sh
python -m pytest
```

Run a live smoke test after `docker compose up -d`:

```sh
./scripts/smoke.sh
```

Run the simple UI checks:

```sh
cd ui
npm test
npm run build
npx playwright test --config playwright.config.ts
```

Keep secrets in `.env`; the generated config references `os.environ/HUAWEI_MAAS_API_KEY` and does not write the MaaS API key to disk.
