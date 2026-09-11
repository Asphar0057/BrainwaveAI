"""Preserve original rich chat material independently of an AI summary."""
import base64
import html
import json
import re
from pathlib import Path
from urllib.parse import urlparse

RICH_CONTENT = re.compile(r'(^|\n)\s{0,3}(```|~~~)|!\[[^\]]*\]\(|<\s*(img|svg|pre)\b', re.I)
IMAGE_TYPES = {'image/png', 'image/jpeg', 'image/webp', 'image/gif'}


RICH_BLOCKS = re.compile(
    r"^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]{0,3}\1[ \t]*(?=\n|$)"
    r"|!\[[^\]]*\]\([^\n]+?\)"
    r"|<img\b[^>]*>|<pre\b[^>]*>[\s\S]*?</pre>|<svg\b[^>]*>[\s\S]*?</svg>",
    re.MULTILINE | re.IGNORECASE,
)


def extract_rich_blocks(text):
    matches = list(RICH_BLOCKS.finditer(text))
    if not matches:
        return text
    # Keep exact whitespace for source composed entirely of rich blocks.
    remainder = RICH_BLOCKS.sub('', text).strip()
    if not remainder:
        return text
    return '\n\n'.join(match.group(0) for match in matches)


def source_material(messages, storage):
    sections = []
    for index, message in enumerate(messages, 1):
        parts = []
        for text in (message.user_message, message.ai_response):
            if text and RICH_CONTENT.search(text):
                parts.append(extract_rich_blocks(text))
        metadata = message.image_metadata or []
        if isinstance(metadata, str):
            metadata = json.loads(metadata)
        for attachment in metadata:
            if not attachment.get('is_image'):
                continue
            mime = attachment.get('mime_type', '')
            if mime not in IMAGE_TYPES:
                continue
            path = attachment.get('storage_path', '')
            if getattr(storage, 'storage_type', 'local') == 'local':
                raw = Path(path).read_bytes()
            else:
                parsed = urlparse(path)
                key = parsed.path.lstrip('/') if parsed.scheme in {'s3', 'r2'} else path
                raw = storage.download_bytes(key)
            if not raw or len(raw) > 20 * 1024 * 1024:
                raise ValueError('Stored image is empty or exceeds the supported size')
            # Copy into the note: no expiring URLs, auth-only image requests, or
            # dependency on the original chat remaining in the library.
            encoded = base64.b64encode(raw).decode('ascii')
            alt = html.escape(attachment.get('filename') or 'Chat image', quote=True)
            parts.append(f'<img src="data:{mime};base64,{encoded}" alt="{alt}">')
        if parts:
            sections.append(f'### Original material — exchange {index}\n\n' + '\n\n'.join(parts))
    return '\n\n'.join(sections)
