from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.crud.item import create_item, get_items
from app.db.session import get_db
from app.schemas.item import ItemCreate, ItemRead

router = APIRouter(prefix="/items", tags=["items"])


@router.get("", response_model=list[ItemRead])
def list_items(db: Session = Depends(get_db)):
    return get_items(db)


@router.post("", response_model=ItemRead, status_code=status.HTTP_201_CREATED)
def add_item(payload: ItemCreate, db: Session = Depends(get_db)):
    return create_item(db, payload)

