import { rememberReturnPath } from '../utils/returnPath';
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, Edit3, User, Clock, MessageSquare, FileText, Lock } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import './SharedItemViewer.css';
import { API_URL } from '../config';
import { sanitizeHtml } from '../utils/sanitize';
const SharedItemViewer = () => {
  const navigate = useNavigate();
  const { contentType, contentId } = useParams();
  const token = localStorage.getItem('token');
  
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');

  useEffect(() => {
    if (!token) {
      rememberReturnPath(window.location.pathname);
      navigate('/login');
      return;
    }
    fetchSharedContent();
  }, [contentType, contentId]);

  const fetchSharedContent = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `${API_URL}/shared/${contentType}/${contentId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 403) {
        setError('You do not have permission to view this content.');
        return;
      }

      if (response.status === 404) {
        setError('Content not found.');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to load shared content');
      }

      const data = await response.json();
      setContent(data);
      if (data.content_type === 'note') {
        setEditedContent(data.content);
      }
    } catch (err) {
            setError('Failed to load shared content. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    if (content.permission !== 'edit') return;

    try {
      const response = await fetch(
        `${API_URL}/update_shared_note/${contentId}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            content: editedContent
          })
        }
      );

      if (response.ok) {
        setContent(prev => ({ ...prev, content: editedContent }));
        setIsEditing(false);
      }
    } catch (err) {
            alert('Failed to save changes');
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="shared-viewer-loading">
        <div className="loading-spinner"></div>
        <p>Loading shared content...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shared-viewer-error">
        <Lock size={48} />
        <h2>Access Denied</h2>
        <p>{error}</p>
        <button className="error-back-btn" onClick={() => navigate('/shared')}>
          <ArrowLeft size={16} />
          Back to Shared Content
        </button>
      </div>
    );
  }

  if (!content) {
    return null;
  }

  return (
    <div className="shared-viewer-page">
      <div className="shared-viewer-container">
        <div className="viewer-content-info">
          <div className="viewer-content-info-left">
            <button className="back-btn" onClick={() => navigate('/shared')}>
              ◄ Back
            </button>
            <div className="content-type-icon">
              {content.content_type === 'chat' ? (
                <MessageSquare size={24} />
              ) : (
                <FileText size={24} />
              )}
            </div>
            <div>
              <h1 className="content-title">{content.title}</h1>
              <div className="content-meta">
                <div className="meta-item">
                  <User size={14} />
                  <span>
                    By {content.owner.first_name && content.owner.last_name
                      ? `${content.owner.first_name} ${content.owner.last_name}`
                      : content.owner.username}
                  </span>
                </div>
                <div className="meta-item">
                  <Clock size={14} />
                  <span>{formatDate(content.created_at)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="viewer-content-info-right">
            <div className={`permission-badge ${content.permission}`}>
              {content.permission === 'view' ? (
                <>
                  <Eye size={14} />
                  <span>View Only</span>
                </>
              ) : (
                <>
                  <Edit3 size={14} />
                  <span>Can Edit</span>
                </>
              )}
            </div>
            {content.is_owner && (
              <div className="owner-badge">
                <span>Owner</span>
              </div>
            )}
          </div>
        </div>
        {content.content_type === 'chat' ? (
          <div className="chat-messages">
            {content.messages.length === 0 ? (
              <div className="empty-chat">
                <MessageSquare size={48} />
                <p>No messages in this chat yet</p>
              </div>
            ) : (
              content.messages.map((msg, index) => (
                <div key={index} className="message-group">
                  <div className="user-message">
                    <div className="message-header">
                      <User size={16} />
                      <span>You</span>
                      <span className="message-time">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="message-content">{msg.user_message}</div>
                  </div>

                  <div className="ai-message">
                    <div className="message-header">
                      <div className="ai-icon">AI</div>
                      <span>Brainwave</span>
                      <span className="message-time">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div 
                      className="message-content"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(msg.ai_response) }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="note-content">
            {content.permission === 'edit' && !content.is_owner ? (
              <div className="edit-controls">
                {isEditing ? (
                  <>
                    <ReactQuill
                      value={editedContent}
                      onChange={setEditedContent}
                      theme="snow"
                      modules={{
                        toolbar: [
                          ['bold', 'italic', 'underline', 'strike'],
                          ['blockquote', 'code-block'],
                          [{ 'header': 1 }, { 'header': 2 }],
                          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                          [{ 'color': [] }, { 'background': [] }],
                          ['link', 'image'],
                          ['clean']
                        ]
                      }}
                    />
                    <div className="edit-actions">
                      <button className="save-btn" onClick={handleSaveEdit}>
                        Save Changes
                      </button>
                      <button 
                        className="cancel-btn" 
                        onClick={() => {
                          setIsEditing(false);
                          setEditedContent(content.content);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div 
                      className="note-display"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.content) }}
                    />
                    <button 
                      className="edit-btn"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit3 size={16} />
                      Edit Note
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div 
                className="note-display"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(content.content) }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SharedItemViewer;
