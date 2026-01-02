import os
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.routers import auth as auth_router

# Bind test sessions to the temporary schema set by conftest
_test_db_url = os.environ.get("DATABASE_URL")
assert _test_db_url, "DATABASE_URL must be set by conftest"
_engine = create_engine(_test_db_url, future=True)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_engine, future=True)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[auth_router.get_db] = override_get_db
def test_register_success():
    import uuid
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    client = TestClient(app)
    payload = {"email": email, "password": "s3cretpass"}
    res = client.post("/auth/register", json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert "access_token" in data and data["access_token"]
    assert "refresh_token" in data and data["refresh_token"]
    assert data.get("token_type") == "bearer"
