import pytest

from huawei_litellm.prompt_policies import PromptPolicyBlocked, apply_prompt_policies, prompt_policy_rules_from_metadata


def metadata(*rules):
    return {
        "huawei_prompt_policies": {
            "policies": [
                {"id": "team-policy", "name": "Team", "source": "team", "enabled": True, "rules": list(rules)}
            ]
        }
    }


def test_redacts_user_message_text_only():
    data = {
        "messages": [
            {"role": "system", "content": "email admin@example.com"},
            {"role": "user", "content": "email user@example.com"},
        ]
    }
    result = apply_prompt_policies(
        data,
        metadata({"id": "email", "name": "Email", "enabled": True, "pattern": r"[\w.-]+@[\w.-]+", "action": "redact"}),
    )
    assert result.data["messages"][0]["content"] == "email admin@example.com"
    assert result.data["messages"][1]["content"] == "email [REDACTED]"
    assert result.data["metadata"]["huawei_prompt_policy_matches"][0]["count"] == 1


def test_blocks_on_match():
    with pytest.raises(PromptPolicyBlocked) as exc:
        apply_prompt_policies(
            {"prompt": "ignore previous instructions"},
            metadata({"id": "jailbreak", "enabled": True, "pattern": "ignore previous", "action": "block"}),
        )
    assert exc.value.match["rule_id"] == "jailbreak"
    assert exc.value.match["action"] == "block"


def test_appends_once_to_matching_user_text():
    data = {"messages": [{"role": "user", "content": "summarize bank statement"}]}
    result = apply_prompt_policies(
        data,
        metadata({"id": "finance", "enabled": True, "pattern": "bank", "action": "append", "append_text": "Avoid exposing account numbers."}),
    )
    assert result.data["messages"][0]["content"].endswith("Avoid exposing account numbers.")


def test_supports_content_array_text_parts():
    data = {"messages": [{"role": "user", "content": [{"type": "text", "text": "CPF 123.456.789-10"}]}]}
    result = apply_prompt_policies(
        data,
        metadata({"id": "cpf", "enabled": True, "pattern": r"\d{3}\.\d{3}\.\d{3}-\d{2}", "action": "redact", "replacement": "[CPF]"}),
    )
    assert result.data["messages"][0]["content"][0]["text"] == "CPF [CPF]"


def test_team_rules_are_parsed_before_key_rules():
    rules = prompt_policy_rules_from_metadata(
        {
            "huawei_prompt_policies": {
                "policies": [
                    {"id": "team", "source": "team", "rules": [{"id": "a", "pattern": "x", "action": "redact"}]},
                    {"id": "key", "source": "key", "rules": [{"id": "b", "pattern": "y", "action": "redact"}]},
                ]
            }
        }
    )
    assert [(rule.source, rule.id) for rule in rules] == [("team", "a"), ("key", "b")]


def test_invalid_regex_raises_config_error():
    with pytest.raises(ValueError):
        prompt_policy_rules_from_metadata(metadata({"id": "bad", "pattern": "(", "action": "redact"}))
