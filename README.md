# Huawei LiteLLM UI

Self-hosted LiteLLM environment and simpler management UI for Huawei Cloud MaaS. It fetches the MaaS model catalog from `https://catalog.hwctools.site/models`, generates LiteLLM model config, stores LiteLLM state in Postgres, and adds a custom callback that computes exact Huawei tiered token costs for models such as `glm-5.1`.

## Quick Start

Use the published containers when you only want to run the stack:

```sh
curl -fsSL https://raw.githubusercontent.com/j0taaa/litellm-huawei/main/scripts/install-release.sh | sh
cd huawei-litellm-ui

docker compose up -d
```

The installer asks for the Huawei MaaS API key and creates `.env` for you. It generates secure defaults for the LiteLLM master key, LiteLLM salt key, and Postgres password unless you provide them.

LiteLLM will listen on `http://localhost:4000` by default. Huawei LiteLLM UI listens on `http://localhost:3002`.

```sh
curl -H "Authorization: Bearer $LITELLM_MASTER_KEY" http://localhost:4000/v1/models
```

## Published Images

GitHub Actions publishes these images to GHCR on every push to `main`:

- `ghcr.io/j0taaa/litellm-huawei-litellm:latest`
- `ghcr.io/j0taaa/litellm-huawei-tools:latest`
- `ghcr.io/j0taaa/litellm-huawei-ui:latest`

The no-clone runtime files are:

- `docker-compose.release.yml`
- `.env.release.example`
- `scripts/install-release.sh`

Clone this repository only if you want to develop the project or build images locally.

## How It Works

- `config-sync` fetches the Huawei MaaS catalog and writes `generated/config.yaml`, `generated/huawei_catalog.json`, and `generated/model_seed.json`.
- `db` runs Postgres for LiteLLM keys, teams, budgets, usage, models, and admin state.
- `litellm` starts from a small custom image layered on `ghcr.io/berriai/litellm-database:main-latest`, adds `asyncpg` for the quota callback, and runs with `STORE_MODEL_IN_DB=True`.
- `model-seed` waits for LiteLLM health, deletes existing DB-backed Huawei MaaS models, and recreates them in LiteLLM’s DB from the latest catalog seed.
- `maas-ui` provides Huawei LiteLLM UI for LiteLLM login, key management, team management, model management, prompt policies, testing, and usage stats.
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

For local development from a checkout:

```sh
cp .env.example .env
docker compose up -d
```

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
