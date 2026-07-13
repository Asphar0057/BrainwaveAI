import os

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

_IS_PROD = os.getenv("ENVIRONMENT", "development") == "production"

_STATIC_HEADERS: dict[str, str] = {
    "X-Content-Type-Options":  "nosniff",
    "X-Frame-Options":         "DENY",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Referrer-Policy":         "strict-origin-when-cross-origin",
    "Permissions-Policy":      "camera=(), microphone=(), geolocation=(), payment=()",
}

if _IS_PROD:
    _STATIC_HEADERS["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

_CACHE_CONTROL = "no-store, no-cache, must-revalidate, private"

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        for name, value in _STATIC_HEADERS.items():
            response.headers[name] = value

        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = _CACHE_CONTROL
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
            )

        if "server" in response.headers:
            del response.headers["server"]

        return response
