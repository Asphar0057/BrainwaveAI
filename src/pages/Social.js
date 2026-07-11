import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, MessageSquare, Share2, TrendingUp, Search, UserPlus, Check, X, UserMinus, FileText, Eye, Edit3, Trash2, Clock, Plus, Gamepad2, Activity, BookOpen, Home, Inbox } from 'lucide-react';
import ShareModal from './SharedModal';
import './Social.css';
import SocialHubChrome from '../components/SocialHubChrome';
import GeometricGrid from '../components/GeometricGrid';
import { API_URL } from '../config';

const Social = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [userName, setUserName] = useState('User');
  const [userId, setUserId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ received: [], sent: [] });
  const [friends, setFriends] = useState([]);
  const [sharedItems, setSharedItems] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('hub');
  const [sharedFilter, setSharedFilter] = useState('all');
  const [sharedSearch, setSharedSearch] = useState('');
  
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
    fetchFriendRequests();
    fetchFriends();
    fetchSharedContent();
  }, [token]);

  const fetchUserProfile = async () => {
    try {
      const response = await fetch(`${API_URL}/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUserName(data.first_name || 'User');
        setUserId(data.email || data.username);
      }
    } catch (error) { /* silenced */ }
  };

  const fetchFriendRequests = async () => {
    try {
      const response = await fetch(`${API_URL}/friend_requests`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFriendRequests(data);
      }
    } catch (error) { /* silenced */ }
  };

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
    } catch (error) { /* silenced */ }
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
    } catch (error) { /* silenced */ }
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`${API_URL}/search_users?query=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.users);
      }
    } catch (error) { /* silenced */ } finally {
      setIsSearching(false);
    }
  };

  const sendFriendRequest = async (receiverId) => {
    try {
      const response = await fetch(`${API_URL}/send_friend_request`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ receiver_id: receiverId })
      });

      if (response.ok) {
        setSearchResults(prev => prev.map(user => 
          user.id === receiverId ? { ...user, request_sent: true } : user
        ));
        fetchFriendRequests();
      }
    } catch (error) { /* silenced */ }
  };

  const respondToFriendRequest = async (requestId, action) => {
    try {
      const response = await fetch(`${API_URL}/respond_friend_request`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ request_id: requestId, action })
      });

      if (response.ok) {
        fetchFriendRequests();
        fetchFriends();
      }
    } catch (error) { /* silenced */ }
  };

  const removeFriend = async (friendId) => {
    if (!window.confirm('Are you sure you want to remove this friend?')) return;
    
    try {
      const response = await fetch(`${API_URL}/remove_friend`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ friend_id: friendId })
      });

      if (response.ok) {
        fetchFriends();
      }
    } catch (error) { /* silenced */ }
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
    } catch (error) { /* silenced */ }
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

  const handleShareSuccess = (data) => {
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

  const bentoCards = [
    {
      id: 'welcome',
      size: 'large-square',
      icon: null,
      title: 'cerbyl',
      subtitle: 'SOCIAL HUB',
      onClick: null,
      className: 'welcome-card'
    },
    {
      id: 'friends',
      size: 'medium-horizontal',
      icon: Users,
      title: 'Friends & Requests',
      subtitle: 'MANAGE CONNECTIONS',
      onClick: () => navigate('/friends'),
      className: 'friends-card'
    },
    {
      id: 'activity',
      size: 'medium-horizontal',
      icon: Activity,
      title: 'Activity Feed',
      subtitle: 'FRIEND UPDATES',
      onClick: () => navigate('/activity-feed'),
      className: 'activity-card'
    },
    {
      id: 'playlists',
      size: 'tall',
      icon: BookOpen,
      title: 'Learning Playlists',
      subtitle: 'CURATED PATHS',
      onClick: () => navigate('/playlists'),
      className: 'playlists-card'
    },
    {
      id: 'games',
      size: 'small',
      icon: Gamepad2,
      title: 'Games',
      subtitle: 'PLAY & COMPETE',
      onClick: () => navigate('/games'),
      className: 'games-card'
    },
    {
      id: 'quiz',
      size: 'small',
      icon: MessageSquare,
      title: 'Quiz',
      subtitle: 'SOLO & 1V1',
      onClick: () => navigate('/quiz-hub'),
      className: 'quiz-card'
    },
    {
      id: 'shared',
      size: 'small',
      icon: Share2,
      title: 'Shared',
      subtitle: 'LEARNING CONTENT',
      onClick: () => navigate('/shared'),
      className: 'shared-card'
    },
    {
      id: 'leaderboards',
      size: 'large-horizontal',
      icon: TrendingUp,
      title: 'Global Leaderboards',
      subtitle: 'TOP PERFORMERS',
      onClick: () => navigate('/leaderboards'),
      className: 'leaderboards-card'
    }
  ];

  const handleTileMove = useCallback((e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = x / rect.width - 0.5;
    const cy = y / rect.height - 0.5;
    card.style.setProperty('--mx', `${x}px`);
    card.style.setProperty('--my', `${y}px`);
    card.style.setProperty('--rx', `${(-cy * 7).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${(cx * 9).toFixed(2)}deg`);
  }, []);
  const handleTileLeave = useCallback((e) => {
    const card = e.currentTarget;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  }, []);

  const renderUserCard = (user, actionButton) => (
    <div key={user.id} className="user-card">
      <div className="user-card-header">
        <div className="user-avatar">
          {user.picture_url ? (
            <img src={user.picture_url} alt={user.username} />
          ) : (
            <div className="user-avatar-placeholder">
              {(user.first_name?.[0] || user.username[0]).toUpperCase()}
            </div>
          )}
        </div>
        <div className="user-info">
          <h3 className="user-name">
            {user.first_name && user.last_name 
              ? `${user.first_name} ${user.last_name}` 
              : user.username}
          </h3>
          <p className="user-username">@{user.username}</p>
          {user.field_of_study && (
            <p className="user-field">{user.field_of_study}</p>
          )}
        </div>
        {actionButton}
      </div>

      {user.preferred_subjects && user.preferred_subjects.length > 0 && (
        <div className="user-subjects">
          <h4>Preferred Subjects</h4>
          <div className="subject-tags">
            {user.preferred_subjects.map((subject, idx) => (
              <span key={idx} className="subject-tag">{subject}</span>
            ))}
          </div>
        </div>
      )}

      {user.stats && (
        <div className="user-stats">
          <div className="stat-item">
            <span className="stat-value">{user.stats.ai_chats || 0}</span>
            <span className="stat-label">AI Chats</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{user.stats.flashcards || 0}</span>
            <span className="stat-label">Flashcards</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{user.stats.notes || 0}</span>
            <span className="stat-label">Notes</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{user.stats.quizzes || 0}</span>
            <span className="stat-label">Quizzes</span>
          </div>
        </div>
      )}
    </div>
  );

  const filteredSharedItems = getFilteredSharedItems();
  const filteredMyContent = getFilteredMyContent();

  return (
    <div className="hub-page with-social-chrome">
      <div className="sh-bg-fx" aria-hidden>
        <div className="cb-bg-wash" />
        <div className="cb-bg-orb cb-bg-orb-1" />
        <div className="cb-bg-orb cb-bg-orb-2" />
        <GeometricGrid />
        <div className="cb-bg-grain" />
        <div className="cb-bg-vignette" />
      </div>

      <SocialHubChrome
        tagline="social hub"
        noSidebar
        sideSections={[
          {
            label: 'Views',
            items: [
              { icon: Home,          label: 'Hub',          onClick: () => setActiveTab('hub'),      active: activeTab === 'hub' },
              { icon: Search,        label: 'Find People',  onClick: () => setActiveTab('search'),   active: activeTab === 'search' },
              { icon: Inbox,         label: 'Requests',     onClick: () => setActiveTab('requests'), active: activeTab === 'requests', count: friendRequests.received.length + friendRequests.sent.length },
              { icon: Users,         label: 'Friends',      onClick: () => setActiveTab('friends'),  active: activeTab === 'friends', count: friends.length },
              { icon: Share2,        label: 'Shared With Me', onClick: () => setActiveTab('shared'), active: activeTab === 'shared', count: sharedItems.length },
            ],
          },
          {
            label: 'Quick Access',
            items: [
              { icon: Activity,   label: 'Activity Feed',   onClick: () => navigate('/activity-feed') },
              { icon: TrendingUp, label: 'Leaderboards',    onClick: () => navigate('/leaderboards') },
              { icon: Gamepad2,   label: 'Games',           onClick: () => navigate('/games') },
              { icon: MessageSquare, label: 'Quiz',         onClick: () => navigate('/quiz-hub') },
              { icon: BookOpen,   label: 'Playlists',       onClick: () => navigate('/playlists') },
            ],
          },
        ]}
      >
        {activeTab === 'hub' ? (
          <div className="bento-container">
            {bentoCards.map(card => {
              const IconComponent = card.icon;
              return (
                <div
                  key={card.id}
                  className={`bento-card ${card.size} ${card.className}`}
                  onClick={card.onClick}
                  onMouseMove={handleTileMove}
                  onMouseLeave={handleTileLeave}
                  style={{ cursor: card.onClick ? 'pointer' : 'default' }}
                >
                  <div className="cb-tile-texture" aria-hidden="true" />
                  <div className="bento-geo-lines" aria-hidden="true">
                    <span></span><span></span><span></span><span></span>
                  </div>
                  <div className="bento-card-content">
                    {IconComponent && (
                      <div className="bento-card-icon">
                        <IconComponent size={card.size === 'tall' ? 56 : card.size === 'large-square' ? 64 : card.size === 'large-horizontal' ? 36 : 32} strokeWidth={1.2} />
                      </div>
                    )}
                    <div className="bento-card-text">
                      <h2 className="bento-card-title">{card.title}</h2>
                      <p className="bento-card-subtitle">{card.subtitle}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <main className="sh-main">
            <div className="sh-content">

              {activeTab === 'search' && (
                <div className="sh-tab-content">
                  <div className="view-heading">
                    <span className="view-kicker">Discover</span>
                    <h2 className="view-title">Find People</h2>
                    <p className="view-sub">Search by username or email to connect</p>
                  </div>
                  <div className="friend-section">
                    <div className="search-container">
                      <Search size={20} />
                      <input type="text" placeholder="Search by username or email..." value={searchQuery} onChange={(e) => handleSearch(e.target.value)} className="search-input" />
                    </div>
                    {isSearching && <div className="loading-text">Searching...</div>}
                    <div className="users-grid">
                      {searchResults.map(user => renderUserCard(user,
                        user.is_friend ? <span className="friend-badge">Friends</span>
                        : user.request_sent ? <span className="pending-badge">Request Sent</span>
                        : user.request_received ? <span className="pending-badge">Pending Response</span>
                        : <button className="social-action-button add-friend" onClick={(e) => { e.stopPropagation(); sendFriendRequest(user.id); }}><UserPlus size={14} /></button>
                      ))}
                    </div>
                    {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
                      <div className="empty-state">No users found matching "{searchQuery}"</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'requests' && (
                <div className="sh-tab-content">
                  <div className="view-heading">
                    <span className="view-kicker">Inbox</span>
                    <h2 className="view-title">Friend Requests</h2>
                    <p className="view-sub">{friendRequests.received.length + friendRequests.sent.length} pending</p>
                  </div>
                  <div className="friend-section">
                    {friendRequests.received.length > 0 && (
                      <div className="requests-section">
                        <div className="sh-section-label">Received</div>
                        <div className="users-grid">
                          {friendRequests.received.map(request => renderUserCard(request,
                            <div className="request-actions">
                              <button className="social-action-button accept" onClick={() => respondToFriendRequest(request.request_id, 'accept')} title="Accept"><Check size={14} /></button>
                              <button className="social-action-button reject" onClick={() => respondToFriendRequest(request.request_id, 'reject')} title="Reject"><X size={14} /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {friendRequests.sent.length > 0 && (
                      <div className="requests-section">
                        <div className="sh-section-label">Sent</div>
                        <div className="users-grid">
                          {friendRequests.sent.map(request => renderUserCard(request,
                            <span className="pending-badge">Pending</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {friendRequests.received.length === 0 && friendRequests.sent.length === 0 && (
                      <div className="empty-state">No pending friend requests</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'friends' && (
                <div className="sh-tab-content">
                  <div className="view-heading">
                    <span className="view-kicker">Your Network</span>
                    <h2 className="view-title">Friends</h2>
                    <p className="view-sub">{friends.length} {friends.length === 1 ? 'friend' : 'friends'} connected</p>
                  </div>
                  <div className="friend-section">
                    <div className="section-header">
                      <button className="hub-nav-btn" onClick={() => setActiveTab('search')}><UserPlus size={16} /><span>Find Friends</span></button>
                    </div>
                    {friends.length > 0 ? (
                      <div className="users-grid">
                        {friends.map(friend => renderUserCard(friend,
                          <button className="social-action-button remove" onClick={(e) => { e.stopPropagation(); removeFriend(friend.id); }} title="Remove Friend"><UserMinus size={14} /></button>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">You haven't added any friends yet. Search for users to connect!</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'shared' && (
                <div className="sh-tab-content">
                  <div className="view-heading">
                    <span className="view-kicker">Library</span>
                    <h2 className="view-title">Shared With Me</h2>
                    <p className="view-sub">Content friends have shared with you</p>
                  </div>
                  <div className="friend-section">
                    <div className="shared-controls">
                      <div className="search-container">
                        <Search size={20} />
                        <input type="text" placeholder="Search shared content..." value={sharedSearch} onChange={(e) => setSharedSearch(e.target.value)} className="search-input" />
                      </div>
                      <div className="shared-filter-buttons">
                        <button className={`filter-btn ${sharedFilter === 'all' ? 'active' : ''}`} onClick={() => setSharedFilter('all')}>All</button>
                        <button className={`filter-btn ${sharedFilter === 'chat' ? 'active' : ''}`} onClick={() => setSharedFilter('chat')}><MessageSquare size={14} /> Chats</button>
                        <button className={`filter-btn ${sharedFilter === 'note' ? 'active' : ''}`} onClick={() => setSharedFilter('note')}><FileText size={14} /> Notes</button>
                      </div>
                      <button className="sh-share-content-btn" onClick={handleShareNewContent}><Plus size={15}/><span>Share New</span></button>
                    </div>
                    {filteredSharedItems.length === 0 ? (
                      <div className="empty-state">{sharedSearch || sharedFilter !== 'all' ? 'No shared content found matching your filters' : 'No content has been shared with you yet.'}</div>
                    ) : (
                      <div className="shared-items-grid">
                        {filteredSharedItems.map((item) => (
                          <div key={item.id} className="shared-item-card">
                            <div className="shared-item-header">
                              <div className="content-type-badge" data-type={item.content_type}>
                                {item.content_type === 'chat' ? <MessageSquare size={16} /> : <FileText size={16} />}
                                <span>{item.content_type === 'chat' ? 'AI Chat' : 'Note'}</span>
                              </div>
                              <div className="permission-badge" data-permission={item.permission}>
                                {item.permission === 'view' ? <Eye size={14} /> : <Edit3 size={14} />}
                                <span>{item.permission === 'view' ? 'View' : 'Edit'}</span>
                              </div>
                            </div>
                            <div className="shared-item-content">
                              <h3 className="shared-item-title">{item.title}</h3>
                              {item.message && <p className="share-message">"{item.message}"</p>}
                              <div className="shared-by">
                                <div className="shared-by-avatar">
                                  {item.shared_by.picture_url ? <img src={item.shared_by.picture_url} alt={item.shared_by.username} /> : <div className="shared-by-avatar-placeholder">{(item.shared_by.first_name?.[0] || item.shared_by.username[0]).toUpperCase()}</div>}
                                </div>
                                <div className="shared-by-info">
                                  <span className="shared-by-text">Shared by</span>
                                  <span className="shared-by-name">{item.shared_by.first_name && item.shared_by.last_name ? `${item.shared_by.first_name} ${item.shared_by.last_name}` : item.shared_by.username}</span>
                                </div>
                              </div>
                              <div className="shared-meta">
                                <div className="meta-item"><Clock size={12} /><span>{formatDate(item.shared_at)}</span></div>
                              </div>
                            </div>
                            <div className="shared-item-footer">
                              <button className="shared-item-action-btn open" onClick={() => handleOpenSharedItem(item)}>
                                {item.permission === 'view' ? <><Eye size={16}/><span>View</span></> : <><Edit3 size={16}/><span>Open</span></>}
                              </button>
                              <button className="shared-item-action-btn remove" onClick={() => handleDeleteSharedAccess(item.id)} title="Remove"><Trash2 size={16} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </main>
        )}
      </SocialHubChrome>

      {shareModalOpen && itemToShare && (
        <ShareModal
          isOpen={shareModalOpen}
          onClose={() => { setShareModalOpen(false); setItemToShare(null); }}
          itemType={itemToShare.type}
          itemId={itemToShare.id}
          itemTitle={itemToShare.title}
          onShare={handleShareSuccess}
        />
      )}
    </div>
  );
};

export default Social;
