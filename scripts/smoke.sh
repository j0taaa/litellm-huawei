#!/usr/bin/env sh
set -eu

base_url="${LITELLM_BASE_URL:-http://127.0.0.1:${HOST_PORT:-4000}}"
master_key="${LITELLM_MASTER_KEY:-sk-huawei-maas-local}"
python_bin="${PYTHON_BIN:-python3}"

curl -fsS "$base_url/health/readiness" >/dev/null

models="$(curl -fsS -H "Authorization: Bearer $master_key" "$base_url/v1/models")"
printf '%s\n' "$models" | "$python_bin" -m json.tool >/dev/null
printf '%s\n' "$models" | grep -q 'glm-5.1'

curl -fsS \
  -H "Authorization: Bearer $master_key" \
  -H "Content-Type: application/json" \
  "$base_url/v1/chat/completions" \
  -d '{
    "model": "deepseek-v4-flash",
    "messages": [{"role": "user", "content": "Reply with only the word ok."}],
    "max_tokens": 8,
    "temperature": 0
  }' | "$python_bin" -m json.tool >/dev/null

printf 'smoke checks passed\n'
