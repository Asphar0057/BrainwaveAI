import sys
from types import ModuleType
from unittest.mock import patch

import pytest
from fastapi import HTTPException

# Route helpers are pure, but the route module also imports the runtime AI stack,
# which requires the production Python version. Keep this focused audit isolated.
deps_stub = ModuleType("deps")
deps_stub.get_db = lambda: None
deps_stub.get_current_user = lambda: None
deps_stub.call_ai = lambda *args, **kwargs: ""
sys.modules.setdefault("deps", deps_stub)

from routes.context import (
    _download_url,
    _is_safe_url,
    _parse_json_list,
    _safe_storage_filename,
)


class _Response:
    def __init__(self, status=200, *, headers=None, chunks=None):
        self.status_code = status
        self.headers = headers or {}
        self._chunks = chunks or [b"study material"]
        self.is_redirect = 300 <= status < 400
        self.is_permanent_redirect = status in (301, 308)

    def iter_content(self, chunk_size=None):
        yield from self._chunks


@pytest.mark.parametrize("url", [
    "http://localhost/file.pdf",
    "http://127.0.0.1/file.pdf",
    "http://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
    "ftp://example.com/file.pdf",
])
def test_url_import_blocks_private_and_non_http_targets(url):
    assert _is_safe_url(url) is False


def test_url_import_revalidates_and_follows_relative_redirects():
    responses = [
        _Response(302, headers={"Location": "/files/notes.pdf"}),
        _Response(200, headers={"content-type": "application/pdf"}, chunks=[b"pdf"]),
    ]
    with patch("routes.context._is_safe_url", return_value=True), patch(
        "routes.context.requests.get", side_effect=responses
    ) as request:
        content, content_type, _ = _download_url("https://example.com/start")
    assert content == b"pdf"
    assert content_type == "application/pdf"
    assert request.call_args_list[1].args[0] == "https://example.com/files/notes.pdf"


def test_url_import_rejects_redirect_loops():
    redirects = [_Response(302, headers={"Location": "/again"}) for _ in range(6)]
    with patch("routes.context._is_safe_url", return_value=True), patch(
        "routes.context.requests.get", side_effect=redirects
    ):
        with pytest.raises(HTTPException) as exc:
            _download_url("https://example.com/start")
    assert exc.value.detail == "URL redirected too many times"


def test_storage_filename_removes_path_separators():
    safe = _safe_storage_filename("../../private notes?.pdf")
    assert "/" not in safe
    assert "?" not in safe
    assert safe.endswith(".pdf")


def test_malformed_saved_concepts_do_not_break_document_listing():
    assert _parse_json_list('["Cells", "Osmosis"]') == ["Cells", "Osmosis"]
    assert _parse_json_list("not-json") == ["not-json"]
    assert _parse_json_list(None) == []
