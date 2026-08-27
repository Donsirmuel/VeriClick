from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Backend API
    BACKEND_URL: str = "https://vericlick.site"
    EDGE_API_KEY: str = ""

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # Sync
    SYNC_INTERVAL: int = 60
    EVENT_BATCH_INTERVAL: int = 60
    EVENT_BATCH_SIZE: int = 500

    # Edge proxy
    EDGE_HOSTNAME: str = "edge.vericlick.cc"
    CADDY_ON_DEMAND_API: str = "https://vericlick.site/api/edge/validate-domain/"
    # Immediate proxy networks allowed to supply X-Forwarded-For. Keep this
    # aligned with the private Docker network or set explicit proxy addresses.
    TRUSTED_PROXY_IPS: str = "127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"

    # Verdict lookups sit in the click path, so they are strictly bounded.
    # On timeout the request is allowed through rather than delayed.
    VERDICT_TIMEOUT: float = 1.5
    VERDICT_CACHE_TTL: int = 15
    BLOCKED_VERDICT_CACHE_TTL: int = 60

    # GeoIP (optional)
    GEOIP2_DB: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
