from datetime import timedelta

from huawei_litellm.token_budget import estimate_request_tokens, parse_duration, token_budget_from_metadata


def test_token_budget_from_metadata_accepts_valid_config():
    config = token_budget_from_metadata(
        {
            "huawei_token_budget": {
                "max_tokens": "10000",
                "reset_duration": "7d",
            }
        }
    )

    assert config is not None
    assert config.max_tokens == 10000
    assert config.reset_duration == "7d"


def test_token_budget_from_metadata_ignores_missing_or_invalid_config():
    assert token_budget_from_metadata({}) is None
    assert token_budget_from_metadata({"huawei_token_budget": {"max_tokens": 0}}) is None
    assert token_budget_from_metadata({"huawei_token_budget": {"max_tokens": "bad"}}) is None


def test_parse_duration_supports_expected_units():
    assert parse_duration("30s") == timedelta(seconds=30)
    assert parse_duration("5m") == timedelta(minutes=5)
    assert parse_duration("2h") == timedelta(hours=2)
    assert parse_duration("7d") == timedelta(days=7)
    assert parse_duration("0d") is None
    assert parse_duration("10w") is None


def test_estimate_request_tokens_uses_prompt_and_completion_reserve():
    tokens = estimate_request_tokens(
        {
            "messages": [{"role": "user", "content": "hello world"}],
            "max_tokens": 50,
        },
        default_completion_reserve=4096,
        model_max_output_tokens=100,
    )

    assert tokens == 54


def test_estimate_request_tokens_caps_default_completion_reserve_by_model_limit():
    tokens = estimate_request_tokens(
        {"messages": [{"role": "user", "content": "hello"}]},
        default_completion_reserve=4096,
        model_max_output_tokens=32,
    )

    assert tokens == 35
