import asyncio
import json
import sys
import types

import pytest


class HTTPException(Exception):
    def __init__(self, status_code, detail):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


fastapi = types.ModuleType("fastapi")
fastapi.HTTPException = HTTPException
litellm = types.ModuleType("litellm")
integrations = types.ModuleType("litellm.integrations")
custom_logger = types.ModuleType("litellm.integrations.custom_logger")
custom_logger.CustomLogger = object
sys.modules.setdefault("fastapi", fastapi)
sys.modules.setdefault("litellm", litellm)
sys.modules.setdefault("litellm.integrations", integrations)
sys.modules.setdefault("litellm.integrations.custom_logger", custom_logger)

import custom_callbacks
from custom_callbacks import HuaweiMaaSCostLogger, _reservations_from_kwargs
from tests.fixtures import CATALOG


def run(coro):
    return asyncio.run(coro)


def logger_with_team(monkeypatch, team_metadata):
    logger = HuaweiMaaSCostLogger()

    async def team_metadata_lookup(team_id):
        if team_id is None:
            return None
        assert team_id == "team-a"
        return team_metadata

    async def image_support_config():
        return None

    async def model_supports_vision(model_id):
        return False

    monkeypatch.setattr(logger, "_team_metadata", team_metadata_lookup)
    monkeypatch.setattr(logger, "_model_max_output_tokens", lambda model_id: 64)
    monkeypatch.setattr(logger, "_image_support_config", image_support_config)
    monkeypatch.setattr(logger, "_model_supports_vision", model_supports_vision)
    return logger


def test_post_call_hook_sets_litellm_response_cost_for_tiered_pricing(monkeypatch, tmp_path):
    catalog_path = tmp_path / "catalog.json"
    catalog_path.write_text(json.dumps(CATALOG), encoding="utf-8")
    monkeypatch.setenv("HUAWEI_MAAS_CATALOG_PATH", str(catalog_path))
    logger = HuaweiMaaSCostLogger()

    class Response:
        usage = {"prompt_tokens": 34024, "completion_tokens": 3, "total_tokens": 34027}
        _hidden_params = {}

    response = Response()
    returned = run(logger.async_post_call_success_hook({"model": "glm-5.1"}, {}, response))

    assert returned is response
    assert response._hidden_params["response_cost"] == pytest.approx(0.028079577)
    assert response._hidden_params["additional_headers"]["llm_provider-x-litellm-response-cost"] == str(0.028079577)


def test_team_and_key_token_quotas_create_independent_reservations(monkeypatch):
    logger = logger_with_team(
        monkeypatch,
        {"huawei_token_budget": {"max_tokens": 1000, "reset_duration": "1d"}},
    )
    reservations = []

    async def reserve(**kwargs):
        reservations.append(kwargs)

    monkeypatch.setattr(logger, "_reserve_tokens", reserve)

    data = run(
        logger.async_pre_call_hook(
            {
                "token": "key-a",
                "team_id": "team-a",
                "metadata": {"huawei_token_budget": {"max_tokens": 500, "reset_duration": "1h"}},
            },
            None,
            {"model": "deepseek-v4-pro", "messages": [{"role": "user", "content": "hello"}], "max_tokens": 10},
            "chat",
        )
    )

    assert [reservation["key_id"] for reservation in reservations] == ["team:team-a", "key-a"]
    assert data["metadata"]["huawei_token_budget_reservations"][0]["source"] == "team"
    assert data["metadata"]["huawei_token_budget_reservations"][1]["source"] == "key"


def test_releases_team_reservation_if_key_quota_fails(monkeypatch):
    logger = logger_with_team(
        monkeypatch,
        {"huawei_token_budget": {"max_tokens": 1000}},
    )
    released = []

    async def reserve(**kwargs):
        if kwargs["key_id"] == "key-a":
            raise HTTPException(status_code=429, detail={"error": "token_budget_exceeded"})

    async def release(reservation):
        released.append(reservation)

    monkeypatch.setattr(logger, "_reserve_tokens", reserve)
    monkeypatch.setattr(logger, "_release_reservation", release)

    with pytest.raises(HTTPException):
        run(
            logger.async_pre_call_hook(
                {
                    "token": "key-a",
                    "team_id": "team-a",
                    "metadata": {"huawei_token_budget": {"max_tokens": 1}},
                },
                None,
                {"model": "deepseek-v4-pro", "messages": [{"role": "user", "content": "hello"}], "max_tokens": 10},
                "chat",
            )
        )

    assert len(released) == 1
    assert released[0]["key_id"] == "team:team-a"


def test_team_schedule_denial_blocks_request(monkeypatch):
    logger = logger_with_team(
        monkeypatch,
        {"huawei_time_access": {"timezone": "UTC", "rules": [{"days": [1]}]}},
    )

    def deny_team_schedule(config):
        return False

    monkeypatch.setattr(custom_callbacks, "is_time_access_allowed", deny_team_schedule)

    with pytest.raises(HTTPException) as exc:
        run(
            logger.async_pre_call_hook(
                {"token": "key-a", "team_id": "team-a", "metadata": {}},
                None,
                {"model": "deepseek-v4-pro", "messages": [{"role": "user", "content": "hello"}]},
                "chat",
            )
        )

    assert exc.value.detail["error"] == "time_access_denied"
    assert exc.value.detail["source"] == "team"


def test_prompt_skills_are_appended_before_request(monkeypatch):
    logger = logger_with_team(monkeypatch, {})

    data = run(
        logger.async_pre_call_hook(
            {
                "token": "key-a",
                "metadata": {
                    "huawei_prompt_skills": {
                        "skills": [
                            {
                                "id": "skill-exa",
                                "name": "Exa research",
                                "source": "key",
                                "enabled": True,
                                "instructions": "Use Exa-style web research when relevant.",
                            }
                        ]
                    }
                },
            },
            None,
            {"model": "deepseek-v4-pro", "messages": [{"role": "user", "content": "Find sources"}]},
            "chat",
        )
    )

    assert "Available built-in skills" in data["messages"][0]["content"]
    assert data["metadata"]["huawei_prompt_skills_applied"][0]["id"] == "skill-exa"


def test_image_request_to_text_only_model_is_transformed_when_key_enabled(monkeypatch):
    logger = logger_with_team(monkeypatch, {})

    async def fake_apply(data, *, config, supports_vision, api_key=None, **kwargs):
        assert not supports_vision
        assert api_key == "sk-user-key"
        assert config.vision_model == "openrouter/qwen-vl"
        assert config.extraction_prompt == "Key image prompt."
        data["messages"][0]["content"] = "What is this?\n\nImage analysis:\nA chart with revenue bars."
        data["metadata"] = {"huawei_image_extraction": {"extracted": True, "model": config.vision_model}}
        return data

    monkeypatch.setattr(custom_callbacks, "apply_image_support", fake_apply)

    async def image_support_config():
        return {"enabled": True}

    async def model_supports_vision(model_id):
        return False

    monkeypatch.setattr(logger, "_image_support_config", image_support_config)
    monkeypatch.setattr(logger, "_model_supports_vision", model_supports_vision)

    data = run(
        logger.async_pre_call_hook(
            {"token": "key-a", "api_key": "sk-user-key", "metadata": {"huawei_image_support": {"enabled": True, "vision_model": "openrouter/qwen-vl", "extraction_prompt": "Key image prompt."}}},
            None,
            {
                "model": "deepseek-v4-pro",
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "What is this?"},
                            {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc"}},
                        ],
                    }
                ],
            },
            "chat",
        )
    )

    assert data["messages"][0]["content"].endswith("A chart with revenue bars.")
    assert data["metadata"]["huawei_image_extraction"]["extracted"] is True


def test_image_request_to_text_only_model_is_unchanged_when_not_enabled(monkeypatch):
    logger = logger_with_team(monkeypatch, {})

    async def fake_apply(data, *, config, supports_vision, api_key=None, **kwargs):
        raise AssertionError("image support should not run")

    monkeypatch.setattr(custom_callbacks, "apply_image_support", fake_apply)

    data = {
        "model": "deepseek-v4-pro",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "What is this?"},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc"}},
                ],
            }
        ],
    }

    returned = run(logger.async_pre_call_hook({"token": "key-a", "metadata": {}}, None, data, "chat"))

    assert returned["messages"][0]["content"][1]["type"] == "image_url"


def test_image_request_to_text_only_model_is_transformed_when_team_enabled(monkeypatch):
    logger = logger_with_team(monkeypatch, {"huawei_image_support": {"enabled": True, "vision_model": "openrouter/team-vl", "extraction_prompt": "Team image prompt."}})

    async def fake_apply(data, *, config, supports_vision, api_key=None, **kwargs):
        assert api_key == "sk-user-key"
        assert config.vision_model == "openrouter/team-vl"
        assert config.extraction_prompt == "Team image prompt."
        data["metadata"] = {"huawei_image_extraction": {"extracted": True, "model": config.vision_model}}
        return data

    monkeypatch.setattr(custom_callbacks, "apply_image_support", fake_apply)

    async def image_support_config():
        return {"enabled": True}

    monkeypatch.setattr(logger, "_image_support_config", image_support_config)

    data = run(
        logger.async_pre_call_hook(
            {"token": "key-a", "api_key": "sk-user-key", "team_id": "team-a", "metadata": {}},
            None,
            {"model": "deepseek-v4-pro", "messages": [{"role": "user", "content": [{"type": "image_url", "image_url": {"url": "data:image/png;base64,abc"}}]}]},
            "chat",
        )
    )

    assert data["metadata"]["huawei_image_extraction"]["extracted"] is True


def test_key_image_config_overrides_team_image_config(monkeypatch):
    logger = logger_with_team(monkeypatch, {"huawei_image_support": {"enabled": True, "vision_model": "openrouter/team-vl", "extraction_prompt": "Team prompt."}})

    async def fake_apply(data, *, config, supports_vision, api_key=None, **kwargs):
        assert api_key == "sk-user-key"
        assert config.vision_model == "openrouter/key-vl"
        assert config.extraction_prompt == "Key prompt."
        data["metadata"] = {"huawei_image_extraction": {"extracted": True, "model": config.vision_model}}
        return data

    monkeypatch.setattr(custom_callbacks, "apply_image_support", fake_apply)

    async def image_support_config():
        return {"enabled": False, "vision_model": "openrouter/default-vl", "extraction_prompt": "Default prompt."}

    monkeypatch.setattr(logger, "_image_support_config", image_support_config)

    data = run(
        logger.async_pre_call_hook(
            {"token": "key-a", "api_key": "sk-user-key", "team_id": "team-a", "metadata": {"huawei_image_support": {"enabled": True, "vision_model": "openrouter/key-vl", "extraction_prompt": "Key prompt."}}},
            None,
            {"model": "deepseek-v4-pro", "messages": [{"role": "user", "content": [{"type": "image_url", "image_url": {"url": "data:image/png;base64,abc"}}]}]},
            "chat",
        )
    )

    assert data["metadata"]["huawei_image_extraction"]["model"] == "openrouter/key-vl"


def test_single_reservation_metadata_shape_still_parses():
    reservations = _reservations_from_kwargs(
        {
            "litellm_params": {
                "metadata": {
                    "huawei_token_budget_reservation": {
                        "reservation_id": "reservation-a",
                        "key_id": "key-a",
                        "estimated_tokens": 42,
                    }
                }
            }
        }
    )

    assert reservations == [{
        "reservation_id": "reservation-a",
        "key_id": "key-a",
        "source": "key",
        "estimated_tokens": 42,
    }]
