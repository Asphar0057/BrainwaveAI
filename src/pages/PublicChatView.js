import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { API_URL } from '../config';
import { sanitizeHtml } from '../utils/sanitize';
import { marked } from 'marked';
import './PublicChatView.css';

const PublicChatView = () => {
  const { token } = useParams();
  const [chatData, setChatData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [missing, setMissing] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const fetchChat = async () => {
      setLoading(true); setError(null); setMissing(false);
      try {
        const response = await fetch(`${API_URL}/public/chat/${token}`);
        if (response.status === 404) {
          setMissing(true);
          setError('This chat link is invalid or no longer available.');
          return;
        }
        if (!response.ok) {
          throw new Error('Failed to load chat');
        }
        const data = await response.json();
        setChatData(data);
      } catch (err) {
        setError('Failed to load this chat. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchChat();
  }, [token, retry]);

  if (loading) {
    return (
      <div className="pcv-page pcv-center">
        <div className="pcv-spinner"></div>
        <p>Loading conversation...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pcv-page pcv-center">
        <h2>{missing ? "Link not found" : "Could not load shared content"}</h2>
        <p role="alert">{error}</p>
        {!missing && <button type="button" onClick={() => setRetry(n => n + 1)}>Try again</button>}
        <Link className="pcv-home-link" to="/">Go to Cerbyl</Link>
      </div>
    );
  }

  return (
    <div className="pcv-page">
      <div className="pcv-container">
        <div className="pcv-header">
          <h1>{chatData.title || 'Shared Conversation'}</h1>
          <span className="pcv-badge">Shared Chat &middot; Read Only</span>
        </div>

        {chatData.messages.length === 0 ? (
          <div className="pcv-empty">This conversation has no messages yet.</div>
        ) : (
          <div className="pcv-messages">
            {chatData.messages.map((msg, index) => (
              <div key={index} className="pcv-message-group">
                <div className="pcv-message pcv-message-user">
                  <span className="pcv-message-label">You</span>
                  <div className="pcv-message-content">{msg.user_message}</div>
                </div>
                <div className="pcv-message pcv-message-ai">
                  <span className="pcv-message-label">Cerbyl</span>
                  <div
                    className="pcv-message-content"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(marked.parse(msg.ai_response || '')) }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pcv-footer">
          <Link className="pcv-home-link" to="/">Powered by Cerbyl</Link>
        </div>
      </div>
    </div>
  );
};

export default PublicChatView;
