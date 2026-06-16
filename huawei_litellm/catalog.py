from __future__ import annotations

import json
import os
import urllib.request
from dataclasses import dataclass
from typing import Any


DEFAULT_CATALOG_URL = "https://catalog.hwctools.site/models"
DEFAULT_OPENAI_BASE = "https://api-ap-southeast-1.modelarts-maas.com/openai/v1"


@dataclass(frozen=True)
class CatalogSource:
    url: str = DEFAULT_CATALOG_URL
    timeout_seconds: float = 20

    def fetch(self) -> dict[str, Any]:
        with urllib.request.urlopen(self.url, timeout=self.timeout_seconds) as response:
            if response.status != 200:
                raise ValueError(f"catalog returned HTTP {response.status}")
            return json.loads(response.read().decode("utf-8"))


def load_catalog(path_or_url: str | None = None) -> dict[str, Any]:
    source = path_or_url or os.environ.get("CATALOG_URL", DEFAULT_CATALOG_URL)
    if source.startswith(("http://", "https://")):
        return CatalogSource(source).fetch()
    with open(source, "r", encoding="utf-8") as handle:
        return json.load(handle)


def validate_catalog(catalog: dict[str, Any]) -> None:
    if catalog.get("provider") != "Huawei Cloud":
        raise ValueError("catalog provider must be Huawei Cloud")
    if catalog.get("service") != "MaaS":
        raise ValueError("catalog service must be MaaS")

    endpoints = catalog.get("endpoints")
    if not isinstance(endpoints, dict) or not endpoints.get("openaiCompatible"):
        raise ValueError("catalog must include endpoints.openaiCompatible")

    models = catalog.get("models")
    if not isinstance(models, list) or not models:
        raise ValueError("catalog must include at least one model")

    seen_ids: set[str] = set()
    for index, model in enumerate(models):
        model_id = _require_str(model, "id", f"models[{index}]")
        if model_id in seen_ids:
            raise ValueError(f"duplicate model id: {model_id}")
        seen_ids.add(model_id)

        _require_str(model, "name", f"models[{index}]")
        pricing = _require_dict(model, "pricing", f"models[{index}]")
        _validate_ranges(pricing.get("input"), f"{model_id}.pricing.input")
        _validate_ranges(pricing.get("output"), f"{model_id}.pricing.output")

        limits = _require_dict(model, "limits", f"models[{index}]")
        for key in ("contextWindowTokens", "maxInputTokens", "maxOutputTokens"):
            value = limits.get(key)
            if not isinstance(value, int) or value <= 0:
                raise ValueError(f"{model_id}.limits.{key} must be a positive integer")


def openai_base_url(catalog: dict[str, Any]) -> str:
    endpoints = catalog.get("endpoints") or {}
    return endpoints.get("openaiCompatible") or DEFAULT_OPENAI_BASE


def _validate_ranges(ranges: Any, label: str) -> None:
    if not isinstance(ranges, list) or not ranges:
        raise ValueError(f"{label} must include at least one price range")

    expected_start = 0
    for index, price_range in enumerate(ranges):
        if not isinstance(price_range, dict):
            raise ValueError(f"{label}[{index}] must be an object")
        start = price_range.get("start")
        end = price_range.get("end")
        price = price_range.get("tokenPriceUsdPerMillion")
        if not isinstance(start, int) or start < 0:
            raise ValueError(f"{label}[{index}].start must be a non-negative integer")
        if not isinstance(end, int) or end < start:
            raise ValueError(f"{label}[{index}].end must be an integer >= start")
        if start < expected_start:
            raise ValueError(f"{label}[{index}] overlaps the previous range")
        if start > expected_start:
            raise ValueError(f"{label}[{index}] leaves a gap after the previous range")
        if not isinstance(price, (int, float)) or price <= 0:
            raise ValueError(f"{label}[{index}].tokenPriceUsdPerMillion must be positive")
        expected_start = end + 1


def _require_dict(value: dict[str, Any], key: str, label: str) -> dict[str, Any]:
    result = value.get(key)
    if not isinstance(result, dict):
        raise ValueError(f"{label}.{key} must be an object")
    return result


def _require_str(value: dict[str, Any], key: str, label: str) -> str:
    result = value.get(key)
    if not isinstance(result, str) or not result:
        raise ValueError(f"{label}.{key} must be a non-empty string")
    return result
