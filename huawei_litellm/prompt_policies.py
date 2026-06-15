from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class PromptPolicyRule:
    policy_id: str
    policy_name: str
    source: str
    id: str
    name: str
    action: str
    pattern: str
    flags: int = 0
    replacement: str = "[REDACTED]"
    append_text: str = ""


@dataclass(frozen=True)
class PromptPolicyResult:
    data: dict[str, Any]
    matches: tuple[dict[str, Any], ...]


class PromptPolicyBlocked(Exception):
    def __init__(self, match: dict[str, Any]) -> None:
        super().__init__("prompt_policy_blocked")
        self.match = match


def apply_prompt_policies(data: dict[str, Any], metadata: dict[str, Any] | None) -> PromptPolicyResult:
    rules = prompt_policy_rules_from_metadata(metadata)
    if not rules:
        return PromptPolicyResult(data=data, matches=())

    matches: list[dict[str, Any]] = []
    for rule in rules:
        for target in _user_text_targets(data):
            value = target.get()
            compiled = re.compile(rule.pattern, rule.flags)
            if not compiled.search(value):
                continue
            match = {
                "policy_id": rule.policy_id,
                "policy_name": rule.policy_name,
                "source": rule.source,
                "rule_id": rule.id,
                "rule_name": rule.name,
                "action": rule.action,
            }
            matches.append(match)
            if rule.action == "block":
                raise PromptPolicyBlocked(match)
            if rule.action == "redact":
                target.set(compiled.sub(rule.replacement, value))
            if rule.action == "append":
                appended = f"{target.get()}\n\nAdditional instruction:\n{rule.append_text}"
                target.set(appended)
                break

    if matches:
        request_metadata = data.get("metadata") if isinstance(data.get("metadata"), dict) else {}
        request_metadata["huawei_prompt_policy_matches"] = _summarize_matches(matches)
        data["metadata"] = request_metadata
    return PromptPolicyResult(data=data, matches=tuple(matches))


def prompt_policy_rules_from_metadata(metadata: dict[str, Any] | None) -> tuple[PromptPolicyRule, ...]:
    raw = (metadata or {}).get("huawei_prompt_policies")
    if not isinstance(raw, dict):
        return ()
    policies = raw.get("policies")
    if not isinstance(policies, list):
        return ()

    rules: list[PromptPolicyRule] = []
    for policy in policies:
        if not isinstance(policy, dict) or policy.get("enabled") is False:
            continue
        policy_id = _string(policy.get("id")) or "unknown-policy"
        policy_name = _string(policy.get("name")) or policy_id
        source = _string(policy.get("source")) or "key"
        for raw_rule in policy.get("rules") if isinstance(policy.get("rules"), list) else []:
            rule = _parse_rule(raw_rule, policy_id=policy_id, policy_name=policy_name, source=source)
            if rule is not None:
                rules.append(rule)
    return tuple(rules)


def _parse_rule(raw: Any, *, policy_id: str, policy_name: str, source: str) -> PromptPolicyRule | None:
    if not isinstance(raw, dict) or raw.get("enabled") is False:
        return None
    pattern = _string(raw.get("pattern"))
    action = _string(raw.get("action"))
    if not pattern or action not in {"block", "redact", "append"}:
        return None
    rule_id = _string(raw.get("id")) or pattern
    flags = _regex_flags(raw.get("flags"))
    try:
        re.compile(pattern, flags)
    except re.error as exc:
        raise ValueError(f"invalid regex for rule {rule_id}: {exc}") from exc
    return PromptPolicyRule(
        policy_id=policy_id,
        policy_name=policy_name,
        source=source,
        id=rule_id,
        name=_string(raw.get("name")) or rule_id,
        action=action,
        pattern=pattern,
        flags=flags,
        replacement=_string(raw.get("replacement")) or "[REDACTED]",
        append_text=_string(raw.get("append_text")) or "",
    )


def _regex_flags(raw: Any) -> int:
    if not isinstance(raw, list):
        return 0
    flags = 0
    if "ignore_case" in raw:
        flags |= re.IGNORECASE
    if "multiline" in raw:
        flags |= re.MULTILINE
    if "dotall" in raw:
        flags |= re.DOTALL
    return flags


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


def _summarize_matches(matches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[tuple[str, str, str], dict[str, Any]] = {}
    for match in matches:
        key = (str(match["policy_id"]), str(match["rule_id"]), str(match["action"]))
        if key not in counts:
            counts[key] = {**match, "count": 0}
        counts[key]["count"] += 1
    return list(counts.values())


def _string(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None
