import re

DATE_PATTERN = re.compile(r"\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}[./-]\d{2}[./-]\d{2}\b")
IBAN_PATTERN = re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b")
AMOUNT_PATTERN = re.compile(r"\b\d{1,3}(?:[.,']\d{3})*(?:[.,]\d{2})\b")
REFERENCE_PATTERN = re.compile(r"\b(?:RF\d{2}[A-Z0-9]{4,}|\d{8,}|[A-Z0-9]{12,})\b")
WHITESPACE_PATTERN = re.compile(r"\s+")


def normalize_booking_text(text: str) -> str:
    normalized = text.upper()
    normalized = DATE_PATTERN.sub(" ", normalized)
    normalized = IBAN_PATTERN.sub(" ", normalized)
    normalized = AMOUNT_PATTERN.sub(" ", normalized)
    normalized = REFERENCE_PATTERN.sub(" ", normalized)
    normalized = WHITESPACE_PATTERN.sub(" ", normalized).strip()
    return normalized

