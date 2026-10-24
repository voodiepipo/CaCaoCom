import uuid

from tests.conftest import LAT, LON, D, square

URL = "/api/v1/plots"


def plot_payload(farmer_id: int, boundary: dict, **overrides) -> dict:
    return {
        "client_id": str(uuid.uuid4()),
        "farmer_id": farmer_id,
        "region": "north",
        "boundary": boundary,
        "captured_by_agent_id": "agent-01",
        "captured_at": "2026-10-15T08:00:00+07:00",
        **overrides,
    }


def add_baseline(client, geometry: dict, region: str = "north", cutoff: str = "2020-12-31") -> int:
    r = client.post(
        "/api/v1/baselines", json={"region": region, "cutoff_date": cutoff, "geometry": geometry}
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_plot_inside_baseline_is_clean(client, farmer_id):
    baseline_id = add_baseline(client, square(LON - D, LAT - D, 3 * D, 3 * D))
    r = client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, D, D)))
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "CLEAN"
    assert body["overlap_percent"] == 100.0
    assert body["checked_baseline_id"] == baseline_id
    assert body["area_m2"] > 0


def test_plot_below_90_percent_is_flagged(client, farmer_id):
    add_baseline(client, square(LON, LAT, D * 0.8, D))  # covers 80%
    r = client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, D, D)))
    body = r.json()
    assert body["status"] == "FLAGGED"
    assert 79 < body["overlap_percent"] < 81


def test_plot_at_95_percent_is_clean(client, farmer_id):
    add_baseline(client, square(LON, LAT, D * 0.95, D))
    assert client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, D, D))).json()["status"] == "CLEAN"


def test_no_baseline_leaves_plot_pending_then_recheck(client, farmer_id):
    r = client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, D, D)))
    plot = r.json()
    assert plot["status"] == "PENDING_CHECK"
    assert plot["overlap_percent"] is None

    add_baseline(client, square(LON, LAT, D / 2, D))
    r = client.post(f"{URL}/{plot['id']}/check")
    assert r.status_code == 200
    assert r.json()["status"] == "FLAGGED"


def test_latest_active_baseline_is_used(client, farmer_id):
    add_baseline(client, square(LON, LAT, D / 2, D), cutoff="2019-12-31")
    newer = add_baseline(client, square(LON - D, LAT - D, 3 * D, 3 * D), cutoff="2020-12-31")
    body = client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, D, D))).json()
    assert body["checked_baseline_id"] == newer
    assert body["status"] == "CLEAN"


def test_baseline_from_other_region_is_ignored(client, farmer_id):
    add_baseline(client, square(LON - D, LAT - D, 3 * D, 3 * D), region="south")
    body = client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, D, D))).json()
    assert body["status"] == "PENDING_CHECK"


def test_resending_same_client_id_is_idempotent(client, farmer_id):
    payload = plot_payload(farmer_id, square(LON, LAT, D, D))
    first = client.post(URL, json=payload)
    second = client.post(URL, json=payload)
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert len(client.get(URL).json()) == 1


def test_unknown_farmer_returns_404(client):
    r = client.post(URL, json=plot_payload(999, square(LON, LAT, D, D)))
    assert r.status_code == 404


def test_invalid_polygon_returns_422(client, farmer_id):
    bow_tie = {
        "type": "Polygon",
        "coordinates": [[[LON, LAT], [LON + D, LAT + D], [LON + D, LAT], [LON, LAT + D], [LON, LAT]]],
    }
    r = client.post(URL, json=plot_payload(farmer_id, bow_tie))
    assert r.status_code == 422


def test_oversized_plot_returns_422(client, farmer_id):
    r = client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, 1, 1)))  # ~12,000 km²
    assert r.status_code == 422


def test_list_filters_by_status(client, farmer_id):
    add_baseline(client, square(LON, LAT, D / 2, D))
    client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, D, D)))  # flagged
    client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, D / 4, D)))  # inside → clean
    flagged = client.get(URL, params={"status": "FLAGGED"}).json()
    assert len(flagged) == 1
    assert flagged[0]["status"] == "FLAGGED"


def test_captured_at_is_stored_as_utc(client, farmer_id):
    body = client.post(URL, json=plot_payload(farmer_id, square(LON, LAT, D, D))).json()
    assert body["captured_at"].startswith("2026-10-15T01:00:00")  # 08:00+07:00


def test_captured_at_without_timezone_returns_422(client, farmer_id):
    payload = plot_payload(farmer_id, square(LON, LAT, D, D), captured_at="2026-10-15T08:00:00")
    assert client.post(URL, json=payload).status_code == 422


def test_get_missing_plot_returns_404(client):
    assert client.get(f"{URL}/123").status_code == 404
