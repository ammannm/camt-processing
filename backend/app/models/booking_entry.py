from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BookingEntry(Base):
    __tablename__ = "booking_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    original_booking_text: Mapped[str] = mapped_column(String(1000), nullable=False)
    new_booking_text: Mapped[str] = mapped_column(String(1000), nullable=False)
    normalized_booking_text: Mapped[str] = mapped_column(String(1000), nullable=False)
    account_number: Mapped[str] = mapped_column(String(255), nullable=False)
    debit_account: Mapped[str | None] = mapped_column(String(100), nullable=True)
    credit_account: Mapped[str | None] = mapped_column(String(100), nullable=True)
    vat_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    debit_cost_center: Mapped[str | None] = mapped_column(String(100), nullable=True)
    credit_cost_center: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

