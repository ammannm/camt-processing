from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.item import Item
from app.schemas.item import ItemCreate


def get_items(db: Session) -> list[Item]:
    return list(db.scalars(select(Item).order_by(Item.id.desc())))


def create_item(db: Session, payload: ItemCreate) -> Item:
    item = Item(name=payload.name, description=payload.description)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

