from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PromptSkill:
    id: str
    name: str
    source: str
    instructions: str


def apply_prompt_skills(data: dict[str, Any], metadata: dict[str, Any] | None) -> dict[str, Any]:
    skills = prompt_skills_from_metadata(metadata)
    if not skills:
        return data

    block = "\n".join(f"- {skill.name} ({skill.source}): {skill.instructions}" for skill in skills)
    instruction = f"Available built-in skills for this request:\n{block}"
    targets = _user_text_targets(data)
    if targets:
        target = targets[-1]
        target.set(f"{target.get()}\n\n{instruction}")
    else:
        messages = data.get("messages")
        if isinstance(messages, list):
            messages.append({"role": "user", "content": instruction})
        elif isinstance(data.get("prompt"), str):
            data["prompt"] = f"{data['prompt']}\n\n{instruction}"
        elif isinstance(data.get("input"), str):
            data["input"] = f"{data['input']}\n\n{instruction}"

    request_metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
    request_metadata["huawei_prompt_skills_applied"] = [
        {"id": skill.id, "name": skill.name, "source": skill.source} for skill in skills
    ]
    data["metadata"] = request_metadata
    return data


def prompt_skills_from_metadata(metadata: dict[str, Any] | None) -> tuple[PromptSkill, ...]:
    raw = (metadata or {}).get("huawei_prompt_skills")
    if not isinstance(raw, dict):
        return ()
    skills = raw.get("skills")
    if not isinstance(skills, list):
        return ()

    parsed: list[PromptSkill] = []
    for raw_skill in skills:
        if not isinstance(raw_skill, dict) or raw_skill.get("enabled") is False:
            continue
        skill_id = _string(raw_skill.get("id"))
        name = _string(raw_skill.get("name"))
        instructions = _string(raw_skill.get("instructions"))
        if not skill_id or not name or not instructions:
            continue
        parsed.append(
            PromptSkill(
                id=skill_id,
                name=name,
                source=_string(raw_skill.get("source")) or "key",
                instructions=instructions,
            )
        )
    return tuple(parsed)


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


def _string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None
