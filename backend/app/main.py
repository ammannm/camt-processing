from fastapi import FastAPI

from app.api.routes import router as items_router
from app.core.config import settings

app = FastAPI(title=settings.app_name, version=settings.app_version)
app.include_router(items_router, prefix="/api/v1")


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}

