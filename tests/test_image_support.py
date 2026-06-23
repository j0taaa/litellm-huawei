import asyncio

from huawei_litellm import image_support
from huawei_litellm.image_support import ImageSupportConfig, apply_image_support


def run(coro):
    return asyncio.run(coro)


def test_image_extraction_runs_through_litellm_with_user_key(monkeypatch):
    payloads = []

    def fake_litellm_request(url, api_key, payload):
        payloads.append((url, api_key, payload))
        return {"choices": [{"message": {"content": "A small chart with visible labels."}}]}

    monkeypatch.setattr(image_support, "_litellm_request", fake_litellm_request)

    data = {
        "model": "deepseek-v4-flash",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Summarize this image."},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc"}},
                ],
            }
        ],
    }

    returned = run(
        apply_image_support(
            data,
            config=ImageSupportConfig(
                enabled=True,
                openrouter_api_key="",
                vision_model="gpt-4o-mini",
                extraction_prompt="Describe the image.",
                max_tokens=32,
            ),
            supports_vision=False,
            base_url="http://litellm.test",
            api_key="sk-user-key",
        )
    )

    assert payloads[0][0] == "http://litellm.test/chat/completions"
    assert payloads[0][1] == "sk-user-key"
    assert payloads[0][2]["model"] == "gpt-4o-mini"
    assert payloads[0][2]["metadata"]["huawei_image_extraction_internal"] is True
    assert "Image analysis:\nA small chart with visible labels." in returned["messages"][0]["content"]
    assert returned["metadata"]["huawei_image_extraction"] == {"extracted": True, "model": "gpt-4o-mini"}


def test_image_extraction_requires_internal_key_when_user_key_is_unavailable(monkeypatch):
    monkeypatch.delenv("HUAWEI_IMAGE_SUPPORT_INTERNAL_KEY", raising=False)
    monkeypatch.delenv("LITELLM_MASTER_KEY", raising=False)
    data = {
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Summarize this image."},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,abc"}},
                ],
            }
        ],
    }

    try:
        run(
            apply_image_support(
                data,
                config=ImageSupportConfig(True, "", "gpt-4o-mini", "Describe the image.", 32),
                supports_vision=False,
                base_url="http://litellm.test",
            )
        )
    except image_support.ImageSupportError as exc:
        assert str(exc) == "image_support_internal_key_missing"
    else:
        raise AssertionError("missing internal key should fail")
