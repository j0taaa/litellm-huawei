CATALOG = {
    "provider": "Huawei Cloud",
    "service": "MaaS",
    "endpoints": {
        "openaiCompatible": "https://api-ap-southeast-1.modelarts-maas.com/openai/v1",
    },
    "currency": "USD",
    "pricingUnit": "1M tokens",
    "models": [
        {
            "name": "DeepSeek-V4-Flash",
            "id": "deepseek-v4-flash",
            "pricing": {
                "input": [{"start": 0, "end": 1000000, "tokenPriceUsdPerMillion": 0.135}],
                "output": [{"start": 0, "end": 1000000, "tokenPriceUsdPerMillion": 0.27}],
            },
            "limits": {
                "contextWindowTokens": 1000000,
                "maxInputTokens": 1000000,
                "maxOutputTokens": 128000,
                "maxReasoningTokens": 96000,
            },
            "modalities": {"input": ["text"], "output": ["text"]},
            "cache": False,
        },
        {
            "name": "GLM-5.1",
            "id": "glm-5.1",
            "pricing": {
                "input": [
                    {"start": 0, "end": 31999, "tokenPriceUsdPerMillion": 0.809},
                    {"start": 32000, "end": 1000000, "tokenPriceUsdPerMillion": 1.078},
                ],
                "output": [
                    {"start": 0, "end": 31999, "tokenPriceUsdPerMillion": 3.235},
                    {"start": 32000, "end": 1000000, "tokenPriceUsdPerMillion": 3.774},
                ],
            },
            "limits": {
                "contextWindowTokens": 198000,
                "maxInputTokens": 192000,
                "maxOutputTokens": 128000,
                "maxReasoningTokens": 96000,
            },
            "modalities": {"input": ["text"], "output": ["text"]},
            "cache": False,
        },
    ],
}

