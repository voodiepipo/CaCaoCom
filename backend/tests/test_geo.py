import pytest

from app.services import geo
from tests.conftest import LAT, LON, D, square


def test_full_overlap_is_100():
    plot = geo.to_polygon(square(LON, LAT, D, D))
    baseline = geo.to_area_geometry(square(LON - D, LAT - D, 3 * D, 3 * D))
    assert geo.overlap_percent(plot, baseline) == 100.0


def test_half_overlap_is_about_50():
    plot = geo.to_polygon(square(LON, LAT, D, D))
    baseline = geo.to_area_geometry(square(LON, LAT, D / 2, D))
    assert geo.overlap_percent(plot, baseline) == pytest.approx(50, abs=0.1)


def test_no_overlap_is_0():
    plot = geo.to_polygon(square(LON, LAT, D, D))
    baseline = geo.to_area_geometry(square(LON + 5 * D, LAT, D, D))
    assert geo.overlap_percent(plot, baseline) == 0.0


def test_area_is_geodesic():
    # 0.001° x 0.001° near 13.7°N ≈ 108 m x 111 m ≈ 12,000 m²
    area = geo.area_m2(geo.to_polygon(square(LON, LAT, D, D)))
    assert 11_500 < area < 12_500


@pytest.mark.parametrize(
    "geojson",
    [
        {"type": "Point", "coordinates": [LON, LAT]},
        {"type": "Polygon", "coordinates": [[[LON, LAT], [LON + D, LAT], [LON, LAT]]]},
        {"type": "Polygon", "coordinates": [[[LON, LAT], [LON + D, LAT], [LON, LAT + D], [LON + D, LAT + D]]]},
        # self-intersecting "bow tie"
        {"type": "Polygon", "coordinates": [[[LON, LAT], [LON + D, LAT + D], [LON + D, LAT], [LON, LAT + D], [LON, LAT]]]},
        {"type": "Polygon", "coordinates": [[[200, LAT], [LON + D, LAT], [LON, LAT + D], [200, LAT]]]},
    ],
    ids=["not-polygon", "too-few-points", "not-closed", "self-intersecting", "out-of-range"],
)
def test_rejects_bad_polygons(geojson):
    with pytest.raises(geo.InvalidGeometryError):
        geo.to_polygon(geojson)
