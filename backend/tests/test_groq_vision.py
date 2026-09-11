from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def test_groq_vision_uses_multimodal_model_and_data_url(monkeypatch):
    from services.ai_utils import UnifiedAIClient

    captured = {}

    class FakeCompletions:
        def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(content="A person is sitting indoors.")
                    )
                ],
                usage=None,
            )

    fake_client = SimpleNamespace(
        chat=SimpleNamespace(completions=FakeCompletions())
    )
    client = UnifiedAIClient(
        groq_client=fake_client,
    )
    monkeypatch.setattr(client, "_log_usage", lambda *args, **kwargs: None)

    answer = client.generate_with_images(
        "Describe the image.",
        [{"data": b"image-bytes", "mime_type": "image/jpeg"}],
        max_tokens=300,
        temperature=0.2,
    )

    assert answer == "A person is sitting indoors."
    assert captured["model"] == "qwen/qwen3.8-27b"
    content = captured["messages"][0]["content"]
    assert content[0] == {"type": "text", "text": "Describe the image."}
    assert content[1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
