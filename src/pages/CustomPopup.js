
import { useState, useEffect } from 'react';

const CustomPopup = ({ isOpen, onClose, message, title = "Notification" }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      
      const timer = setTimeout(() => {
        handleClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsVisible(false);
    onClose();
  };

  if (!isVisible) return null;

  
  const isSuccess = title.toLowerCase().includes('success') || 
                    title.toLowerCase().includes('copied') || 
                    title.toLowerCase().includes('created') ||
                    title.toLowerCase().includes('deleted') ||
                    title.toLowerCase().includes('renamed') ||
                    title.toLowerCase().includes('updated') ||
                    title.toLowerCase().includes('complete') ||
                    title.toLowerCase().includes('converted');
  const isError = title.toLowerCase().includes('error') || title.toLowerCase().includes('failed');

  return (
    <div 
      className="custom-popup-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        padding: '12px'
      }}
      onClick={handleClose}
    >
      <div 
        className="custom-popup-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          background: 'var(--bg-secondary, #1a1a1a)',
          border: '1px solid color-mix(in srgb, var(--accent, #D7B38C) 40%, transparent)',
          borderRadius: '12px',
          padding: 'clamp(22px, 6vw, 32px) clamp(18px, 7vw, 40px)',
          maxWidth: '450px',
          width: 'min(100%, 450px)',
          maxHeight: 'calc(100dvh - 24px)',
          overflowY: 'auto',
          textAlign: 'center',
          position: 'relative',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '12px',
          background: isError 
            ? 'rgba(239, 68, 68, 0.15)' 
            : 'color-mix(in srgb, var(--accent, #D7B38C) 15%, transparent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px auto'
        }}>
          {isError ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #D7B38C)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
        </div>

        <h3 style={{
          color: 'var(--accent, #D7B38C)',
          fontSize: '11px',
          fontWeight: '600',
          margin: '0 0 12px 0',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          fontFamily: "'Inter', sans-serif"
        }}>
          {title.toUpperCase()}
        </h3>

        <p style={{
          color: 'var(--text-secondary, rgba(215, 179, 140, 0.8))',
          fontSize: '14px',
          lineHeight: '1.6',
          margin: '0 0 24px 0',
          fontFamily: "'Inter', sans-serif"
        }}>
          {message}
        </p>

        <button
          onClick={handleClose}
          style={{
            background: 'linear-gradient(135deg, var(--accent, #D7B38C), color-mix(in srgb, var(--accent, #D7B38C) 85%, black))',
            border: 'none',
            borderRadius: '8px',
            color: 'var(--bg-primary, #0f0f0f)',
            padding: '12px 32px',
            width: 'min(100%, 220px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto',
            fontSize: '11px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            fontFamily: "'Inter', sans-serif",
            letterSpacing: '2px',
            textTransform: 'uppercase'
          }}
          onMouseOver={(e) => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 4px 12px color-mix(in srgb, var(--accent, #D7B38C) 40%, transparent)';
          }}
          onMouseOut={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = 'none';
          }}
        >
          CLOSE
        </button>
      </div>
    </div>
  );
};

export default CustomPopup;
