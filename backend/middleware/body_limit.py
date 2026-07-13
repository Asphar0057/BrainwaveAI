import logging
import os

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

_MB = 1024 * 1024
_DEFAULT_MAX = int(os.getenv("REQUEST_MAX_BODY_MB", "10")) * _MB
_UPLOAD_MAX  = int(os.getenv("REQUEST_MAX_UPLOAD_MB", "100")) * _MB

_UPLOAD_PREFIXES = (
    "/api/context",
    "/api/import",
    "/api/upload",
    "/api/media",
)

class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        is_upload = any(request.url.path.startswith(p) for p in _UPLOAD_PREFIXES)
        limit = _UPLOAD_MAX if is_upload else _DEFAULT_MAX
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                size = int(content_length)
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Invalid Content-Length header."},
                )

            if size < 0:
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Invalid Content-Length header."},
                )

            if size > limit:
                limit_mb = limit // _MB
                logger.warning(
                    "Request body too large | path=%s size=%d limit=%d",
                    request.url.path, size, limit,
                )
                return JSONResponse(
                    status_code=413,
                    content={
                        "detail": f"Request body too large. Maximum allowed size is {limit_mb} MB.",
                        "limit_mb": limit_mb,
                    },
                )
        elif request.method in {"POST", "PUT", "PATCH"}:
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > limit:
                    limit_mb = limit // _MB
                    logger.warning(
                        "Chunked request body too large | path=%s limit=%d",
                        request.url.path, limit,
                    )
                    return JSONResponse(
                        status_code=413,
                        content={
                            "detail": f"Request body too large. Maximum allowed size is {limit_mb} MB.",
                            "limit_mb": limit_mb,
                        },
                    )
            request._body = bytes(body)

        return await call_next(request)
