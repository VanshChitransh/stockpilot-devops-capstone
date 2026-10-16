import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import Base, get_db
from app.main import app

# in-memory sqlite: every test gets a fresh, throwaway database,
# so tests never touch the real postgres
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSession = sessionmaker(bind=engine, autoflush=False)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def product(client):
    payload = {
        "sku": "KB-001", "name": "Mechanical Keyboard", "category": "Peripherals",
        "quantity": 20, "reorder_level": 5, "unit_price": "49.99", "supplier": "KeyCo",
    }
    return client.post("/api/products", json=payload).json()
