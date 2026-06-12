from __future__ import annotations

from typing import Any


def usd_per_million_to_token(price: float) -> float:
    return price / 1_000_000


def range_cost_usd(token_count: int, ranges: list[dict[str, Any]]) -> float:
    if token_count <= 0:
        return 0.0

    remaining = token_count
    total = 0.0
    current = 0

    for price_range in ranges:
        start = int(price_range["start"])
        end = int(price_range["end"])
        price_per_token = usd_per_million_to_token(float(price_range["tokenPriceUsdPerMillion"]))

        if current < start:
            skipped = min(remaining, start - current)
            remaining -= skipped
            current += skipped
            if remaining <= 0:
                break

        if current > end:
            continue

        span = end - max(current, start) + 1
        billable = min(remaining, span)
        total += billable * price_per_token
        remaining -= billable
        current += billable
        if remaining <= 0:
            break

    if remaining > 0:
        last = ranges[-1]
        total += remaining * usd_per_million_to_token(float(last["tokenPriceUsdPerMillion"]))

    return total


def model_cost_usd(model: dict[str, Any], prompt_tokens: int, completion_tokens: int) -> float:
    pricing = model["pricing"]
    return range_cost_usd(prompt_tokens, pricing["input"]) + range_cost_usd(
        completion_tokens,
        pricing["output"],
    )


def find_model(catalog: dict[str, Any], model_id: str) -> dict[str, Any] | None:
    for model in catalog.get("models", []):
        if model.get("id") == model_id:
            return model
    return None

