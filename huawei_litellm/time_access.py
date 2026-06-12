from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


@dataclass(frozen=True)
class TimeAccessRule:
    days: tuple[int, ...]
    start: time | None = None
    end: time | None = None


@dataclass(frozen=True)
class TimeAccessConfig:
    timezone: str
    rules: tuple[TimeAccessRule, ...]


def time_access_from_metadata(metadata: dict[str, Any] | None) -> TimeAccessConfig | None:
    raw = (metadata or {}).get("huawei_time_access")
    if not isinstance(raw, dict):
        return None

    timezone_name = raw.get("timezone")
    if not isinstance(timezone_name, str) or not timezone_name:
        raise ValueError("timezone is required")
    _timezone(timezone_name)

    raw_rules = raw.get("rules")
    if not isinstance(raw_rules, list) or not raw_rules:
        raise ValueError("rules must be a non-empty list")

    rules = tuple(_parse_rule(rule) for rule in raw_rules)
    return TimeAccessConfig(timezone=timezone_name, rules=rules)


def is_time_access_allowed(config: TimeAccessConfig, now: datetime | None = None) -> bool:
    timezone = _timezone(config.timezone)
    local_now = (now or datetime.now(timezone)).astimezone(timezone)
    current_time = local_now.time().replace(second=0, microsecond=0)
    return any(_rule_matches(rule, local_now.isoweekday(), current_time) for rule in config.rules)


def _parse_rule(raw: Any) -> TimeAccessRule:
    if not isinstance(raw, dict):
        raise ValueError("rule must be an object")

    raw_days = raw.get("days")
    if not isinstance(raw_days, list) or not raw_days:
        raise ValueError("rule days must be a non-empty list")

    days: list[int] = []
    for raw_day in raw_days:
        if not isinstance(raw_day, int) or raw_day < 1 or raw_day > 7:
            raise ValueError("rule days must use ISO weekdays 1-7")
        if raw_day not in days:
            days.append(raw_day)

    start = _parse_time(raw.get("start"), "start") if raw.get("start") is not None else None
    end = _parse_time(raw.get("end"), "end") if raw.get("end") is not None else None
    if (start is None) != (end is None):
        raise ValueError("rule start and end must be set together")
    if start is not None and end is not None and start == end:
        raise ValueError("rule start and end must be different")

    return TimeAccessRule(days=tuple(days), start=start, end=end)


def _parse_time(value: Any, field: str) -> time:
    if not isinstance(value, str):
        raise ValueError(f"rule {field} must be HH:MM")
    try:
        hour_raw, minute_raw = value.split(":", 1)
        hour = int(hour_raw)
        minute = int(minute_raw)
    except ValueError as exc:
        raise ValueError(f"rule {field} must be HH:MM") from exc
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        raise ValueError(f"rule {field} must be HH:MM")
    return time(hour=hour, minute=minute)


def _rule_matches(rule: TimeAccessRule, weekday: int, current_time: time) -> bool:
    if rule.start is None or rule.end is None:
        return weekday in rule.days
    if rule.start < rule.end:
        if weekday not in rule.days:
            return False
        return rule.start <= current_time < rule.end
    previous_weekday = 7 if weekday == 1 else weekday - 1
    return (weekday in rule.days and current_time >= rule.start) or (
        previous_weekday in rule.days and current_time < rule.end
    )


def _timezone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("timezone is invalid") from exc
