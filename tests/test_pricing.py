import pytest

from huawei_litellm.pricing import model_cost_usd, range_cost_usd, usd_per_million_to_token
from tests.fixtures import CATALOG


def test_usd_per_million_to_token():
    assert usd_per_million_to_token(1.0) == 0.000001


def test_single_range_cost():
    model = CATALOG["models"][0]
    assert model_cost_usd(model, 1000, 2000) == (1000 * 0.135 / 1_000_000) + (2000 * 0.27 / 1_000_000)


def test_tiered_cost_crosses_32k_boundary():
    model = CATALOG["models"][1]
    input_cost = (32000 * 0.809 / 1_000_000) + (1000 * 1.078 / 1_000_000)
    output_cost = (32000 * 3.235 / 1_000_000) + (5 * 3.774 / 1_000_000)
    assert model_cost_usd(model, 33000, 32005) == input_cost + output_cost


def test_tiered_cost_uses_lower_price_through_token_32000():
    model = CATALOG["models"][1]
    input_cost = 32000 * 0.809 / 1_000_000
    output_cost = 32000 * 3.235 / 1_000_000
    assert model_cost_usd(model, 32000, 32000) == pytest.approx(input_cost + output_cost)


def test_tiered_cost_uses_higher_price_starting_at_token_32001():
    model = CATALOG["models"][1]
    input_cost = (32000 * 0.809 / 1_000_000) + (1 * 1.078 / 1_000_000)
    output_cost = (32000 * 3.235 / 1_000_000) + (1 * 3.774 / 1_000_000)
    assert model_cost_usd(model, 32001, 32001) == pytest.approx(input_cost + output_cost)


def test_range_cost_extends_last_range_for_unexpected_large_usage():
    ranges = [{"start": 0, "end": 9, "tokenPriceUsdPerMillion": 2.0}]
    assert range_cost_usd(12, ranges) == pytest.approx(12 * 2.0 / 1_000_000)
