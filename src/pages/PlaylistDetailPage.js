import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Check, Users, Clock, BookOpen, X,
  FileText, MessageSquare, ExternalLink, Youtube, FileUp, Link as LinkIcon,
  ChevronDown, ChevronUp, ChevronRight, Share2, Heart, Lock, Globe, GraduationCap,
  CheckCircle, Sparkles, Zap, GitFork, Search, ArrowLeft, ArrowUpRight, ListChecks, Circle, Layers3
} from 'lucide-react';
import './PlaylistDetailPage.css';
import '../components/SocialHubChrome.css';
import { API_URL } from '../config';
import MathRenderer from '../components/MathRenderer';
import { renderMarkdownWithMath } from '../utils/mathMarkdown';
import PlaylistShareModal from '../components/PlaylistShareModal';
import SocialHubChrome from '../components/SocialHubChrome';
import useDialogA11y from '../hooks/useDialogA11y';

const renderPlaylistMarkdown = (value = '') => renderMarkdownWithMath(value, {});

const PlaylistDetailPage = () => {
  const { playlistId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingItem, setViewingItem] = useState(null);
  const [itemContent, setItemContent] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [aiLoading, setAiLoading] = useState({ notes: false, flashcards: false });
  const [aiResult, setAiResult] = useState(null);
  const [itemFilter, setItemFilter] = useState('all');
  const [itemSearch, setItemSearch] = useState('');
  const [itemStatus, setItemStatus] = useState('all');
  const [showOnlyRequired, setShowOnlyRequired] = useState(false);
  const [updatingItem, setUpdatingItem] = useState(null);
  const [forkLoading, setForkLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    fetchPlaylistDetails();
  }, [playlistId]);

  useEffect(() => {
    setItemFilter('all');
    setItemSearch('');
    setItemStatus('all');
    setShowOnlyRequired(false);
    setAiResult(null);
    setShowShareModal(false);
  }, [playlistId]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      setShowViewModal(false);
      setViewingItem(null);
      setItemContent(null);
      setShowAddItemModal(false);
      setShowShareModal(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const fetchPlaylistDetails = async () => {
    setLoading(true);
    setPageError('');
    try {
      const response = await fetch(`${API_URL}/playlists/${playlistId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not load this playlist');
      setPlaylist(data);
      setIsFollowing(data.is_following || false);
    } catch (error) {
      setPageError(error.message || 'Could not load this playlist');
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async () => {
    setActionError('');
    setFollowLoading(true);
    try {
      const method = isFollowing ? 'DELETE' : 'POST';
      const response = await fetch(`${API_URL}/playlists/${playlistId}/follow`, {
        method: method,
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setIsFollowing(!isFollowing);
        setPlaylist(prev => ({
          ...prev,
          follower_count: isFollowing
            ? Math.max(0, (prev.follower_count || 0) - 1)
            : (prev.follower_count || 0) + 1
        }));
      } else {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Could not update the follow state');
      }
    } catch (error) {
      setActionError(`${error.message || 'Could not update the follow state'}. Try again.`);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleForkPlaylist = async () => {
    if (forkLoading) return;
    setForkLoading(true);
    try {
      const response = await fetch(`${API_URL}/playlists/${playlistId}/fork`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.id) {
        navigate(`/playlists/${data.uid || data.id}`);
      } else {
        throw new Error(data.detail || 'Could not fork this playlist');
      }
    } catch (error) {
      setActionError(`${error.message || 'Could not fork this playlist'}. Try again.`);
    } finally {
      setForkLoading(false);
    }
  };

  const handleGenerateNotes = async () => {
    if (aiLoading.notes) return;
    setAiResult(null);
    setAiLoading(prev => ({ ...prev, notes: true }));
    try {
      const response = await fetch(`${API_URL}/import_export/playlist_to_notes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ playlist_id: playlist?.id || playlistId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.error || data.detail || 'Failed to generate notes');
      }
      setAiResult({
        status: 'success',
        type: 'notes',
        noteId: data.note_id
      });
    } catch (error) {
      setAiResult({
        status: 'error',
        message: error.message || 'Failed to generate notes'
      });
    } finally {
      setAiLoading(prev => ({ ...prev, notes: false }));
    }
  };

  const handleGenerateFlashcards = async () => {
    if (aiLoading.flashcards) return;
    setAiResult(null);
    setAiLoading(prev => ({ ...prev, flashcards: true }));
    try {
      const response = await fetch(`${API_URL}/import_export/playlist_to_flashcards`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ playlist_id: playlist?.id || playlistId, card_count: 15 })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        throw new Error(data.error || data.detail || 'Failed to generate flashcards');
      }
      setAiResult({
        status: 'success',
        type: 'flashcards'
      });
    } catch (error) {
      setAiResult({
        status: 'error',
        message: error.message || 'Failed to generate flashcards'
      });
    } finally {
      setAiLoading(prev => ({ ...prev, flashcards: false }));
    }
  };

  const handleAskAI = () => {
    if (!playlist) return;
    const itemList = (playlist.items || [])
      .slice(0, 6)
      .map((item, idx) => `${idx + 1}. ${item.title || 'Untitled'} (${item.item_type || 'item'})`)
      .join('\n');

    const message = `I want to study this playlist:

${playlist.title}
${playlist.description || ''}

Category: ${playlist.category || 'Uncategorized'}
Difficulty: ${playlist.difficulty_level || 'All levels'}
Estimated time: ${playlist.estimated_hours || totalHours || 0} hours

Items:
${itemList}

Help me summarize the key concepts, recommend an order, and suggest a study plan.`;

    navigate('/ai-chat', { state: { initialMessage: message } });
  };

  const handleToggleCompletion = async (itemId, completed) => {
    if (updatingItem) return;
    setUpdatingItem(itemId);
    try {
      const response = await fetch(
        `${API_URL}/playlists/${playlistId}/progress?item_id=${itemId}&completed=${completed}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setPlaylist(prev => ({
          ...prev,
          user_progress: {
            ...(prev.user_progress || {}),
            completed_items: data.completed_items || [],
            progress_percentage: data.progress_percentage || 0
          }
        }));
      } else {
        throw new Error(data.detail || 'Could not update progress');
      }
    } catch (error) {
      setActionError(`${error.message || 'Could not update progress'}. Try again.`);
    } finally {
      setUpdatingItem(null);
    }
  };

  const handleAddItem = async (itemData) => {
    const response = await fetch(`${API_URL}/playlists/${playlistId}/items`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(itemData)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = Array.isArray(data.detail) ? data.detail[0]?.msg : data.detail;
      throw new Error(detail || data.error || 'Could not add this item');
    }
    await fetchPlaylistDetails();
    return data;
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Delete this item?')) return;

    try {
      const response = await fetch(`${API_URL}/playlists/${playlistId}/items/${itemId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        fetchPlaylistDetails();
      }
    } catch (error) { /* silenced */ }
  };

  const handleDeletePlaylist = async () => {
    if (!playlist?.is_owner || deleteLoading) return;
    const confirmed = window.confirm(`Delete "${playlist.title}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeleteLoading(true);
    try {
      const response = await fetch(`${API_URL}/playlists/${playlistId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        navigate('/playlists');
      }
    } catch (error) { /* silenced */ } finally {
      setDeleteLoading(false);
    }
  };

  const toggleItem = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  const handleOpenItem = async (item) => {
    if (item.item_type === 'flashcard') {
      if (item.item_id) {
        navigate(`/flashcards?set_id=${item.item_id}&mode=preview`);
      }
      return;
    }

    if (item.item_type === 'note' || item.item_type === 'chat') {
      if (item.item_id) {
        try {
          const response = await fetch(
            `${API_URL}/playlists/${playlistId}/items/${item.id}/view`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );

          if (response.ok) {
            const data = await response.json();
            setItemContent(data);
            setViewingItem(item);
            setShowViewModal(true);
          }
        } catch (error) { /* silenced */ }
      }
    } else if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
  };

  const getItemIcon = (type) => {
    const icons = {
      note: FileText,
      chat: MessageSquare,
      external_link: ExternalLink,
      youtube: Youtube,
      pdf: FileUp,
      course: GraduationCap,
      video: BookOpen,
      article: BookOpen,
      quiz: BookOpen,
      flashcard: BookOpen
    };
    return icons[type] || BookOpen;
  };

  useEffect(() => {
    if (!aiResult) return;
    const timer = setTimeout(() => setAiResult(null), 6000);
    return () => clearTimeout(timer);
  }, [aiResult]);

  if (loading) {
    return (
      <div className="detail-loading playlist-detail-page">
        <div className="shc-topbar">
          <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
          <div className="shc-topbar-right">
            <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
          </div>
        </div>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className="detail-error playlist-detail-page">
        <div className="shc-topbar">
          <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
          <div className="shc-topbar-right">
            <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
          </div>
        </div>
        <h2 role={pageError ? 'alert' : undefined}>{pageError || 'Playlist not found'}</h2>
        {pageError && <button type="button" onClick={fetchPlaylistDetails} className="error-back-btn">Try again</button>}
        <button onClick={() => navigate('/playlists')} className="error-back-btn">
          <span>Back to Playlists</span>
          <ChevronRight size={18} />
        </button>
      </div>
    );
  }

  const completedItems = playlist.user_progress?.completed_items || [];
  const allItems = playlist.items || [];
  const progressPercentage = allItems.length > 0
    ? (completedItems.length / allItems.length) * 100
    : 0;
  const itemTypes = Array.from(new Set(allItems.map(item => item.item_type))).filter(Boolean);
  const filteredItems = allItems.filter(item => {
    const typeMatch = itemFilter === 'all' || item.item_type === itemFilter;
    const requiredMatch = !showOnlyRequired || item.is_required;
    const searchMatch = !itemSearch || `${item.title || ''} ${item.description || ''} ${item.notes || ''}`
      .toLowerCase()
      .includes(itemSearch.toLowerCase());
    const isCompleted = completedItems.includes(item.id);
    const statusMatch = itemStatus === 'all'
      || (itemStatus === 'complete' && isCompleted)
      || (itemStatus === 'todo' && !isCompleted);
    return typeMatch && requiredMatch && searchMatch && statusMatch;
  });
  const requiredCount = allItems.filter(item => item.is_required).length;
  const optionalCount = allItems.length - requiredCount;
  const totalMinutes = allItems.reduce((sum, item) => sum + (item.duration_minutes || 0), 0);
  const totalHours = totalMinutes ? Math.round((totalMinutes / 60) * 10) / 10 : playlist.estimated_hours || 0;
  const coverMark = playlist.title
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase() || 'PL';

  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const detailSections = [{
    label: 'Playlist',
    items: [
      { icon: Layers3, label: 'Overview', active: true, onClick: () => scrollToSection('playlist-overview') },
      { icon: ListChecks, label: 'Items', count: allItems.length, onClick: () => scrollToSection('playlist-items') },
      { icon: CheckCircle, label: 'Completed', count: completedItems.length, onClick: () => { setItemStatus('complete'); scrollToSection('playlist-items'); } },
    ],
  }];
  const sidebarLead = (
    <button className="pdx-back-side" type="button" onClick={() => navigate('/playlists')}>
      <ArrowLeft size={15} />
      <span>Back to library</span>
    </button>
  );
  const sidebarTail = (
    <div className="pdx-side-summary">
      <div className="pdx-side-numbers">
        <div><strong>{allItems.length}</strong><span>items</span></div>
        <div><strong>{requiredCount}</strong><span>required</span></div>
        <div><strong>{totalHours}</strong><span>hours</span></div>
      </div>
      {playlist.is_owner && (
        <button className="pdx-side-add" type="button" onClick={() => setShowAddItemModal(true)}>
          <Plus size={14} /> Add an item
        </button>
      )}
    </div>
  );
  const creatorName = playlist.creator?.first_name || playlist.creator?.username || 'Cerbyl learner';
  const filtersActive = itemFilter !== 'all' || itemStatus !== 'all' || showOnlyRequired || itemSearch;
  const nextItem = allItems.find(item => !completedItems.includes(item.id)) || allItems[0];
  const clearItemFilters = () => {
    setItemFilter('all');
    setItemStatus('all');
    setShowOnlyRequired(false);
    setItemSearch('');
  };

  return (
    <div className="playlist-detail-container playlist-detail-page with-social-chrome">
      <SocialHubChrome
        brandKicker="Playlists"
        sideSections={detailSections}
        sidebarLead={sidebarLead}
        sidebarTail={sidebarTail}
        topbarAction={{ label: 'Library', path: '/playlists' }}
      >
        <div className="pdx-workspace">
          <section id="playlist-overview" className="pdx-overview">
            <div className="pdx-identity">
              <div
                className="pdx-mark"
                style={{ '--pdx-accent': playlist.cover_color || '#D7B38C' }}
                aria-hidden="true"
              >
                <span>{coverMark}</span>
                <i /><i /><i />
              </div>
              <div className="pdx-heading">
                <div className="pdx-badges">
                  <span>{playlist.is_public ? <Globe size={10} /> : <Lock size={10} />}{playlist.is_public ? 'Public' : 'Private'}</span>
                  {playlist.category && <span>{playlist.category}</span>}
                  {playlist.difficulty_level && <span>{playlist.difficulty_level}</span>}
                </div>
                <h1>{playlist.title}</h1>
                <p>{playlist.description || 'A focused sequence of resources, practice, and notes.'}</p>
                <div className="pdx-byline">
                  {playlist.creator?.picture_url ? <img src={playlist.creator.picture_url} alt="" /> : <span>{creatorName[0]?.toUpperCase()}</span>}
                  <strong>{creatorName}</strong>
                  <i />
                  <span><BookOpen size={12} /> {allItems.length} items</span>
                  <span><Users size={12} /> {playlist.follower_count || 0}</span>
                  {totalHours > 0 && <span><Clock size={12} /> {totalHours}h</span>}
                </div>
              </div>

            </div>

            <div className="pdx-action-bar" aria-label="Playlist actions">
              <div className="pdx-primary-actions">
                {playlist.is_owner ? (
                  <button className="pdx-action pdx-action--primary" type="button" onClick={() => setShowAddItemModal(true)}>
                    <Plus size={14} /> Add item
                  </button>
                ) : (
                  <button
                    className={`pdx-action ${isFollowing ? 'pdx-action--active' : 'pdx-action--primary'}`}
                    type="button"
                    onClick={handleFollowToggle}
                    disabled={followLoading}
                  >
                    {isFollowing ? <Check size={14} /> : <Heart size={14} />}
                    {followLoading ? 'Updating' : isFollowing ? 'Following' : 'Follow path'}
                  </button>
                )}
                <button className="pdx-action" type="button" onClick={() => setShowShareModal(true)}><Share2 size={14} /> Share</button>
                {!playlist.is_owner && <button className="pdx-action" type="button" onClick={handleForkPlaylist} disabled={forkLoading}><GitFork size={14} /> {forkLoading ? 'Forking' : 'Fork'}</button>}
              </div>
              <div className="pdx-ai-actions">
                <span>Transform</span>
                <button type="button" onClick={handleGenerateNotes} disabled={aiLoading.notes || !allItems.length} title="Generate notes">
                  {aiLoading.notes ? <span className="detail-btn-spinner" /> : <FileText size={14} />} Notes
                </button>
                <button type="button" onClick={handleGenerateFlashcards} disabled={aiLoading.flashcards || !allItems.length} title="Generate flashcards">
                  {aiLoading.flashcards ? <span className="detail-btn-spinner" /> : <Zap size={14} />} Cards
                </button>
                <button type="button" onClick={handleAskAI} title="Ask AI about this playlist"><Sparkles size={14} /> Ask AI</button>
              </div>
              {playlist.is_owner && (
                <button className="pdx-icon-danger" type="button" onClick={handleDeletePlaylist} disabled={deleteLoading} aria-label={`Delete ${playlist.title}`} title="Delete playlist">
                  <Trash2 size={15} />
                </button>
              )}
            </div>

            <div className="pdx-progress-ribbon">
              <div>
                <span>{completedItems.length} of {allItems.length} complete</span>
                <strong>{Math.round(progressPercentage)}%</strong>
              </div>
              <div className="pdx-progress-track"><span style={{ width: `${progressPercentage}%` }} /></div>
              <p>{progressPercentage === 100 ? 'Path complete. Nice work.' : progressPercentage > 0 ? 'Continue where you left off.' : 'Mark items complete as you move through the path.'}</p>
            </div>

            {allItems.length > 0 && (
              <div className="pdx-route-map" aria-label="Playlist route map">
                <div className="pdx-route-intro">
                  <span>Route map</span>
                  <strong>{progressPercentage === 100 ? 'Path complete' : 'Your next move is ready'}</strong>
                </div>
                <div className="pdx-route-track">
                  <div className="pdx-route-line" aria-hidden="true">
                    <span style={{ width: `${progressPercentage}%` }} />
                  </div>
                  {allItems.slice(0, 10).map((item, index) => {
                    const isComplete = completedItems.includes(item.id);
                    const isCurrent = nextItem?.id === item.id && progressPercentage < 100;
                    return (
                      <button
                        key={item.id}
                        className={`pdx-route-node ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''}`}
                        type="button"
                        onClick={() => handleOpenItem(item)}
                        aria-label={`${isComplete ? 'Completed' : isCurrent ? 'Continue with' : 'Open'} ${item.title}`}
                        title={item.title}
                      >
                        {isComplete ? <Check size={12} /> : <span>{String(index + 1).padStart(2, '0')}</span>}
                      </button>
                    );
                  })}
                  {allItems.length > 10 && <span className="pdx-route-more">+{allItems.length - 10}</span>}
                </div>
                {nextItem && progressPercentage < 100 && (
                  <button className="pdx-resume" type="button" onClick={() => handleOpenItem(nextItem)}>
                    <span><small>Continue</small><strong>{nextItem.title}</strong></span>
                    <ArrowUpRight size={15} />
                  </button>
                )}
              </div>
            )}
          </section>

          {aiResult && (
            <div className={`pdp-ai-toast ${aiResult.status}`}>
              <Sparkles size={15} />
              <span>{aiResult.status === 'success' ? `AI ${aiResult.type === 'notes' ? 'notes' : 'flashcards'} are ready.` : aiResult.message}</span>
              {aiResult.status === 'success' && aiResult.type === 'notes' && aiResult.noteId && <button className="pdp-toast-link" onClick={() => navigate(`/notes/editor/${aiResult.noteId}`)}>Open notes</button>}
              {aiResult.status === 'success' && aiResult.type === 'flashcards' && <button className="pdp-toast-link" onClick={() => navigate('/flashcards')}>Open flashcards</button>}
              <button className="pdp-toast-close" type="button" aria-label="Dismiss conversion result" onClick={() => setAiResult(null)}><X size={13} /></button>
            </div>
          )}
          {actionError && (
            <div className="pdp-ai-toast error" role="alert">
              <X size={15} />
              <span>{actionError}</span>
              <button className="pdp-toast-close" type="button" aria-label="Dismiss action error" onClick={() => setActionError('')}><X size={13} /></button>
            </div>
          )}

          <section id="playlist-items" className="pdx-items">
            <div className="pdx-section-heading">
              <div>
                <span>Learning sequence</span>
                <h2>Playlist items</h2>
              </div>
              <p><strong>{filteredItems.length}</strong> of {allItems.length} shown</p>
            </div>

            {allItems.length > 0 && (
              <div className="pdx-toolbox">
                <div className="pdx-item-search">
                  <Search size={15} />
                  <label className="sr-only" htmlFor="playlist-item-search">Search playlist items</label>
                  <input id="playlist-item-search" type="search" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Find an item" />
                  {itemSearch && <button type="button" onClick={() => setItemSearch('')} aria-label="Clear item search"><X size={13} /></button>}
                </div>
                <div className="pdx-segment" role="group" aria-label="Completion status">
                  {[
                    ['all', 'All'],
                    ['todo', 'To do'],
                    ['complete', 'Done'],
                  ].map(([value, label]) => (
                    <button key={value} type="button" className={itemStatus === value ? 'active' : ''} onClick={() => setItemStatus(value)} aria-pressed={itemStatus === value}>{label}</button>
                  ))}
                </div>
                <label className="pdx-type-select">
                  <span className="sr-only">Item type</span>
                  <select value={itemFilter} onChange={(event) => setItemFilter(event.target.value)}>
                    <option value="all">All types</option>
                    {itemTypes.map(type => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}
                  </select>
                </label>
                <button className={`pdx-required ${showOnlyRequired ? 'active' : ''}`} type="button" onClick={() => setShowOnlyRequired(value => !value)} aria-pressed={showOnlyRequired}>
                  <Circle size={12} fill={showOnlyRequired ? 'currentColor' : 'none'} /> Required
                </button>
                {filtersActive && <button className="pdx-clear" type="button" onClick={clearItemFilters} aria-label="Clear item filters"><X size={14} /></button>}
              </div>
            )}

            {filteredItems.length > 0 ? (
              <div className="pdx-list">
                {filteredItems.map((item, index) => {
                  const ItemIcon = getItemIcon(item.item_type);
                  const isCompleted = completedItems.includes(item.id);
                  const isExpanded = expandedItems[item.id];
                  return (
                    <article key={item.id} className={`pdx-row playlist-item ${isCompleted ? 'completed' : ''}`}>
                      <div className="pdx-row-number">{String(index + 1).padStart(2, '0')}</div>
                      <button className="pdx-row-open" type="button" onClick={() => handleOpenItem(item)} aria-label={`Open ${item.title}`}>
                        <span className="pdx-row-icon"><ItemIcon size={17} /></span>
                        <span className="pdx-row-copy">
                          <strong>{item.title}</strong>
                          <span>
                            {item.item_type?.replace('_', ' ') || 'resource'}
                            {item.platform ? ` · ${item.platform}` : ''}
                            {item.duration_minutes ? ` · ${item.duration_minutes} min` : ''}
                          </span>
                        </span>
                      </button>
                      <div className="pdx-row-labels">
                        {item.is_required && <span>Required</span>}
                        {isCompleted && <span className="complete">Complete</span>}
                      </div>
                      <div className="pdx-row-actions">
                        {(isFollowing || playlist.is_owner) && (
                          <button className={isCompleted ? 'active' : ''} type="button" onClick={() => handleToggleCompletion(item.id, !isCompleted)} disabled={updatingItem === item.id} aria-label={isCompleted ? `Mark ${item.title} incomplete` : `Mark ${item.title} complete`} title={isCompleted ? 'Mark incomplete' : 'Mark complete'}>
                            <CheckCircle size={16} />
                          </button>
                        )}
                        {(item.description || item.notes) && (
                          <button type="button" onClick={() => toggleItem(item.id)} aria-expanded={isExpanded} aria-label={isExpanded ? `Collapse ${item.title}` : `Expand ${item.title}`} title="Details">
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                        {playlist.is_owner && <button className="danger" type="button" onClick={() => handleDeleteItem(item.id)} aria-label={`Remove ${item.title}`} title="Remove item"><Trash2 size={16} /></button>}
                      </div>
                      {isExpanded && (item.description || item.notes) && (
                        <div className="pdx-row-details">
                          {item.description && <div><strong>Description</strong><p>{item.description}</p></div>}
                          {item.notes && <div><strong>Notes</strong><p>{item.notes}</p></div>}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="pdx-empty">
                <BookOpen size={25} />
                <span>{allItems.length ? 'No matching items' : 'This path is empty'}</span>
                <h3>{allItems.length ? 'Try a broader filter.' : 'Add the first step.'}</h3>
                <p>{allItems.length ? 'Clear or change a control to see more of this playlist.' : 'Bring in a note, link, video, quiz, or flashcard set.'}</p>
                {(allItems.length || playlist.is_owner) && (
                  <button className="pdx-action pdx-action--primary" type="button" onClick={allItems.length ? clearItemFilters : () => setShowAddItemModal(true)}>
                    {allItems.length ? <X size={14} /> : <Plus size={14} />}
                    {allItems.length ? 'Clear filters' : 'Add item'}
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </SocialHubChrome>

      {showViewModal && itemContent && (
        <ViewItemModal item={viewingItem} content={itemContent} onClose={() => { setShowViewModal(false); setViewingItem(null); setItemContent(null); }} />
      )}
      {showAddItemModal && <AddItemModal onClose={() => setShowAddItemModal(false)} onAdd={handleAddItem} />}
      {showShareModal && <PlaylistShareModal isOpen playlist={playlist} onClose={() => setShowShareModal(false)} />}
    </div>
  );

};

export default PlaylistDetailPage;

const ViewItemModal = ({ item, content, onClose }) => {
  const dialogRef = useRef(null);
  useDialogA11y(true, onClose, dialogRef);
  const resourceType = item?.item_type || content.type || 'resource';
  const ResourceIcon = resourceType === 'chat' ? MessageSquare : FileText;
  const hasMessages = Array.isArray(content.messages) && content.messages.length > 0;

  return (
    <div className="modal-backdrop pdx-view-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`modal-box view-modal pdx-view-modal pdx-view-modal--${resourceType}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="playlist-item-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pdx-view-atmosphere" aria-hidden="true">
          <span /><span /><span /><span />
        </div>

        <header className="pdx-view-header">
          <div className="pdx-view-resource">
            <span className="pdx-view-resource-icon"><ResourceIcon size={16} /></span>
            <div>
              <span>Learning artifact</span>
              <strong>{resourceType.replace('_', ' ')}</strong>
            </div>
          </div>
          <div className="pdx-view-heading">
            <span>Playlist resource</span>
            <h2 id="playlist-item-modal-title">{content.title || item?.title}</h2>
            <div className="pdx-view-meta">
              {item?.platform && <span>{item.platform}</span>}
              {item?.duration_minutes && <span>{item.duration_minutes} min</span>}
              {item?.is_required && <span>Required</span>}
            </div>
          </div>
          <button className="pdx-view-close" type="button" aria-label="Close item viewer" onClick={onClose}>
            <X size={17} />
            <span>Esc</span>
          </button>
        </header>

        <div className="pdx-view-rule" aria-hidden="true">
          <span>01</span><i /><span>{resourceType === 'chat' ? (hasMessages ? `${content.messages.length} exchanges` : 'No messages') : 'Reading view'}</span>
        </div>

        <div className="modal-content pdx-view-content">
          {content.type === 'note' && (
            <MathRenderer content={content.content || '<p>No content</p>'} className="note-viewer pdx-note-sheet" />
          )}

          {content.type === 'chat' && (
            <div className={`chat-viewer pdx-chat-thread ${hasMessages ? '' : 'is-empty'}`}>
              {hasMessages ? (
                content.messages.map((msg, index) => (
                  <div key={index} className="chat-pair pdx-chat-pair">
                    <div className="pdx-exchange-index">{String(index + 1).padStart(2, '0')}</div>
                    <div className="chat-msg user-msg">
                      <div className="msg-label">You</div>
                      <MathRenderer
                        content={renderPlaylistMarkdown(msg.user_message)}
                        className="msg-text playlist-chat-render"
                      />
                    </div>
                    <div className="chat-msg ai-msg">
                      <div className="msg-label">AI</div>
                      <MathRenderer
                        content={renderPlaylistMarkdown(msg.ai_response)}
                        className="msg-text playlist-chat-render"
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="pdx-view-empty">
                  <div className="pdx-empty-signal" aria-hidden="true">
                    <MessageSquare size={24} />
                  </div>
                  <div>
                    <span>Empty conversation</span>
                    <h3>No messages in this saved chat.</h3>
                    <p>This chat was added to the playlist, but it does not contain any conversation history.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="pdx-view-footer">
          <span>Playlist item</span>
          <i />
          <span>{item?.title || content.title}</span>
        </footer>
      </div>
    </div>
  );
};

const AddItemModal = ({ onClose, onAdd }) => {
  const dialogRef = useRef(null);
  useDialogA11y(true, onClose, dialogRef);
  const token = localStorage.getItem('token');
  const userName = localStorage.getItem('username');
  const [itemType, setItemType] = useState('external_link');
  const [formData, setFormData] = useState({
    title: '',
    url: '',
    description: '',
    is_required: true,
    notes: '',
    item_id: null,
    platform: ''
  });

  const [userNotes, setUserNotes] = useState([]);
  const [userChats, setUserChats] = useState([]);
  const [userQuizzes, setUserQuizzes] = useState([]);
  const [userFlashcards, setUserFlashcards] = useState([]);
  const [loadingResources, setLoadingResources] = useState(false);
  const [resourceError, setResourceError] = useState('');
  const [addedItems, setAddedItems] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const validateItem = (item) => {
    if (!item.title?.trim()) return 'Add a title or select a resource.';
    if (['external_link', 'youtube', 'pdf', 'article', 'course'].includes(item.item_type)) {
      if (!item.url?.trim()) return 'Add the URL for this item.';
      if (!/^https?:\/\//i.test(item.url.trim())) return 'Use a full URL beginning with http:// or https://.';
    }
    if (['note', 'chat', 'quiz', 'flashcard'].includes(item.item_type) && !item.item_id) {
      return `Select a ${item.item_type === 'flashcard' ? 'flashcard set' : item.item_type}.`;
    }
    return '';
  };

  useEffect(() => {
    if (['note', 'chat', 'quiz', 'flashcard'].includes(itemType)) {
      fetchUserResources();
    }
  }, [itemType]);

  const fetchUserResources = async () => {
    setLoadingResources(true);
    setResourceError('');
    try {
      if (itemType === 'note') {
        const response = await fetch(`${API_URL}/get_notes?user_id=${encodeURIComponent(userName)}&summary=true&limit=100`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setUserNotes(Array.isArray(data) ? data : (data.notes || []));
        }
      } else if (itemType === 'chat') {
        const response = await fetch(`${API_URL}/get_chat_sessions?user_id=${encodeURIComponent(userName)}&limit=100`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setUserChats(Array.isArray(data) ? data : (data.sessions || []));
        }
      } else if (itemType === 'quiz') {
        const response = await fetch(`${API_URL}/get_question_sets?user_id=${userName}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setUserQuizzes(Array.isArray(data) ? data : (data.question_sets || []));
        }
      } else if (itemType === 'flashcard') {
        const response = await fetch(`${API_URL}/get_flashcard_history?user_id=${userName}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setUserFlashcards(Array.isArray(data) ? data : (data.flashcard_history || []));
        }
      }
    } catch (error) {
      setResourceError('Could not load your saved resources. Check your connection and try this type again.');
    } finally {
      setLoadingResources(false);
    }
  };

  const handleAddToQueue = (e) => {
    e.preventDefault();
    const newItem = {
      item_type: itemType,
      ...formData,
      tempId: Date.now()
    };
    const validationError = validateItem(newItem);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError('');
    setAddedItems(prev => [...prev, newItem]);


    setFormData({
      title: '',
      url: '',
      description: '',
      is_required: true,
      notes: '',
      item_id: null,
      platform: ''
    });
  };

  const handleAddAndClose = async (e) => {
    e.preventDefault();
    const newItem = {
      item_type: itemType,
      ...formData
    };

    const validationError = validateItem(newItem);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);
    setFormError('');
    try {
      await onAdd(newItem);
      onClose();
    } catch (error) {
      setFormError(`${error.message || 'Could not add this item.'} Review the fields and try again.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveFromQueue = (tempId) => {
    setAddedItems(prev => prev.filter(item => item.tempId !== tempId));
  };

  const handleSubmitAll = async () => {
    if (addedItems.length === 0) return;

    setIsSubmitting(true);
    try {
      for (const item of addedItems) {
        const { tempId, ...itemData } = item;
        await onAdd(itemData);
      }
      onClose();
    } catch (error) {
      setFormError(`${error.message || 'Could not add the queued items.'} Your queue is still here; try again.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResourceSelect = (resourceId, resourceTitle) => {
    setFormData(prev => ({
      ...prev,
      item_id: resourceId,
      title: resourceTitle
    }));
  };

  const itemTypes = [
    { value: 'external_link', label: 'Link', icon: LinkIcon },
    { value: 'youtube', label: 'YouTube', icon: Youtube },
    { value: 'pdf', label: 'PDF', icon: FileUp },
    { value: 'note', label: 'Note', icon: FileText },
    { value: 'chat', label: 'Chat', icon: MessageSquare },
    { value: 'quiz', label: 'Quiz', icon: BookOpen },
    { value: 'flashcard', label: 'Flashcard', icon: BookOpen }
  ];

  const getItemIcon = (type) => {
    const typeObj = itemTypes.find(t => t.value === type);
    return typeObj ? typeObj.icon : BookOpen;
  };

  return (
    <div className="add-item-fullpage" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="add-items-title" tabIndex={-1}>
      <div className="add-item-shell">
        <div className="cb-tile-texture add-item-texture" aria-hidden="true" />
        <div className="ai-header">
          <div className="ai-header-left pdx-identity">
            <div className="pdx-mark add-item-mark" aria-hidden="true">
              <span>+</span><i /><i /><i />
            </div>
            <div className="pdx-heading">
              <div className="pdx-badges">
                <span>Playlist</span>
                <span>Resource builder</span>
              </div>
              <h1 className="ai-title" id="add-items-title">Add resources</h1>
              <p>Choose one resource to add now, or stage several and add them together.</p>
            </div>
          </div>
          <button className="ai-close pdx-action" type="button" aria-label="Close add items" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="add-item-body">
          <div className="add-item-main">
            <div className="add-item-form-section">
              <div className="ai-section-head pdx-section-heading">
                <div>
                  <span>Resource setup</span>
                  <h2>Choose and configure</h2>
                </div>
                <p>Links and uploads need a title and URL. Saved learning resources can be selected directly.</p>
              </div>

            <form onSubmit={handleAddToQueue} className="add-item-form">
              <div className="form-field">
                <span className="ai-field-label" id="item-type-label">Item Type</span>
                <div className="ai-type-chips pdx-toolbox" role="group" aria-labelledby="item-type-label">
                  {itemTypes.map(type => {
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        className={`ai-type-chip pdx-action ${itemType === type.value ? 'active pdx-action--active' : ''}`}
                        aria-pressed={itemType === type.value}
                        onClick={() => {
                          setItemType(type.value);
                          setFormData({ title: '', url: '', description: '', is_required: true, notes: '', item_id: null, platform: '' });
                        }}
                      >
                        <Icon size={15} />
                        <span>{type.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(itemType === 'note' || itemType === 'chat' || itemType === 'quiz' || itemType === 'flashcard') && (
                <div className="form-field">
                  <label>Select {itemType === 'flashcard' ? 'Flashcard Set' : itemType === 'quiz' ? 'Quiz' : itemType === 'note' ? 'Note' : 'Chat'}</label>
                  {loadingResources ? (
                    <div className="loading-text" role="status">Loading your {itemType === 'flashcard' ? 'flashcard sets' : `${itemType}s`}…</div>
                  ) : (
                    <div className="resource-selector-list">
                      {resourceError && <div className="resource-load-error" role="alert">{resourceError}</div>}
                      {itemType === 'note' && userNotes.map(note => (
                        <div
                          key={note.id}
                          className={`resource-option-item ${formData.item_id === note.id ? 'selected' : ''}`}
                          onClick={() => handleResourceSelect(note.id, note.title)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleResourceSelect(note.id, note.title); } }}
                          role="option"
                          aria-selected={formData.item_id === note.id}
                          tabIndex={0}
                        >
                          <FileText size={18} />
                          <span>{note.title}</span>
                          {formData.item_id === note.id && <Check size={18} />}
                        </div>
                      ))}
                      {itemType === 'chat' && userChats.map(chat => (
                        <div
                          key={chat.id}
                          className={`resource-option-item ${formData.item_id === chat.id ? 'selected' : ''}`}
                          onClick={() => handleResourceSelect(chat.id, chat.title)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleResourceSelect(chat.id, chat.title); } }}
                          role="option"
                          aria-selected={formData.item_id === chat.id}
                          tabIndex={0}
                        >
                          <MessageSquare size={18} />
                          <span>{chat.title}</span>
                          {formData.item_id === chat.id && <Check size={18} />}
                        </div>
                      ))}
                      {itemType === 'quiz' && userQuizzes.map(quiz => (
                        <div
                          key={quiz.id}
                          className={`resource-option-item ${formData.item_id === quiz.id ? 'selected' : ''}`}
                          onClick={() => handleResourceSelect(quiz.id, quiz.title || quiz.name)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleResourceSelect(quiz.id, quiz.title || quiz.name); } }}
                          role="option"
                          aria-selected={formData.item_id === quiz.id}
                          tabIndex={0}
                        >
                          <BookOpen size={18} />
                          <span>{quiz.title || quiz.name}</span>
                          {formData.item_id === quiz.id && <Check size={18} />}
                        </div>
                      ))}
                      {itemType === 'flashcard' && userFlashcards.map(flashcard => {

                        let cleanTitle = (flashcard.title || flashcard.name || '')
                          .replace(/^(Flashcards?:\s*|Cerbyl\s*|AI Generated\s*|ai generated\s*)/gi, '')
                          .replace(/^\s*:\s*/, '')
                          .trim();
                        cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

                        return (
                          <div
                            key={flashcard.id}
                            className={`resource-option-item ${formData.item_id === flashcard.id ? 'selected' : ''}`}
                            onClick={() => handleResourceSelect(flashcard.id, cleanTitle)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleResourceSelect(flashcard.id, cleanTitle); } }}
                            role="option"
                            aria-selected={formData.item_id === flashcard.id}
                            tabIndex={0}
                          >
                            <BookOpen size={18} />
                            <span>{cleanTitle}</span>
                            {formData.item_id === flashcard.id && <Check size={18} />}
                          </div>
                        );
                      })}

                      {!resourceError && ((itemType === 'note' && userNotes.length === 0) ||
                        (itemType === 'chat' && userChats.length === 0) ||
                        (itemType === 'quiz' && userQuizzes.length === 0) ||
                        (itemType === 'flashcard' && userFlashcards.length === 0)) && (
                        <div className="no-resources">
                          No {itemType === 'flashcard' ? 'flashcard sets' : itemType === 'quiz' ? 'quizzes' : itemType === 'note' ? 'notes' : 'chats'} found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {itemType !== 'note' && itemType !== 'chat' && itemType !== 'quiz' && itemType !== 'flashcard' && (
                <div className="form-field">
                  <label htmlFor="playlist-item-title">Title</label>
                  <input
                    id="playlist-item-title"
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    placeholder={itemType === 'course' ? 'e.g., Machine Learning Specialization' : 'Enter title'}
                    required
                  />
                </div>
              )}

              {(itemType === 'external_link' || itemType === 'youtube' || itemType === 'pdf' ||
                itemType === 'article' || itemType === 'course') && (
                <div className="form-field">
                  <label htmlFor="playlist-item-url">URL</label>
                  <input
                    id="playlist-item-url"
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                    placeholder={itemType === 'course' ? 'https://www.coursera.org/learn/...' : 'https://...'}
                    required
                  />
                </div>
              )}

              {itemType === 'course' && (
                <div className="form-field">
                  <label>Platform (Optional)</label>
                  <select
                    value={formData.platform || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, platform: e.target.value }))}
                  >
                    <option value="">Select platform</option>
                    <option value="Coursera">Coursera</option>
                    <option value="edX">edX</option>
                    <option value="Udemy">Udemy</option>
                    <option value="Udacity">Udacity</option>
                    <option value="Khan Academy">Khan Academy</option>
                    <option value="LinkedIn Learning">LinkedIn Learning</option>
                    <option value="Pluralsight">Pluralsight</option>
                    <option value="Skillshare">Skillshare</option>
                    <option value="FreeCodeCamp">FreeCodeCamp</option>
                    <option value="MIT OpenCourseWare">MIT OpenCourseWare</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              )}

              <div className="form-field">
                <label htmlFor="playlist-item-description">Description (Optional)</label>
                <textarea
                  id="playlist-item-description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Add a description..."
                  rows={3}
                />
              </div>

              <label className="add-item-required">
                <input
                  type="checkbox"
                  checked={formData.is_required}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_required: e.target.checked }))}
                />
                <span className="add-item-required-control" aria-hidden="true"><Check size={13} /></span>
                <span><strong>Required in this path</strong><small>Learners should complete this resource.</small></span>
              </label>

              {formError && <p className="add-item-error" role="alert">{formError}</p>}
              <div className="form-actions">
                <button type="submit" className="add-to-queue-btn pdx-action pdx-action--primary">
                  <Plus size={18} />
                  <span>Add to Queue</span>
                </button>
                <button type="button" className="done-btn pdx-action" onClick={handleAddAndClose} disabled={isSubmitting}>
                  <Check size={18} />
                  <span>{isSubmitting ? 'Adding…' : 'Add now'}</span>
                </button>
              </div>
            </form>
            </div>
          </div>

          <div className="add-item-sidebar">
            <div className="cb-tile-texture" aria-hidden="true" />
            <div className="queue-section">
              <div className="queue-header">
                <div className="ai-section-head pdx-section-heading">
                  <div>
                    <span>Staged resources</span>
                    <h2>Ready to add</h2>
                  </div>
                </div>
                <span className="queue-count">{addedItems.length} {addedItems.length === 1 ? 'item' : 'items'}</span>
              </div>

            {addedItems.length === 0 ? (
              <div className="queue-empty pdx-empty">
                <BookOpen size={25} />
                <span>This queue is empty</span>
                <h3>No resources staged.</h3>
                <p>Add a resource from the setup panel. It will appear here before you commit it to the playlist.</p>
              </div>
            ) : (
              <div className="queue-list">
                {addedItems.map((item, index) => {
                  const ItemIcon = getItemIcon(item.item_type);
                  return (
                    <article key={item.tempId} className="queue-item pdx-row">
                      <div className="pdx-row-number">{String(index + 1).padStart(2, '0')}</div>
                      <div className="pdx-row-open">
                        <span className="pdx-row-icon"><ItemIcon size={17} /></span>
                        <span className="pdx-row-copy">
                          <strong>{item.title}</strong>
                          <span>{item.item_type.replace('_', ' ')}</span>
                        </span>
                      </div>
                      <div className="pdx-row-actions">
                        <button
                          type="button"
                          className="danger"
                          onClick={() => handleRemoveFromQueue(item.tempId)}
                          aria-label={`Remove ${item.title} from queue`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {addedItems.length > 0 && (
              <button
                type="button"
                className="submit-all-btn pdx-action pdx-action--primary"
                onClick={handleSubmitAll}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  'Adding Items...'
                ) : (
                  <>
                    <Check size={18} />
                    <span>Add {addedItems.length} Item{addedItems.length > 1 ? 's' : ''} to Playlist</span>
                  </>
                )}
              </button>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
