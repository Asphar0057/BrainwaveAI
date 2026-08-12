import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Plus, MessageSquare, FileText, Eye, Edit3,
  Trash2, Clock, Share2
} from 'lucide-react';
import ShareModal from './SharedModal';
import './SharedPage.css';
import SocialHubChrome from '../components/SocialHubChrome';
import { API_URL } from '../config';

const SharedPage = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [userId, setUserId] = useState(null);
  const [sharedItems, setSharedItems] = useState([]);
  const [sharedFilter, setSharedFilter] = useState('all');
  const [sharedSearch, setSharedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [itemToShare, setItemToShare] = useState(null);
  
  const [myNotes, setMyNotes] = useState([]);
  const [myChats, setMyChats] = useState([]);
  const [showMyContentModal, setShowMyContentModal] = useState(false);
  const [myContentFilter, setMyContentFilter] = useState('all');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    fetchUserProfile();
    fetchSharedContent();
  }, [token]);

  const fetchUserProfile = async () => {
    try {
      const response = await fetch(`${API_URL}/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUserId(data.email || data.username);
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  };

  const fetchSharedContent = async () => {
    try {
      const response = await fetch(`${API_URL}/shared_with_me`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSharedItems(data.shared_items || []);
      }
    } catch (error) {
      console.error('Error fetching shared content:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMyContent = async () => {
    try {
      const notesResponse = await fetch(`${API_URL}/get_notes?user_id=${encodeURIComponent(userId)}&summary=true&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (notesResponse.ok) {
        const notesData = await notesResponse.json();
        setMyNotes(notesData);
      }

      const chatsResponse = await fetch(`${API_URL}/get_chat_sessions?user_id=${encodeURIComponent(userId)}&limit=100`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (chatsResponse.ok) {
        const chatsData = await chatsResponse.json();
        setMyChats(chatsData.sessions || []);
      }
    } catch (error) {
      console.error('Error fetching my content:', error);
    }
  };

  const handleOpenSharedItem = (item) => {
    if (item.content_type === 'chat') {
      navigate(`/shared/chat/${item.content_id}`);
    } else if (item.content_type === 'note') {
      navigate(`/shared/note/${item.content_id}`);
    }
  };

  const handleDeleteSharedAccess = async (shareId) => {
    if (!window.confirm('Remove this shared item? You will no longer have access to it.')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/remove_shared_access/${shareId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setSharedItems(prev => prev.filter(item => item.id !== shareId));
      }
    } catch (error) {
      console.error('Error deleting shared access:', error);
    }
  };

  const handleShareNewContent = async () => {
    await fetchMyContent();
    setShowMyContentModal(true);
  };

  const handleSelectItemToShare = (item, type) => {
    setItemToShare({
      id: item.id,
      title: item.title,
      type: type
    });
    setShowMyContentModal(false);
    setShareModalOpen(true);
  };

  const handleShareSuccess = () => {
    fetchSharedContent();
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
    });
  };

  const getFilteredSharedItems = () => {
    let filtered = sharedItems;

    if (sharedFilter !== 'all') {
      filtered = filtered.filter(item => item.content_type === sharedFilter);
    }

    if (sharedSearch) {
      filtered = filtered.filter(item =>
        item.title.toLowerCase().includes(sharedSearch.toLowerCase()) ||
        item.shared_by.username.toLowerCase().includes(sharedSearch.toLowerCase()) ||
        (item.shared_by.first_name && item.shared_by.first_name.toLowerCase().includes(sharedSearch.toLowerCase()))
      );
    }

    return filtered;
  };

  const getFilteredMyContent = () => {
    if (myContentFilter === 'notes') return myNotes;
    if (myContentFilter === 'chats') return myChats;
    return [...myNotes.map(n => ({...n, type: 'note'})), ...myChats.map(c => ({...c, type: 'chat'}))];
  };

  const filteredSharedItems = getFilteredSharedItems();
  const filteredMyContent = getFilteredMyContent();

  const GEO_SVG = (
    <svg className="geo-bg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx="600" cy="400" r="360" fill="none" stroke="currentColor" strokeWidth="1"/>
      <circle cx="600" cy="400" r="260" fill="none" stroke="currentColor" strokeWidth="0.8"/>
      <circle cx="600" cy="400" r="168" fill="none" stroke="currentColor" strokeWidth="0.7"/>
      <circle cx="600" cy="400" r="90" fill="none" stroke="currentColor" strokeWidth="0.6"/>
      <line x1="600" y1="0" x2="600" y2="800" stroke="currentColor" strokeWidth="0.5"/>
      <line x1="0" y1="400" x2="1200" y2="400" stroke="currentColor" strokeWidth="0.5"/>
      <line x1="0" y1="800" x2="500" y2="0" stroke="currentColor" strokeWidth="0.4"/>
      <line x1="1200" y1="0" x2="700" y2="800" stroke="currentColor" strokeWidth="0.4"/>
      <circle cx="600" cy="40" r="5" fill="currentColor"/>
      <circle cx="600" cy="760" r="5" fill="currentColor"/>
      <circle cx="240" cy="400" r="5" fill="currentColor"/>
      <circle cx="960" cy="400" r="5" fill="currentColor"/>
      <circle cx="345" cy="146" r="3.5" fill="currentColor"/>
      <circle cx="855" cy="654" r="3.5" fill="currentColor"/>
      <circle cx="855" cy="146" r="3.5" fill="currentColor"/>
      <circle cx="345" cy="654" r="3.5" fill="currentColor"/>
    </svg>
  );

  const sharedChatCount = sharedItems.filter(item => item.content_type === 'chat').length;
  const sharedNoteCount = sharedItems.filter(item => item.content_type === 'note').length;
  const sharedChromeProps = {
    sideSections: [
      {
        label: 'Filter',
        items: [
          { icon: Share2,        label: 'All Content', onClick: () => setSharedFilter('all'),  active: sharedFilter === 'all',  count: sharedItems.length },
          { icon: MessageSquare, label: 'AI Chats',    onClick: () => setSharedFilter('chat'), active: sharedFilter === 'chat', count: sharedChatCount },
          { icon: FileText,      label: 'Notes',       onClick: () => setSharedFilter('note'), active: sharedFilter === 'note', count: sharedNoteCount },
        ],
      },
    ],
  };

  if (loading) {
    return (
      <div className="sp-page with-social-chrome">
        {GEO_SVG}
        <SocialHubChrome {...sharedChromeProps}>
          <main className="sp-main">
            <div className="sp-content">
              <div className="sp-loading-text">Loading shared content...</div>
            </div>
          </main>
        </SocialHubChrome>
      </div>
    );
  }

  return (
    <div className="sp-page with-social-chrome">
      {GEO_SVG}

      <SocialHubChrome {...sharedChromeProps}>
        <main className="sp-main">
          <div className="sp-content">
            <div className="view-heading">
              <span className="view-kicker">Library</span>
              <h2 className="view-title">Shared With Me</h2>
              <p className="view-sub">{filteredSharedItems.length} item{filteredSharedItems.length !== 1 ? 's' : ''}</p>
            </div>

            <div className="sp-search-row">
              <div className="sp-search-container">
                <Search size={16} />
                <input type="text" placeholder="Search shared content..." value={sharedSearch} onChange={(e) => setSharedSearch(e.target.value)} className="sp-search-input" />
              </div>
            </div>

        {filteredSharedItems.length === 0 ? (
          <div className="sp-empty-state">
            <Share2 size={64} className="sp-empty-icon" />
            <h3 className="sp-empty-title">
              {sharedSearch || sharedFilter !== 'all'
                ? 'No shared content found'
                : 'No shared content yet'}
            </h3>
            <p className="sp-empty-description">
              {sharedSearch || sharedFilter !== 'all'
                ? 'Try adjusting your search or filters'
                : 'When friends share notes or AI chats with you, they will appear here'}
            </p>
          </div>
        ) : (
          <div className="sp-items-grid">
            {filteredSharedItems.map((item) => (
              <div key={item.id} className="sp-item-card">
                <div className="sp-item-header">
                  <div className="sp-content-type-badge" data-type={item.content_type}>
                    {item.content_type === 'chat' ? (
                      <MessageSquare size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                    <span>{item.content_type === 'chat' ? 'AI Chat' : 'Note'}</span>
                  </div>
                  
                  <div className="sp-permission-badge" data-permission={item.permission}>
                    {item.permission === 'view' ? (
                      <Eye size={14} />
                    ) : (
                      <Edit3 size={14} />
                    )}
                    <span>{item.permission === 'view' ? 'View' : 'Edit'}</span>
                  </div>
                </div>

                <div className="sp-item-content">
                  <h3 className="sp-item-title">{item.title}</h3>
                  
                  {item.message && (
                    <p className="sp-share-message">
                      "{item.message}"
                    </p>
                  )}

                  <div className="sp-shared-by">
                    <div className="sp-shared-by-avatar">
                      {item.shared_by.picture_url ? (
                        <img src={item.shared_by.picture_url} alt={item.shared_by.username} />
                      ) : (
                        <div className="sp-shared-by-avatar-placeholder">
                          {(item.shared_by.first_name?.[0] || item.shared_by.username[0]).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="sp-shared-by-info">
                      <span className="sp-shared-by-text">Shared by</span>
                      <span className="sp-shared-by-name">
                        {item.shared_by.first_name && item.shared_by.last_name
                          ? `${item.shared_by.first_name} ${item.shared_by.last_name}`
                          : item.shared_by.username}
                      </span>
                    </div>
                  </div>

                  <div className="sp-meta">
                    <div className="sp-meta-item">
                      <Clock size={12} />
                      <span>{formatDate(item.shared_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="sp-item-footer">
                  <button 
                    className="sp-item-action-btn sp-open"
                    onClick={() => handleOpenSharedItem(item)}
                  >
                    {item.permission === 'view' ? (
                      <>
                        <Eye size={16} />
                        <span>View</span>
                      </>
                    ) : (
                      <>
                        <Edit3 size={16} />
                        <span>Open</span>
                      </>
                    )}
                  </button>
                  
                  <button 
                    className="sp-item-action-btn sp-remove"
                    onClick={() => handleDeleteSharedAccess(item.id)}
                    title="Remove from your shared items"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
          </div>
        </main>
      </SocialHubChrome>

      {showMyContentModal && (
        <div className="sp-modal-overlay" onClick={() => setShowMyContentModal(false)}>
          <div className="sp-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="sp-modal-header">
              <h2>Select Content to Share</h2>
              <button className="sp-modal-close" onClick={() => setShowMyContentModal(false)}>
                <Trash2 size={20} />
              </button>
            </div>

            <div className="sp-modal-filters">
              <button
                className={`sp-filter-btn ${myContentFilter === 'all' ? 'active' : ''}`}
                onClick={() => setMyContentFilter('all')}
              >
                All
              </button>
              <button
                className={`sp-filter-btn ${myContentFilter === 'notes' ? 'active' : ''}`}
                onClick={() => setMyContentFilter('notes')}
              >
                <FileText size={14} />
                Notes
              </button>
              <button
                className={`sp-filter-btn ${myContentFilter === 'chats' ? 'active' : ''}`}
                onClick={() => setMyContentFilter('chats')}
              >
                <MessageSquare size={14} />
                Chats
              </button>
            </div>

            <div className="sp-my-content-list">
              {filteredMyContent.length === 0 ? (
                <div className="sp-empty-content">
                  No {myContentFilter === 'all' ? 'content' : myContentFilter} available to share
                </div>
              ) : (
                filteredMyContent.map((item) => (
                  <div
                    key={item.id}
                    className="sp-content-item"
                    onClick={() => handleSelectItemToShare(item, item.type || (myContentFilter === 'notes' ? 'note' : 'chat'))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectItemToShare(item, item.type || (myContentFilter === 'notes' ? 'note' : 'chat')); } }}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="sp-content-item-icon">
                      {(item.type === 'note' || myContentFilter === 'notes') ? (
                        <FileText size={20} />
                      ) : (
                        <MessageSquare size={20} />
                      )}
                    </div>
                    <div className="sp-content-item-info">
                      <h4>{item.title}</h4>
                      <p>{(item.type === 'note' || myContentFilter === 'notes') ? 'Note' : 'AI Chat'}</p>
                    </div>
                    <div className="sp-content-item-share-icon">
                      <Share2 size={20} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {shareModalOpen && itemToShare && (
        <ShareModal
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setItemToShare(null);
          }}
          itemType={itemToShare.type}
          itemId={itemToShare.id}
          itemTitle={itemToShare.title}
          onShare={handleShareSuccess}
        />
      )}
    </div>
  );
};

export default SharedPage;
