import pytest
from pydantic import ValidationError

from routes.playlists import PlaylistCreateRequest, PlaylistItemRequest


def test_playlist_title_must_not_be_blank():
    with pytest.raises(ValidationError, match="Playlist title is required"):
        PlaylistCreateRequest(title="   ")


def test_link_item_requires_a_full_url():
    with pytest.raises(ValidationError, match="URL must start"):
        PlaylistItemRequest(item_type="external_link", title="Reference", url="example.com")


def test_library_item_requires_a_selected_resource():
    with pytest.raises(ValidationError, match="Select an existing resource"):
        PlaylistItemRequest(item_type="note", title="My note")


def test_valid_item_is_trimmed():
    item = PlaylistItemRequest(item_type="external_link", title="  Reference  ", url="https://example.com")
    assert item.title == "Reference"
