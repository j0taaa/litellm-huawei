import asyncio
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


def run(coro):
    return asyncio.run(coro)


def logger_with_team(monkeypatch, team_metadata):
    logger = HuaweiMaaSCostLogger()

    async def team_metadata_lookup(team_id):
        assert team_id == "team-a"
        return team_metadata

    monkeypatch.setattr(logger, "_team_metadata", team_metadata_lookup)
    monkeypatch.setattr(logger, "_model_max_output_tokens", lambda model_id: 64)
    return logger


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
