import { useState, useEffect } from 'react';
import { X, Search, Users, Check, Copy, Link2, Mail, AlertCircle, UserPlus, Eye, Edit3, MessageSquare } from 'lucide-react';
import './SharedModal.css';
import { API_URL } from '../config';
const ShareModal = ({ isOpen, onClose, itemType, itemId, itemTitle, onShare }) => {
  const token = localStorage.getItem('token');
  const [friends, setFriends] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [shareMessage, setShareMessage] = useState('');
  const [permission, setPermission] = useState('view'); 
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchFriends();
      generateShareLink();
    }
  }, [isOpen]);

  const fetchFriends = async () => {
    try {
      const response = await fetch(`${API_URL}/friends`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFriends(data.friends);
      }
    } catch (error) { /* silenced */ }
  };

  const generateShareLink = () => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/shared/${itemType}/${itemId}`;
    setShareLink(link);
  };

  const toggleFriendSelection = (friendId) => {
    setSelectedFriends(prev => 
      prev.includes(friendId) 
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleShare = async () => {
    if (selectedFriends.length === 0) {
      setError('Please select at least one friend to share with');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/share_content`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content_type: itemType,
          content_id: itemId,
          friend_ids: selectedFriends,
          message: shareMessage,
          permission: permission
        })
      });

      if (response.ok) {
        const data = await response.json();
        setShareSuccess(true);
        if (onShare) onShare(data);
        
        setTimeout(() => {
          onClose();
          setShareSuccess(false);
          setSelectedFriends([]);
          setShareMessage('');
        }, 2000);
      } else {
        const error = await response.json();
        setError(error.detail || 'Failed to share content');
      }
    } catch (error) {
            setError('Failed to share content. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const filteredFriends = friends.filter(friend => {
    const fullName = `${friend.first_name || ''} ${friend.last_name || ''}`.toLowerCase();
    const username = friend.username.toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || username.includes(query);
  });

  if (!isOpen) return null;

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal-header">
          <div className="share-modal-title">
            <Users size={24} />
            <div>
              <h2>Share {itemType === 'chat' ? 'AI Chat' : 'Note'}</h2>
              <p className="share-modal-subtitle">{itemTitle}</p>
            </div>
          </div>
          <button className="share-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {shareSuccess ? (
          <div className="share-success-message">
            <Check size={48} />
            <h3>Shared Successfully!</h3>
            <p>Your {itemType} has been shared with {selectedFriends.length} friend{selectedFriends.length > 1 ? 's' : ''}</p>
          </div>
        ) : (
          <>
            <div className="share-modal-body">
              <div className="share-section">
                <h3 className="share-section-title">Access Permission</h3>
                <div className="permission-options">
                  <button
                    className={`permission-option ${permission === 'view' ? 'active' : ''}`}
                    onClick={() => setPermission('view')}
                  >
                    <Eye size={20} />
                    <div>
                      <strong>View Only</strong>
                      <span>Friends can view but not edit</span>
                    </div>
                  </button>
                  <button
                    className={`permission-option ${permission === 'edit' ? 'active' : ''}`}
                    onClick={() => setPermission('edit')}
                  >
                    <Edit3 size={20} />
                    <div>
                      <strong>Can Edit</strong>
                      <span>Friends can view and edit</span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="share-section">
                <h3 className="share-section-title">Share with Friends</h3>
                
                <div className="friend-search">
                  <Search size={16} />
                  <input
                    type="text"
                    placeholder="Search friends..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="friends-list">
                  {filteredFriends.length === 0 ? (
                    <div className="no-friends">
                      <UserPlus size={32} />
                      <p>No friends found</p>
                      <p className="no-friends-hint">Add friends to share your content</p>
                    </div>
                  ) : (
                    filteredFriends.map(friend => (
                      <div
                        key={friend.id}
                        className={`friend-item ${selectedFriends.includes(friend.id) ? 'selected' : ''}`}
                        onClick={() => toggleFriendSelection(friend.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFriendSelection(friend.id); } }}
                        role="checkbox"
                        aria-checked={selectedFriends.includes(friend.id)}
                        tabIndex={0}
                      >
                        <div className="friend-avatar">
                          {friend.picture_url ? (
                            <img src={friend.picture_url} alt={friend.username} />
                          ) : (
                            <div className="friend-avatar-placeholder">
                              {(friend.first_name?.[0] || friend.username[0]).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="friend-info">
                          <span className="friend-name">
                            {friend.first_name && friend.last_name
                              ? `${friend.first_name} ${friend.last_name}`
                              : friend.username}
                          </span>
                          <span className="friend-username">@{friend.username}</span>
                        </div>
                        <div className="friend-checkbox">
                          {selectedFriends.includes(friend.id) && <Check size={16} />}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {selectedFriends.length > 0 && (
                  <div className="selected-count">
                    <Users size={16} />
                    <span>{selectedFriends.length} friend{selectedFriends.length > 1 ? 's' : ''} selected</span>
                  </div>
                )}
              </div>

              <div className="share-section">
                <h3 className="share-section-title">Add a Message (Optional)</h3>
                <textarea
                  className="share-message-input"
                  placeholder="Add a note about why you're sharing this..."
                  value={shareMessage}
                  onChange={(e) => setShareMessage(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="share-section">
                <h3 className="share-section-title">Or Share via Link</h3>
                <div className="share-link-container">
                  <div className="share-link">
                    <Link2 size={16} />
                    <input
                      type="text"
                      value={shareLink}
                      readOnly
                    />
                  </div>
                  <button 
                    className="copy-link-btn"
                    onClick={copyLink}
                  >
                    {linkCopied ? <Check size={16} /> : <Copy size={16} />}
                    <span>{linkCopied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
                <p className="share-link-hint">
                  Anyone with this link can {permission === 'view' ? 'view' : 'view and edit'} this {itemType}
                </p>
              </div>

              {error && (
                <div className="share-error">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="share-modal-footer">
              <button className="share-btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button 
                className="share-btn-primary"
                onClick={handleShare}
                disabled={loading || selectedFriends.length === 0}
              >
                {loading ? (
                  <span>Sharing...</span>
                ) : (
                  <>
                    <Users size={16} />
                    <span>Share with {selectedFriends.length || 'Friends'}</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ShareModal;