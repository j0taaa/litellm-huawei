from __future__ import annotations

import json
import os
import sys
import uuid
import hashlib
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from litellm.integrations.custom_logger import CustomLogger

sys.path.insert(0, str(Path(__file__).resolve().parent))

from huawei_litellm.pricing import find_model, model_cost_usd
from huawei_litellm.prompt_policies import PromptPolicyBlocked, apply_prompt_policies
from huawei_litellm.time_access import is_time_access_allowed, time_access_from_metadata
from huawei_litellm.token_budget import estimate_request_tokens, parse_duration, token_budget_from_metadata


class HuaweiMaaSCostLogger(CustomLogger):
    def __init__(self) -> None:
        self.catalog_path = Path(os.environ.get("HUAWEI_MAAS_CATALOG_PATH", "/app/generated/huawei_catalog.json"))
        self._catalog: dict[str, Any] | None = None
        self._mtime_ns: int | None = None
        self._pool = None
        self._schema_ready = False
        self.default_completion_reserve = int(os.environ.get("HUAWEI_TOKEN_BUDGET_DEFAULT_COMPLETION_RESERVE", "4096"))
        self.reservation_ttl_seconds = int(os.environ.get("HUAWEI_TOKEN_BUDGET_RESERVATION_TTL_SECONDS", "3600"))

    async def async_pre_call_hook(self, user_api_key_dict, cache, data: dict, call_type: str):
        auth_metadata = _auth_metadata(user_api_key_dict)
        team_id = _team_identifier(user_api_key_dict)
        team_metadata = await self._team_metadata(team_id)
        try:
            team_time_access = time_access_from_metadata(team_metadata)
            key_time_access = time_access_from_metadata(auth_metadata)
        except ValueError as exc:
            raise HTTPException(
                status_code=403,
                detail={"error": "time_access_invalid_config", "message": str(exc)},
            ) from exc
        for source, time_access in (("team", team_time_access), ("key", key_time_access)):
            if time_access is not None and not is_time_access_allowed(time_access):
                raise HTTPException(
                    status_code=403,
                    detail={"error": "time_access_denied", "source": source, "timezone": time_access.timezone},
                )

        try:
            policy_result = apply_prompt_policies(data, auth_metadata)
        except PromptPolicyBlocked as exc:
            raise HTTPException(
                status_code=403,
                detail={"error": "prompt_policy_blocked", **exc.match},
            ) from exc
        except ValueError as exc:
            raise HTTPException(
                status_code=403,
                detail={"error": "prompt_policy_invalid_config", "message": str(exc)},
            ) from exc
        data = policy_result.data

        team_budget = token_budget_from_metadata(team_metadata)
        key_budget = token_budget_from_metadata(auth_metadata)
        if team_budget is None and key_budget is None:
            return data

        key_id = _key_identifier(user_api_key_dict)
        if key_budget is not None and not key_id:
            raise HTTPException(status_code=429, detail={"error": "token_budget_key_missing"})
        if team_budget is not None and not team_id:
            raise HTTPException(status_code=429, detail={"error": "token_budget_team_missing"})

        model_id = _request_model_id(data)
        model_max_output_tokens = self._model_max_output_tokens(model_id)
        estimated_tokens = estimate_request_tokens(
            data,
            default_completion_reserve=self.default_completion_reserve,
            model_max_output_tokens=model_max_output_tokens,
        )
        reservations: list[dict[str, Any]] = []
        try:
            for source, budget_key, budget in (
                ("team", f"team:{team_id}" if team_budget is not None else None, team_budget),
                ("key", key_id, key_budget),
            ):
                if budget is None or not budget_key:
                    continue
                reservation = {
                    "reservation_id": str(uuid.uuid4()),
                    "key_id": budget_key,
                    "source": source,
                    "estimated_tokens": estimated_tokens,
                }
                await self._reserve_tokens(
                    key_id=budget_key,
                    reservation_id=reservation["reservation_id"],
                    estimated_tokens=estimated_tokens,
                    max_tokens=budget.max_tokens,
                    reset_duration=budget.reset_duration,
                )
                reservations.append(reservation)
        except HTTPException:
            for reservation in reservations:
                await self._release_reservation(reservation)
            raise

        metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
        metadata["huawei_token_budget_reservations"] = reservations
        if len(reservations) == 1:
            metadata["huawei_token_budget_reservation"] = reservations[0]
        data["metadata"] = metadata
        return data

    async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
        usage = _usage(response_obj)
        reservations = _reservations_from_kwargs(kwargs)
        if reservations:
            actual_tokens = _actual_total_tokens(usage) if usage else 0
            for reservation in reservations:
                await self._reconcile_reservation(reservation, actual_tokens=max(1, actual_tokens))

        if not usage:
            return

        model_id = _configured_model(kwargs)
        if not model_id:
            return

        cost = self._set_huawei_response_cost(model_id, response_obj, usage)
        if cost is None:
            return

        print(
            (
                "huawei_maas_cost "
                f"model={model_id} "
                f"prompt_tokens={cost['prompt_tokens']} "
                f"completion_tokens={cost['completion_tokens']} "
                f"exact_cost_usd={cost['exact_cost']:.12f}"
            ),
            flush=True,
        )

    async def async_log_failure_event(self, kwargs, response_obj, start_time, end_time):
        for reservation in _reservations_from_kwargs(kwargs):
            await self._release_reservation(reservation)

    async def async_post_call_success_hook(self, data: dict, user_api_key_dict, response):
        model_id = _request_model_id(data)
        if model_id:
            self._set_huawei_response_cost(model_id, response)
        return response

    def _load_catalog(self) -> dict[str, Any]:
        stat = self.catalog_path.stat()
        if self._catalog is None or self._mtime_ns != stat.st_mtime_ns:
            with self.catalog_path.open("r", encoding="utf-8") as handle:
                self._catalog = json.load(handle)
            self._mtime_ns = stat.st_mtime_ns
        return self._catalog

    def _model_max_output_tokens(self, model_id: str | None) -> int | None:
        if not model_id:
            return None
        model = find_model(self._load_catalog(), model_id)
        if not model:
            return None
        limits = model.get("limits") if isinstance(model, dict) else None
        value = limits.get("maxOutputTokens") if isinstance(limits, dict) else None
        return value if isinstance(value, int) else None

    def _set_huawei_response_cost(self, model_id: str, response_obj, usage: dict[str, Any] | None = None) -> dict[str, Any] | None:
        usage = usage or _usage(response_obj)
        if not usage:
            return None

        model = find_model(self._load_catalog(), model_id)
        if not model:
            return None

        prompt_tokens = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
        completion_tokens = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
        exact_cost = model_cost_usd(model, prompt_tokens, completion_tokens)

        hidden_params = getattr(response_obj, "_hidden_params", None) or {}
        if not isinstance(hidden_params, dict):
            hidden_params = hidden_params.model_dump() if hasattr(hidden_params, "model_dump") else {}
        hidden_params["response_cost"] = exact_cost
        hidden_params["huawei_maas_response_cost"] = exact_cost
        hidden_params["huawei_maas_prompt_tokens"] = prompt_tokens
        hidden_params["huawei_maas_completion_tokens"] = completion_tokens
        additional_headers = hidden_params.get("additional_headers")
        if not isinstance(additional_headers, dict):
            additional_headers = {}
        additional_headers["llm_provider-x-litellm-response-cost"] = str(exact_cost)
        hidden_params["additional_headers"] = additional_headers
        response_obj._hidden_params = hidden_params
        return {"exact_cost": exact_cost, "prompt_tokens": prompt_tokens, "completion_tokens": completion_tokens}

    async def _reserve_tokens(
        self,
        *,
        key_id: str,
        reservation_id: str,
        estimated_tokens: int,
        max_tokens: int,
        reset_duration: str | None,
    ) -> None:
        pool = await self._db_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await self._cleanup_stale_reservations(conn, key_id)
                now = datetime.now(timezone.utc)
                row = await conn.fetchrow(
                    "SELECT * FROM huawei_token_budget_windows WHERE key_id = $1 FOR UPDATE",
                    key_id,
                )
                window_start, window_end = _window_bounds(now, reset_duration)
                used_tokens = 0
                reserved_tokens = 0
                if row:
                    used_tokens = int(row["used_tokens"] or 0)
                    reserved_tokens = int(row["reserved_tokens"] or 0)
                    if _window_expired(row["window_end"], now) or row["reset_duration"] != reset_duration:
                        used_tokens = 0
                        reserved_tokens = 0
                    else:
                        window_start = row["window_start"]
                        window_end = row["window_end"]

                if used_tokens + reserved_tokens + estimated_tokens > max_tokens:
                    raise HTTPException(
                        status_code=429,
                        detail={
                            "error": "token_budget_exceeded",
                            "max_tokens": max_tokens,
                            "used_tokens": used_tokens,
                            "reserved_tokens": reserved_tokens,
                            "requested_tokens": estimated_tokens,
                        },
                    )

                await conn.execute(
                    """
                    INSERT INTO huawei_token_budget_windows
                      (key_id, window_start, window_end, reset_duration, max_tokens, used_tokens, reserved_tokens, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, now())
                    ON CONFLICT (key_id) DO UPDATE SET
                      window_start = EXCLUDED.window_start,
                      window_end = EXCLUDED.window_end,
                      reset_duration = EXCLUDED.reset_duration,
                      max_tokens = EXCLUDED.max_tokens,
                      used_tokens = EXCLUDED.used_tokens,
                      reserved_tokens = EXCLUDED.reserved_tokens,
                      updated_at = now()
                    """,
                    key_id,
                    window_start,
                    window_end,
                    reset_duration,
                    max_tokens,
                    used_tokens,
                    reserved_tokens + estimated_tokens,
                )
                await conn.execute(
                    """
                    INSERT INTO huawei_token_budget_reservations (reservation_id, key_id, estimated_tokens, created_at)
                    VALUES ($1, $2, $3, now())
                    """,
                    reservation_id,
                    key_id,
                    estimated_tokens,
                )

    async def _reconcile_reservation(self, reservation: dict[str, Any], *, actual_tokens: int) -> None:
        pool = await self._db_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT * FROM huawei_token_budget_reservations WHERE reservation_id = $1 FOR UPDATE",
                    reservation["reservation_id"],
                )
                if not row:
                    return
                await conn.execute(
                    """
                    UPDATE huawei_token_budget_windows
                    SET used_tokens = used_tokens + $2,
                        reserved_tokens = GREATEST(0, reserved_tokens - $3),
                        updated_at = now()
                    WHERE key_id = $1
                    """,
                    row["key_id"],
                    actual_tokens,
                    int(row["estimated_tokens"] or 0),
                )
                await conn.execute(
                    "DELETE FROM huawei_token_budget_reservations WHERE reservation_id = $1",
                    reservation["reservation_id"],
                )

    async def _release_reservation(self, reservation: dict[str, Any]) -> None:
        pool = await self._db_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    "SELECT * FROM huawei_token_budget_reservations WHERE reservation_id = $1 FOR UPDATE",
                    reservation["reservation_id"],
                )
                if not row:
                    return
                await conn.execute(
                    """
                    UPDATE huawei_token_budget_windows
                    SET reserved_tokens = GREATEST(0, reserved_tokens - $2),
                        updated_at = now()
                    WHERE key_id = $1
                    """,
                    row["key_id"],
                    int(row["estimated_tokens"] or 0),
                )
                await conn.execute(
                    "DELETE FROM huawei_token_budget_reservations WHERE reservation_id = $1",
                    reservation["reservation_id"],
                )

    async def _cleanup_stale_reservations(self, conn, key_id: str) -> None:
        rows = await conn.fetch(
            """
            DELETE FROM huawei_token_budget_reservations
            WHERE key_id = $1 AND created_at < now() - ($2::text || ' seconds')::interval
            RETURNING estimated_tokens
            """,
            key_id,
            str(self.reservation_ttl_seconds),
        )
        stale_tokens = sum(int(row["estimated_tokens"] or 0) for row in rows)
        if stale_tokens:
            await conn.execute(
                """
                UPDATE huawei_token_budget_windows
                SET reserved_tokens = GREATEST(0, reserved_tokens - $2),
                    updated_at = now()
                WHERE key_id = $1
                """,
                key_id,
                stale_tokens,
            )

    async def _team_metadata(self, team_id: str | None) -> dict[str, Any] | None:
        if not team_id:
            return None
        pool = await self._db_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow('SELECT metadata FROM "LiteLLM_TeamTable" WHERE team_id = $1', team_id)
        if not row:
            return None
        metadata = row["metadata"]
        return metadata if isinstance(metadata, dict) else None

    async def _db_pool(self):
        if self._pool is None:
            import asyncpg

            database_url = os.environ.get("DATABASE_URL")
            if not database_url:
                raise HTTPException(status_code=500, detail={"error": "token_budget_database_url_missing"})
            self._pool = await asyncpg.create_pool(_asyncpg_database_url(database_url), min_size=1, max_size=4)
        if not self._schema_ready:
            async with self._pool.acquire() as conn:
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS huawei_token_budget_windows (
                      key_id TEXT PRIMARY KEY,
                      window_start TIMESTAMPTZ NOT NULL,
                      window_end TIMESTAMPTZ NULL,
                      reset_duration TEXT NULL,
                      max_tokens BIGINT NOT NULL,
                      used_tokens BIGINT NOT NULL DEFAULT 0,
                      reserved_tokens BIGINT NOT NULL DEFAULT 0,
                      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )
                    """
                )
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS huawei_token_budget_reservations (
                      reservation_id TEXT PRIMARY KEY,
                      key_id TEXT NOT NULL REFERENCES huawei_token_budget_windows(key_id) ON DELETE CASCADE,
                      estimated_tokens BIGINT NOT NULL,
                      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )
                    """
                )
                await conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS huawei_token_budget_reservations_key_created_idx
                    ON huawei_token_budget_reservations (key_id, created_at)
                    """
                )
            self._schema_ready = True
        return self._pool


def _configured_model(kwargs: dict[str, Any]) -> str | None:
    model = kwargs.get("model")
    if isinstance(model, str) and model.startswith("openai/"):
        return model.removeprefix("openai/")
    metadata = kwargs.get("litellm_params", {}).get("metadata", {})
    model_info = metadata.get("model_info", {}) if isinstance(metadata, dict) else {}
    key = model_info.get("key") if isinstance(model_info, dict) else None
    return key if isinstance(key, str) else None


def _request_model_id(data: dict[str, Any]) -> str | None:
    model = data.get("model")
    if isinstance(model, str):
        return model.removeprefix("openai/")
    return None


def _usage(response_obj) -> dict[str, Any] | None:
    usage = getattr(response_obj, "usage", None)
    if usage is None and isinstance(response_obj, dict):
        usage = response_obj.get("usage")
    if usage is None:
        return None
    if hasattr(usage, "model_dump"):
        return usage.model_dump()
    if isinstance(usage, dict):
        return usage
    result = {}
    for key in ("prompt_tokens", "completion_tokens", "total_tokens", "input_tokens", "output_tokens"):
        if hasattr(usage, key):
            result[key] = getattr(usage, key)
    return result


def _actual_total_tokens(usage: dict[str, Any]) -> int:
    total = usage.get("total_tokens")
    if isinstance(total, int) and total > 0:
        return total
    prompt_tokens = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    completion_tokens = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)
    return prompt_tokens + completion_tokens


def _auth_metadata(user_api_key_dict: Any) -> dict[str, Any] | None:
    metadata = _auth_value(user_api_key_dict, "metadata")
    return metadata if isinstance(metadata, dict) else None


def _key_identifier(user_api_key_dict: Any) -> str | None:
    for field in ("token", "key_name", "key_alias"):
        value = _auth_value(user_api_key_dict, field)
        if isinstance(value, str) and value:
            return value
    api_key = _auth_value(user_api_key_dict, "api_key")
    if isinstance(api_key, str) and api_key:
        return "sha256:" + hashlib.sha256(api_key.encode("utf-8")).hexdigest()
    return None


def _team_identifier(user_api_key_dict: Any) -> str | None:
    value = _auth_value(user_api_key_dict, "team_id")
    return value if isinstance(value, str) and value else None


def _auth_value(user_api_key_dict: Any, field: str) -> Any:
    if isinstance(user_api_key_dict, dict):
        return user_api_key_dict.get(field)
    if hasattr(user_api_key_dict, field):
        return getattr(user_api_key_dict, field)
    if hasattr(user_api_key_dict, "model_dump"):
        return user_api_key_dict.model_dump().get(field)
    return None


def _reservations_from_kwargs(kwargs: dict[str, Any]) -> list[dict[str, Any]]:
    metadata = kwargs.get("litellm_params", {}).get("metadata", {})
    if not isinstance(metadata, dict):
        return []
    reservations = metadata.get("huawei_token_budget_reservations")
    if isinstance(reservations, list):
        parsed = [_reservation_from_value(item) for item in reservations]
        return [reservation for reservation in parsed if reservation is not None]
    reservation = _reservation_from_value(metadata.get("huawei_token_budget_reservation"))
    return [reservation] if reservation is not None else []


def _reservation_from_value(reservation: Any) -> dict[str, Any] | None:
    if not isinstance(reservation, dict):
        return None
    reservation_id = reservation.get("reservation_id")
    key_id = reservation.get("key_id")
    estimated_tokens = reservation.get("estimated_tokens")
    if not isinstance(reservation_id, str) or not isinstance(key_id, str):
        return None
    if not isinstance(estimated_tokens, int):
        return None
    return {
        "reservation_id": reservation_id,
        "key_id": key_id,
        "source": reservation.get("source") if isinstance(reservation.get("source"), str) else "key",
        "estimated_tokens": estimated_tokens,
    }


def _window_bounds(now: datetime, reset_duration: str | None) -> tuple[datetime, datetime | None]:
    duration = parse_duration(reset_duration)
    if duration is None:
        return now, None
    return now, now + duration


def _window_expired(window_end: datetime | None, now: datetime) -> bool:
    if window_end is None:
        return False
    return window_end <= now


def _asyncpg_database_url(database_url: str) -> str:
    split = urlsplit(database_url)
    ignored = {"connection_limit", "pool_timeout", "pgbouncer"}
    query = urlencode([(key, value) for key, value in parse_qsl(split.query, keep_blank_values=True) if key not in ignored])
    return urlunsplit((split.scheme, split.netloc, split.path, query, split.fragment))


proxy_handler_instance = HuaweiMaaSCostLogger()
