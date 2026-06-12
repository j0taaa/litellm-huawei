from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
from pathlib import Path

from huawei_litellm.catalog import load_catalog, validate_catalog
from huawei_litellm.config import dump_json_yaml, model_entries, render_litellm_config


def write_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as handle:
        handle.write(content)
        temp_name = handle.name
    os.replace(temp_name, path)


def sync(
    catalog_source: str | None,
    config_path: Path,
    catalog_path: Path,
    seed_path: Path,
    include_runtime_assets: bool = True,
) -> None:
    catalog = load_catalog(catalog_source)
    validate_catalog(catalog)
    config = render_litellm_config(catalog)
    write_atomic(config_path, dump_json_yaml(config))
    write_atomic(catalog_path, json.dumps(catalog, indent=2, sort_keys=False) + "\n")
    write_atomic(seed_path, json.dumps(model_entries(catalog), indent=2, sort_keys=False) + "\n")
    if include_runtime_assets:
        copy_runtime_assets(config_path.parent)


def copy_runtime_assets(target_dir: Path) -> None:
    project_root = Path(__file__).resolve().parent.parent
    shutil.copy2(project_root / "custom_callbacks.py", target_dir / "custom_callbacks.py")
    shutil.copytree(
        project_root / "huawei_litellm",
        target_dir / "huawei_litellm",
        dirs_exist_ok=True,
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate LiteLLM config from Huawei MaaS catalog")
    parser.add_argument("--catalog", default=None, help="Catalog URL or local JSON path")
    parser.add_argument("--config-out", default="generated/config.yaml")
    parser.add_argument("--catalog-out", default="generated/huawei_catalog.json")
    parser.add_argument("--seed-out", default="generated/model_seed.json")
    parser.add_argument("--no-runtime-assets", action="store_true", help="Do not copy callback/package files")
    args = parser.parse_args()

    sync(
        args.catalog,
        Path(args.config_out),
        Path(args.catalog_out),
        Path(args.seed_out),
        include_runtime_assets=not args.no_runtime_assets,
    )


if __name__ == "__main__":
    main()
