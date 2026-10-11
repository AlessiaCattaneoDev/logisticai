from fastapi.testclient import TestClient

from main import create_app


def test_health_risponde_ok():
    client = TestClient(create_app())
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
