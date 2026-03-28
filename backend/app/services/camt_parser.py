from xml.etree import ElementTree as ET

from app.schemas.booking import ParsedBookingEntry


def _local_name(tag: str) -> str:
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _find_first_text(element: ET.Element, candidates: list[str]) -> str | None:
    for child in element.iter():
        if _local_name(child.tag) in candidates and child.text:
            value = child.text.strip()
            if value:
                return value
    return None


def _extract_date_from_parent(element: ET.Element, parent_name: str) -> str | None:
    for child in element.iter():
        if _local_name(child.tag) == parent_name:
            for nested in child.iter():
                if _local_name(nested.tag) in {"Dt", "DtTm"} and nested.text:
                    value = nested.text.strip()
                    if value:
                        return value
    return None


def parse_camt053(xml_content: bytes) -> list[ParsedBookingEntry]:
    root = ET.fromstring(xml_content)
    entries: list[ParsedBookingEntry] = []

    for idx, node in enumerate(root.iter()):
        if _local_name(node.tag) != "Ntry":
            continue

        amount = "0"
        currency = None
        for child in node.iter():
            if _local_name(child.tag) == "Amt":
                amount = (child.text or "0").strip()
                currency = child.attrib.get("Ccy")
                break

        original_booking_text = _find_first_text(node, ["AddtlNtryInf"]) or ""
        booking_date = _extract_date_from_parent(node, "BookgDt")
        value_date = _extract_date_from_parent(node, "ValDt")
        account_number = _find_first_text(node, ["NtryRef"]) or f"ntry-{idx + 1}"

        entries.append(
            ParsedBookingEntry(
                row_id=f"row-{idx + 1}",
                amount=amount,
                currency=currency,
                original_booking_text=original_booking_text,
                booking_date=booking_date,
                value_date=value_date,
                account_number=account_number,
            )
        )

    return entries

