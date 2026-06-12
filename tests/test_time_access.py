from datetime import datetime, timezone

import pytest

from huawei_litellm.time_access import is_time_access_allowed, time_access_from_metadata


def config(raw):
    parsed = time_access_from_metadata({"huawei_time_access": raw})
    assert parsed is not None
    return parsed


def test_time_access_ignores_missing_config():
    assert time_access_from_metadata({}) is None


def test_time_access_allows_weekday_business_hours():
    access = config(
        {
            "timezone": "Asia/Shanghai",
            "rules": [{"days": [1, 2, 3, 4, 5], "start": "09:00", "end": "17:00"}],
        }
    )

    assert is_time_access_allowed(access, datetime(2026, 6, 15, 2, 0, tzinfo=timezone.utc))
    assert not is_time_access_allowed(access, datetime(2026, 6, 15, 0, 59, tzinfo=timezone.utc))
    assert not is_time_access_allowed(access, datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc))
    assert not is_time_access_allowed(access, datetime(2026, 6, 13, 4, 0, tzinfo=timezone.utc))


def test_time_access_supports_day_only_rules():
    access = config({"timezone": "UTC", "rules": [{"days": [1, 2, 3, 4, 5]}]})

    assert is_time_access_allowed(access, datetime(2026, 6, 15, 23, 59, tzinfo=timezone.utc))
    assert not is_time_access_allowed(access, datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc))


def test_time_access_supports_overnight_windows():
    access = config({"timezone": "UTC", "rules": [{"days": [1], "start": "22:00", "end": "06:00"}]})

    assert is_time_access_allowed(access, datetime(2026, 6, 15, 23, 0, tzinfo=timezone.utc))
    assert is_time_access_allowed(access, datetime(2026, 6, 16, 5, 0, tzinfo=timezone.utc))
    assert not is_time_access_allowed(access, datetime(2026, 6, 15, 5, 0, tzinfo=timezone.utc))
    assert not is_time_access_allowed(access, datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc))


def test_time_access_rejects_invalid_config():
    invalid_configs = [
        {"timezone": "Not/AZone", "rules": [{"days": [1]}]},
        {"timezone": "UTC", "rules": []},
        {"timezone": "UTC", "rules": [{"days": [0]}]},
        {"timezone": "UTC", "rules": [{"days": [1], "start": "09:00"}]},
        {"timezone": "UTC", "rules": [{"days": [1], "start": "09:00", "end": "09:00"}]},
        {"timezone": "UTC", "rules": [{"days": [1], "start": "25:00", "end": "09:00"}]},
    ]

    for raw in invalid_configs:
        with pytest.raises(ValueError):
            time_access_from_metadata({"huawei_time_access": raw})
