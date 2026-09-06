import { readLibraryState, writeLibraryState } from '../utils/libraryState';
import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { Table, Columns, Calendar as CalendarIcon, Grid, Clock, Folder } from 'lucide-react';
import './DatabaseViews.css';

const DatabaseViews = ({ notes, folders, onSelectNote, persistenceKey }) => {
  const [initialState] = useState(() => persistenceKey ? readLibraryState(persistenceKey) : {});
  const [viewMode, setViewMode] = useState(['table', 'kanban'].includes(initialState.viewMode) ? initialState.viewMode : 'table');
  const [sortBy, setSortBy] = useState(['title', 'updated_at', 'created_at'].includes(initialState.sortBy) ? initialState.sortBy : 'updated_at');
  const [sortOrder, setSortOrder] = useState(initialState.sortOrder === 'asc' ? 'asc' : 'desc');
  const contentRef = useRef(null);
  useLayoutEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = initialState.scrollTop || 0;
      contentRef.current.scrollLeft = initialState.scrollLeft || 0;
    }
  }, [initialState]);
  useEffect(() => {
    if (persistenceKey) writeLibraryState(persistenceKey, { viewMode, sortBy, sortOrder });
  }, [persistenceKey, viewMode, sortBy, sortOrder]);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const sortedNotes = [...notes].sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case 'title':
        comparison = a.title.localeCompare(b.title);
        break;
      case 'updated_at':
        comparison = new Date(a.updated_at) - new Date(b.updated_at);
        break;
      case 'created_at':
        comparison = new Date(a.created_at) - new Date(b.created_at);
        break;
      default:
        comparison = 0;
    }
    
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const getPreview = (content) => {
    const text = content.replace(/<[^>]+>/g, '');
    return text.substring(0, 100) + (text.length > 100 ? '...' : '');
  };

  const getFolderName = (folderId) => {
    const folder = folders.find(f => f.id === folderId);
    return folder ? folder.name : 'No Folder';
  };

  
  const renderTableView = () => (
    <table className="table-view">
      <thead>
        <tr>
          <th onClick={() => handleSort('title')}>
            Title {sortBy === 'title' && (sortOrder === 'asc' ? '↑' : '↓')}
          </th>
          <th>Preview</th>
          <th onClick={() => handleSort('updated_at')}>
            Last Modified {sortBy === 'updated_at' && (sortOrder === 'asc' ? '↑' : '↓')}
          </th>
          <th>Folder</th>
        </tr>
      </thead>
      <tbody>
        {sortedNotes.map(note => (
          <tr key={note.id} onClick={() => onSelectNote(note)}>
            <td className="table-cell-title"><button className="note-title-link" type="button" onClick={(event) => { event.stopPropagation(); onSelectNote(note); }}>{note.title || 'Untitled note'}</button></td>
            <td className="table-cell-preview">{getPreview(note.content)}</td>
            <td className="table-cell-date">
              {new Date(note.updated_at).toLocaleDateString()}
            </td>
            <td>
              <span className="table-cell-folder" style={{ 
                backgroundColor: folders.find(f => f.id === note.folder_id)?.color || '#ccc'
              }}>
                {getFolderName(note.folder_id)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  
  const renderKanbanView = () => {
    const columns = [
      { id: 'recent', title: 'Recent', filter: (n) => {
        const dayAgo = new Date();
        dayAgo.setDate(dayAgo.getDate() - 1);
        return new Date(n.updated_at) > dayAgo;
      }},
      { id: 'this-week', title: 'This Week', filter: (n) => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(n.updated_at) > weekAgo && new Date(n.updated_at) <= new Date(Date.now() - 86400000);
      }},
      { id: 'older', title: 'Older', filter: (n) => {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(n.updated_at) <= weekAgo;
      }}
    ];

    return (
      <div className="kanban-view">
        {columns.map(column => {
          const columnNotes = sortedNotes.filter(column.filter);
          return (
            <div key={column.id} className="kanban-column">
              <div className="kanban-column-header">
                <span className="kanban-column-title">{column.title}</span>
                <span className="kanban-column-count">{columnNotes.length}</span>
              </div>
              <div className="kanban-cards">
                {columnNotes.map(note => (
                  <div
                    key={note.id}
                    className="kanban-card"
                    onClick={() => onSelectNote(note)}
                  >
                    <div className="kanban-card-title">{note.title}</div>
                    <div className="kanban-card-preview">{getPreview(note.content)}</div>
                    <div className="kanban-card-meta">
                      <span>{new Date(note.updated_at).toLocaleDateString()}</span>
                      {note.folder_id && <span>{getFolderName(note.folder_id)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  
  const renderCalendarView = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    const prevMonthDays = new Date(year, month, 0).getDate();
    
    
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: prevMonthDays - i,
        isCurrentMonth: false,
        fullDate: new Date(year, month - 1, prevMonthDays - i)
      });
    }
    
    
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: i,
        isCurrentMonth: true,
        fullDate: new Date(year, month, i)
      });
    }
    
    
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: i,
        isCurrentMonth: false,
        fullDate: new Date(year, month + 1, i)
      });
    }

    const getNotesForDay = (date) => {
      return sortedNotes.filter(note => {
        const noteDate = new Date(note.updated_at);
        return noteDate.toDateString() === date.toDateString();
      });
    };

    const isToday = (date) => {
      return date.toDateString() === new Date().toDateString();
    };

    return (
      <div className="calendar-view">
        <div className="calendar-header">
          <div className="calendar-nav">
            <button
              className="calendar-nav-btn"
              onClick={() => setCurrentMonth(new Date(year, month - 1))}
            >
              ←
            </button>
            <button
              className="calendar-nav-btn"
              onClick={() => setCurrentMonth(new Date())}
            >
              Today
            </button>
            <button
              className="calendar-nav-btn"
              onClick={() => setCurrentMonth(new Date(year, month + 1))}
            >
              →
            </button>
          </div>
          <div className="calendar-month-title">
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
        </div>
        
        <div className="calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="calendar-day-header">{day}</div>
          ))}
          
          {days.map((day, index) => {
            const dayNotes = getNotesForDay(day.fullDate);
            return (
              <div
                key={index}
                className={`calendar-day ${!day.isCurrentMonth ? 'other-month' : ''} ${isToday(day.fullDate) ? 'today' : ''}`}
              >
                <div className="calendar-day-number">{day.date}</div>
                <div className="calendar-day-notes">
                  {dayNotes.map(note => (
                    <div
                      key={note.id}
                      className="calendar-note-item"
                      onClick={() => onSelectNote(note)}
                      title={note.title}
                    >
                      {note.title}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  
  const renderGalleryView = () => (
    <div className="gallery-view">
      {sortedNotes.map(note => (
        <div
          key={note.id}
          className="gallery-card"
          onClick={() => onSelectNote(note)}
        >
          <div className="gallery-card-image">
            📄
          </div>
          <div className="gallery-card-content">
            <div className="gallery-card-title">{note.title}</div>
            <div className="gallery-card-preview">{getPreview(note.content)}</div>
            <div className="gallery-card-meta">
              <span>{new Date(note.updated_at).toLocaleDateString()}</span>
              {note.folder_id && (
                <span style={{ 
                  color: folders.find(f => f.id === note.folder_id)?.color || '#ccc'
                }}>
                  <Folder size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  {getFolderName(note.folder_id)}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  
  const renderTimelineView = () => {
    const groupedByDate = sortedNotes.reduce((acc, note) => {
      const date = new Date(note.updated_at).toLocaleDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(note);
      return acc;
    }, {});

    return (
      <div className="timeline-view">
        <div className="timeline-line"></div>
        {Object.entries(groupedByDate).map(([date, notes]) => (
          <div key={date}>
            <div className="timeline-date">{date}</div>
            {notes.map(note => (
              <div key={note.id} className="timeline-item">
                <div className="timeline-dot"></div>
                <div
                  className="timeline-card"
                  onClick={() => onSelectNote(note)}
                >
                  <div className="timeline-card-title">{note.title}</div>
                  <div className="timeline-card-preview">{getPreview(note.content)}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="database-views-container">
      <div className="view-selector">
        <button
          className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
          aria-pressed={viewMode === 'table'}
          onClick={() => setViewMode('table')}
        >
          <Table size={16} />
          Table
        </button>
        <button
          className={`view-btn ${viewMode === 'kanban' ? 'active' : ''}`}
          aria-pressed={viewMode === 'kanban'}
          onClick={() => setViewMode('kanban')}
        >
          <Columns size={16} />
          Kanban
        </button>
      </div>

      <div className="view-content" ref={contentRef} onScroll={(event) => {
        if (persistenceKey) writeLibraryState(persistenceKey, { scrollTop: event.currentTarget.scrollTop, scrollLeft: event.currentTarget.scrollLeft });
      }}>
        {viewMode === 'table' && renderTableView()}
        {viewMode === 'kanban' && renderKanbanView()}
      </div>
    </div>
  );
};

export default DatabaseViews;
