#!/bin/sh
set -eu

INSTALL_DIR="${INSTALL_DIR:-huawei-litellm-ui}"
BASE_URL="${BASE_URL:-https://raw.githubusercontent.com/j0taaa/litellm-huawei/main}"

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

curl -fsSLo docker-compose.yml "$BASE_URL/docker-compose.release.yml"

if [ ! -f .env ]; then
  curl -fsSLo .env "$BASE_URL/.env.release.example"
fi

cat <<'EOF'
Huawei LiteLLM UI files were downloaded.

Next steps:
1. Edit .env and set HUAWEI_MAAS_API_KEY, LITELLM_MASTER_KEY, LITELLM_SALT_KEY, and POSTGRES_PASSWORD.
2. Start the stack:

   docker compose up -d

LiteLLM API: http://localhost:4000
Huawei LiteLLM UI: http://localhost:3002
EOF
