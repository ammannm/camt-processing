from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CAMT.053 Processing API"
    app_version: str = "0.1.0"
    database_url: str = "sqlite:///./mvp.db"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="CAMT053_",
    )


settings = Settings()

