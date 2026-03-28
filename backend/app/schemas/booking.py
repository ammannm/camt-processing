from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ParsedBookingEntry(BaseModel):
    row_id: str
    amount: str
    currency: str | None
    original_booking_text: str
    booking_date: str | None
    value_date: str | None
    account_number: str


class ParsedBookingResponse(BaseModel):
    entries: list[ParsedBookingEntry]


class BookingEntrySaveRequest(BaseModel):
    original_booking_text: str
    new_booking_text: str
    account_number: str
    debit_account: str | None = None
    credit_account: str | None = None
    vat_code: str | None = None
    debit_cost_center: str | None = None
    credit_cost_center: str | None = None


class BookingEntryRead(BaseModel):
    id: int
    original_booking_text: str
    new_booking_text: str
    normalized_booking_text: str
    account_number: str
    debit_account: str | None = None
    credit_account: str | None = None
    vat_code: str | None = None
    debit_cost_center: str | None = None
    credit_cost_center: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

