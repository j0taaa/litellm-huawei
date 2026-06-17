from __future__ import annotations

import asyncio
import json
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


async def apply_image_support(data: dict[str, Any], *, config: ImageSupportConfig | None, supports_vision: bool) -> dict[str, Any]:
    image_parts = _image_parts(data)
    if not image_parts:
        return data
    if supports_vision:
        return data
    if config is None or not config.enabled or not config.openrouter_api_key:
        raise ImageSupportError("image_support_not_configured")

    extracted = await _extract_image_text(data, image_parts, config)
    _remove_images_and_append_analysis(data, extracted, config.vision_model)
    return data


class ImageSupportError(Exception):
    pass


def image_support_config_from_row(row: Any) -> ImageSupportConfig | None:
    if not row:
        return None
    enabled = bool(row.get("enabled")) if isinstance(row, dict) else bool(row["enabled"])
    api_key = _row_string(row, "openrouter_api_key")
    vision_model = _row_string(row, "vision_model") or "openai/gpt-4o-mini"
    extraction_prompt = _row_string(row, "extraction_prompt") or DEFAULT_EXTRACTION_PROMPT
    max_tokens = _row_int(row, "max_tokens") or 1200
    return ImageSupportConfig(
        enabled=enabled,
        openrouter_api_key=api_key,
        vision_model=vision_model,
        extraction_prompt=extraction_prompt,
        max_tokens=max(1, max_tokens),
    )


async def _extract_image_text(data: dict[str, Any], image_parts: list[dict[str, Any]], config: ImageSupportConfig) -> str:
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
    }
    response = await asyncio.to_thread(_openrouter_request, config.openrouter_api_key, payload)
    extracted = _choice_text(response)
    if not extracted:
        raise ImageSupportError("image_extraction_empty")
    return extracted


def _openrouter_request(api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://litellm.hwctools.site",
            "X-Title": "Huawei LiteLLM UI",
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
