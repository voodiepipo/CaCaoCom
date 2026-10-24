import os
import tempfile

# Tests run on SQLite so they need no PostgreSQL server. Must be set before `app` is imported.
_tmpdir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmpdir}/test.db"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402

LON, LAT = 100.5, 13.7  # arbitrary point in Thailand
D = 0.001  # ~110 m


def square(x0: float, y0: float, w: float, h: float) -> dict:
    return {
        "type": "Polygon",
        "coordinates": [[[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h], [x0, y0]]],
    }


@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with TestClient(app) as c:
        yield c


@pytest.fixture
def farmer_id(client) -> int:
    r = client.post("/api/v1/farmers", json={"full_name": "Somchai", "region": "north"})
    assert r.status_code == 201
    return r.json()["id"]
