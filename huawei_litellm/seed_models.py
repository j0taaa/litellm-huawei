from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def request_json(
    base_url: str,
    path: str,
    master_key: str,
    method: str = "GET",
    payload: Any | None = None,
    ignore_statuses: set[int] | None = None,
) -> Any:
    data = None
    headers = {
        "Authorization": f"Bearer {master_key}",
        "Content-Type": "application/json",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(base_url.rstrip("/") + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        if ignore_statuses and exc.code in ignore_statuses:
            return None
        raise


def wait_for_ready(base_url: str, timeout_seconds: int) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(base_url.rstrip("/") + "/health/readiness", timeout=5) as response:
                if response.status == 200:
                    return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(2)
    raise TimeoutError(f"LiteLLM did not become ready within {timeout_seconds} seconds")


def seed_models(base_url: str, master_key: str, seed_path: Path) -> None:
    models = json.loads(seed_path.read_text(encoding="utf-8"))
    info = request_json(base_url, "/model/info", master_key)
    for item in info.get("data", []):
        model_info = item.get("model_info") or {}
        if model_info.get("huawei_maas"):
            request_json(base_url, "/model/delete", master_key, method="POST", payload={"id": model_info["id"]})

    for model in models:
        model = json.loads(json.dumps(model))
        model_id = "huawei-maas-" + model["model_name"].replace(".", "-")
        request_json(
            base_url,
            "/model/delete",
            master_key,
            method="POST",
            payload={"id": model_id},
            ignore_statuses={400, 404},
        )
        model["model_info"]["id"] = model_id
        model["model_info"]["db_model"] = True
        request_json(base_url, "/model/new", master_key, method="POST", payload=model)
        print(f"seeded Huawei MaaS model {model['model_name']}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed generated Huawei MaaS models into LiteLLM DB")
    parser.add_argument("--base-url", default=os.environ.get("LITELLM_BASE_URL", "http://litellm:4000"))
    parser.add_argument("--master-key", default=os.environ.get("LITELLM_MASTER_KEY", "sk-huawei-maas-local"))
    parser.add_argument("--seed-path", default=os.environ.get("MODEL_SEED_PATH", "/workspace/generated/model_seed.json"))
    parser.add_argument("--ready-timeout", type=int, default=120)
    args = parser.parse_args()

    wait_for_ready(args.base_url, args.ready_timeout)
    seed_models(args.base_url, args.master_key, Path(args.seed_path))


if __name__ == "__main__":
    main()
