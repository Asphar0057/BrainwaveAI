import base64
import json
import sys
from pathlib import Path
from types import SimpleNamespace
import pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services.chat_note_content import source_material


def message(text='', metadata=None):
    return SimpleNamespace(user_message='Explain this', ai_response=text, image_metadata=metadata)


def test_original_code_graphs_and_embedded_images_survive():
    text = '```python\n  print("<div>")\n```\n```graphjson\n{"type":"bar"}\n```\n```mermaid\ngraph TD\nA-->B\n```\n![x](https://example.test/x.png)'
    assert text in source_material([message(text)], SimpleNamespace(storage_type='local'))


def test_local_upload_is_copied_into_note(tmp_path):
    image = tmp_path / 'image.png'; image.write_bytes(b'png fixture')
    metadata = json.dumps([{'is_image':True, 'mime_type':'image/png', 'storage_path':str(image), 'filename':'"<test>'}])
    result = source_material([message(metadata=metadata)], SimpleNamespace(storage_type='local'))
    assert 'data:image/png;base64,' + base64.b64encode(b'png fixture').decode() in result
    assert '&quot;&lt;test&gt;' in result


def test_remote_upload_downloads_storage_key():
    keys = []
    storage = SimpleNamespace(storage_type='s3', download_bytes=lambda key: keys.append(key) or b'png')
    source_material([message(metadata=[{'is_image':True,'mime_type':'image/png','storage_path':'s3://bucket/chat_images/image.png'}])], storage)
    assert keys == ['chat_images/image.png']


def test_missing_attachment_fails_instead_of_silently_omitting_it():
    with pytest.raises(FileNotFoundError):
        source_material([message(metadata=[{'is_image':True,'mime_type':'image/png','storage_path':'/missing-test-image.png'}])], SimpleNamespace(storage_type='local'))


def test_preserves_rich_blocks_without_duplicating_the_entire_explanation():
    source = 'An explanation that the summary already covers.\n\n```python\nprint("<tag>")\n```\n\nRepeated takeaway.'
    result = source_material([message(source)], SimpleNamespace(storage_type='local'))
    assert '```python\nprint("<tag>")\n```' in result
    assert 'summary already covers' not in result
    assert 'Repeated takeaway' not in result
