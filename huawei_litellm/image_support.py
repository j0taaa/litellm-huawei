from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ImageSupportConfig:
    enabled: bool
    openrouter_api_key: str
    vision_model: str
    extraction_prompt: str
    max_tokens: int


DEFAULT_EXTRACTION_PROMPT = (
    "Describe all visible text, objects, layout, people, charts, and important context in the image. "
    "Be factual and detailed. Do not answer the user's task; only extract image information."
)


async def apply_image_support(
    data: dict[str, Any],
    *,
    config: ImageSupportConfig | None,
    supports_vision: bool,
    base_url: str | None = None,
    api_key: str | None = None,
    parent_key_id: str | None = None,
    parent_team_id: str | None = None,
    key_metadata: dict[str, Any] | None = None,
    team_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if _is_internal_request(data):
        return data
    image_parts = _image_parts(data)
    if not image_parts:
        return data
    if supports_vision:
        return data
    if config is None or not config.enabled:
        raise ImageSupportError("image_support_not_configured")
    helper_api_key = api_key or _internal_api_key()
    if not helper_api_key:
        raise ImageSupportError("image_support_internal_key_missing")
    helper_metadata = _helper_metadata(
        parent_key_id=parent_key_id,
        parent_team_id=parent_team_id,
        key_metadata=key_metadata,
        team_metadata=team_metadata,
    )

    extracted = await _extract_image_text(data, image_parts, config, base_url=base_url or _internal_base_url(), api_key=helper_api_key, metadata=helper_metadata)
    _remove_images_and_append_analysis(data, extracted, config.vision_model)
    return data


class ImageSupportError(Exception):
    pass


def image_support_config_from_row(row: Any) -> ImageSupportConfig | None:
    if not row:
        return None
    enabled = bool(row.get("enabled")) if isinstance(row, dict) else bool(row["enabled"])
    api_key = _row_string(row, "openrouter_api_key")
    vision_model = _row_string(row, "vision_model") or "gpt-4o-mini"
    extraction_prompt = _row_string(row, "extraction_prompt") or DEFAULT_EXTRACTION_PROMPT
    max_tokens = _row_int(row, "max_tokens") or 1200
    return ImageSupportConfig(
        enabled=enabled,
        openrouter_api_key=api_key,
        vision_model=vision_model,
        extraction_prompt=extraction_prompt,
        max_tokens=max(1, max_tokens),
    )


async def _extract_image_text(data: dict[str, Any], image_parts: list[dict[str, Any]], config: ImageSupportConfig, *, base_url: str, api_key: str, metadata: dict[str, Any] | None = None) -> str:
    user_text = "\n\n".join(_user_text_values(data)) or "Analyze the attached image."
    content: list[dict[str, Any]] = [{"type": "text", "text": user_text}]
    content.extend(json.loads(json.dumps(part)) for part in image_parts)
    payload = {
        "model": config.vision_model,
        "messages": [
            {"role": "system", "content": config.extraction_prompt},
            {"role": "user", "content": content},
        ],
        "max_tokens": config.max_tokens,
        "metadata": metadata or {"huawei_image_extraction_internal": True},
    }
    response = await asyncio.to_thread(_litellm_request, f"{base_url}/chat/completions", api_key, payload)
    extracted = _choice_text(response)
    if not extracted:
        raise ImageSupportError("image_extraction_empty")
    return extracted


def _litellm_request(url: str, api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise ImageSupportError(f"image_extraction_failed:{exc.code}:{body[:500]}") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise ImageSupportError(f"image_extraction_failed:{exc}") from exc


def _internal_base_url() -> str:
    return os.environ.get("HUAWEI_LITELLM_INTERNAL_BASE_URL") or os.environ.get("LITELLM_PROXY_URL") or "http://127.0.0.1:4000"


def _internal_api_key() -> str:
    return os.environ.get("HUAWEI_IMAGE_SUPPORT_INTERNAL_KEY") or os.environ.get("LITELLM_MASTER_KEY", "")


def _helper_metadata(
    *,
    parent_key_id: str | None,
    parent_team_id: str | None,
    key_metadata: dict[str, Any] | None,
    team_metadata: dict[str, Any] | None,
) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "huawei_image_extraction_internal": True,
        "huawei_parent_key_id": parent_key_id,
        "huawei_parent_team_id": parent_team_id,
    }
    spend_logs_metadata = {
        "huawei_parent_key_id": parent_key_id,
        "huawei_parent_team_id": parent_team_id,
    }
    metadata["spend_logs_metadata"] = {key: value for key, value in spend_logs_metadata.items() if value is not None}
    if isinstance(key_metadata, dict):
        metadata["huawei_parent_key_metadata"] = key_metadata
    if isinstance(team_metadata, dict):
        metadata["huawei_parent_team_metadata"] = team_metadata
    return {key: value for key, value in metadata.items() if value is not None}


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
        if isinstance(content, list):
            return "\n".join(part.get("text", "") for part in content if isinstance(part, dict) and isinstance(part.get("text"), str)).strip()
    text = first.get("text")
    return text.strip() if isinstance(text, str) else ""


def _remove_images_and_append_analysis(data: dict[str, Any], extracted: str, vision_model: str) -> None:
    appended = False
    messages = data.get("messages")
    if isinstance(messages, list):
        for message in messages:
            if not isinstance(message, dict):
                continue
            content = message.get("content")
            if not isinstance(content, list):
                continue
            text = "\n".join(part["text"] for part in content if isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str))
            message["content"] = text
            if message.get("role") == "user" and not appended:
                message["content"] = f"{text}\n\nImage analysis:\n{extracted}".strip()
                appended = True
    if not appended and isinstance(messages, list):
        messages.append({"role": "user", "content": f"Image analysis:\n{extracted}"})

    metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    metadata["huawei_image_extraction"] = {"extracted": True, "model": vision_model}
    data["metadata"] = metadata


def _image_parts(data: dict[str, Any]) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    messages = data.get("messages")
    if not isinstance(messages, list):
        return parts
    for message in messages:
        if not isinstance(message, dict):
            continue
        content = message.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if isinstance(part, dict) and part.get("type") == "image_url" and isinstance(part.get("image_url"), (dict, str)):
                parts.append(part)
    return parts


def _is_internal_request(data: dict[str, Any]) -> bool:
    metadata = data.get("metadata")
    return isinstance(metadata, dict) and metadata.get("huawei_image_extraction_internal") is True


def _user_text_values(data: dict[str, Any]) -> list[str]:
    values: list[str] = []
    messages = data.get("messages")
    if isinstance(messages, list):
        for message in messages:
            if not isinstance(message, dict) or message.get("role") != "user":
                continue
            content = message.get("content")
            if isinstance(content, str):
                values.append(content)
            elif isinstance(content, list):
                values.extend(part["text"] for part in content if isinstance(part, dict) and part.get("type") == "text" and isinstance(part.get("text"), str))
    for key in ("prompt", "input"):
        if isinstance(data.get(key), str):
            values.append(data[key])
    return [value for value in values if value.strip()]


def _row_string(row: Any, key: str) -> str:
    value = row.get(key) if isinstance(row, dict) else row[key]
    return value if isinstance(value, str) else ""


def _row_int(row: Any, key: str) -> int | None:
    value = row.get(key) if isinstance(row, dict) else row[key]
    return value if isinstance(value, int) else None
