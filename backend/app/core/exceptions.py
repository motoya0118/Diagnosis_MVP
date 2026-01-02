from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import ErrorCode

logger = logging.getLogger(__name__)


class BaseAppException(Exception):
    def __init__(
        self,
        error_code: ErrorCode,
        *,
        detail: Any | None = None,
        extra: dict[str, Any] | None = None,
        status_code: int | None = None,
    ) -> None:
        super().__init__(error_code.value)
        self.error_code = error_code
        self.detail = detail
        self.extra = extra or {}
        self.status_code = status_code or error_code.http_status

    def to_response_body(self) -> dict[str, Any]:
        document: dict[str, Any] = {
            "error": {
                "code": self.error_code.value,
                "domain": self.error_code.domain,
                "name": self.error_code.label,
                "message": self.error_code.message,
            }
        }
        if self.detail not in (None, ""):
            document["error"]["detail"] = self.detail
        if self.extra:
            document["error"]["extra"] = self.extra
        return document


def raise_app_error(
    error_code: ErrorCode,
    *,
    detail: Any | None = None,
    extra: dict[str, Any] | None = None,
    status_code: int | None = None,
) -> None:
    raise BaseAppException(error_code, detail=detail, extra=extra, status_code=status_code)


def _build_response(exc: BaseAppException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.to_response_body())


async def base_exception_handler(_: Request, exc: BaseAppException) -> JSONResponse:
    return _build_response(exc)


def _from_http_exception(exc: StarletteHTTPException) -> BaseAppException:
    detail = exc.detail
    status_code = exc.status_code

    if status_code == status.HTTP_401_UNAUTHORIZED:
        return BaseAppException(ErrorCode.COMMON_UNAUTHENTICATED, detail=detail)
    if status_code == status.HTTP_403_FORBIDDEN:
        if isinstance(detail, str) and detail.lower() == "not authenticated":
            return BaseAppException(
                ErrorCode.COMMON_UNAUTHENTICATED,
                detail=detail,
                status_code=status.HTTP_401_UNAUTHORIZED,
            )
        return BaseAppException(ErrorCode.COMMON_PERMISSION_DENIED, detail=detail, status_code=status_code)
    if status_code == status.HTTP_404_NOT_FOUND:
        return BaseAppException(ErrorCode.COMMON_RESOURCE_NOT_FOUND, detail=detail)
    if status_code == status.HTTP_422_UNPROCESSABLE_ENTITY:
        return BaseAppException(
            ErrorCode.COMMON_VALIDATION_ERROR,
            detail=detail,
            extra={"source": "http_exception"},
            status_code=status_code,
        )
    return BaseAppException(
        ErrorCode.COMMON_UNEXPECTED_ERROR,
        detail=detail,
        status_code=status_code,
    )


async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    return _build_response(_from_http_exception(exc))


async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return _build_response(
        BaseAppException(
            ErrorCode.COMMON_VALIDATION_ERROR,
            detail="Validation failed",
            extra={"errors": exc.errors()},
        )
    )


async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled exception", exc_info=exc)
    return _build_response(BaseAppException(ErrorCode.COMMON_UNEXPECTED_ERROR))


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(BaseAppException, base_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
