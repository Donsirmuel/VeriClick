"""IP → country lookup with graceful fallback when GeoIP2 is unavailable."""

import ipaddress
import logging
from typing import Optional

logger = logging.getLogger("edge.geo")

_reader = None


def _load_reader(db_path: str):
    global _reader
    try:
        import geoip2.database
        import geoip2.errors

        _reader = geoip2.database.Reader(db_path)
        logger.info("GeoIP2 database loaded from %s", db_path)
    except Exception:
        logger.warning("GeoIP2 database not available, geo lookups will return None")
        _reader = None


def init(db_path: str):
    """Initialize the GeoIP reader. Call once at startup."""
    if db_path:
        _load_reader(db_path)


def lookup(ip: str) -> Optional[str]:
    """Return the ISO country code for an IP, or None."""
    if _reader is None:
        return None
    try:
        # Skip private/reserved IPs
        addr = ipaddress.ip_address(ip)
        if addr.is_private or addr.is_loopback or addr.is_reserved:
            return None
        resp = _reader.country(ip)
        return resp.country.iso_code
    except Exception:
        return None
