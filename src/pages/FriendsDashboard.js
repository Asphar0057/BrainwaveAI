import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Users, Search, UserPlus, Check, X,
  Flame, Trophy, Clock3, Inbox, Compass, MoreHorizontal,
  Copy, ArrowUpDown, CheckCircle2, AlertCircle, LoaderCircle
} from 'lucide-react';
import './FriendsDashboard.css';
import SocialHubChrome from '../components/SocialHubChrome';
import { API_URL } from '../config';

const FRIEND_VIEWS = new Set(['my-friends', 'find-friends', 'requests']);

const FriendsDashboard = () => {
  const location = useLocation();
  const token = localStorage.getItem('token');
  const getRouteView = () => {
    const queryView = new URLSearchParams(location.search).get('view');
    const stateView = location.state?.activeView;
    const routeView = queryView || stateView;
    return FRIEND_VIEWS.has(routeView) ? routeView : 'my-friends';
  };
  const [activeView, setActiveView] = useState(getRouteView);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState({ received: [], sent: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [friendQuery, setFriendQuery] = useState('');
  const [friendSort, setFriendSort] = useState('momentum');
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [pendingActions, setPendingActions] = useState({});
  const [notice, setNotice] = useState(null);
  const discoverySearchRef = useRef(null);

  useEffect(() => {
    fetchFriends();
    fetchFriendRequests();
    if (activeView === 'find-friends') fetchAllUsers();
  }, [activeView]);

  useEffect(() => {
    const routeView = getRouteView();
    setActiveView(prev => (prev === routeView ? prev : routeView));
  }, [location.search, location.state]);

  useEffect(() => {
    if (activeView !== 'find-friends' || searchQuery.length < 2) {
      if (searchQuery.length < 2) setSearchResults([]);
      return undefined;
    }
    const timer = setTimeout(() => searchUsers(searchQuery), 280);
    return () => clearTimeout(timer);
  }, [searchQuery, activeView]);

  useEffect(() => {
    const handleShortcut = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
      if (event.key === '/' && !isTyping) {
        event.preventDefault();
        setActiveView('find-friends');
        window.requestAnimationFrame(() => discoverySearchRef.current?.focus());
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const fetchLeaderboardStats = async () => {
    try {
      const res = await fetch(`${API_URL}/get_leaderboard?limit=200`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return {};
      const data = await res.json();
      const map = {};
      (data.leaderboard || []).forEach(entry => {
        const uid = entry.user_id || entry.id;
        if (uid) map[uid] = {
          level: entry.level || 1,
          experience: entry.experience || 0,
          current_streak: entry.current_streak || 0,
          total_hours: entry.score || entry.total_hours || 0,
        };
      });
      return map;
    } catch { return {}; }
  };

  const fetchFriends = async () => {
    try {
      setLoading(true);
      const [res, statsMap] = await Promise.all([
        fetch(`${API_URL}/friends`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetchLeaderboardStats(),
      ]);
      if (res.ok) {
        const data = await res.json();
        const list = (data.friends || []).map(f => ({
          ...f,
          ...statsMap[f.id],
        }));
        setFriends(list);
      }
    } catch {
      
    } finally { setLoading(false); }
  };

  const fetchFriendRequests = async () => {
    try {
      const res = await fetch(`${API_URL}/friend_requests`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setFriendRequests(data); }
    } catch {
      
    }
  };

  const fetchAllUsers = async () => {
    try {
      setLoading(true);
      const [res, statsMap] = await Promise.all([
        fetch(`${API_URL}/search_users?query=a`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetchLeaderboardStats(),
      ]);
      if (res.ok) {
        const data = await res.json();
        const list = (data.users || [])
          .sort((a, b) => (a.username || a.email).localeCompare(b.username || b.email))
          .map(u => ({ ...u, ...statsMap[u.id] }));
        setAllUsers(list);
      }
    } catch {
      
    } finally { setLoading(false); }
  };

  const searchUsers = async (query) => {
    if (query.length < 2) { setSearchResults([]); return; }
    try {
      setIsSearching(true);
      const [res, statsMap] = await Promise.all([
        fetch(`${API_URL}/search_users?query=${encodeURIComponent(query)}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetchLeaderboardStats(),
      ]);
      if (res.ok) {
        const data = await res.json();
        const list = (data.users || [])
          .sort((a, b) => (a.username || a.email).localeCompare(b.username || b.email))
          .map(u => ({ ...u, ...statsMap[u.id] }));
        setSearchResults(list);
      }
    } catch {
      
    } finally { setIsSearching(false); }
  };

  const sendFriendRequest = async (receiverId) => {
    const actionKey = `send-${receiverId}`;
    setPendingActions(prev => ({ ...prev, [actionKey]: true }));
    try {
      const res = await fetch(`${API_URL}/send_friend_request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_id: receiverId }),
      });
      if (res.ok) {
        setSearchResults(prev => prev.map(u => u.id === receiverId ? { ...u, request_sent: true } : u));
        setAllUsers(prev => prev.map(u => u.id === receiverId ? { ...u, request_sent: true } : u));
        fetchFriendRequests();
        setNotice({ type: 'success', message: 'Invitation sent. It will appear in Requests.' });
      } else {
        setNotice({ type: 'error', message: 'Could not send that invitation. Try again.' });
      }
    } catch {
      setNotice({ type: 'error', message: 'Could not send that invitation. Check your connection.' });
    } finally {
      setPendingActions(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  const respondToFriendRequest = async (requestId, action) => {
    const actionKey = `request-${requestId}`;
    setPendingActions(prev => ({ ...prev, [actionKey]: true }));
    try {
      const res = await fetch(`${API_URL}/respond_friend_request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, action }),
      });
      if (res.ok) {
        setFriendRequests(prev => ({
          ...prev,
          received: prev.received.filter(request => request.request_id !== requestId),
        }));
        if (action === 'accept') fetchFriends();
        setNotice({
          type: 'success',
          message: action === 'accept' ? 'Connection added to your network.' : 'Invitation declined.',
        });
      } else {
        setNotice({ type: 'error', message: 'Could not update that invitation. Try again.' });
      }
    } catch {
      setNotice({ type: 'error', message: 'Could not update that invitation. Check your connection.' });
    } finally {
      setPendingActions(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  const removeFriend = async (friendId) => {
    const actionKey = `remove-${friendId}`;
    setPendingActions(prev => ({ ...prev, [actionKey]: true }));
    try {
      const res = await fetch(`${API_URL}/remove_friend`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ friend_id: friendId }),
      });
      if (res.ok) {
        setFriends(prev => prev.filter(friend => friend.id !== friendId));
        setConfirmRemoveId(null);
        setNotice({ type: 'success', message: 'Connection removed from your network.' });
      } else {
        setNotice({ type: 'error', message: 'Could not remove that connection. Try again.' });
      }
    } catch {
      setNotice({ type: 'error', message: 'Could not remove that connection. Check your connection.' });
    } finally {
      setPendingActions(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  const cancelFriendRequest = async (requestId) => {
    const actionKey = `request-${requestId}`;
    setPendingActions(prev => ({ ...prev, [actionKey]: true }));
    try {
      const res = await fetch(`${API_URL}/respond_friend_request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, action: 'reject' }),
      });
      if (res.ok) {
        setFriendRequests(prev => ({
          ...prev,
          sent: prev.sent.filter(request => request.request_id !== requestId),
        }));
        setNotice({ type: 'success', message: 'Sent invitation cancelled.' });
      } else {
        setNotice({ type: 'error', message: 'Could not cancel that invitation. Try again.' });
      }
    } catch {
      setNotice({ type: 'error', message: 'Could not cancel that invitation. Check your connection.' });
    } finally {
      setPendingActions(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  const copyFriendHandle = async (friend, event) => {
    const handle = friend.username || friend.email;
    const menu = event.currentTarget.closest('details');
    try {
      await navigator.clipboard.writeText(handle);
      menu?.removeAttribute('open');
      setNotice({ type: 'success', message: `${handle} copied to your clipboard.` });
    } catch {
      setNotice({ type: 'error', message: 'Could not copy that username.' });
    }
  };

  const renderAvatar = (user, size = 'md') => {
    const pic = user.picture_url || user.picture || user.profile_picture;
    const name = user.username || user.email || 'U';
    const initial = name.charAt(0).toUpperCase();
    return (
      <div className={`fd-avatar fd-avatar--${size}`}>
        {pic
          ? <img src={pic} alt={name} referrerPolicy="no-referrer" onError={e => { e.target.style.display = 'none'; }} />
          : <span>{initial}</span>}
      </div>
    );
  };

  const getLevelLabel = (level) => {
    if (!level || level < 2) return 'Learner';
    if (level < 5) return 'Explorer';
    if (level < 10) return 'Scholar';
    if (level < 20) return 'Expert';
    return 'Master';
  };

  const renderFriendCard = (friend, index) => {
    const progress = Math.min(100, ((friend.experience % 1000) / 1000) * 100);
    return (
    <article key={friend.id} className="fd-friend-card" style={{ '--fd-index': `"${String(index + 1).padStart(2, '0')}"` }}>
      <div className="fd-card-spine" aria-hidden="true">
        <span>{String(index + 1).padStart(2, '0')}</span>
        <i />
      </div>
      <div className="fd-friend-card-top">
        {renderAvatar(friend, 'lg')}
        <div className="fd-friend-identity">
          <div className="fd-friend-level-badge">{getLevelLabel(friend.level)} · LVL {friend.level || 1}</div>
          <h3 className="fd-friend-name">{friend.username || friend.email}</h3>
          <p className="fd-friend-role">
            {(friend.current_streak || 0) > 0 ? `${friend.current_streak} day learning rhythm` : 'Ready for a fresh learning rhythm'}
          </p>
        </div>
        <details className="fd-card-menu" onToggle={event => {
          if (!event.currentTarget.open && confirmRemoveId === friend.id) setConfirmRemoveId(null);
        }}>
          <summary aria-label={`Actions for ${friend.username || friend.email}`}>
            <MoreHorizontal size={16} />
          </summary>
          <div className="fd-card-menu-popover">
            <button type="button" onClick={event => copyFriendHandle(friend, event)}>
              <Copy size={13} />
              Copy username
            </button>
            {confirmRemoveId === friend.id ? (
              <div className="fd-remove-confirm">
                <span>Remove connection?</span>
                <div>
                  <button type="button" onClick={() => setConfirmRemoveId(null)}>Keep</button>
                  <button
                    type="button"
                    className="danger"
                    disabled={pendingActions[`remove-${friend.id}`]}
                    onClick={() => removeFriend(friend.id)}
                  >
                    {pendingActions[`remove-${friend.id}`] ? <LoaderCircle size={12} className="fd-spin" /> : null}
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="danger" onClick={() => setConfirmRemoveId(friend.id)}>
                <X size={13} />
                Remove connection
              </button>
            )}
          </div>
        </details>
      </div>

      <div className="fd-friend-stats">
        <div className="fd-stat fd-stat--xp">
          <Trophy size={13} />
          <span className="fd-stat-val">{(friend.experience || 0).toLocaleString()}</span>
          <span className="fd-stat-lbl">XP</span>
        </div>
        <div className="fd-stat fd-stat--streak">
          <Flame size={13} />
          <span className="fd-stat-val">{friend.current_streak || 0}</span>
          <span className="fd-stat-lbl">Streak</span>
        </div>
        <div className="fd-stat fd-stat--hours">
          <Clock3 size={13} />
          <span className="fd-stat-val">{friend.level || 1}</span>
          <span className="fd-stat-lbl">Level</span>
        </div>
      </div>

      <div className="fd-card-progress">
        <div><span>Next level</span><strong>{Math.round(progress)}%</strong></div>
        <div className="fd-xp-bar"><div className="fd-xp-fill" style={{ width: `${progress}%` }} /></div>
      </div>
    </article>
    );
  };

  const renderUserCard = (user) => {
    const isRequestSent = user.request_sent || friendRequests.sent.some(r => r.id === user.id);
    const isRequestReceived = friendRequests.received.some(r => r.id === user.id);
    const isFriend = user.is_friend || friends.some(f => f.id === user.id);
    return (
      <div key={user.id} className="fd-user-row">
        {renderAvatar(user, 'md')}
        <div className="fd-user-row-info">
          <h4 className="fd-user-row-name">{user.username || user.email}</h4>
          <div className="fd-user-row-meta">
            <span className="fd-user-row-pill fd-pill--level">LVL {user.level || 1}</span>
            {(user.current_streak || 0) > 0 && (
              <><span className="fd-pill-sep">·</span><span className="fd-user-row-pill fd-pill--streak">{user.current_streak}D STREAK</span></>
            )}
            {(user.experience || 0) > 0 && (
              <><span className="fd-pill-sep">·</span><span className="fd-user-row-pill fd-pill--xp">{(user.experience || 0).toLocaleString()} XP</span></>
            )}
          </div>
        </div>
        <div className="fd-user-row-action">
          {isFriend
            ? <span className="fd-badge-pill fd-badge-pill--friend">Friends</span>
            : isRequestSent
            ? <button className="fd-badge-pill fd-badge-pill--pending fd-status-link" type="button" onClick={() => setActiveView('requests')}>Sent · View</button>
            : isRequestReceived
            ? <button className="fd-badge-pill fd-badge-pill--pending fd-status-link" type="button" onClick={() => setActiveView('requests')}>Respond</button>
            : (
              <button
                className="fd-add-btn"
                type="button"
                disabled={pendingActions[`send-${user.id}`]}
                onClick={() => sendFriendRequest(user.id)}
              >
                {pendingActions[`send-${user.id}`] ? <LoaderCircle size={14} className="fd-spin" /> : <UserPlus size={15} />}
                <span>{pendingActions[`send-${user.id}`] ? 'Sending' : 'Connect'}</span>
              </button>
            )}
        </div>
      </div>
    );
  };

  const totalRequests = friendRequests.received.length + friendRequests.sent.length;
  const receivedCount = friendRequests.received.length;
  const viewCopy = {
    'my-friends': {
      kicker: 'Your circle',
      title: 'People who make learning less solitary.',
      description: 'See the learners in your network and the momentum they are building.',
    },
    'find-friends': {
      kicker: 'Discover learners',
      title: 'Find your next study connection.',
      description: 'Search the Cerbyl community by username or email.',
    },
    requests: {
      kicker: 'Connection inbox',
      title: 'Turn introductions into a network.',
      description: 'Review incoming invitations and keep track of requests you have sent.',
    },
  }[activeView];
  const displayedUsers = searchQuery.length >= 2 ? searchResults : allUsers;
  const visibleFriends = useMemo(() => {
    const query = friendQuery.trim().toLowerCase();
    const filtered = query
      ? friends.filter(friend => `${friend.username || ''} ${friend.email || ''}`.toLowerCase().includes(query))
      : [...friends];

    return filtered.sort((a, b) => {
      if (friendSort === 'name') {
        return (a.username || a.email || '').localeCompare(b.username || b.email || '');
      }
      if (friendSort === 'level') {
        return (b.level || 1) - (a.level || 1) || (b.experience || 0) - (a.experience || 0);
      }
      return (b.current_streak || 0) - (a.current_streak || 0) || (b.experience || 0) - (a.experience || 0);
    });
  }, [friends, friendQuery, friendSort]);
  const sidebarLead = (
    <button className="fd-side-discover" type="button" onClick={() => setActiveView('find-friends')}>
      <UserPlus size={15} />
      <span>Find people</span>
    </button>
  );

  return (
    <div className="fd-container with-social-chrome">
      <SocialHubChrome
        brandKicker="Friends"
        sidebarLead={sidebarLead}
        sideSections={[
          {
            label: 'Network',
            items: [
              { icon: Users, label: 'My Friends', onClick: () => setActiveView('my-friends'), active: activeView === 'my-friends', count: friends.length },
              { icon: Inbox, label: 'Requests', onClick: () => setActiveView('requests'), active: activeView === 'requests', count: totalRequests },
              { icon: Compass, label: 'Discover', onClick: () => setActiveView('find-friends'), active: activeView === 'find-friends' },
            ],
          },
        ]}
      >
        <main className="fd-main fd-main--redesigned">
          <header className="fd-hero">
            <div className="fd-hero-copy">
              <span className="fd-hero-kicker">{viewCopy.kicker}</span>
              <h1>{viewCopy.title}</h1>
              <p>{viewCopy.description}</p>
            </div>
          </header>

          {activeView === 'my-friends' && (
            <section className="fd-view">
              <div className="fd-view-bar">
                <div>
                  <span>Network roster</span>
                  <strong>{visibleFriends.length} of {friends.length} {friends.length === 1 ? 'person' : 'people'}</strong>
                </div>
                <button type="button" onClick={() => setActiveView('find-friends')}>
                  <UserPlus size={14} />
                  Add connection
                </button>
              </div>

              {friends.length > 0 && (
                <div className="fd-roster-tools">
                  <label className="fd-roster-search">
                    <span className="sr-only">Search your friends</span>
                    <Search size={15} />
                    <input
                      type="search"
                      value={friendQuery}
                      placeholder="Search your connections"
                      onChange={event => setFriendQuery(event.target.value)}
                    />
                    {friendQuery && (
                      <button type="button" onClick={() => setFriendQuery('')} aria-label="Clear friend search">
                        <X size={12} />
                      </button>
                    )}
                  </label>
                  <label className="fd-sort-control">
                    <ArrowUpDown size={14} />
                    <span>Sort</span>
                    <select value={friendSort} onChange={event => setFriendSort(event.target.value)}>
                      <option value="momentum">Momentum</option>
                      <option value="level">Level</option>
                      <option value="name">Name</option>
                    </select>
                  </label>
                </div>
              )}

              {loading ? (
                <div className="fd-loading"><div className="fd-pulse-loader"><div className="fd-pulse-block fd-pulse-1" /><div className="fd-pulse-block fd-pulse-2" /><div className="fd-pulse-block fd-pulse-3" /></div></div>
              ) : visibleFriends.length > 0 ? (
                <div className="fd-friends-grid">{visibleFriends.map(renderFriendCard)}</div>
              ) : friends.length > 0 ? (
                <div className="fd-empty-state fd-empty-state--compact">
                  <div className="fd-empty-icon"><Search size={22} /></div>
                  <span>No match in your network</span>
                  <h2>Try a different name.</h2>
                  <p>No connection matched “{friendQuery}”.</p>
                  <button type="button" onClick={() => setFriendQuery('')}>Clear search</button>
                </div>
              ) : (
                <div className="fd-empty-state">
                  <div className="fd-empty-icon"><Users size={23} /></div>
                  <span>Your network is open</span>
                  <h2>Learning is better with company.</h2>
                  <p>Find someone studying a similar topic and build momentum together.</p>
                  <button type="button" onClick={() => setActiveView('find-friends')}><UserPlus size={14} /> Find people</button>
                </div>
              )}
            </section>
          )}

          {activeView === 'find-friends' && (
            <section className="fd-view">
              <div className="fd-discovery-deck">
                <div className="fd-discovery-field">
                  <div className="fd-field-label">
                    <span>Search learners</span>
                    <span className="fd-key-hint"><kbd>/</kbd> focus</span>
                  </div>
                  <label className="fd-search-box">
                    <Search size={16} className="fd-search-icon" />
                    <input
                      ref={discoverySearchRef}
                      type="search"
                      className="fd-search-input"
                      aria-label="Search learners by username or email"
                      placeholder="Username or email"
                      value={searchQuery}
                      onChange={event => setSearchQuery(event.target.value)}
                    />
                    {isSearching && <LoaderCircle size={14} className="fd-spin fd-searching-icon" aria-label="Searching" />}
                    {searchQuery && !isSearching && (
                      <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search"><X size={13} /></button>
                    )}
                  </label>
                </div>
                <div className="fd-result-count">
                  <strong>{displayedUsers.length}</strong>
                  <span>{searchQuery.length >= 2 ? 'matches' : 'learners nearby'}</span>
                </div>
              </div>

              {(loading && !allUsers.length) || (isSearching && !searchResults.length) ? (
                <div className="fd-loading"><div className="fd-pulse-loader"><div className="fd-pulse-block fd-pulse-1" /><div className="fd-pulse-block fd-pulse-2" /><div className="fd-pulse-block fd-pulse-3" /></div></div>
              ) : displayedUsers.length > 0 ? (
                <div className="fd-users-list fd-users-list--directory" aria-busy={isSearching}>{displayedUsers.map(renderUserCard)}</div>
              ) : (
                <div className="fd-empty-state fd-empty-state--compact">
                  <div className="fd-empty-icon"><Search size={22} /></div>
                  <span>No matches</span>
                  <h2>Try another name.</h2>
                  <p>No learners matched “{searchQuery}”.</p>
                </div>
              )}
            </section>
          )}

          {activeView === 'requests' && (
            <section className="fd-view">
              {totalRequests > 0 ? (
                <div className="fd-request-columns">
                  <section className="fd-request-board fd-request-board--received">
                    <div className="fd-request-board-head">
                      <div><span>Incoming</span><h2>Waiting for you</h2></div>
                      <strong>{receivedCount}</strong>
                    </div>
                    <div className="fd-users-list">
                      {friendRequests.received.map(req => (
                        <article key={req.request_id} className="fd-user-row fd-request-row">
                          {renderAvatar(req, 'md')}
                          <div className="fd-user-row-info">
                            <h3 className="fd-user-row-name">{req.username || req.email}</h3>
                            <p className="fd-user-row-email">{req.email}</p>
                          </div>
                          <div className="fd-user-row-action fd-request-btns">
                            <button
                              className="fd-req-btn fd-req-btn--accept"
                              type="button"
                              disabled={pendingActions[`request-${req.request_id}`]}
                              onClick={() => respondToFriendRequest(req.request_id, 'accept')}
                            >
                              {pendingActions[`request-${req.request_id}`] ? <LoaderCircle size={14} className="fd-spin" /> : <Check size={14} />}
                              <span>Accept</span>
                            </button>
                            <button
                              className="fd-req-btn fd-req-btn--reject"
                              type="button"
                              disabled={pendingActions[`request-${req.request_id}`]}
                              onClick={() => respondToFriendRequest(req.request_id, 'reject')}
                            >
                              <X size={14} />
                              <span>Decline</span>
                            </button>
                          </div>
                        </article>
                      ))}
                      {!receivedCount && <p className="fd-board-empty">No incoming requests.</p>}
                    </div>
                  </section>

                  <section className="fd-request-board">
                    <div className="fd-request-board-head">
                      <div><span>Outgoing</span><h2>Sent by you</h2></div>
                      <strong>{friendRequests.sent.length}</strong>
                    </div>
                    <div className="fd-users-list">
                      {friendRequests.sent.map(req => (
                        <article key={req.request_id} className="fd-user-row fd-request-row">
                          {renderAvatar(req, 'md')}
                          <div className="fd-user-row-info">
                            <h3 className="fd-user-row-name">{req.username || req.email}</h3>
                            <p className="fd-user-row-email">{req.email}</p>
                          </div>
                          <div className="fd-user-row-action">
                            <button
                              className="fd-cancel-request"
                              type="button"
                              disabled={pendingActions[`request-${req.request_id}`]}
                              onClick={() => cancelFriendRequest(req.request_id)}
                            >
                              {pendingActions[`request-${req.request_id}`] ? <LoaderCircle size={13} className="fd-spin" /> : null}
                              Cancel
                            </button>
                          </div>
                        </article>
                      ))}
                      {!friendRequests.sent.length && <p className="fd-board-empty">No sent requests.</p>}
                    </div>
                  </section>
                </div>
              ) : (
                <div className="fd-empty-state">
                  <div className="fd-empty-icon"><Inbox size={23} /></div>
                  <span>Inbox clear</span>
                  <h2>No introductions waiting.</h2>
                  <p>New requests and invitations you send will appear here.</p>
                  <button type="button" onClick={() => setActiveView('find-friends')}><Compass size={14} /> Discover learners</button>
                </div>
              )}
            </section>
          )}

          {notice && (
            <div className={`fd-action-notice fd-action-notice--${notice.type}`} role="status" aria-live="polite">
              {notice.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{notice.message}</span>
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={13} /></button>
            </div>
          )}
        </main>
      </SocialHubChrome>
    </div>
  );

  return (
    <div className="fd-container with-social-chrome">
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

      <SocialHubChrome
        sideSections={[
          {
            label: 'Friends',
            items: [
              { icon: Users,    label: 'Current Friends',  onClick: () => setActiveView('my-friends'),   active: activeView === 'my-friends',  count: friends.length },
              { icon: UserPlus, label: 'Pending Requests', onClick: () => setActiveView('requests'),     active: activeView === 'requests',    count: totalRequests },
              { icon: Search,   label: 'Find Friends',     onClick: () => setActiveView('find-friends'), active: activeView === 'find-friends' },
            ],
          },
        ]}
      >
        <main className="fd-main">
          {activeView === 'my-friends' && (
            <>
              <div className="view-heading">
                <span className="view-kicker">Your Network</span>
                <h2 className="view-title">Current Friends</h2>
                <p className="view-sub">{friends.length} connection{friends.length !== 1 ? 's' : ''}</p>
              </div>
              {loading
                ? <div className="fd-loading"><div className="fd-pulse-loader"><div className="fd-pulse-block fd-pulse-1" /><div className="fd-pulse-block fd-pulse-2" /><div className="fd-pulse-block fd-pulse-3" /></div></div>
                : friends.length > 0
                ? <div className="fd-friends-grid">{friends.map(renderFriendCard)}</div>
                : <p className="fd-empty-text">No friends yet.</p>
              }
            </>
          )}

          {activeView === 'find-friends' && (
            <>
              <div className="view-heading">
                <span className="view-kicker">Discover</span>
                <h2 className="view-title">Find Friends</h2>
                <p className="view-sub">Search and connect with learners</p>
              </div>
              <div className="fd-search-box">
                <Search size={16} className="fd-search-icon" />
                <input
                  type="text"
                  className="fd-search-input"
                  placeholder="Search by username or email..."
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); searchUsers(e.target.value); }}
                />
              </div>
              <div className="fd-users-list">
                {searchQuery.length >= 2
                  ? isSearching
                    ? <div className="fd-loading"><div className="fd-pulse-loader"><div className="fd-pulse-block fd-pulse-1" /><div className="fd-pulse-block fd-pulse-2" /><div className="fd-pulse-block fd-pulse-3" /></div></div>
                    : searchResults.length > 0
                    ? searchResults.map(renderUserCard)
                    : <p className="fd-empty-text">No users found for "{searchQuery}"</p>
                  : loading
                  ? <div className="fd-loading"><div className="fd-pulse-loader"><div className="fd-pulse-block fd-pulse-1" /><div className="fd-pulse-block fd-pulse-2" /><div className="fd-pulse-block fd-pulse-3" /></div></div>
                  : allUsers.length > 0
                  ? allUsers.map(renderUserCard)
                  : <p className="fd-empty-text">No users available</p>}
              </div>
            </>
          )}

          {activeView === 'requests' && (
            <>
              <div className="view-heading">
                <span className="view-kicker">Inbox</span>
                <h2 className="view-title">Requests</h2>
                <p className="view-sub">{totalRequests} pending</p>
              </div>

              {friendRequests.received.length > 0 && (
                <section className="fd-requests-section">
                  <h3 className="fd-section-label">Received <span>{friendRequests.received.length}</span></h3>
                  <div className="fd-users-list">
                    {friendRequests.received.map(req => (
                      <div key={req.request_id} className="fd-user-row">
                        {renderAvatar(req, 'md')}
                        <div className="fd-user-row-info">
                          <h4 className="fd-user-row-name">{req.username || req.email}</h4>
                          <p className="fd-user-row-email">{req.email}</p>
                        </div>
                        <div className="fd-user-row-action fd-request-btns">
                          <button className="fd-req-btn fd-req-btn--accept" onClick={() => respondToFriendRequest(req.request_id, 'accept')}>
                            <Check size={15} />
                          </button>
                          <button className="fd-req-btn fd-req-btn--reject" onClick={() => respondToFriendRequest(req.request_id, 'reject')}>
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {friendRequests.sent.length > 0 && (
                <section className="fd-requests-section">
                  <h3 className="fd-section-label">Sent <span>{friendRequests.sent.length}</span></h3>
                  <div className="fd-users-list">
                    {friendRequests.sent.map(req => (
                      <div key={req.request_id} className="fd-user-row">
                        {renderAvatar(req, 'md')}
                        <div className="fd-user-row-info">
                          <h4 className="fd-user-row-name">{req.username || req.email}</h4>
                          <p className="fd-user-row-email">{req.email}</p>
                        </div>
                        <div className="fd-user-row-action">
                          <button className="fd-req-btn fd-req-btn--reject" onClick={() => cancelFriendRequest(req.request_id)}>
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {totalRequests === 0 && (
                <p className="fd-empty-text">No pending requests.</p>
              )}
            </>
          )}
        </main>
      </SocialHubChrome>
    </div>
  );
};

export default FriendsDashboard;
