import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { API_URL } from '../config';
import './PublicFlashcardView.css';

const PublicFlashcardView = () => {
  const { token } = useParams();
  const [setData, setSetData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    const fetchSet = async () => {
      try {
        const response = await fetch(`${API_URL}/public/flashcards/${token}`);
        if (response.status === 404) {
          setError('This flashcard set link is invalid or no longer available.');
          return;
        }
        if (!response.ok) {
          throw new Error('Failed to load flashcard set');
        }
        const data = await response.json();
        setSetData(data);
      } catch (err) {
        setError('Failed to load this flashcard set. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchSet();
  }, [token]);

  const cards = setData?.flashcards || [];
  const currentCard = cards[currentIndex];

  const goNext = () => {
    setIsFlipped(false);
    setCurrentIndex((i) => Math.min(i + 1, cards.length - 1));
  };

  const goPrev = () => {
    setIsFlipped(false);
    setCurrentIndex((i) => Math.max(i - 1, 0));
  };

  if (loading) {
    return (
      <div className="pfv-page pfv-center">
        <div className="pfv-spinner"></div>
        <p>Loading flashcard set...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pfv-page pfv-center">
        <h2>Link Not Found</h2>
        <p>{error}</p>
        <Link className="pfv-home-link" to="/">Go to Brainwave</Link>
      </div>
    );
  }

  return (
    <div className="pfv-page">
      <div className="pfv-container">
        <div className="pfv-header">
          <h1>{setData.set_title || 'Flashcard Set'}</h1>
          {setData.description && <p className="pfv-description">{setData.description}</p>}
          <span className="pfv-badge">Shared Preview &middot; Read Only</span>
        </div>

        {cards.length === 0 ? (
          <div className="pfv-empty">This flashcard set has no cards yet.</div>
        ) : (
          <>
            <div className="pfv-counter">CARD {currentIndex + 1} OF {cards.length}</div>
            <div className={`pfv-card ${isFlipped ? 'pfv-flipped' : ''}`} onClick={() => setIsFlipped((f) => !f)} role="button" tabIndex={0} aria-label="Flip flashcard" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsFlipped((f) => !f); } }}>
              <div className="pfv-card-inner">
                <div className="pfv-card-face pfv-card-front">
                  <span className="pfv-card-label">Question</span>
                  <p>{currentCard.question}</p>
                </div>
                <div className="pfv-card-face pfv-card-back">
                  <span className="pfv-card-label">Answer</span>
                  <p>{currentCard.answer}</p>
                </div>
              </div>
            </div>
            <p className="pfv-hint">Click the card to flip it</p>

            <div className="pfv-nav">
              <button className="pfv-nav-btn" onClick={goPrev} disabled={currentIndex === 0}>
                Previous
              </button>
              <button className="pfv-nav-btn" onClick={goNext} disabled={currentIndex === cards.length - 1}>
                Next
              </button>
            </div>
          </>
        )}

        <div className="pfv-footer">
          <Link className="pfv-home-link" to="/">Powered by Brainwave</Link>
        </div>
      </div>
    </div>
  );
};

export default PublicFlashcardView;
