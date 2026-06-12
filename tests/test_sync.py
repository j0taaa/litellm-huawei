import json

from huawei_litellm.sync import sync
from tests.fixtures import CATALOG


def test_sync_writes_config_and_catalog(tmp_path):
    source = tmp_path / "catalog.json"
    config_out = tmp_path / "config.yaml"
    catalog_out = tmp_path / "huawei_catalog.json"
    seed_out = tmp_path / "model_seed.json"
    source.write_text(json.dumps(CATALOG), encoding="utf-8")

    sync(str(source), config_out, catalog_out, seed_out)

    config = json.loads(config_out.read_text(encoding="utf-8"))
    catalog = json.loads(catalog_out.read_text(encoding="utf-8"))
    seed = json.loads(seed_out.read_text(encoding="utf-8"))
    assert config["model_list"] == []
    assert seed[1]["model_name"] == "glm-5.1"
    assert catalog["models"][0]["id"] == "deepseek-v4-flash"
    assert (tmp_path / "custom_callbacks.py").exists()
    assert (tmp_path / "huawei_litellm" / "pricing.py").exists()
