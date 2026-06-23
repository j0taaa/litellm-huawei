from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class WebSearchConfig:
    enabled: bool
    mode: str
    search_tool_name: str
    trigger: str = "[SEARCH]"
    max_results: int = 5
    max_queries: int = 2


class WebSearchError(Exception):
    pass


async def apply_web_search(
    data: dict[str, Any],
    *,
    team_metadata: dict[str, Any] | None,
    key_metadata: dict[str, Any] | None,
    base_url: str | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    if _is_internal_request(data):
        return data

    config = effective_web_search_config(team_metadata, key_metadata)
    if config is None:
        return data

    user_text = "\n\n".join(_user_text_values(data)).strip()
    if not user_text:
        return data
    planner_model = _request_model_id(data)
    if not planner_model:
        _set_metadata(data, {"enabled": True, "mode": config.mode, "searched": False, "reason": "request_model_missing"})
        return data

    search_text = user_text
    if config.mode == "trigger":
        if config.trigger not in user_text:
            _set_metadata(data, {"enabled": True, "mode": config.mode, "searched": False, "reason": "trigger_not_present"})
            return data
        _remove_trigger(data, config.trigger)
        search_text = user_text.replace(config.trigger, " ").strip()

    planner = await _plan_search(
        config=config,
        planner_model=planner_model,
        user_text=search_text,
        base_url=base_url or _internal_base_url(),
        api_key=api_key or _internal_api_key(),
    )
    if not planner.get("should_search"):
        _set_metadata(data, {
            "enabled": True,
            "mode": config.mode,
            "searched": False,
            "reason": _string(planner.get("reason")) or "planner_no_search",
        })
        return data

    queries = _planner_queries(planner, config.max_queries)
    if not queries:
        _set_metadata(data, {"enabled": True, "mode": config.mode, "searched": False, "reason": "planner_returned_no_queries"})
        return data

    results_by_query: list[dict[str, Any]] = []
    for query in queries:
        response = await _run_search(
            config=config,
            query=query,
            base_url=base_url or _internal_base_url(),
            api_key=api_key or _internal_api_key(),
        )
        results_by_query.append({"query": query, "results": _search_results(response)[: config.max_results]})

    result_count = sum(len(group["results"]) for group in results_by_query)
    if result_count == 0:
        raise WebSearchError("web_search_no_results")

    _append_search_context(data, results_by_query)
    _set_metadata(data, {
        "enabled": True,
        "mode": config.mode,
        "searched": True,
        "search_tool_name": config.search_tool_name,
        "planner_model": planner_model,
        "queries": queries,
        "result_count": result_count,
    })
    return data


def effective_web_search_config(team_metadata: dict[str, Any] | None, key_metadata: dict[str, Any] | None) -> WebSearchConfig | None:
    key_config = web_search_config_from_metadata(key_metadata)
    if key_config is not None:
        return key_config
    return web_search_config_from_metadata(team_metadata)


def web_search_config_from_metadata(metadata: dict[str, Any] | None) -> WebSearchConfig | None:
    raw = (metadata or {}).get("huawei_web_search")
    if not isinstance(raw, dict) or raw.get("enabled") is not True:
        return None
    mode = _string(raw.get("mode")) or "trigger"
    if mode not in {"trigger", "automatic"}:
        return None
    search_tool_name = _string(raw.get("search_tool_name"))
    if not search_tool_name:
        return None
    trigger = _string(raw.get("trigger")) or "[SEARCH]"
    return WebSearchConfig(
        enabled=True,
        mode=mode,
        search_tool_name=search_tool_name,
        trigger=trigger,
        max_results=_bounded_int(raw.get("max_results"), default=5, minimum=1, maximum=20),
        max_queries=_bounded_int(raw.get("max_queries"), default=2, minimum=1, maximum=5),
    )


async def _plan_search(*, config: WebSearchConfig, planner_model: str, user_text: str, base_url: str, api_key: str) -> dict[str, Any]:
    prompt = (
        "You decide whether a model request needs live web search before answering. "
        "Return only JSON with keys should_search, queries, reason. "
        "Use should_search=false for stable knowledge, math, writing, coding, or private/internal content. "
        f"If search is needed, return at most {config.max_queries} concise search queries. "
        "For explicit trigger mode, search is usually needed unless the request is malformed."
    )
    payload = {
        "model": planner_model,
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": user_text},
        ],
        "max_tokens": 300,
        "temperature": 0,
        "metadata": {"huawei_web_search_internal": True},
    }
    response = await asyncio.to_thread(_json_request, f"{base_url}/chat/completions", api_key, payload)
    return _planner_json(response)


async def _run_search(*, config: WebSearchConfig, query: str, base_url: str, api_key: str) -> dict[str, Any]:
    payload = {
        "query": query,
        "max_results": config.max_results,
        "metadata": {"huawei_web_search_internal": True},
    }
    return await asyncio.to_thread(
        _json_request,
        f"{base_url}/v1/search/{config.search_tool_name}",
        api_key,
        payload,
    )


def _json_request(url: str, api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        timeout = float(os.environ.get("HUAWEI_WEB_SEARCH_TIMEOUT_SECONDS", "45"))
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise WebSearchError(f"web_search_failed:{exc.code}:{body[:500]}") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise WebSearchError(f"web_search_failed:{exc}") from exc


def _planner_json(response: dict[str, Any]) -> dict[str, Any]:
    text = _choice_text(response)
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:].strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise WebSearchError(f"web_search_planner_invalid_json:{text[:300]}") from exc
    return parsed if isinstance(parsed, dict) else {"should_search": False, "reason": "planner_returned_non_object"}


def _choice_text(response: dict[str, Any]) -> str:
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message")
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, str):
            return content.strip()
    text = first.get("text")
    return text.strip() if isinstance(text, str) else ""


def _planner_queries(planner: dict[str, Any], max_queries: int) -> list[str]:
    raw = planner.get("queries")
    if not isinstance(raw, list):
        return []
    queries: list[str] = []
    for item in raw:
        if isinstance(item, str) and item.strip():
            queries.append(item.strip())
    return queries[:max_queries]


def _search_results(response: dict[str, Any]) -> list[dict[str, Any]]:
    raw = response.get("results")
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict)]


def _request_model_id(data: dict[str, Any]) -> str | None:
    model = data.get("model")
    return model if isinstance(model, str) and model else None


def _append_search_context(data: dict[str, Any], results_by_query: list[dict[str, Any]]) -> None:
    lines = ["Web search context:"]
    index = 1
    for group in results_by_query:
        lines.append(f"Query: {group['query']}")
        for result in group["results"]:
            title = _string(result.get("title")) or "Untitled result"
            url = _string(result.get("url")) or ""
            snippet = _string(result.get("snippet")) or _string(result.get("content")) or ""
            lines.append(f"[{index}] {title}")
            if url:
                lines.append(f"URL: {url}")
            if snippet:
                lines.append(f"Snippet: {snippet}")
            index += 1
    context = "\n".join(lines)
    targets = _user_text_targets(data)
    if targets:
        target = targets[-1]
        target.set(f"{target.get()}\n\n{context}")
        return
    messages = data.get("messages")
    if isinstance(messages, list):
        messages.append({"role": "user", "content": context})
    elif isinstance(data.get("prompt"), str):
        data["prompt"] = f"{data['prompt']}\n\n{context}"
    elif isinstance(data.get("input"), str):
        data["input"] = f"{data['input']}\n\n{context}"


def _remove_trigger(data: dict[str, Any], trigger: str) -> None:
    for target in _user_text_targets(data):
        target.set(target.get().replace(trigger, " ").strip())


def _user_text_values(data: dict[str, Any]) -> list[str]:
    return [target.get() for target in _user_text_targets(data) if target.get().strip()]


class _TextTarget:
    def __init__(self, getter, setter) -> None:
        self.get = getter
        self.set = setter


def _user_text_targets(data: dict[str, Any]) -> list[_TextTarget]:
    targets: list[_TextTarget] = []
    messages = data.get("messages")
    if isinstance(messages, list):
        for message in messages:
            if not isinstance(message, dict) or message.get("role") != "user":
                continue
            content = message.get("content")
            if isinstance(content, str):
                targets.append(_TextTarget(lambda message=message: message["content"], lambda value, message=message: message.__setitem__("content", value)))
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str):
                        targets.append(_TextTarget(lambda part=part: part["text"], lambda value, part=part: part.__setitem__("text", value)))
    for key in ("prompt", "input"):
        if isinstance(data.get(key), str):
            targets.append(_TextTarget(lambda key=key: data[key], lambda value, key=key: data.__setitem__(key, value)))
    return targets


def _set_metadata(data: dict[str, Any], patch: dict[str, Any]) -> None:
    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    metadata["huawei_web_search"] = patch
    data["metadata"] = metadata


def _is_internal_request(data: dict[str, Any]) -> bool:
    metadata = data.get("metadata")
    return isinstance(metadata, dict) and metadata.get("huawei_web_search_internal") is True


def _internal_base_url() -> str:
    return os.environ.get("HUAWEI_WEB_SEARCH_INTERNAL_BASE_URL", "http://127.0.0.1:4000").rstrip("/")


def _internal_api_key() -> str:
    return os.environ.get("HUAWEI_WEB_SEARCH_INTERNAL_KEY") or os.environ.get("LITELLM_MASTER_KEY", "")


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return min(max(parsed, minimum), maximum)


def _string(value: Any) -> str | None:
    return value if isinstance(value, str) and value.strip() else None
