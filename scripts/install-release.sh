#!/bin/sh
set -eu

INSTALL_DIR="${INSTALL_DIR:-huawei-litellm-ui}"
BASE_URL="${BASE_URL:-https://raw.githubusercontent.com/j0taaa/litellm-huawei/main}"

is_interactive() {
  ( : </dev/tty ) >/dev/null 2>&1 && ( : >/dev/tty ) >/dev/null 2>&1
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    od -An -N24 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n'
  fi
}

prompt() {
  prompt_label="$1"
  default_value="${2:-}"

  if ! is_interactive; then
    printf '%s' "$default_value"
    return
  fi

  if [ -n "$default_value" ]; then
    printf '%s [%s]: ' "$prompt_label" "$default_value" >/dev/tty
  else
    printf '%s: ' "$prompt_label" >/dev/tty
  fi

  IFS= read -r reply </dev/tty || reply=""
  if [ -n "$reply" ]; then
    printf '%s' "$reply"
  else
    printf '%s' "$default_value"
  fi
}

prompt_secret() {
  prompt_label="$1"
  default_value="${2:-}"

  if ! is_interactive; then
    printf '%s' "$default_value"
    return
  fi

  if [ -n "$default_value" ]; then
    printf '%s [generated, press Enter to use it]: ' "$prompt_label" >/dev/tty
  else
    printf '%s: ' "$prompt_label" >/dev/tty
  fi

  old_stty="$(stty -g </dev/tty 2>/dev/null || true)"
  stty -echo </dev/tty 2>/dev/null || true
  IFS= read -r reply </dev/tty || reply=""
  if [ -n "$old_stty" ]; then
    stty "$old_stty" </dev/tty 2>/dev/null || true
  else
    stty echo </dev/tty 2>/dev/null || true
  fi
  printf '\n' >/dev/tty

  if [ -n "$reply" ]; then
    printf '%s' "$reply"
  else
    printf '%s' "$default_value"
  fi
}

prompt_required_secret() {
  prompt_label="$1"

  while true; do
    value="$(prompt_secret "$prompt_label")"
    if [ -n "$value" ]; then
      printf '%s' "$value"
      return
    fi
    if ! is_interactive; then
      printf '%s' "$value"
      return
    fi
    printf '%s is required.\n' "$prompt_label" >/dev/tty
  done
}

require_value() {
  name="$1"
  value="$2"
  message="$3"

  if [ -n "$value" ]; then
    return
  fi

  printf '%s\n' "$message" >&2
  exit 1
}

write_env_file() {
  maas_key="${HUAWEI_MAAS_API_KEY:-}"
  master_key="${LITELLM_MASTER_KEY:-}"
  salt_key="${LITELLM_SALT_KEY:-}"
  postgres_password="${POSTGRES_PASSWORD:-}"
  host_port="${HOST_PORT:-4000}"
  ui_port="${UI_PORT:-3002}"
  ui_body_limit_mb="${UI_BODY_LIMIT_MB:-25}"
  catalog_url="${CATALOG_URL:-https://catalog.hwctools.site/models}"
  litellm_log="${LITELLM_LOG:-INFO}"
  postgres_db="${POSTGRES_DB:-litellm}"
  postgres_user="${POSTGRES_USER:-litellm}"
  ui_secure_cookies="${UI_SECURE_COOKIES:-false}"
  image_tag="${IMAGE_TAG:-}"

  if [ -z "$maas_key" ]; then
    maas_key="$(prompt_required_secret "Huawei MaaS API key")"
  fi
  require_value "HUAWEI_MAAS_API_KEY" "$maas_key" "HUAWEI_MAAS_API_KEY is required. Re-run in a terminal or set it before running the installer."

  if [ -z "$master_key" ]; then
    master_key="$(prompt_secret "LiteLLM master key" "sk-$(random_secret)")"
  fi

  if [ -z "$salt_key" ]; then
    salt_key="$(prompt_secret "LiteLLM salt key" "sk-$(random_secret)")"
  fi

  if [ -z "$postgres_password" ]; then
    postgres_password="$(prompt_secret "Postgres password" "$(random_secret)")"
  fi

  host_port="$(prompt "LiteLLM API host port" "$host_port")"
  ui_port="$(prompt "Huawei LiteLLM UI host port" "$ui_port")"
  ui_body_limit_mb="$(prompt "Huawei LiteLLM UI request body limit in MB" "$ui_body_limit_mb")"
  catalog_url="$(prompt "Huawei MaaS catalog URL" "$catalog_url")"
  litellm_log="$(prompt "LiteLLM log level" "$litellm_log")"
  postgres_db="$(prompt "Postgres database name" "$postgres_db")"
  postgres_user="$(prompt "Postgres username" "$postgres_user")"
  ui_secure_cookies="$(prompt "Use secure UI cookies" "$ui_secure_cookies")"
  image_tag="$(prompt "Container image tag" "${image_tag:-latest}")"

  cat > .env <<EOF
HUAWEI_MAAS_API_KEY=$maas_key
LITELLM_MASTER_KEY=$master_key
LITELLM_SALT_KEY=$salt_key
POSTGRES_PASSWORD=$postgres_password

HOST_PORT=$host_port
UI_PORT=$ui_port
UI_BODY_LIMIT_MB=$ui_body_limit_mb
CATALOG_URL=$catalog_url
LITELLM_LOG=$litellm_log
POSTGRES_DB=$postgres_db
POSTGRES_USER=$postgres_user
UI_SECURE_COOKIES=$ui_secure_cookies
EOF

  if [ -n "$image_tag" ]; then
    printf '\nIMAGE_TAG=%s\n' "$image_tag" >> .env
  fi

  ENV_HOST_PORT="$host_port"
  ENV_UI_PORT="$ui_port"
}

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

curl -fsSLo docker-compose.yml "$BASE_URL/docker-compose.release.yml"

if [ ! -f .env ]; then
  write_env_file
  env_message="A new .env file was created from your answers."
else
  env_message=".env already exists, so it was left unchanged."
  ENV_HOST_PORT="${HOST_PORT:-4000}"
  ENV_UI_PORT="${UI_PORT:-3002}"
fi

cat <<'EOF'
Huawei LiteLLM UI files were downloaded.
EOF

printf '%s\n\n' "$env_message"

cat <<'EOF'
Next step:

   docker compose up -d

EOF

printf 'LiteLLM API: http://localhost:%s\n' "$ENV_HOST_PORT"
printf 'Huawei LiteLLM UI: http://localhost:%s\n' "$ENV_UI_PORT"
