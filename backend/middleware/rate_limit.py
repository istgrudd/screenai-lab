"""Rate-limiting helpers shared across routers.

A single `Limiter` is created here so routers can apply `@limiter.limit(...)`
decorators without re-importing slowapi everywhere. `main.py` registers the
limiter on `app.state` and installs slowapi's exception handler.

Two key functions are exposed:
    * `get_remote_address` (re-exported) — IP-based, used for unauthenticated
      endpoints (login, register).
    * `user_or_ip_key` — bearer-token based, used for authenticated endpoints
      so a single logged-in recruiter is the unit of rate limiting (not the
      shared IP of a campus NAT).
"""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def user_or_ip_key(request: Request) -> str:
    """Key by Authorization header (one bucket per session) or IP as fallback."""
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return f"bearer:{auth[7:]}"
    return get_remote_address(request)


limiter = Limiter(key_func=get_remote_address)

__all__ = ["limiter", "get_remote_address", "user_or_ip_key"]
