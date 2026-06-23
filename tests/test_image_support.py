import asyncio

from huawei_litellm import image_support
from huawei_litellm.image_support import ImageSupportConfig, apply_image_support


def run(coro):
    return asyncio.run(coro)


def test_litellm_prefixed_openrouter_model_is_normalized_before_extraction(monkeypatch):
    payloads = []

    def fake_openrouter_request(api_key, payload):
        payloads.append((api_key, payload))
        return {"choices": [{"message": {"content": "A small chart with visible labels."}}]}

    monkeypatch.setattr(image_support, "_openrouter_request", fake_openrouter_request)

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
                openrouter_api_key="sk-test",
                vision_model="openrouter/openai/gpt-4o-mini",
                extraction_prompt="Describe the image.",
                max_tokens=32,
            ),
            supports_vision=False,
        )
    )

    assert payloads[0][0] == "sk-test"
    assert payloads[0][1]["model"] == "openai/gpt-4o-mini"
    assert "Image analysis:\nA small chart with visible labels." in returned["messages"][0]["content"]
    assert returned["metadata"]["huawei_image_extraction"] == {"extracted": True, "model": "openai/gpt-4o-mini"}
