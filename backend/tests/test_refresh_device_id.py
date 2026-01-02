import os
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.errors import ErrorCode
from app.main import app
from app.routers import auth as auth_router


def override_get_db():
    # Use URL as set by conftest (temporary schema). Create engine lazily per process.
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    assert url, "DATABASE_URL/TEST_DATABASE_URL must be set"
    engine = create_engine(url, future=True)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[auth_router.get_db] = override_get_db


def test_refresh_enforces_device_and_revokes_all_on_mismatch():
    client = TestClient(app)

    # 1) Register with remember_me=True using device A
    import uuid
    A = "device-A"
    email = f"devA_{uuid.uuid4().hex[:8]}@example.com"
    payload = {"email": email, "password": "s3cretpass", "remember_me": True}
    res = client.post("/auth/register", json=payload, headers={"X-Device-Id": A})
    assert res.status_code == 200, res.text
    rt = res.json()["refresh_token"]
    assert rt

    # 2) Refresh with matching device A -> success
    res2 = client.post("/auth/refresh", json={"refresh_token": rt}, headers={"X-Device-Id": A})
    assert res2.status_code == 200, res2.text
    rt2 = res2.json()["refresh_token"]
    assert rt2 and rt2 != rt  # rotated

    # 3) Refresh with mismatching device B -> 401 and all user RT revoked
    B = "device-B"
    res3 = client.post("/auth/refresh", json={"refresh_token": rt2}, headers={"X-Device-Id": B})
    assert res3.status_code == 401, res3.text
    assert res3.json()["error"]["code"] == ErrorCode.AUTH_REFRESH_DEVICE_MISMATCH.value

    # 4) Further refresh attempts with device A should also fail now (all RT revoked)
    res4 = client.post("/auth/refresh", json={"refresh_token": rt2}, headers={"X-Device-Id": A})
    assert res4.status_code == 401, res4.text
    assert res4.json()["error"]["code"] == ErrorCode.AUTH_REFRESH_TOKEN_REVOKED.value
