import json

from huawei_litellm.catalog import validate_catalog
from huawei_litellm.config import dump_json_yaml, model_entries, render_litellm_config
from tests.fixtures import CATALOG


def test_validate_catalog_accepts_fixture():
    validate_catalog(CATALOG)


def test_model_entries_contains_models():
    entries = model_entries(CATALOG)
    assert len(entries) == 2

    glm = next(model for model in entries if model["model_name"] == "glm-5.1")
    assert glm["litellm_params"]["model"] == "glm-5.1"
    assert glm["litellm_params"]["custom_llm_provider"] == "openai"
    assert glm["litellm_params"]["api_key"] == "os.environ/HUAWEI_MAAS_API_KEY"
    assert glm["model_info"]["huawei_maas"]["tiered_pricing"] is True
    assert glm["model_info"]["input_cost_per_token"] == 0.809 / 1_000_000


def test_render_litellm_config_contains_callback_and_db_settings():
    config = render_litellm_config(CATALOG)
    assert config["model_list"] == []
    assert config["litellm_settings"]["callbacks"] == "custom_callbacks.proxy_handler_instance"
    assert config["general_settings"]["database_url"] == "os.environ/DATABASE_URL"


def test_dump_json_yaml_is_valid_json_and_yaml_subset():
    dumped = dump_json_yaml(render_litellm_config(CATALOG))
    parsed = json.loads(dumped)
    assert parsed["model_list"] == []


def test_validate_catalog_rejects_overlapping_ranges():
    catalog = json.loads(json.dumps(CATALOG))
    catalog["models"][1]["pricing"]["input"][1]["start"] = 100
    try:
        validate_catalog(catalog)
    except ValueError as exc:
        assert "overlaps" in str(exc)
    else:
        raise AssertionError("expected validation failure")


def test_validate_catalog_rejects_range_that_does_not_start_at_zero():
    catalog = json.loads(json.dumps(CATALOG))
    catalog["models"][0]["pricing"]["input"][0]["start"] = 1
    try:
        validate_catalog(catalog)
    except ValueError as exc:
        assert "leaves a gap" in str(exc)
    else:
        raise AssertionError("expected validation failure")


def test_validate_catalog_rejects_gaps_between_ranges():
    catalog = json.loads(json.dumps(CATALOG))
    catalog["models"][1]["pricing"]["input"][1]["start"] = 32001
    try:
        validate_catalog(catalog)
    except ValueError as exc:
        assert "leaves a gap" in str(exc)
    else:
        raise AssertionError("expected validation failure")
