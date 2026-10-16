from fastapi import Depends, FastAPI, HTTPException, Query, status
from prometheus_client import Counter
from prometheus_fastapi_instrumentator import Instrumentator
from sqlalchemy import func, or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Product, StockMovement
from .schemas import MovementCreate, MovementOut, ProductCreate, ProductOut, ProductUpdate, StatsOut

app = FastAPI(title=settings.app_name, version=settings.app_version)
Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

# business metric so grafana shows more than just http traffic
STOCK_MOVEMENTS = Counter("stockpilot_stock_movements_total", "Stock movements recorded", ["reason"])


def get_product_or_404(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def commit_or_409(db: Session):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A product with this SKU already exists")


@app.get("/")
def root():
    return {"service": settings.app_name, "version": settings.app_version, "docs": "/docs"}


@app.get("/health")
def health():
    # liveness: the process is up, no dependencies checked
    return {"status": "UP"}


@app.get("/ready")
def ready(db: Session = Depends(get_db)):
    # readiness: only take traffic once the database answers
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        raise HTTPException(status_code=503, detail="database unavailable")
    return {"status": "READY"}


@app.get("/api/products", response_model=list[ProductOut])
def list_products(
    search: str | None = None,
    category: str | None = None,
    low_stock: bool = False,
    db: Session = Depends(get_db),
):
    query = select(Product).order_by(Product.name)
    if search:
        like = f"%{search}%"
        query = query.where(or_(Product.name.ilike(like), Product.sku.ilike(like)))
    if category:
        query = query.where(Product.category == category)
    if low_stock:
        query = query.where(Product.quantity <= Product.reorder_level)
    return list(db.scalars(query))


@app.get("/api/products/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    return get_product_or_404(db, product_id)


@app.post("/api/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    product = Product(**payload.model_dump())
    db.add(product)
    commit_or_409(db)
    db.refresh(product)
    return product


@app.put("/api/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)):
    product = get_product_or_404(db, product_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, key, value)
    commit_or_409(db)
    db.refresh(product)
    return product


@app.delete("/api/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    db.delete(get_product_or_404(db, product_id))
    db.commit()


@app.post("/api/products/{product_id}/movements", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def record_movement(product_id: int, payload: MovementCreate, db: Session = Depends(get_db)):
    if payload.change == 0:
        raise HTTPException(status_code=400, detail="change must not be zero")
    # row lock so two concurrent sales can't both read the same quantity (no-op on sqlite)
    product = db.get(Product, product_id, with_for_update=True)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.quantity + payload.change < 0:
        raise HTTPException(status_code=400, detail=f"Only {product.quantity} units in stock")
    product.quantity += payload.change
    db.add(StockMovement(product_id=product.id, **payload.model_dump()))
    db.commit()
    db.refresh(product)
    STOCK_MOVEMENTS.labels(reason=payload.reason).inc()
    return product


@app.get("/api/movements", response_model=list[MovementOut])
def list_movements(limit: int = Query(default=20, ge=1, le=100), db: Session = Depends(get_db)):
    rows = db.execute(
        select(StockMovement, Product.name)
        .join(Product)
        .order_by(StockMovement.created_at.desc(), StockMovement.id.desc())
        .limit(limit)
    ).all()
    return [
        MovementOut(
            id=m.id, product_id=m.product_id, product_name=name, change=m.change,
            reason=m.reason, note=m.note, created_at=m.created_at,
        )
        for m, name in rows
    ]


@app.get("/api/stats", response_model=StatsOut)
def stats(db: Session = Depends(get_db)):
    total, units, value = db.execute(
        select(
            func.count(Product.id),
            func.coalesce(func.sum(Product.quantity), 0),
            func.coalesce(func.sum(Product.quantity * Product.unit_price), 0),
        )
    ).one()
    low = db.scalar(select(func.count(Product.id)).where(Product.quantity <= Product.reorder_level))
    out = db.scalar(select(func.count(Product.id)).where(Product.quantity == 0))
    return StatsOut(total_products=total, total_units=units, inventory_value=float(value), low_stock=low, out_of_stock=out)
