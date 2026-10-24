"""Geometry helpers. All coordinates are WGS84 (lon, lat); areas are geodesic, in m²."""

from pyproj import Geod
from shapely.geometry import shape
from shapely.geometry.base import BaseGeometry
from shapely.validation import explain_validity

_GEOD = Geod(ellps="WGS84")


class InvalidGeometryError(ValueError):
    pass


def to_polygon(geojson: dict) -> BaseGeometry:
    """Parse a GeoJSON Polygon and reject shapes a field agent could not have walked."""
    if geojson.get("type") != "Polygon":
        raise InvalidGeometryError("Boundary must be a GeoJSON Polygon")

    rings = geojson.get("coordinates") or []
    if not rings or len(rings[0]) < 4:
        raise InvalidGeometryError("Polygon needs at least 3 distinct points plus a closing point")

    for lon, lat, *_ in (pt for ring in rings for pt in ring):
        if not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise InvalidGeometryError(f"Coordinate out of range: ({lon}, {lat})")

    if rings[0][0] != rings[0][-1]:
        raise InvalidGeometryError("Polygon ring must be closed (first point == last point)")

    polygon = shape(geojson)
    if not polygon.is_valid:
        raise InvalidGeometryError(f"Invalid polygon: {explain_validity(polygon)}")
    return polygon


def to_area_geometry(geojson: dict) -> BaseGeometry:
    """Parse a baseline (Polygon or MultiPolygon)."""
    if geojson.get("type") not in ("Polygon", "MultiPolygon"):
        raise InvalidGeometryError("Baseline must be a GeoJSON Polygon or MultiPolygon")
    geom = shape(geojson)
    if not geom.is_valid:
        raise InvalidGeometryError(f"Invalid baseline: {explain_validity(geom)}")
    return geom


def area_m2(geom: BaseGeometry) -> float:
    if geom.is_empty:
        return 0.0
    area, _ = _GEOD.geometry_area_perimeter(geom)
    return abs(area)


def overlap_percent(plot: BaseGeometry, baseline: BaseGeometry) -> float:
    """009.1: share of the plot's area that lies inside the satellite baseline, 0–100."""
    plot_area = area_m2(plot)
    if plot_area == 0:
        return 0.0
    overlap = area_m2(plot.intersection(baseline))
    return round(min(100.0, overlap / plot_area * 100), 2)
