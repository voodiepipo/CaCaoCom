"""Tests for Backend 2 tasks (Nuttanun):
- Expose overlap percentage via API endpoint (009.1)
- Define flagging rule and 90% threshold config (009.2)
- Implement automatic status update to Flagged (009.2)
"""

import pytest

from app.config import get_settings
from app.models import PlotStatus
from app.services.flagging import decide_status
from tests.conftest import LAT, LON, D, square
from tests.test_plots_api import URL, add_baseline, plot_payload


# ---------- Flagging rule ----------
@pytest.mark.parametrize(
    "overlap, expected",
    [
        (0.0, PlotStatus.FLAGGED),
        (89.9, PlotStatus.FLAGGED),
        (89.99, PlotStatus.FLAGGED),
        (90.0, PlotStatus.CLEAN),  # exactly at threshold is Clean
        (90.1, PlotStatus.CLEAN),
        (100.0, PlotStatus.CLEAN),
        (None, PlotStatus.PENDING_CHECK),
    ],
)
def test_rule_at_default_90(overlap, expected):
    assert decide_status(overlap, threshold=90) == expected


def test_default_threshold_is_90():
    assert get_settings().overlap_threshold_percent == 90


def test_threshold_is_configurable():
    assert decide_status(85, threshold=80) == PlotStatus.CLEAN
    assert decide_status(85, threshold=95) == PlotStatus.FLAGGED


def test_threshold_must_be_0_to_100(monkeypatch):
    from app.config import Settings

    with pytest.raises(ValueError):
        Settings(overlap_threshold_percent=150)


# ---------- Settings endpoint ----------
def test_flagging_config_endpoint(client):
    body = client.get("/api/v1/settings/flagging").json()
    assert body["threshold_percent"] == 90
    assert "FLAGGED" in body["rule"]


# ---------- Overlap endpoint ----------
def test_overlap_endpoint_flagged(client, farmer_id):
    baseline_id = add_baseline(client, square(LON, LAT, D * 0.8, D))
    plot_id = client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, D, D))).json()["id"]

    body = client.get(f"{URL}/{plot_id}/overlap").json()
    assert 79 < body["overlap_percent"] < 81
    assert body["threshold_percent"] == 90
    assert body["status"] == "FLAGGED"
    assert body["baseline_id"] == baseline_id
    assert body["checked_at"] is not None


def test_overlap_endpoint_pending_without_baseline(client, farmer_id):
    plot_id = client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, D, D))).json()["id"]
    body = client.get(f"{URL}/{plot_id}/overlap").json()
    assert body["overlap_percent"] is None
    assert body["status"] == "PENDING_CHECK"


def test_overlap_endpoint_404(client):
    assert client.get(f"{URL}/999/overlap").status_code == 404


# ---------- Automatic status update ----------
def test_status_updates_automatically_on_upload(client, farmer_id):
    add_baseline(client, square(LON, LAT, D / 2, D))
    body = client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, D, D))).json()
    assert body["status"] == "FLAGGED"  # no extra call needed


def test_status_flips_from_flagged_to_clean_after_recheck(client, farmer_id):
    add_baseline(client, square(LON, LAT, D / 2, D))
    plot_id = client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, D, D))).json()["id"]
    add_baseline(client, square(LON - D, LAT - D, 3 * D, 3 * D), cutoff="2021-12-31")
    assert client.post(f"{URL}/{plot_id}/check").json()["status"] == "CLEAN"
