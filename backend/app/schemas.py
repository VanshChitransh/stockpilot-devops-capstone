from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Reason = Literal["RESTOCK", "SALE", "ADJUSTMENT"]


class ProductCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=200)
    category: str = Field(default="General", max_length=80)
    quantity: int = Field(default=0, ge=0)
    reorder_level: int = Field(default=10, ge=0)
    unit_price: Decimal = Field(default=Decimal("0"), ge=0, max_digits=10, decimal_places=2)
    supplier: str = Field(default="", max_length=120)


class ProductUpdate(BaseModel):
    # every field optional so PUT can change just one thing
    sku: str | None = Field(default=None, min_length=1, max_length=40)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = Field(default=None, max_length=80)
    quantity: int | None = Field(default=None, ge=0)
    reorder_level: int | None = Field(default=None, ge=0)
    unit_price: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    supplier: str | None = Field(default=None, max_length=120)


class ProductOut(BaseModel):
    id: int
    sku: str
    name: str
    category: str
    quantity: int
    reorder_level: int
    unit_price: float
    supplier: str
    low_stock: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MovementCreate(BaseModel):
    change: int = Field(description="positive adds stock, negative removes it")
    reason: Reason
    note: str = Field(default="", max_length=500)


class MovementOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    change: int
    reason: str
    note: str
    created_at: datetime


class StatsOut(BaseModel):
    total_products: int
    total_units: int
    inventory_value: float
    low_stock: int
    out_of_stock: int
