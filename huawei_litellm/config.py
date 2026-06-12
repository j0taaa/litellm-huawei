from __future__ import annotations

import json
from typing import Any

from huawei_litellm.catalog import openai_base_url, validate_catalog
from huawei_litellm.pricing import usd_per_million_to_token


def model_entries(catalog: dict[str, Any]) -> list[dict[str, Any]]:
    validate_catalog(catalog)
    api_base = openai_base_url(catalog)

    model_list = []
    for model in catalog["models"]:
        model_id = model["id"]
        limits = model["limits"]
        input_price = model["pricing"]["input"][0]["tokenPriceUsdPerMillion"]
        output_price = model["pricing"]["output"][0]["tokenPriceUsdPerMillion"]
        tiered = len(model["pricing"]["input"]) > 1 or len(model["pricing"]["output"]) > 1

        model_list.append(
            {
                "model_name": model_id,
                "litellm_params": {
                    "model": model_id,
                    "custom_llm_provider": "openai",
                    "api_base": api_base,
                    "api_key": "os.environ/HUAWEI_MAAS_API_KEY",
                },
                "model_info": {
                    "key": model_id,
                    "litellm_provider": "openai",
                    "mode": "chat",
                    "max_tokens": limits["maxOutputTokens"],
                    "max_input_tokens": limits["maxInputTokens"],
                    "max_output_tokens": limits["maxOutputTokens"],
                    "input_cost_per_token": usd_per_million_to_token(float(input_price)),
                    "output_cost_per_token": usd_per_million_to_token(float(output_price)),
                    "supports_system_messages": True,
                    "supports_function_calling": False,
                    "huawei_maas": {
                        "name": model["name"],
                        "id": model_id,
                        "context_window_tokens": limits["contextWindowTokens"],
                        "max_reasoning_tokens": limits.get("maxReasoningTokens"),
                        "pricing_unit": catalog.get("pricingUnit", "1M tokens"),
                        "currency": catalog.get("currency", "USD"),
                        "tiered_pricing": tiered,
                        "pricing": model["pricing"],
                    },
                },
            }
        )

    return model_list


def render_litellm_config(catalog: dict[str, Any], master_key_env: str = "LITELLM_MASTER_KEY") -> dict[str, Any]:
    validate_catalog(catalog)
    return {
        "model_list": [],
        "litellm_settings": {
            "callbacks": "custom_callbacks.proxy_handler_instance",
            "drop_params": True,
            "turn_off_message_logging": True,
        },
        "general_settings": {
            "master_key": f"os.environ/{master_key_env}",
            "database_url": "os.environ/DATABASE_URL",
        },
    }


def dump_json_yaml(value: dict[str, Any]) -> str:
    return json.dumps(value, indent=2, sort_keys=False) + "\n"
