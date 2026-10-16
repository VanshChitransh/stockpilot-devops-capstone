def test_health(client):
    assert client.get("/health").json() == {"status": "UP"}


def test_ready_checks_database(client):
    response = client.get("/ready")
    assert response.status_code == 200
    assert response.json() == {"status": "READY"}


def test_metrics_exposed(client):
    client.get("/health")
    body = client.get("/metrics").text
    assert "http_requests_total" in body


def test_create_product(client, product):
    assert product["id"] > 0
    assert product["sku"] == "KB-001"
    assert product["unit_price"] == 49.99
    assert product["low_stock"] is False


def test_create_product_rejects_bad_input(client):
    assert client.post("/api/products", json={"sku": "", "name": "x"}).status_code == 422
    assert client.post("/api/products", json={"sku": "A", "name": "x", "quantity": -1}).status_code == 422


def test_duplicate_sku_conflict(client, product):
    response = client.post("/api/products", json={"sku": "KB-001", "name": "Another"})
    assert response.status_code == 409


def test_list_and_search_products(client, product):
    client.post("/api/products", json={"sku": "MS-001", "name": "Wireless Mouse", "category": "Peripherals"})
    assert len(client.get("/api/products").json()) == 2
    found = client.get("/api/products", params={"search": "mouse"}).json()
    assert [p["sku"] for p in found] == ["MS-001"]


def test_get_product_and_404(client, product):
    assert client.get(f"/api/products/{product['id']}").json()["name"] == "Mechanical Keyboard"
    assert client.get("/api/products/9999").status_code == 404


def test_update_product(client, product):
    response = client.put(f"/api/products/{product['id']}", json={"quantity": 3})
    assert response.status_code == 200
    assert response.json()["quantity"] == 3
    assert response.json()["low_stock"] is True
    assert response.json()["name"] == "Mechanical Keyboard"  # untouched fields survive


def test_delete_product(client, product):
    assert client.delete(f"/api/products/{product['id']}").status_code == 204
    assert client.get(f"/api/products/{product['id']}").status_code == 404


def test_stock_movement_updates_quantity(client, product):
    url = f"/api/products/{product['id']}/movements"
    assert client.post(url, json={"change": 10, "reason": "RESTOCK"}).json()["quantity"] == 30
    assert client.post(url, json={"change": -25, "reason": "SALE"}).json()["quantity"] == 5
    feed = client.get("/api/movements").json()
    assert [m["change"] for m in feed] == [-25, 10]
    assert feed[0]["product_name"] == "Mechanical Keyboard"


def test_cannot_sell_more_than_in_stock(client, product):
    response = client.post(f"/api/products/{product['id']}/movements", json={"change": -21, "reason": "SALE"})
    assert response.status_code == 400
    assert client.get(f"/api/products/{product['id']}").json()["quantity"] == 20


def test_stats(client, product):
    client.post("/api/products", json={"sku": "CB-001", "name": "USB-C Cable", "quantity": 0, "unit_price": "5"})
    stats = client.get("/api/stats").json()
    assert stats["total_products"] == 2
    assert stats["total_units"] == 20
    assert stats["inventory_value"] == 999.8
    assert stats["low_stock"] == 1
    assert stats["out_of_stock"] == 1
