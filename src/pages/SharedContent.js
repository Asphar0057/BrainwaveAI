import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, FileText, Users, Clock, Eye, Edit3, Trash2, Search, Filter, Calendar } from 'lucide-react';
import './SharedContent.css';
import { API_URL } from '../config';
const SharedContent = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [sharedItems, setSharedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all'); 
  const [filterPermission, setFilterPermission] = useState('all'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('recent'); 

  useEffect(() => {
    fetchSharedContent();
  }, []);

  const fetchSharedContent = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/shared_with_me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSharedItems(data.shared_items);
      }
    } catch (error) { /* silenced */ } finally {
      setLoading(false);
    }
  };

  const handleOpenItem = (item) => {
    if (item.content_type === 'chat') {
      navigate(`/shared/chat/${item.content_id}`);
    } else if (item.content_type === 'note') {
      navigate(`/shared/note/${item.content_id}`);
    }
  };

  const handleDeleteShare = async (shareId) => {
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

  const getFilteredAndSortedItems = () => {
    let filtered = sharedItems;

    
    if (filterType !== 'all') {
      filtered = filtered.filter(item => item.content_type === filterType);
    }

    
    if (filterPermission !== 'all') {
      filtered = filtered.filter(item => item.permission === filterPermission);
    }

    
    if (searchQuery) {
      filtered = filtered.filter(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.shared_by.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.shared_by.first_name && item.shared_by.first_name.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    
    switch (sortBy) {
      case 'recent':
        filtered.sort((a, b) => new Date(b.shared_at) - new Date(a.shared_at));
        break;
      case 'oldest':
        filtered.sort((a, b) => new Date(a.shared_at) - new Date(b.shared_at));
        break;
      case 'title':
        filtered.sort((a, b) => a.title.localeCompare(b.title));
        break;
      default:
        break;
    }

    return filtered;
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

  const filteredItems = getFilteredAndSortedItems();

  return (
    <div className="shared-content-page">
      <div className="shared-container">
        <div className="shared-welcome">
          <div className="shared-welcome-left">
            <div className="view-heading" style={{ marginBottom: 0, paddingBottom: 0, border: 'none' }}>

              <h2 className="view-title">Shared Content</h2>

            </div>
          </div>
          <div className="shared-stats">
            <div className="stat-badge">
              <MessageSquare size={16} />
              <span>{sharedItems.filter(i => i.content_type === 'chat').length} Chats</span>
            </div>
            <div className="stat-badge">
              <FileText size={16} />
              <span>{sharedItems.filter(i => i.content_type === 'note').length} Notes</span>
            </div>
          </div>
        </div>

        <div className="shared-filters">
          <div className="filters-left">
            <div className="search-box">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search shared content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="filters-right">
            <select 
              className="filter-select"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="chat">AI Chats</option>
              <option value="note">Notes</option>
            </select>

            <select 
              className="filter-select"
              value={filterPermission}
              onChange={(e) => setFilterPermission(e.target.value)}
            >
              <option value="all">All Permissions</option>
              <option value="view">View Only</option>
              <option value="edit">Can Edit</option>
            </select>

            <select 
              className="filter-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="recent">Most Recent</option>
              <option value="oldest">Oldest First</option>
              <option value="title">By Title</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="loading-text">Loading shared content...</div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-shared">
            <Users size={48} />
            <p>No shared content found</p>
            <p className="empty-hint">
              {searchQuery || filterType !== 'all' || filterPermission !== 'all'
                ? 'Try adjusting your filters'
                : 'When friends share notes or AI chats with you, they will appear here'}
            </p>
          </div>
        ) : (
          <div className="shared-grid">
            {filteredItems.map((item) => (
              <div key={item.id} className="shared-card">
                <div className="shared-card-header">
                  <div className="content-type-badge" data-type={item.content_type}>
                    {item.content_type === 'chat' ? (
                      <MessageSquare size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                    <span>{item.content_type === 'chat' ? 'AI Chat' : 'Note'}</span>
                  </div>
                  
                  <div className="permission-badge" data-permission={item.permission}>
                    {item.permission === 'view' ? (
                      <Eye size={14} />
                    ) : (
                      <Edit3 size={14} />
                    )}
                    <span>{item.permission === 'view' ? 'View' : 'Edit'}</span>
                  </div>
                </div>

                <div className="shared-card-content">
                  <h3 className="shared-item-title">{item.title}</h3>
                  
                  {item.message && (
                    <p className="share-message">
                      "{item.message}"
                    </p>
                  )}

                  <div className="shared-by">
                    <div className="shared-by-avatar">
                      {item.shared_by.picture_url ? (
                        <img src={item.shared_by.picture_url} alt={item.shared_by.username} />
                      ) : (
                        <div className="shared-by-avatar-placeholder">
                          {(item.shared_by.first_name?.[0] || item.shared_by.username[0]).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="shared-by-info">
                      <span className="shared-by-text">Shared by</span>
                      <span className="shared-by-name">
                        {item.shared_by.first_name && item.shared_by.last_name
                          ? `${item.shared_by.first_name} ${item.shared_by.last_name}`
                          : item.shared_by.username}
                      </span>
                    </div>
                  </div>

                  <div className="shared-meta">
                    <div className="meta-item">
                      <Clock size={12} />
                      <span>{formatDate(item.shared_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="shared-card-footer">
                  <button 
                    className="shared-action-btn open"
                    onClick={() => handleOpenItem(item)}
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
                    className="shared-action-btn remove"
                    onClick={() => handleDeleteShare(item.id)}
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
    </div>
  );
};

export default SharedContent;
