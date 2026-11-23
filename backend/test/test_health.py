from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_endpoint_returns_200_ok():
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200

        body = response.json()
        assert body["status"] == "ok"
        assert "sla_worker_running" in body
        assert "sla_poll_interval_seconds" in body