from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    db_host: str = "192.168.45.147"
    db_port: int = 5432
    db_name: str = "budget_db"
    db_user: str = "budget_book"
    db_password: str = ""

    anthropic_api_key: str = ""

    @property
    def database_url(self) -> str:
        return f"postgresql+asyncpg://{self.db_user}:{self.db_password}@{self.db_host}:{self.db_port}/{self.db_name}"

    class Config:
        env_file = ".env"


settings = Settings()
