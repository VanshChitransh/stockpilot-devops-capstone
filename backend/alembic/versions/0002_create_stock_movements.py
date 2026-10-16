"""create stock_movements table

Revision ID: 0002_create_stock_movements
Revises: 0001_create_products
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_create_stock_movements"
down_revision = "0001_create_products"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("change", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=20), nullable=False),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_stock_movements_product_id", "stock_movements", ["product_id"])


def downgrade():
    op.drop_index("ix_stock_movements_product_id", table_name="stock_movements")
    op.drop_table("stock_movements")
