"""create booking entries table

Revision ID: 0001_create_booking_entries
Revises:
Create Date: 2026-03-28
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_create_booking_entries"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "booking_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("original_booking_text", sa.String(length=1000), nullable=False),
        sa.Column("new_booking_text", sa.String(length=1000), nullable=False),
        sa.Column("normalized_booking_text", sa.String(length=1000), nullable=False),
        sa.Column("account_number", sa.String(length=255), nullable=False),
        sa.Column("debit_account", sa.String(length=100), nullable=True),
        sa.Column("credit_account", sa.String(length=100), nullable=True),
        sa.Column("vat_code", sa.String(length=50), nullable=True),
        sa.Column("debit_cost_center", sa.String(length=100), nullable=True),
        sa.Column("credit_cost_center", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_booking_entries_id"), "booking_entries", ["id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_booking_entries_id"), table_name="booking_entries")
    op.drop_table("booking_entries")
