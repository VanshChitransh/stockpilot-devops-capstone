from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "StockPilot API"
    app_version: str = "1.0.0"
    database_url: str = "postgresql+psycopg://stockpilot:stockpilot@localhost:5432/stockpilot"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
