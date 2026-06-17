import pytest

from huawei_litellm.seed_models import resolve_env_refs_for_litellm


def test_resolve_env_refs_for_litellm_replaces_api_key(monkeypatch):
    monkeypatch.setenv("HUAWEI_MAAS_API_KEY", "secret-value")
    payload = {"litellm_params": {"api_key": "os.environ/HUAWEI_MAAS_API_KEY"}}

    resolved = resolve_env_refs_for_litellm(payload)

    assert resolved["litellm_params"]["api_key"] == "secret-value"
    assert payload["litellm_params"]["api_key"] == "os.environ/HUAWEI_MAAS_API_KEY"


def test_resolve_env_refs_for_litellm_requires_api_key(monkeypatch):
    monkeypatch.delenv("HUAWEI_MAAS_API_KEY", raising=False)
    payload = {"litellm_params": {"api_key": "os.environ/HUAWEI_MAAS_API_KEY"}}

    with pytest.raises(RuntimeError, match="HUAWEI_MAAS_API_KEY is required"):
        resolve_env_refs_for_litellm(payload)
