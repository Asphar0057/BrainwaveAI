import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, BookOpen, Users, Clock,
  Globe, Lock, Heart, Library, Filter, X, Zap,
  FileText, Share2, Check, Sparkles, Trash2,
  LayoutGrid, List, ArrowUpRight, ChevronLeft, ChevronRight, Home
} from 'lucide-react';
import './PlaylistsPage.css';
import './PlaylistsConvert.css';
import '../components/SocialHubChrome.css';
import { API_URL } from '../config';
import ImportExportModal from '../components/ImportExportModal';
import PlaylistShareModal from '../components/PlaylistShareModal';
import SocialHubChrome from '../components/SocialHubChrome';

const PlaylistsPage = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [view, setView] = useState('discover');
  const [playlists, setPlaylists] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showDifficultyDropdown, setShowDifficultyDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [loading, setLoading] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [sharePlaylist, setSharePlaylist] = useState(null);
  const [aiLoading, setAiLoading] = useState({});
  const [aiResult, setAiResult] = useState(null);
  const [sortBy, setSortBy] = useState('recent');
  const [deletingPlaylistId, setDeletingPlaylistId] = useState(null);
  const [layoutMode, setLayoutMode] = useState('grid');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const searchRef = useRef(null);

  const categories = [
    'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science',
    'History', 'Literature', 'Languages', 'Business', 'Art', 'Music'
  ];

  const difficulties = ['beginner', 'intermediate', 'advanced'];

  const coverColors = [
    '#4A90E2', '#50C878', '#FF6B6B', '#9B59B6', '#F39C12',
    '#E74C3C', '#1ABC9C', '#3498DB', '#E91E63', '#00BCD4'
  ];

  useEffect(() => {
    fetchPlaylists();
  }, [view, filterCategory, filterDifficulty, searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if ((showCategoryDropdown || showDifficultyDropdown) && !event.target.closest('.custom-dropdown')) {
        setShowCategoryDropdown(false);
        setShowDifficultyDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCategoryDropdown, showDifficultyDropdown]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      setShowCategoryDropdown(false);
      setShowDifficultyDropdown(false);
      if (showCreateModal) setShowCreateModal(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showCreateModal]);

  useEffect(() => {
    const handleSearchShortcut = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (event.key === '/' && tagName !== 'input' && tagName !== 'textarea' && tagName !== 'select') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleSearchShortcut);
    return () => document.removeEventListener('keydown', handleSearchShortcut);
  }, []);

  const fetchPlaylists = async () => {
    setLoading(true);
    try {
      let url = `${API_URL}/playlists?`;

      if (view === 'my-playlists') {
        url += 'my_playlists=true&';
      } else if (view === 'following') {
        url += 'following=true&';
      }

      if (filterCategory) url += `category=${filterCategory}&`;
      if (filterDifficulty) url += `difficulty=${filterDifficulty}&`;
      if (searchQuery) url += `search=${encodeURIComponent(searchQuery)}&`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setPlaylists(data.playlists || []);
      }
    } catch (error) { /* silenced */ } finally {
      setLoading(false);
    }
  };

  const handleCreatePlaylist = async (playlistData) => {
    try {
      const response = await fetch(`${API_URL}/playlists`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(playlistData)
      });

      if (response.ok) {
        setShowCreateModal(false);
        fetchPlaylists();
      }
    } catch (error) { /* silenced */ }
  };

  const handlePlaylistClick = (playlistUid, playlistId) => {
    navigate(`/playlists/${playlistUid || playlistId}`);
  };

  const handleFollowToggle = async (playlistId, currentlyFollowing) => {
    try {
      const response = await fetch(`${API_URL}/playlists/${playlistId}/follow`, {
        method: currentlyFollowing ? 'DELETE' : 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setPlaylists(prev => prev.map(playlist => {
          if (playlist.id !== playlistId) return playlist;
          const followerCount = playlist.follower_count || 0;
          return {
            ...playlist,
            is_following: !currentlyFollowing,
            follower_count: currentlyFollowing ? Math.max(0, followerCount - 1) : followerCount + 1
          };
        }));
      }
    } catch (error) { /* silenced */ }
  };

  const handleDeletePlaylist = async (playlist) => {
    if (!playlist?.is_owner || deletingPlaylistId) return;
    const confirmed = window.confirm(`Delete "${playlist.title}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingPlaylistId(playlist.id);
    try {
      const response = await fetch(`${API_URL}/playlists/${playlist.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setPlaylists(prev => prev.filter(item => item.id !== playlist.id));
        if (sharePlaylist?.id === playlist.id) {
          setSharePlaylist(null);
        }
      }
    } catch (error) { /* silenced */ } finally {
      setDeletingPlaylistId(null);
    }
  };

  const handleAiConvert = async (playlist, action) => {
    if (!playlist) return;
    setAiResult(null);
    const key = `${playlist.id}-${action}`;
    setAiLoading(prev => ({ ...prev, [key]: true }));

    try {
      const endpoint = action === 'notes'
        ? `${API_URL}/import_export/playlist_to_notes`
        : `${API_URL}/import_export/playlist_to_flashcards`;

      const payload = action === 'notes'
        ? { playlist_id: playlist.id }
        : { playlist_id: playlist.id, card_count: 15 };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(data.error || data.detail || 'AI conversion failed');
      }

      setAiResult({
        status: 'success',
        type: action,
        playlistTitle: playlist.title,
        noteId: data.note_id,
        setId: data.set_id
      });
    } catch (error) {
      setAiResult({
        status: 'error',
        message: error.message || 'AI conversion failed'
      });
    } finally {
      setAiLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const clearFilters = () => {
    setFilterCategory('');
    setFilterDifficulty('');
    setSearchQuery('');
  };

  const hasActiveFilters = filterCategory || filterDifficulty || searchQuery;

  useEffect(() => {
    if (!aiResult) return;
    const timer = setTimeout(() => setAiResult(null), 6000);
    return () => clearTimeout(timer);
  }, [aiResult]);

  const sortedPlaylists = useMemo(() => {
    const items = [...playlists];
    switch (sortBy) {
      case 'popular':
        return items.sort((a, b) => (b.follower_count || 0) - (a.follower_count || 0));
      case 'items':
        return items.sort((a, b) => (b.item_count || 0) - (a.item_count || 0));
      case 'hours':
        return items.sort((a, b) => (b.estimated_hours || 0) - (a.estimated_hours || 0));
      default:
        return items.sort((a, b) => {
          const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bTime - aTime;
        });
    }
  }, [playlists, sortBy]);

  const libraryStats = useMemo(() => ({
    items: playlists.reduce((sum, playlist) => sum + (playlist.item_count || playlist.items?.length || 0), 0),
    following: playlists.filter(playlist => playlist.is_following).length,
  }), [playlists]);

  const playlistSections = [{
    label: 'Library',
    items: [
      { icon: Globe, label: 'Discover', active: view === 'discover', onClick: () => setView('discover') },
      { icon: Heart, label: 'Following', active: view === 'following', count: libraryStats.following, onClick: () => setView('following') },
      { icon: Library, label: 'My Playlists', active: view === 'my-playlists', onClick: () => setView('my-playlists') },
    ],
  }];

  const playlistSidebarLead = (
    <button className="plx-create-side" type="button" onClick={() => setShowCreateModal(true)}>
      <Plus size={15} />
      <span>New playlist</span>
    </button>
  );

  const playlistSidebarTail = (
    <div className="plx-side-tools">
      <div className="plx-side-tool-heading">
        <span>Refine</span>
        {hasActiveFilters && (
          <button type="button" onClick={clearFilters} aria-label="Clear all playlist filters">
            Clear
          </button>
        )}
      </div>
      <label className="plx-side-select">
        <span>Category</span>
        <select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}>
          <option value="">All categories</option>
          {categories.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label className="plx-side-select">
        <span>Level</span>
        <select value={filterDifficulty} onChange={(event) => setFilterDifficulty(event.target.value)}>
          <option value="">All levels</option>
          {difficulties.map(level => <option key={level} value={level}>{level}</option>)}
        </select>
      </label>
    </div>
  );

  return (
    <div className="playlists-container playlists-page with-social-chrome">
      <SocialHubChrome
        brandKicker="Playlists"
        sideSections={playlistSections}
        sidebarLead={playlistSidebarLead}
        sidebarTail={playlistSidebarTail}
      >
        <div className="plx-workspace">
          <header className="plx-header">
            <div>
              <span className="plx-eyebrow">Learning library</span>
              <h1>Build a path through what matters.</h1>
              <p>Collect resources, order the work, and turn a scattered topic into something you can finish.</p>
            </div>
            <div className="plx-header-actions">
              <button className="plx-secondary-btn" type="button" onClick={() => setShowImportExport(true)}>
                <Sparkles size={15} />
                <span>Convert with AI</span>
              </button>
              <button className="plx-primary-btn" type="button" onClick={() => setShowCreateModal(true)}>
                <Plus size={15} />
                <span>New playlist</span>
              </button>
            </div>

          </header>

          {sortedPlaylists.length > 0 && (
            <section className="plx-topology" aria-label="Library topology">
              <div className="plx-topology-copy">
                <span>Library topology</span>
                <strong>{libraryStats.items} ideas across {sortedPlaylists.length} paths</strong>
                <p>Jump directly into a collection or let Cerbyl pick your next direction.</p>
              </div>
              <div className="plx-topology-map">
                <div className="plx-topology-line" aria-hidden="true" />
                {sortedPlaylists.slice(0, 6).map((playlist, index) => {
                  const itemCount = playlist.item_count || playlist.items?.length || 0;
                  const initials = playlist.title
                    ?.split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map(word => word[0])
                    .join('')
                    .toUpperCase() || 'PL';
                  return (
                    <button
                      key={playlist.id}
                      className="plx-topology-node"
                      style={{
                        '--node-accent': playlist.cover_color || '#D7B38C',
                        '--node-size': `${Math.min(42, 27 + itemCount)}px`,
                        '--node-delay': `${index * 36}ms`,
                      }}
                      type="button"
                      onClick={() => handlePlaylistClick(playlist.uid, playlist.id)}
                      aria-label={`Open ${playlist.title}`}
                    >
                      <span>{initials}</span>
                      <i>{playlist.title}</i>
                    </button>
                  );
                })}
              </div>
              <button
                className="plx-random-path"
                type="button"
                onClick={() => {
                  const playlist = sortedPlaylists[Math.floor(Math.random() * sortedPlaylists.length)];
                  handlePlaylistClick(playlist.uid, playlist.id);
                }}
              >
                <Sparkles size={14} />
                <span>Pick a path</span>
                <ArrowUpRight size={13} />
              </button>
            </section>
          )}

          <section className="plx-control-deck" aria-label="Playlist controls">
            <label className="plx-search">
              <Search size={16} />
              <input
                ref={searchRef}
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search titles, topics, or creators"
              />
              {searchQuery ? (
                <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear playlist search">
                  <X size={14} />
                </button>
              ) : (
                <kbd>/</kbd>
              )}
            </label>

            <label className="plx-sort">
              <Filter size={14} />
              <span className="sr-only">Sort playlists</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="recent">Newest</option>
                <option value="popular">Most followed</option>
                <option value="items">Most items</option>
                <option value="hours">Most hours</option>
              </select>
            </label>

            <div className="plx-layout-switch" role="group" aria-label="Playlist layout">
              <button
                type="button"
                className={layoutMode === 'grid' ? 'active' : ''}
                onClick={() => setLayoutMode('grid')}
                aria-label="Grid view"
                aria-pressed={layoutMode === 'grid'}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                className={layoutMode === 'list' ? 'active' : ''}
                onClick={() => setLayoutMode('list')}
                aria-label="List view"
                aria-pressed={layoutMode === 'list'}
              >
                <List size={16} />
              </button>
            </div>
          </section>

          <div className="plx-result-line">
            <div>
              <strong>{sortedPlaylists.length}</strong>
              <span>{sortedPlaylists.length === 1 ? 'playlist' : 'playlists'} in view</span>
            </div>
            {hasActiveFilters && (
              <div className="plx-active-filters">
                {filterCategory && <button type="button" onClick={() => setFilterCategory('')}>{filterCategory}<X size={11} /></button>}
                {filterDifficulty && <button type="button" onClick={() => setFilterDifficulty('')}>{filterDifficulty}<X size={11} /></button>}
                {searchQuery && <button type="button" onClick={() => setSearchQuery('')}>“{searchQuery}”<X size={11} /></button>}
              </div>
            )}
          </div>

          {aiResult && (
            <div className={`playlists-ai-result-toast ${aiResult.status}`}>
              <div className="playlists-ai-result-text">
                <Sparkles size={14} />
                <span>{aiResult.message || `AI ${aiResult.type === 'notes' ? 'notes' : 'flashcards'} ready for ${aiResult.playlistTitle}`}</span>
              </div>
              {aiResult.status === 'success' && aiResult.type === 'notes' && aiResult.noteId && (
                <button className="playlists-ai-result-action" onClick={() => navigate(`/notes/editor/${aiResult.noteId}`)} type="button">Open notes</button>
              )}
              {aiResult.status === 'success' && aiResult.type === 'flashcards' && (
                <button className="playlists-ai-result-action" onClick={() => navigate('/flashcards')} type="button">Open flashcards</button>
              )}
              <button className="playlists-ai-result-close" onClick={() => setAiResult(null)} type="button" aria-label="Dismiss conversion result"><X size={14} /></button>
            </div>
          )}

          <div className="plx-library">
            {loading ? (
              <div className="plx-state">
                <div className="fc-spinner"><span /><span /><span /></div>
                <p>Loading your library</p>
              </div>
            ) : sortedPlaylists.length === 0 ? (
              <div className="plx-state plx-state--empty">
                <div className="plx-empty-mark"><BookOpen size={24} /></div>
                <span>{hasActiveFilters ? 'Nothing matches yet' : 'Your first path starts here'}</span>
                <h2>{hasActiveFilters ? 'Try a wider search.' : 'Create a playlist worth finishing.'}</h2>
                <p>{hasActiveFilters ? 'Clear one or more filters to bring more collections into view.' : 'Bundle notes, links, videos, and quizzes into one focused sequence.'}</p>
                <button className="plx-primary-btn" type="button" onClick={hasActiveFilters ? clearFilters : () => setShowCreateModal(true)}>
                  {hasActiveFilters ? <X size={15} /> : <Plus size={15} />}
                  <span>{hasActiveFilters ? 'Clear filters' : 'Create playlist'}</span>
                </button>
              </div>
            ) : (
              <div className={`plx-grid plx-grid--${layoutMode}`}>
                {sortedPlaylists.map((playlist, index) => (
                  <PlaylistCard
                    key={playlist.id}
                    index={index}
                    playlist={playlist}
                    onClick={() => handlePlaylistClick(playlist.uid, playlist.id)}
                    onShare={() => setSharePlaylist(playlist)}
                    onGenerateNotes={() => handleAiConvert(playlist, 'notes')}
                    onGenerateFlashcards={() => handleAiConvert(playlist, 'flashcards')}
                    onToggleFollow={() => handleFollowToggle(playlist.id, playlist.is_following)}
                    onDelete={() => handleDeletePlaylist(playlist)}
                    aiLoading={aiLoading}
                    deleting={deletingPlaylistId === playlist.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </SocialHubChrome>

      {showCreateModal && (
        <CreatePlaylistModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreatePlaylist}
          categories={categories}
          difficulties={difficulties}
          coverColors={coverColors}
        />
      )}
      <ImportExportModal
        isOpen={showImportExport}
        onClose={() => setShowImportExport(false)}
        mode="import"
        sourceType="playlist"
        onSuccess={(result) => {
          if (result?.shouldNavigate) {
            const items = result.items || [];
            if (result.destinationType === 'notes') {
              navigate(result.note_id ? `/notes/editor/${result.note_id}` : items.length === 1 && items[0]?.note_id ? `/notes/editor/${items[0].note_id}` : '/notes');
            } else if (result.destinationType === 'flashcards') {
              navigate(result.set_id ? `/flashcards?set_id=${result.set_id}&mode=preview` : items.length === 1 && items[0]?.set_id ? `/flashcards?set_id=${items[0].set_id}&mode=preview` : '/flashcards');
            }
          } else {
            setAiResult({ status: 'success', message: 'AI conversion completed. Check your notes or flashcards.' });
          }
        }}
      />
      {sharePlaylist && (
        <PlaylistShareModal isOpen playlist={sharePlaylist} onClose={() => setSharePlaylist(null)} />
      )}
    </div>
  );

  return (
    <div className="playlists-container playlists-page">
      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
      <svg className="geo-bg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
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
        <rect x="24" y="24" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="0.8"/>
        <rect x="44" y="44" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="60" cy="60" r="3" fill="currentColor"/>
        <rect x="1104" y="704" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="0.8"/>
        <rect x="1124" y="724" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="1140" cy="740" r="3" fill="currentColor"/>
        <circle cx="120" cy="200" r="2" fill="currentColor"/>
        <circle cx="160" cy="160" r="1.5" fill="currentColor"/>
        <circle cx="200" cy="200" r="2" fill="currentColor"/>
        <circle cx="160" cy="240" r="1.5" fill="currentColor"/>
        <circle cx="1080" cy="600" r="2" fill="currentColor"/>
        <circle cx="1040" cy="640" r="1.5" fill="currentColor"/>
        <circle cx="1000" cy="600" r="2" fill="currentColor"/>
        <circle cx="1040" cy="560" r="1.5" fill="currentColor"/>
      </svg>
      <div className={`playlists-body ${sidebarOpen ? '' : 'pl-body--collapsed'}`}>
        <aside className={`playlists-sidebar ${sidebarOpen ? '' : 'pl-sidebar--collapsed'}`}>
          {!sidebarOpen ? (
            <div className="pl-collapsed-strip">
              <button className="pl-strip-btn" data-tip="Open sidebar" aria-label="Open playlists sidebar" onClick={() => setSidebarOpen(true)} type="button">
                <ChevronRight size={18} />
              </button>
              <button className="pl-strip-btn" data-tip="New Playlist" aria-label="New Playlist" onClick={() => setShowCreateModal(true)} type="button">
                <Plus size={18} />
              </button>

              <div className="pl-strip-divider"></div>

              <button
                className={`pl-strip-btn ${view === 'discover' ? 'active' : ''}`}
                data-tip="Discover"
                aria-label="Discover playlists"
                aria-pressed={view === 'discover'}
                onClick={() => setView('discover')}
                type="button"
              >
                <Globe size={18} />
              </button>
              <button
                className={`pl-strip-btn ${view === 'following' ? 'active' : ''}`}
                data-tip="Following"
                aria-label="Following playlists"
                aria-pressed={view === 'following'}
                onClick={() => setView('following')}
                type="button"
              >
                <Heart size={18} />
              </button>
              <button
                className={`pl-strip-btn ${view === 'my-playlists' ? 'active' : ''}`}
                data-tip="My Playlists"
                aria-label="My Playlists"
                aria-pressed={view === 'my-playlists'}
                onClick={() => setView('my-playlists')}
                type="button"
              >
                <Library size={18} />
              </button>

              <div className="pl-strip-spacer"></div>

              <button className="pl-strip-btn" data-tip="Dashboard" aria-label="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} type="button">
                <Home size={18} />
              </button>
            </div>
          ) : (
          <>
          <div className="pl-sidebar-brand">
            <div className="pl-sidebar-logo">cerbyl</div>
            <div className="pl-sidebar-kicker">PLAYLISTS</div>
            <button
              className="pl-sidebar-close-btn"
              onClick={() => setSidebarOpen(false)}
              title="Collapse sidebar"
              aria-label="Collapse playlists sidebar"
              type="button"
            >
              <ChevronLeft size={14} />
            </button>
          </div>

          <button
            className="pl-new-playlist-btn"
            onClick={() => setShowCreateModal(true)}
            type="button"
          >
            <Plus size={16} />
            <span>New Playlist</span>
          </button>

          <div className="sidebar-divider"></div>

          <div className="sidebar-section">
            <h3 className="sidebar-heading">Browse</h3>
            <nav className="sidebar-menu">
                <button
                  className={`menu-item ${view === 'discover' ? 'active' : ''}`}
                  onClick={() => setView('discover')}
                  type="button"
                  aria-pressed={view === 'discover'}
                >
                <Globe size={18} />
                <span>Discover</span>
              </button>

              <button
                className={`menu-item ${view === 'following' ? 'active' : ''}`}
                  onClick={() => setView('following')}
                  type="button"
                  aria-pressed={view === 'following'}
              >
                <Heart size={18} />
                <span>Following</span>
              </button>

              <button
                className={`menu-item ${view === 'my-playlists' ? 'active' : ''}`}
                  onClick={() => setView('my-playlists')}
                  type="button"
                  aria-pressed={view === 'my-playlists'}
              >
                <Library size={18} />
                <span>My Playlists</span>
              </button>
            </nav>
          </div>

          <div className="sidebar-divider"></div>

          <div className="sidebar-section">
            <div className="filter-item">
              <div className="filter-header">
                <label>Category</label>
                {hasActiveFilters && (
                  <button className="clear-btn-inline" onClick={clearFilters} type="button" aria-label="Clear playlist filters">
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="custom-dropdown">
                <button
                  className="dropdown-trigger"
                  onClick={() => {
                    setShowDifficultyDropdown(false);
                    setShowCategoryDropdown(!showCategoryDropdown);
                  }}
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={showCategoryDropdown}
                >
                  <span>{filterCategory || 'All Categories'}</span>
                  <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                    <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
                {showCategoryDropdown && (
                  <div className="dropdown-menu" role="listbox" aria-label="Playlist category" style={{ display: 'block', position: 'absolute' }}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={!filterCategory}
                      className={`dropdown-item ${!filterCategory ? 'active' : ''}`}
                      onClick={() => {
                        setFilterCategory('');
                        setShowCategoryDropdown(false);
                      }}
                    >
                      All Categories
                    </button>
                    {categories.map(cat => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={filterCategory === cat}
                        key={cat}
                        className={`dropdown-item ${filterCategory === cat ? 'active' : ''}`}
                        onClick={() => {
                          setFilterCategory(cat);
                          setShowCategoryDropdown(false);
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="filter-item">
              <div className="filter-header">
                <label>Difficulty</label>
              </div>
              <div className="custom-dropdown">
                <button
                  className="dropdown-trigger"
                  onClick={() => {
                    setShowCategoryDropdown(false);
                    setShowDifficultyDropdown(!showDifficultyDropdown);
                  }}
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={showDifficultyDropdown}
                >
                  <span>{filterDifficulty || 'All Levels'}</span>
                  <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
                    <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </button>
                {showDifficultyDropdown && (
                  <div className="dropdown-menu" role="listbox" aria-label="Playlist difficulty" style={{ display: 'block', position: 'absolute' }}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={!filterDifficulty}
                      className={`dropdown-item ${!filterDifficulty ? 'active' : ''}`}
                      onClick={() => {
                        setFilterDifficulty('');
                        setShowDifficultyDropdown(false);
                      }}
                    >
                      All Levels
                    </button>
                    {difficulties.map(level => (
                      <button
                        type="button"
                        role="option"
                        aria-selected={filterDifficulty === level}
                        key={level}
                        className={`dropdown-item ${filterDifficulty === level ? 'active' : ''}`}
                        onClick={() => {
                          setFilterDifficulty(level);
                          setShowDifficultyDropdown(false);
                        }}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="sidebar-stats">
            <div className="stat-box">
              <div className="stat-value">{playlists.length}</div>
              <div className="stat-label">Total Playlists</div>
            </div>
          </div>

          <div className="pl-sidebar-actions">
            <button className="pl-sidebar-action" onClick={() => navigate('/dashboard-cerbyl')} type="button">
              <Home size={16} />
              <span>Dashboard</span>
            </button>
          </div>
          </>
          )}
        </aside>

        <main className="playlists-main">
          <div className="content-body">
            <div className="view-heading">
              <span className="view-kicker">Your Library</span>
              <h2 className="view-title">Playlists</h2>
              <p className="view-sub">Curated collections of learning content</p>
            </div>
            <div className="playlists-toolbar">
              <div className="playlists-toolbar-left">
                <div className="playlists-search-field">
                  <Search size={16} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search playlists, topics, creators..."
                  />
                  {searchQuery && (
                    <button className="playlists-clear-search-btn" onClick={() => setSearchQuery('')} type="button" aria-label="Clear playlist search">
                      <X size={14} />
                    </button>
                  )}
                </div>
                <div className="playlists-toolbar-count">
                  <span>{sortedPlaylists.length} playlists</span>
                  {hasActiveFilters && <span className="playlists-toolbar-filtered">Filtered</span>}
                </div>
              </div>
              <div className="playlists-toolbar-right">
                <div className="playlists-sort-select">
                  <Filter size={14} />
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                    <option value="recent">Newest</option>
                    <option value="popular">Most Followed</option>
                    <option value="items">Most Items</option>
                    <option value="hours">Most Hours</option>
                  </select>
                </div>
                <button className="playlists-ai-hub-btn" onClick={() => setShowImportExport(true)} type="button">
                  <Sparkles size={14} />
                  <span>AI Convert</span>
                </button>
              </div>
            </div>

            {aiResult && (
              <div className={`playlists-ai-result-toast ${aiResult.status}`}>
                <div className="playlists-ai-result-text">
                  {aiResult.status === 'success' ? (
                    aiResult.message ? (
                      <span>{aiResult.message}</span>
                    ) : (
                      <>
                        <span>AI {aiResult.type === 'notes' ? 'notes' : 'flashcards'} ready for</span>
                        <strong>{aiResult.playlistTitle}</strong>
                      </>
                    )
                  ) : (
                    <span>{aiResult.message}</span>
                  )}
                </div>
                {aiResult.status === 'success' && aiResult.type === 'notes' && aiResult.noteId && (
                  <button className="playlists-ai-result-action" onClick={() => navigate(`/notes/editor/${aiResult.noteId}`)} type="button">
                    Open Notes
                  </button>
                )}
                {aiResult.status === 'success' && aiResult.type === 'flashcards' && (
                  <button className="playlists-ai-result-action" onClick={() => navigate('/flashcards')} type="button">
                    Open Flashcards
                  </button>
                )}
                <button className="playlists-ai-result-close" onClick={() => setAiResult(null)} type="button" aria-label="Dismiss conversion result">
                  <X size={14} />
                </button>
              </div>
            )}

            {loading ? (
              <div className="loading-container">
                <div className="fc-spinner">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
                <p>LOADING PLAYLISTS...</p>
              </div>
            ) : playlists.length === 0 ? (
              <div className="empty-container">
                <BookOpen size={56} />
                <h3>NO PLAYLISTS FOUND</h3>
                <p>
                  {view === 'my-playlists'
                    ? 'CREATE YOUR FIRST PLAYLIST TO GET STARTED'
                    : 'TRY ADJUSTING YOUR FILTERS OR SEARCH'}
                </p>
              </div>
            ) : (
              <div className="playlists-grid">
                {sortedPlaylists.map((playlist, index) => (
                  <PlaylistCard
                    key={playlist.id}
                    index={index}
                    playlist={playlist}
                    onClick={() => handlePlaylistClick(playlist.uid, playlist.id)}
                    onShare={() => setSharePlaylist(playlist)}
                    onGenerateNotes={() => handleAiConvert(playlist, 'notes')}
                    onGenerateFlashcards={() => handleAiConvert(playlist, 'flashcards')}
                    onToggleFollow={() => handleFollowToggle(playlist.id, playlist.is_following)}
                    onDelete={() => handleDeletePlaylist(playlist)}
                    aiLoading={aiLoading}
                    deleting={deletingPlaylistId === playlist.id}
                  />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {showCreateModal && (
        <CreatePlaylistModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreatePlaylist}
          categories={categories}
          difficulties={difficulties}
          coverColors={coverColors}
        />
      )}

      <ImportExportModal
        isOpen={showImportExport}
        onClose={() => setShowImportExport(false)}
        mode="import"
        sourceType="playlist"
        onSuccess={(result) => {
          if (result?.shouldNavigate) {
            const items = result.items || [];
            if (result.destinationType === 'notes') {
              if (result.note_id) {
                navigate(`/notes/editor/${result.note_id}`);
              } else if (items.length === 1 && items[0]?.note_id) {
                navigate(`/notes/editor/${items[0].note_id}`);
              } else {
                navigate('/notes');
              }
            } else if (result.destinationType === 'flashcards') {
              if (result.set_id) {
                navigate(`/flashcards?set_id=${result.set_id}&mode=preview`);
              } else if (items.length === 1 && items[0]?.set_id) {
                navigate(`/flashcards?set_id=${items[0].set_id}&mode=preview`);
              } else {
                navigate('/flashcards');
              }
            }
          } else {
            setAiResult({
              status: 'success',
              message: 'AI conversion completed. Check your notes or flashcards.'
            });
          }
        }}
      />

      {sharePlaylist && (
        <PlaylistShareModal
          isOpen={!!sharePlaylist}
          playlist={sharePlaylist}
          onClose={() => setSharePlaylist(null)}
        />
      )}
    </div>
  );
};

export default PlaylistsPage;

const PlaylistCard = ({
  index,
  playlist,
  onClick,
  onShare,
  onGenerateNotes,
  onGenerateFlashcards,
  onToggleFollow,
  onDelete,
  aiLoading,
  deleting
}) => {
  const itemCount = playlist.item_count || playlist.items?.length || 0;
  const hasItems = itemCount > 0;
  const notesLoading = aiLoading?.[`${playlist.id}-notes`];
  const flashcardsLoading = aiLoading?.[`${playlist.id}-flashcards`];
  const cardIndex = String(index + 1).padStart(2, '0');
  const coverMark = playlist.title
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase() || 'PL';

  const handlePointerMove = (event) => {
    if (event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    event.currentTarget.style.setProperty('--pl-mx', `${x}px`);
    event.currentTarget.style.setProperty('--pl-my', `${y}px`);
    event.currentTarget.style.setProperty('--pl-rx', `${(((y / rect.height) - 0.5) * -1.4).toFixed(2)}deg`);
    event.currentTarget.style.setProperty('--pl-ry', `${(((x / rect.width) - 0.5) * 1.4).toFixed(2)}deg`);
  };

  const handlePointerLeave = (event) => {
    event.currentTarget.style.removeProperty('--pl-mx');
    event.currentTarget.style.removeProperty('--pl-my');
    event.currentTarget.style.removeProperty('--pl-rx');
    event.currentTarget.style.removeProperty('--pl-ry');
  };

  const handleCardKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  const progress = Math.round(playlist.user_progress?.progress_percentage || 0);
  const stackSize = Math.max(1, Math.min(itemCount, 5));
  const creatorName = playlist.creator?.first_name || playlist.creator?.username || 'Cerbyl learner';

  return (
    <article
      className="plx-card"
      style={{ '--plx-card-accent': playlist.cover_color || '#D7B38C' }}
      onClick={onClick}
      onKeyDown={handleCardKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Open playlist ${playlist.title}`}
    >
      <div className="plx-card-index" aria-hidden="true">{cardIndex}</div>
      <div className="plx-card-top">
        <div className="plx-stack-visual" aria-hidden="true">
          {Array.from({ length: stackSize }).map((_, stackIndex) => (
            <span key={stackIndex} style={{ '--stack-index': stackIndex }} />
          ))}
          <strong>{coverMark}</strong>
        </div>

        <div className="plx-card-main">
          <div className="plx-card-badges">
            <span>{playlist.category || 'General'}</span>
            {playlist.difficulty_level && <span>{playlist.difficulty_level}</span>}
            {!playlist.is_public && <span><Lock size={10} /> Private</span>}
          </div>
          <h2>{playlist.title}</h2>
          <p>{playlist.description || 'A focused learning path ready for notes, links, videos, and practice.'}</p>
        </div>

        <ArrowUpRight className="plx-open-cue" size={17} aria-hidden="true" />
      </div>

      <div className="plx-card-data">
        <div><BookOpen size={13} /><strong>{itemCount}</strong><span>items</span></div>
        <div><Users size={13} /><strong>{playlist.follower_count || 0}</strong><span>following</span></div>
        <div><Clock size={13} /><strong>{playlist.estimated_hours || 0}</strong><span>hours</span></div>
      </div>

      {playlist.user_progress && (
        <div className="plx-progress">
          <div><span>Progress</span><strong>{progress}%</strong></div>
          <div className="plx-progress-track"><span style={{ width: `${progress}%` }} /></div>
        </div>
      )}

      <footer className="plx-card-footer">
        <div className="plx-creator">
          {playlist.creator?.picture_url ? (
            <img src={playlist.creator.picture_url} alt="" />
          ) : (
            <span>{creatorName[0]?.toUpperCase()}</span>
          )}
          <div><small>Curated by</small><strong>{creatorName}</strong></div>
        </div>

        <div className="plx-card-controls" aria-label={`Actions for ${playlist.title}`}>
          {hasItems && (
            <>
              <button
                type="button"
                title="Generate notes"
                aria-label={`Generate notes from ${playlist.title}`}
                disabled={notesLoading}
                onClick={(event) => { event.stopPropagation(); onGenerateNotes(); }}
              >
                {notesLoading ? <span className="lp-btn-spinner" /> : <FileText size={14} />}
              </button>
              <button
                type="button"
                title="Generate flashcards"
                aria-label={`Generate flashcards from ${playlist.title}`}
                disabled={flashcardsLoading}
                onClick={(event) => { event.stopPropagation(); onGenerateFlashcards(); }}
              >
                {flashcardsLoading ? <span className="lp-btn-spinner" /> : <Zap size={14} />}
              </button>
            </>
          )}
          {!playlist.is_owner && (
            <button
              type="button"
              className={playlist.is_following ? 'active' : ''}
              title={playlist.is_following ? 'Unfollow' : 'Follow'}
              aria-label={playlist.is_following ? `Unfollow ${playlist.title}` : `Follow ${playlist.title}`}
              onClick={(event) => { event.stopPropagation(); onToggleFollow(); }}
            >
              {playlist.is_following ? <Check size={14} /> : <Heart size={14} />}
            </button>
          )}
          <button
            type="button"
            title="Share"
            aria-label={`Share ${playlist.title}`}
            onClick={(event) => { event.stopPropagation(); onShare(); }}
          >
            <Share2 size={14} />
          </button>
          {playlist.is_owner && (
            <button
              type="button"
              className="danger"
              title="Delete"
              aria-label={`Delete ${playlist.title}`}
              disabled={deleting}
              onClick={(event) => { event.stopPropagation(); onDelete(); }}
            >
              {deleting ? <span className="lp-btn-spinner danger" /> : <Trash2 size={14} />}
            </button>
          )}
        </div>
      </footer>
    </article>
  );

  return (
    <div
      className="playlist-card"
      onClick={onClick}
      onKeyDown={handleCardKeyDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      role="button"
      tabIndex={0}
      aria-label={`Open playlist ${playlist.title}`}
    >
      <div className="cb-tile-texture" aria-hidden="true" />
      <div
        className="card-cover"
        style={{
          '--playlist-cover': playlist.cover_color || '#D7B38C',
          background: `linear-gradient(135deg, color-mix(in srgb, ${playlist.cover_color || '#D7B38C'} 88%, white) 0%, ${playlist.cover_color || '#D7B38C'} 58%, color-mix(in srgb, ${playlist.cover_color || '#D7B38C'} 72%, black) 100%)`
        }}
      >
        <div className="playlist-cover-meta" aria-hidden="true">
          <span>Cerbyl playlist</span>
          <span>{cardIndex}</span>
        </div>
        <div className="cover-overlay">
          <span className="playlist-cover-mark">{coverMark}</span>
        </div>
        <div className="playlist-cover-rule" aria-hidden="true" />
        <div className="playlist-cover-count" aria-hidden="true">
          <strong>{itemCount}</strong>
          <span>{itemCount === 1 ? 'item' : 'items'}</span>
        </div>
        {!playlist.is_public && (
          <div className="privacy-badge">
            <Lock size={12} />
          </div>
        )}
      </div>

      <div className="card-content">
        <h3 className="card-title">{playlist.title}</h3>
        <p className="card-description">{playlist.description}</p>

        {(playlist.category || playlist.difficulty_level) && (
          <div className="card-tags">
            {playlist.category && (
              <span className="tag category-tag">{playlist.category}</span>
            )}
            {playlist.difficulty_level && (
              <span className="tag difficulty-tag">{playlist.difficulty_level}</span>
            )}
          </div>
        )}

        <div className="card-stats">
          <div className="stat">
            <BookOpen size={14} />
            <span>{itemCount}</span>
          </div>
          <div className="stat">
            <Users size={14} />
            <span>{playlist.follower_count || 0}</span>
          </div>
          {playlist.estimated_hours > 0 && (
            <div className="stat">
              <Clock size={14} />
              <span>{playlist.estimated_hours}h</span>
            </div>
          )}
        </div>

        {playlist.user_progress && (
          <div className="playlists-card-progress">
            <div className="playlists-progress-meta">
              <span>Progress</span>
              <strong>{Math.round(playlist.user_progress.progress_percentage || 0)}%</strong>
            </div>
            <div className="playlists-card-progress-track">
              <div
                className="playlists-card-progress-fill"
                style={{ width: `${playlist.user_progress.progress_percentage || 0}%` }}
              />
            </div>
          </div>
        )}

        <div className="playlists-card-actions">
          <div className="playlists-card-actions-left">
            <div className="creator">
              {playlist.creator.picture_url ? (
                <img src={playlist.creator.picture_url} alt="" />
              ) : (
                <div className="creator-avatar">
                  {(playlist.creator.first_name?.[0] || playlist.creator.username[0]).toUpperCase()}
                </div>
              )}
              <span className="creator-name">
                {playlist.creator.first_name || playlist.creator.username}
              </span>
            </div>
          </div>
          <div className="playlists-card-actions-right">
            {!playlist.is_owner && (
              <button
                className={`playlists-icon-action-btn ${playlist.is_following ? 'following' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFollow();
                }}
                title={playlist.is_following ? 'Unfollow' : 'Follow'}
                aria-label={playlist.is_following ? `Unfollow ${playlist.title}` : `Follow ${playlist.title}`}
                type="button"
              >
                {playlist.is_following ? <Check size={14} /> : <Heart size={14} />}
              </button>
            )}
            <button
              className="playlists-icon-action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onShare();
              }}
              title="Share playlist"
              aria-label={`Share ${playlist.title}`}
              type="button"
            >
              <Share2 size={14} />
            </button>
            {playlist.is_owner && (
              <button
                className="playlists-icon-action-btn danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                disabled={deleting}
                title={deleting ? 'Deleting playlist' : 'Delete playlist'}
                aria-label={deleting ? `Deleting ${playlist.title}` : `Delete ${playlist.title}`}
                type="button"
              >
                {deleting ? <span className="lp-btn-spinner danger" /> : <Trash2 size={14} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const CreatePlaylistModal = ({ onClose, onCreate, categories, difficulties, coverColors }) => {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    difficulty_level: 'intermediate',
    estimated_hours: '',
    is_public: true,
    is_collaborative: false,
    cover_color: '#D7B38C',
    tags: [],
    items: []
  });

  const [tagInput, setTagInput] = useState('');
  const [isPickingColor, setIsPickingColor] = useState(false);
  const [hue, setHue] = useState(30);
  const [saturation, setSaturation] = useState(50);
  const [brightness, setBrightness] = useState(70);

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreate(formData);
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const removeTag = (tag) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };


  const hslToHex = (h, s, l) => {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = n => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };


  const updateColor = (newHue, newSat, newBright) => {
    const hexColor = hslToHex(newHue, newSat, newBright);
    setFormData(prev => ({ ...prev, cover_color: hexColor }));
  };

  const handleHueChange = (e) => {
    const newHue = parseInt(e.target.value);
    setHue(newHue);
    updateColor(newHue, saturation, brightness);
  };

  const handleSaturationChange = (e) => {
    const newSat = parseInt(e.target.value);
    setSaturation(newSat);
    updateColor(hue, newSat, brightness);
  };

  const handleBrightnessChange = (e) => {
    const newBright = parseInt(e.target.value);
    setBrightness(newBright);
    updateColor(hue, saturation, newBright);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-playlist-title"
      >
        <div className="modal-header">
          <h2 id="create-playlist-title">Create Playlist</h2>
          <button className="close-btn" onClick={onClose} type="button" aria-label="Close create playlist dialog">×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-field">
            <label>Title</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter playlist title"
              required
            />
          </div>

          <div className="form-field">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="What's this playlist about?"
              rows={3}
            />
          </div>

          <div className="form-field">
            <label>Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
            >
              <option value="">Select category</option>
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Cover Color</label>
            <div className="color-picker-container">
              <button
                type="button"
                className="color-preview"
                style={{ backgroundColor: formData.cover_color }}
                onClick={() => setIsPickingColor(!isPickingColor)}
                aria-expanded={isPickingColor}
                aria-label={`Choose cover color, current color ${formData.cover_color}`}
              >
                <span className="color-hex">{formData.cover_color}</span>
              </button>
              {isPickingColor && (
                <div className="gradient-picker-sliders">
                  <div className="slider-group">
                    <label className="slider-label">HUE</label>
                    <div className="slider-container hue-slider">
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={hue}
                        onChange={handleHueChange}
                        className="color-slider"
                      />
                      <div className="slider-track hue-track"></div>
                    </div>
                  </div>
                  <div className="slider-group">
                    <label className="slider-label">SATURATION</label>
                    <div className="slider-container sat-slider">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={saturation}
                        onChange={handleSaturationChange}
                        className="color-slider"
                      />
                      <div
                        className="slider-track sat-track"
                        style={{
                          background: `linear-gradient(to right,
                            hsl(${hue}, 0%, ${brightness}%),
                            hsl(${hue}, 100%, ${brightness}%))`
                        }}
                      ></div>
                    </div>
                  </div>
                  <div className="slider-group">
                    <label className="slider-label">BRIGHTNESS</label>
                    <div className="slider-container bright-slider">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={brightness}
                        onChange={handleBrightnessChange}
                        className="color-slider"
                      />
                      <div
                        className="slider-track bright-track"
                        style={{
                          background: `linear-gradient(to right,
                            hsl(${hue}, ${saturation}%, 0%),
                            hsl(${hue}, ${saturation}%, 50%),
                            hsl(${hue}, ${saturation}%, 100%))`
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="form-field">
            <label>Tags</label>
            <div className="tag-input-row">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Add tags..."
              />
              <button type="button" onClick={addTag} className="add-btn">
                <Plus size={16} />
              </button>
            </div>
            {formData.tags.length > 0 && (
              <div className="tags-display">
                {formData.tags.map(tag => (
                  <span key={tag} className="tag-item">
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="form-checkboxes">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.is_public}
                onChange={(e) => setFormData(prev => ({ ...prev, is_public: e.target.checked }))}
              />
              <span>Make playlist public</span>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.is_collaborative}
                onChange={(e) => setFormData(prev => ({ ...prev, is_collaborative: e.target.checked }))}
              />
              <span>Allow collaborators</span>
            </label>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Create Playlist
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
