from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import timedelta
from typing import Any


@dataclass(frozen=True)
class TokenBudgetConfig:
    max_tokens: int
    reset_duration: str | None = None


def token_budget_from_metadata(metadata: dict[str, Any] | None) -> TokenBudgetConfig | None:
    raw = (metadata or {}).get("huawei_token_budget")
    if not isinstance(raw, dict):
        return None
    max_tokens = raw.get("max_tokens")
    if not isinstance(max_tokens, int):
        try:
            max_tokens = int(max_tokens)
        except (TypeError, ValueError):
            return None
    if max_tokens <= 0:
        return None
    reset_duration = raw.get("reset_duration")
    return TokenBudgetConfig(
        max_tokens=max_tokens,
        reset_duration=reset_duration if isinstance(reset_duration, str) and reset_duration else None,
    )


def parse_duration(value: str | None) -> timedelta | None:
    if not value:
        return None
    unit = value[-1]
    try:
        amount = int(value[:-1])
    except ValueError:
        return None
    if amount <= 0:
        return None
    if unit == "s":
        return timedelta(seconds=amount)
    if unit == "m":
        return timedelta(minutes=amount)
    if unit == "h":
        return timedelta(hours=amount)
    if unit == "d":
        return timedelta(days=amount)
    return None


def estimate_request_tokens(
    data: dict[str, Any],
    *,
    default_completion_reserve: int = 4096,
    model_max_output_tokens: int | None = None,
) -> int:
    prompt_tokens = estimate_prompt_tokens(data)
    completion_reserve = completion_token_reserve(
        data,
        default_completion_reserve=default_completion_reserve,
        model_max_output_tokens=model_max_output_tokens,
    )
    return max(1, prompt_tokens + completion_reserve)


def estimate_prompt_tokens(data: dict[str, Any]) -> int:
    if isinstance(data.get("messages"), list):
        return sum(_estimate_value_tokens(message) for message in data["messages"])
    if "prompt" in data:
        return _estimate_value_tokens(data["prompt"])
    if "input" in data:
        return _estimate_value_tokens(data["input"])
    return 1


def completion_token_reserve(
    data: dict[str, Any],
    *,
    default_completion_reserve: int,
    model_max_output_tokens: int | None,
) -> int:
    requested = data.get("max_tokens") or data.get("max_completion_tokens")
    if isinstance(requested, int) and requested > 0:
        reserve = requested
    else:
        reserve = default_completion_reserve
    if model_max_output_tokens and model_max_output_tokens > 0:
        reserve = min(reserve, model_max_output_tokens)
    return max(0, reserve)


def _estimate_value_tokens(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, str):
        return max(1, math.ceil(len(value) / 4))
    if isinstance(value, list):
        return sum(_estimate_value_tokens(item) for item in value)
    if isinstance(value, dict):
        return sum(_estimate_value_tokens(item) for item in value.values())
    return max(1, math.ceil(len(str(value)) / 4))
