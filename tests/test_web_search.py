import asyncio

import pytest

from huawei_litellm import web_search
from huawei_litellm.web_search import WebSearchError, apply_web_search, effective_web_search_config


def run(coro):
    return asyncio.run(coro)


def config(**patch):
    base = {
        "enabled": True,
        "mode": "trigger",
        "search_tool_name": "perplexity-search",
        "trigger": "[SEARCH]",
        "max_results": 2,
        "max_queries": 2,
    }
    base.update(patch)
    return {"huawei_web_search": base}


def test_trigger_mode_ignores_prompt_without_trigger(monkeypatch):
    async def fail_plan(**kwargs):
        raise AssertionError("planner should not run")

    monkeypatch.setattr(web_search, "_plan_search", fail_plan)
    data = {"model": "glm-5.1", "messages": [{"role": "user", "content": "What is a token?"}]}

    result = run(apply_web_search(data, team_metadata=None, key_metadata=config()))

    assert result["messages"][0]["content"] == "What is a token?"
    assert result["metadata"]["huawei_web_search"]["reason"] == "trigger_not_present"


def test_trigger_mode_appends_results_and_removes_trigger(monkeypatch):
    async def plan(**kwargs):
        assert kwargs["planner_model"] == "glm-5.1"
        return {"should_search": True, "queries": ["Huawei MaaS latest models"], "reason": "latest"}

    async def search(**kwargs):
        return {"results": [{"title": "Huawei model list", "url": "https://example.com/models", "snippet": "GLM-5.1 is available."}]}

    monkeypatch.setattr(web_search, "_plan_search", plan)
    monkeypatch.setattr(web_search, "_run_search", search)
    data = {"model": "glm-5.1", "messages": [{"role": "user", "content": "[SEARCH] latest Huawei MaaS models"}]}

    result = run(apply_web_search(data, team_metadata=None, key_metadata=config()))

    content = result["messages"][0]["content"]
    assert "[SEARCH]" not in content
    assert "Web search context:" in content
    assert "GLM-5.1 is available." in content
    assert result["metadata"]["huawei_web_search"]["searched"] is True
    assert result["metadata"]["huawei_web_search"]["queries"] == ["Huawei MaaS latest models"]


def test_automatic_mode_skips_when_planner_says_no(monkeypatch):
    async def plan(**kwargs):
        return {"should_search": False, "queries": [], "reason": "stable_knowledge"}

    async def fail_search(**kwargs):
        raise AssertionError("search should not run")

    monkeypatch.setattr(web_search, "_plan_search", plan)
    monkeypatch.setattr(web_search, "_run_search", fail_search)
    data = {"model": "glm-5.1", "messages": [{"role": "user", "content": "Write a haiku about clouds"}]}

    result = run(apply_web_search(data, team_metadata=None, key_metadata=config(mode="automatic")))

    assert result["messages"][0]["content"] == "Write a haiku about clouds"
    assert result["metadata"]["huawei_web_search"]["reason"] == "stable_knowledge"


def test_internal_request_bypasses_web_search(monkeypatch):
    async def fail_plan(**kwargs):
        raise AssertionError("planner should not run")

    monkeypatch.setattr(web_search, "_plan_search", fail_plan)
    data = {
        "metadata": {"huawei_web_search_internal": True},
        "model": "glm-5.1",
        "messages": [{"role": "user", "content": "[SEARCH] latest news"}],
    }

    result = run(apply_web_search(data, team_metadata=None, key_metadata=config()))

    assert result is data
    assert result["messages"][0]["content"] == "[SEARCH] latest news"


def test_key_config_overrides_team_config():
    effective = effective_web_search_config(
        config(search_tool_name="team-search"),
        config(search_tool_name="key-search", mode="automatic"),
    )

    assert effective is not None
    assert effective.search_tool_name == "key-search"
    assert effective.mode == "automatic"


def test_no_results_raise_web_search_error(monkeypatch):
    async def plan(**kwargs):
        return {"should_search": True, "queries": ["no results"], "reason": "latest"}

    async def search(**kwargs):
        return {"results": []}

    monkeypatch.setattr(web_search, "_plan_search", plan)
    monkeypatch.setattr(web_search, "_run_search", search)

    with pytest.raises(WebSearchError):
        run(
            apply_web_search(
                {"model": "glm-5.1", "messages": [{"role": "user", "content": "[SEARCH] no results"}]},
                team_metadata=None,
                key_metadata=config(),
            )
        )
