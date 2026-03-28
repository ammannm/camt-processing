from sqlalchemy.orm import Session

from app.models.booking_entry import BookingEntry
from app.schemas.booking import BookingEntrySaveRequest


def create_booking_entry(
    db: Session, payload: BookingEntrySaveRequest, normalized_booking_text: str
) -> BookingEntry:
    entry = BookingEntry(
        original_booking_text=payload.original_booking_text,
        new_booking_text=payload.new_booking_text,
        normalized_booking_text=normalized_booking_text,
        account_number=payload.account_number,
        debit_account=payload.debit_account,
        credit_account=payload.credit_account,
        vat_code=payload.vat_code,
        debit_cost_center=payload.debit_cost_center,
        credit_cost_center=payload.credit_cost_center,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def update_booking_entry(
    db: Session,
    entry: BookingEntry,
    payload: BookingEntrySaveRequest,
    normalized_booking_text: str,
) -> BookingEntry:
    entry.original_booking_text = payload.original_booking_text
    entry.new_booking_text = payload.new_booking_text
    entry.normalized_booking_text = normalized_booking_text
    entry.account_number = payload.account_number
    entry.debit_account = payload.debit_account
    entry.credit_account = payload.credit_account
    entry.vat_code = payload.vat_code
    entry.debit_cost_center = payload.debit_cost_center
    entry.credit_cost_center = payload.credit_cost_center
    db.commit()
    db.refresh(entry)
    return entry
