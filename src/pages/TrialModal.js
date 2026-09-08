

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './TrialModal.css';

const TrialModal = ({ isOpen, onClose, timeRemaining, isWarning = false, onLogin, onRegister }) => {
  const [timeDisplay, setTimeDisplay] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (timeRemaining) {
      const totalSeconds = Math.floor(timeRemaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      
      if (minutes > 0) {
        setTimeDisplay(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      } else {
        setTimeDisplay(`${seconds}s`);
      }
    }
  }, [timeRemaining]);

  const handleLogin = () => {
    onClose();
    navigate('/login');
  };

  const handleRegister = () => {
    onClose();
    navigate('/register');
  };

  if (!isOpen) return null;

  return (
    <div className="trial-modal-overlay">
      <div className={`trial-modal ${isWarning ? 'warning' : 'expired'}`}>
        <div className="trial-modal-header">
          <div className="trial-icon">
            {isWarning ? '⏰' : '⛔'}
          </div>
          <h2 className="trial-modal-title">
            {isWarning ? 'Trial Time Running Out' : 'Trial Time Expired'}
          </h2>
        </div>

        <div className="trial-modal-content">
          {isWarning ? (
            <>
              <div className="time-remaining">
                <span className="time-label">Time Remaining:</span>
                <span className="time-value">{timeDisplay}</span>
              </div>
              <p className="trial-message">
                Your free trial is almost over. Create a free account to continue using Brainwave 
                without any time limits!
              </p>
            </>
          ) : (
            <>
              <div className="trial-expired-message">
                <p className="trial-message-main">
                  Your 5-minute trial has ended
                </p>
                <p className="trial-message-sub">
                  Create a free account to continue your learning journey with unlimited access 
                  to your AI tutor, flashcards, notes, and more!
                </p>
              </div>
            </>
          )}

          <div className="trial-benefits">
            <h3>With a free account, you get:</h3>
            <ul>
              <li>✨ Unlimited AI tutoring sessions</li>
              <li>📚 Personalized study materials</li>
              <li>🎯 Progress tracking and analytics</li>
              <li> Save your conversations and notes</li>
              <li>🔄 Sync across all your devices</li>
            </ul>
          </div>
        </div>

        <div className="trial-modal-actions">
          <button 
            className="trial-btn trial-btn-primary"
            onClick={handleRegister}
          >
            Create Free Account
          </button>
          
          <button 
            className="trial-btn trial-btn-secondary"
            onClick={handleLogin}
          >
            Already have an account? Login
          </button>

          {isWarning && (
            <button 
              className="trial-btn trial-btn-text"
              onClick={onClose}
            >
              Continue Trial ({timeDisplay})
            </button>
          )}
        </div>

        <div className="trial-modal-footer">
          <p className="privacy-note">
            No credit card required • Your data is secure • 100% free forever
          </p>
        </div>
      </div>
    </div>
  );
};

export default TrialModal;
