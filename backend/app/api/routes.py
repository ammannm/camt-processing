from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.crud.booking_entry import create_booking_entry
from app.db.session import get_db
from app.schemas.booking import (
    BookingEntryRead,
    BookingEntrySaveRequest,
    ParsedBookingResponse,
)
from app.services.camt_parser import parse_camt053
from app.services.text_normalizer import normalize_booking_text

router = APIRouter(tags=["bookings"])


@router.post("/camt053/parse", response_model=ParsedBookingResponse)
async def parse_camt053_file(file: UploadFile = File(...)):
    filename = (file.filename or "").lower()
    if not filename.endswith(".xml"):
        raise HTTPException(status_code=400, detail="Please upload a CAMT.053 XML file.")

    content = await file.read()
    try:
        entries = parse_camt053(content)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Invalid CAMT.053 XML file.") from exc

    return ParsedBookingResponse(entries=entries)


@router.post(
    "/booking-entries",
    response_model=BookingEntryRead,
    status_code=status.HTTP_201_CREATED,
)
def save_booking_entry(
    payload: BookingEntrySaveRequest,
    db: Session = Depends(get_db),
):
    text_source = payload.new_booking_text or payload.original_booking_text
    normalized_text = normalize_booking_text(text_source)
    return create_booking_entry(db, payload, normalized_text)
