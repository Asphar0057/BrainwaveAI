from services.document_flashcard_source import (
    build_document_flashcard_source,
    has_low_document_card_quality,
)


def test_document_source_samples_content_beyond_cover_page():
    cover = "Agam pharmacology notes " * 90
    middle = "Beta blockers reduce heart rate by blocking beta-adrenergic receptors. " * 80
    ending = "Loop diuretics inhibit the sodium-potassium-chloride transporter in the ascending loop. " * 80

    excerpts = build_document_flashcard_source(cover + middle + ending, max_chars=4_500)

    assert "Beta blockers reduce heart rate" in excerpts
    assert "Loop diuretics inhibit" in excerpts
    assert "Agam pharmacology notes" not in excerpts


def test_document_quality_rejects_title_and_metadata_cards():
    cards = [
        {"question": "What is the primary purpose of the Agam pharmacology notes?", "answer": "Study pharmacology."},
        {"question": "Who is the team leader responsible for the notes?", "answer": "Unknown."},
    ]

    assert has_low_document_card_quality(cards)
