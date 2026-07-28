import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOutAppSession } from '../utils/authSession';
import {
  Award,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Edit3,
  FileText,
  Filter,
  Flag,
  Flame,
  ListChecks,
  Link as LinkIcon,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { API_URL } from '../config';
import { useNotifications } from '../contexts/NotificationContext';
import { sanitizeUrl } from '../utils/sanitize';
import './ActivityTimeline.css';

const ACTIVITY_TYPES = ['note', 'flashcard', 'quiz', 'chat'];
const DEFAULT_ACCENT_COLOR = '#D7B38C';

const TYPE_META = {
  note: { label: 'Notes', color: '#34d399', icon: FileText },
  flashcard: { label: 'Flashcards', color: '#fbbf24', icon: BookOpen },
  quiz: { label: 'Quizzes', color: '#f472b6', icon: Award },
  chat: { label: 'AI Chats', color: DEFAULT_ACCENT_COLOR, icon: MessageSquare },
  reminder: { label: 'Reminder', color: '#8b5cf6', icon: Bell },
};

const PRIORITY_LABELS = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const REMINDER_COLORS = [
  DEFAULT_ACCENT_COLOR,
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#14b8a6',
];

const stripHtml = (input = '') => input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const isSameDay = (a, b) => dayKey(a) === dayKey(b);

const monthGrid = (cursorDate, startWeekOnMonday = true) => {
  const year = cursorDate.getFullYear();
  const month = cursorDate.getMonth();
  const first = new Date(year, month, 1);
  const offset = startWeekOnMonday ? ((first.getDay() + 6) % 7) : first.getDay();
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, idx) => {
    const cell = new Date(start);
    cell.setDate(start.getDate() + idx);
    return cell;
  });
};

const toDatetimeLocal = (rawValue) => {
  if (!rawValue) return '';
  const d = new Date(rawValue);
  if (Number.isNaN(d.getTime())) return '';
  const tzOffsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
};

const emptyReminderForm = (listId = null) => ({
  title: '',
  description: '',
  reminder_date: '',
  priority: 'none',
  color: DEFAULT_ACCENT_COLOR,
  is_flagged: false,
  url: '',
  list_id: listId || null,
});

const parseDateSafe = (rawValue) => {
  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const ActivityTimeline = () => {
  const navigate = useNavigate();
  const { refreshNotifications } = useNotifications();
  const userName = localStorage.getItem('username') || '';
  const token = localStorage.getItem('token') || '';

  const [viewMode, setViewMode] = useState('timeline');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [activities, setActivities] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [reminderLists, setReminderLists] = useState([]);
  const [smartListCounts, setSmartListCounts] = useState({});

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedFilters, setSelectedFilters] = useState([...ACTIVITY_TYPES]);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateRange, setDateRange] = useState('all');

  const [selectedSmartList, setSelectedSmartList] = useState('all');
  const [selectedListId, setSelectedListId] = useState(null);

  const [activeDay, setActiveDay] = useState(null);
  const [showDayModal, setShowDayModal] = useState(false);

  const [showReminderModal, setShowReminderModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [reminderForm, setReminderForm] = useState(emptyReminderForm());
  const searchInputRef = useRef(null);

  const authHeaders = useMemo(() => (
    token ? { Authorization: `Bearer ${token}` } : {}
  ), [token]);

  const loadActivities = useCallback(async () => {
    if (!userName) return;
    const all = [];

    const addActivity = (activity) => {
      if (!activity || !activity.timestamp || Number.isNaN(activity.timestamp.getTime())) return;
      all.push(activity);
    };

    try {
      const notesRes = await fetch(`${API_URL}/get_notes?user_id=${encodeURIComponent(userName)}&summary=true&limit=200`, { headers: authHeaders });
      if (notesRes.ok) {
        const notes = await notesRes.json();
        (Array.isArray(notes) ? notes : []).forEach((note) => {
          if (note?.is_deleted) return;
          addActivity({
            id: `note-${note.id}`,
            type: 'note',
            title: note.title || 'Untitled Note',
            content: note.preview || stripHtml(note.content || '').slice(0, 140),
            timestamp: parseDateSafe(note.updated_at || note.created_at),
            data: note,
          });
        });
      }
    } catch (e) {
      console.error('Notes load failed', e);
    }

    try {
      const flashcardsRes = await fetch(`${API_URL}/get_flashcard_history?user_id=${encodeURIComponent(userName)}&limit=200`, { headers: authHeaders });
      if (flashcardsRes.ok) {
        const payload = await flashcardsRes.json();
        const sets = Array.isArray(payload?.flashcard_history) ? payload.flashcard_history : [];
        sets.forEach((setInfo) => {
          addActivity({
            id: `flashcard-${setInfo.id}`,
            type: 'flashcard',
            title: setInfo.title || 'Flashcard Set',
            content: `${setInfo.card_count || 0} flashcard${setInfo.card_count === 1 ? '' : 's'}`,
            timestamp: parseDateSafe(setInfo.updated_at || setInfo.created_at),
            data: setInfo,
          });
        });
      }
    } catch (e) {
      console.error('Flashcards load failed', e);
    }

    try {
      const chatRes = await fetch(`${API_URL}/get_chat_sessions?user_id=${encodeURIComponent(userName)}&limit=200`, { headers: authHeaders });
      if (chatRes.ok) {
        const chats = await chatRes.json();
        (chats?.sessions || []).forEach((session) => {
          addActivity({
            id: `chat-${session.id}`,
            type: 'chat',
            title: session.title || 'AI Chat Session',
            content: 'AI conversation',
            timestamp: parseDateSafe(session.updated_at || session.created_at),
            data: session,
          });
        });
      }
    } catch (e) {
      console.error('Chats load failed', e);
    }

    try {
      const quizRes = await fetch(`${API_URL}/get_quiz_history?user_id=${encodeURIComponent(userName)}`, { headers: authHeaders });
      if (quizRes.ok) {
        const payload = await quizRes.json();
        const quizzes = Array.isArray(payload) ? payload : (payload?.sessions || []);
        quizzes.forEach((quiz) => {
          const totalQuestions = Number(quiz.total_questions || 0);
          const correctAnswers = Number(quiz.correct_answers || 0);
          const score = Number(quiz.score || 0);
          addActivity({
            id: `quiz-${quiz.id}`,
            type: 'quiz',
            title: quiz.title || 'Quiz Session',
            content: totalQuestions > 0
              ? `${correctAnswers}/${totalQuestions} correct · ${score}%`
              : 'Quiz completed',
            timestamp: parseDateSafe(quiz.completed_at || quiz.created_at),
            data: quiz,
          });
        });
      }
    } catch (e) {
      console.error('Quizzes load failed', e);
    }

    all.sort((a, b) => b.timestamp - a.timestamp);
    setActivities(all);
  }, [userName, authHeaders]);

  const loadReminderLists = useCallback(async () => {
    if (!userName) return;
    try {
      const res = await fetch(`${API_URL}/get_reminder_lists?user_id=${encodeURIComponent(userName)}`, {
        headers: authHeaders,
      });
      if (!res.ok) return;
      const payload = await res.json();
      setReminderLists(payload?.lists || []);
      setSmartListCounts(payload?.smart_lists || {});
    } catch (e) {
      console.error('Reminder lists load failed', e);
    }
  }, [userName, authHeaders]);

  const loadReminders = useCallback(async (smartList, listId) => {
    if (!userName) return;
    try {
      const params = new URLSearchParams({ user_id: userName });
      if (listId) {
        params.set('list_id', String(listId));
      } else if (smartList && smartList !== 'all') {
        params.set('smart_list', smartList);
      }
      const res = await fetch(`${API_URL}/get_reminders?${params.toString()}`, {
        headers: authHeaders,
      });
      if (!res.ok) return;
      const payload = await res.json();
      const normalized = (Array.isArray(payload) ? payload : []).map((item) => ({
        ...item,
        reminder_date: item.reminder_date || null,
        created_at: item.created_at || null,
      }));
      setReminders(normalized);
    } catch (e) {
      console.error('Reminders load failed', e);
    }
  }, [userName, authHeaders]);

  useEffect(() => {
    if (!userName || !token) {
      navigate('/login');
      return;
    }

    let mounted = true;
    const bootstrap = async () => {
      setLoading(true);
      setError('');
      try {
        await Promise.all([
          loadActivities(),
          loadReminderLists(),
          loadReminders(selectedSmartList, selectedListId),
        ]);
      } catch (e) {
        if (mounted) setError('Failed to load timeline data.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    bootstrap();
    return () => {
      mounted = false;
    };
  }, [
    userName,
    token,
    navigate,
    loadActivities,
    loadReminderLists,
    loadReminders,
  ]);

  useEffect(() => {
    if (!userName || !token) return;
    loadReminders(selectedSmartList, selectedListId);
  }, [userName, token, selectedSmartList, selectedListId, loadReminders]);

  useEffect(() => {
    if (!showDayModal && !showReminderModal) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setShowDayModal(false);
      setShowReminderModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showDayModal, showReminderModal]);

  useEffect(() => {
    if (!showDayModal && !showReminderModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showDayModal, showReminderModal]);

  useEffect(() => {
    const onGlobalKeyDown = (event) => {
      if (
        event.key === '/'
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  const filteredActivities = useMemo(() => {
    const lowered = searchQuery.trim().toLowerCase();
    const cutoff = dateRange === 'all'
      ? null
      : new Date(Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000);
    return activities.filter((activity) => {
      if (!selectedFilters.includes(activity.type)) return false;
      if (cutoff && activity.timestamp < cutoff) return false;
      if (!lowered) return true;
      return (
        (activity.title || '').toLowerCase().includes(lowered)
        || (activity.content || '').toLowerCase().includes(lowered)
      );
    });
  }, [activities, selectedFilters, searchQuery, dateRange]);

  const filteredReminders = useMemo(() => {
    const lowered = searchQuery.trim().toLowerCase();
    return reminders.filter((reminder) => (
      !lowered
      || (reminder.title || '').toLowerCase().includes(lowered)
      || (reminder.description || '').toLowerCase().includes(lowered)
    ));
  }, [reminders, searchQuery]);

  const groupedTimeline = useMemo(() => {
    const grouped = {};
    const timelineEntries = [
      ...filteredActivities.map((activity) => ({ ...activity, entryKind: 'activity' })),
      ...filteredReminders
        .filter((reminder) => reminder.reminder_date)
        .map((reminder) => ({
          id: `reminder-${reminder.id}`,
          type: 'reminder',
          title: reminder.title || 'Untitled reminder',
          content: reminder.description || `${PRIORITY_LABELS[reminder.priority] || 'No'} priority`,
          timestamp: parseDateSafe(reminder.reminder_date),
          data: reminder,
          entryKind: 'reminder',
        })),
    ];

    timelineEntries.forEach((entry) => {
      const key = dayKey(entry.timestamp);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(entry);
    });

    return Object.entries(grouped)
      .sort(([a], [b]) => new Date(b) - new Date(a))
      .map(([key, items]) => ({
        key,
        date: new Date(key),
        items: items.sort((a, b) => b.timestamp - a.timestamp),
      }));
  }, [filteredActivities, filteredReminders]);

  const timelineItemCount = useMemo(
    () => groupedTimeline.reduce((total, group) => total + group.items.length, 0),
    [groupedTimeline],
  );

  const activitiesByDay = useMemo(() => {
    const map = new Map();
    filteredActivities.forEach((activity) => {
      const key = dayKey(activity.timestamp);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(activity);
    });
    return map;
  }, [filteredActivities]);

  const remindersByDay = useMemo(() => {
    const map = new Map();
    filteredReminders.forEach((reminder) => {
      if (!reminder.reminder_date) return;
      const date = parseDateSafe(reminder.reminder_date);
      const key = dayKey(date);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(reminder);
    });
    return map;
  }, [filteredReminders]);

  const monthCells = useMemo(() => monthGrid(currentMonth, true), [currentMonth]);

  const maxCalendarDayCount = useMemo(() => (
    monthCells.reduce((maxCount, day) => {
      const key = dayKey(day);
      const count = (activitiesByDay.get(key)?.length || 0) + (remindersByDay.get(key)?.length || 0);
      return Math.max(maxCount, count);
    }, 0)
  ), [activitiesByDay, monthCells, remindersByDay]);

  const stats = useMemo(() => {
    const typeCounts = {
      note: 0,
      flashcard: 0,
      quiz: 0,
      chat: 0,
    };

    filteredActivities.forEach((activity) => {
      if (typeCounts[activity.type] !== undefined) typeCounts[activity.type] += 1;
    });

    const streakSet = new Set(filteredActivities.map((item) => dayKey(item.timestamp)));
    let streak = 0;
    if (streakSet.size) {
      let cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      if (!streakSet.has(dayKey(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
      }
      while (streakSet.has(dayKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
    }

    return {
      total: filteredActivities.length,
      reminders: filteredReminders.length,
      streak,
      ...typeCounts,
    };
  }, [filteredActivities, filteredReminders.length]);

  const calendarDayPayload = useMemo(() => {
    if (!activeDay) return null;
    const key = dayKey(activeDay);
    return {
      date: activeDay,
      activities: activitiesByDay.get(key) || [],
      reminders: remindersByDay.get(key) || [],
    };
  }, [activeDay, activitiesByDay, remindersByDay]);

  const toggleFilter = (type) => {
    setSelectedFilters((prev) => {
      if (prev.includes(type)) {
        const next = prev.filter((item) => item !== type);
        return next.length ? next : [...ACTIVITY_TYPES];
      }
      return [...prev, type];
    });
  };

  const setSmartList = (smartList) => {
    setSelectedListId(null);
    setSelectedSmartList(smartList);
  };

  const setCustomList = (listId) => {
    setSelectedListId(listId);
    setSelectedSmartList('list');
  };

  const switchViewMode = (nextMode) => {
    if (nextMode === viewMode) return;
    setViewMode(nextMode);
  };

  const refreshAll = async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([
        loadActivities(),
        loadReminderLists(),
        loadReminders(selectedSmartList, selectedListId),
      ]);
    } catch (e) {
      setError('Refresh failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const exportData = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      user: userName,
      filters: selectedFilters,
      search: searchQuery,
      activities: filteredActivities.map((activity) => ({
        type: activity.type,
        title: activity.title,
        content: activity.content,
        timestamp: activity.timestamp.toISOString(),
      })),
      reminders: filteredReminders.map((reminder) => ({
        title: reminder.title,
        description: reminder.description,
        reminder_date: reminder.reminder_date,
        priority: reminder.priority,
        is_completed: reminder.is_completed,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-timeline-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openReminderCreate = () => {
    setEditingReminder(null);
    setReminderForm(emptyReminderForm(selectedListId));
    setShowReminderModal(true);
  };

  const openReminderEdit = (reminder) => {
    setEditingReminder(reminder);
    setReminderForm({
      title: reminder.title || '',
      description: reminder.description || '',
      reminder_date: toDatetimeLocal(reminder.reminder_date),
      priority: reminder.priority || 'none',
      color: reminder.color || DEFAULT_ACCENT_COLOR,
      is_flagged: Boolean(reminder.is_flagged),
      url: reminder.url || '',
      list_id: reminder.list_id || null,
    });
    setShowReminderModal(true);
  };

  const persistReminder = async () => {
    const title = reminderForm.title.trim();
    if (!title) return;

    const formData = new FormData();
    formData.append('user_id', userName);
    formData.append('title', title);
    formData.append('description', reminderForm.description || '');
    formData.append('priority', reminderForm.priority || 'none');
    formData.append('color', reminderForm.color || DEFAULT_ACCENT_COLOR);
    formData.append('is_flagged', reminderForm.is_flagged ? 'true' : 'false');
    formData.append('url', reminderForm.url || '');
    if (reminderForm.reminder_date) formData.append('reminder_date', reminderForm.reminder_date);
    formData.append('timezone_offset', String(new Date().getTimezoneOffset()));
    formData.append('user_timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    if (reminderForm.list_id) formData.append('list_id', String(reminderForm.list_id));

    try {
      const url = editingReminder
        ? `${API_URL}/update_reminder/${editingReminder.id}`
        : `${API_URL}/create_reminder`;
      const method = editingReminder ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: authHeaders,
        body: formData,
      });

      if (!res.ok) throw new Error('Reminder save failed');

      await Promise.all([
        loadReminders(selectedSmartList, selectedListId),
        loadReminderLists(),
      ]);
      setError('');
      setShowReminderModal(false);
      setEditingReminder(null);
      setReminderForm(emptyReminderForm(selectedListId));
      refreshNotifications();
    } catch (e) {
      setError('Could not save reminder.');
    }
  };

  const toggleReminderComplete = async (reminder) => {
    const formData = new FormData();
    formData.append('is_completed', reminder.is_completed ? 'false' : 'true');
    try {
      const res = await fetch(`${API_URL}/update_reminder/${reminder.id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: formData,
      });
      if (!res.ok) throw new Error('Toggle failed');
      await Promise.all([
        loadReminders(selectedSmartList, selectedListId),
        loadReminderLists(),
      ]);
      setError('');
    } catch (e) {
      setError('Could not update reminder status.');
    }
  };

  const toggleReminderFlag = async (reminder) => {
    try {
      const res = await fetch(`${API_URL}/toggle_reminder_flag/${reminder.id}`, {
        method: 'PUT',
        headers: authHeaders,
      });
      if (!res.ok) throw new Error('Flag toggle failed');
      await Promise.all([
        loadReminders(selectedSmartList, selectedListId),
        loadReminderLists(),
      ]);
      setError('');
    } catch (e) {
      setError('Could not toggle reminder flag.');
    }
  };

  const removeReminder = async (reminderId) => {
    if (!window.confirm('Delete this reminder?')) return;
    try {
      const res = await fetch(`${API_URL}/delete_reminder/${reminderId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!res.ok) throw new Error('Delete failed');
      await Promise.all([
        loadReminders(selectedSmartList, selectedListId),
        loadReminderLists(),
      ]);
      setError('');
    } catch (e) {
      setError('Could not delete reminder.');
    }
  };

  const openActivity = (activity) => {
    if (activity.type === 'note' && activity.data?.id) {
      navigate(`/notes/editor/${activity.data.id}`);
      return;
    }
    if (activity.type === 'chat' && activity.data?.id) {
      navigate(`/ai-chat/${activity.data.id}`);
      return;
    }
    if (activity.type === 'flashcard') {
      navigate('/flashcards');
      return;
    }
    if (activity.type === 'quiz') {
      navigate('/quiz-hub');
    }
  };

  const openTimelineEntry = (entry) => {
    if (entry.entryKind === 'reminder') {
      openReminderEdit(entry.data);
      return;
    }
    openActivity(entry);
  };

  const renderTimeline = () => {
    if (!groupedTimeline.length) {
      return (
        <div className="atl-empty">
          <Clock size={36} />
          <h3>No activity found</h3>
          <p>Try broadening your filters or search.</p>
        </div>
      );
    }

    return (
      <section className="atl-panel">
        <div className="atl-panel-head">
          <div>
            <p className="atl-eyebrow">Learning ledger</p>
            <h2>Your work, in sequence</h2>
          </div>
          <span className="atl-panel-index">{String(timelineItemCount).padStart(2, '0')} entries</span>
        </div>

        <div className="atl-timeline-groups">
          {groupedTimeline.map((group) => (
            <article key={group.key} className="atl-time-group">
              <div className="atl-time-group-date">
                <CalendarDays size={14} />
                <span>{group.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>

              <div className="atl-time-group-items">
                {group.items.map((activity) => {
                  const meta = TYPE_META[activity.type] || TYPE_META.note;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={activity.id}
                      className="atl-activity-card"
                      type="button"
                      onClick={() => openTimelineEntry(activity)}
                      style={{ '--atl-entry-color': meta.color }}
                    >
                      <span className="atl-activity-time">
                        {activity.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="atl-activity-icon">
                        <Icon size={14} />
                      </span>
                      <div className="atl-activity-copy">
                        <div className="atl-activity-topline">
                          <h4>{activity.title}</h4>
                          <ArrowUpRight size={15} />
                        </div>
                        {activity.content && <p>{activity.content}</p>}
                        <span className="atl-type-chip">
                          {meta.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  };

  const renderCalendar = () => {
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
      <section className="atl-panel">
        <div className="atl-panel-head atl-panel-head--calendar">
          <div>
            <p className="atl-eyebrow">Calendar</p>
            <h2>Month Overview</h2>
          </div>
          <div className="atl-month-nav">
            <button className="atl-btn atl-btn--ghost atl-today-btn" type="button" onClick={() => setCurrentMonth(new Date())}>
              Today
            </button>
            <button
              className="atl-btn atl-btn--ghost"
              type="button"
              onClick={() => {
                const next = new Date(currentMonth);
                next.setMonth(currentMonth.getMonth() - 1);
                setCurrentMonth(next);
              }}
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <strong>{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
            <button
              className="atl-btn atl-btn--ghost"
              type="button"
              onClick={() => {
                const next = new Date(currentMonth);
                next.setMonth(currentMonth.getMonth() + 1);
                setCurrentMonth(next);
              }}
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="atl-calendar-grid atl-calendar-grid--weekdays">
          {weekdays.map((weekday) => <div key={weekday}>{weekday}</div>)}
        </div>

        <div className="atl-calendar-grid atl-calendar-grid--days">
          {monthCells.map((day) => {
            const key = dayKey(day);
            const dayActivities = activitiesByDay.get(key) || [];
            const dayReminders = remindersByDay.get(key) || [];
            const count = dayActivities.length + dayReminders.length;
            const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
            const isToday = isSameDay(day, new Date());
            const activityTypes = ACTIVITY_TYPES.filter((type) => dayActivities.some((activity) => activity.type === type));
            const hasReminders = dayReminders.length > 0;
            const density = maxCalendarDayCount ? count / maxCalendarDayCount : 0;
            const densityLevel = count === 0 ? 'empty' : count >= maxCalendarDayCount ? 'high' : count >= Math.ceil(maxCalendarDayCount * 0.5) ? 'medium' : 'low';

            return (
              <button
                key={`${key}-${isCurrentMonth ? 'in' : 'out'}`}
                className={`atl-day-cell ${isCurrentMonth ? '' : 'atl-day-cell--muted'} ${isToday ? 'atl-day-cell--today' : ''} atl-day-cell--density-${densityLevel}`}
                style={{ '--atl-day-density': density }}
                type="button"
                onClick={() => {
                  setActiveDay(day);
                  setShowDayModal(true);
                }}
              >
                <div className="atl-day-cell-head">
                  <span>{day.getDate()}</span>
                  {count > 0 && <em>{count}</em>}
                </div>
                <div className="atl-day-density" aria-hidden="true">
                  <span />
                </div>
                {(activityTypes.length > 0 || hasReminders) && (
                  <div className="atl-day-signals" aria-label={`${count} item${count === 1 ? '' : 's'} on this day`}>
                    {activityTypes.map((type) => (
                      <i
                        key={type}
                        style={{ '--atl-signal-color': TYPE_META[type]?.color || DEFAULT_ACCENT_COLOR }}
                        title={TYPE_META[type]?.label || type}
                      />
                    ))}
                    {hasReminders && <i className="atl-day-signal--reminder" title="Reminders" />}
                  </div>
                )}
                <div className="atl-day-cell-preview">
                  {dayReminders.slice(0, 1).map((item) => (
                    <span key={`r-${item.id}`} className="atl-preview-pill atl-preview-pill--reminder">{item.title}</span>
                  ))}
                  {dayActivities.slice(0, 1).map((item) => (
                    <span key={item.id} className="atl-preview-pill atl-preview-pill--activity">{item.title}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  const renderReminders = () => (
    <section className="atl-panel">
      <div className="atl-panel-head">
        <div>
          <p className="atl-eyebrow">Reminders</p>
          <h2>Task and Reminder Board</h2>
        </div>
        <button className="atl-btn atl-btn--primary" type="button" onClick={openReminderCreate}>
          <Plus size={15} />
          <span>New Reminder</span>
        </button>
      </div>

      <div className="atl-chip-row atl-chip-row--stack">
        {['today', 'scheduled', 'flagged', 'all', 'completed'].map((smartKey) => (
          <button
            key={smartKey}
            className={`atl-chip ${selectedSmartList === smartKey && !selectedListId ? 'active' : ''}`}
            type="button"
            onClick={() => setSmartList(smartKey)}
          >
            {smartKey}
            <em>{smartListCounts?.[smartKey] || 0}</em>
          </button>
        ))}
      </div>

      {reminderLists.length > 0 && (
        <div className="atl-chip-row">
          {reminderLists.map((list) => (
            <button
              key={list.id}
              className={`atl-chip ${selectedListId === list.id ? 'active' : ''}`}
              type="button"
              onClick={() => setCustomList(list.id)}
            >
              {list.name}
              <em>{list.reminder_count || 0}</em>
            </button>
          ))}
        </div>
      )}

      <div className="atl-reminder-list">
        {filteredReminders.length === 0 ? (
          <div className="atl-empty">
            <Bell size={36} />
            <h3>No reminders</h3>
            <p>Create one to get started.</p>
          </div>
        ) : (
          filteredReminders.map((reminder) => {
            const safeUrl = sanitizeUrl(reminder.url || '');
            return (
              <article key={reminder.id} className="atl-reminder-card" style={{ '--atl-reminder-color': reminder.color || DEFAULT_ACCENT_COLOR }}>
                <button className="atl-icon-btn" type="button" aria-label={reminder.is_completed ? 'Mark reminder incomplete' : 'Mark reminder complete'} onClick={() => toggleReminderComplete(reminder)}>
                {reminder.is_completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </button>

                <div className="atl-reminder-copy">
                  <div className="atl-reminder-head">
                    <h4 className={reminder.is_completed ? 'done' : ''}>{reminder.title}</h4>
                    <span>{PRIORITY_LABELS[reminder.priority] || 'None'} priority</span>
                  </div>
                  {reminder.description && <p>{reminder.description}</p>}
                  <div className="atl-reminder-meta">
                    {reminder.reminder_date && (
                      <span><Clock size={12} /> {new Date(reminder.reminder_date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                    {safeUrl && (
                      <a href={safeUrl} target="_blank" rel="noopener noreferrer">
                        <LinkIcon size={12} /> link
                      </a>
                    )}
                  </div>
                </div>

                <div className="atl-reminder-actions">
                  <button className="atl-icon-btn" type="button" aria-label={reminder.is_flagged ? 'Unflag reminder' : 'Flag reminder'} onClick={() => toggleReminderFlag(reminder)}>
                    <Flag size={15} fill={reminder.is_flagged ? 'currentColor' : 'none'} />
                  </button>
                  <button className="atl-icon-btn" type="button" aria-label="Edit reminder" onClick={() => openReminderEdit(reminder)}>
                    <Edit3 size={15} />
                  </button>
                  <button className="atl-icon-btn danger" type="button" aria-label="Delete reminder" onClick={() => removeReminder(reminder.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );

  return (
    <div className="atl-page">
      <div className="atl-qb-topbar">
        <div className="atl-qb-tagline"><span>Learning,</span> unified</div>
        <div className="atl-qb-topbar-right">
          <button className="atl-qb-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>
            Dashboard
          </button>
          <button className="atl-qb-top-btn" type="button" onClick={refreshAll}>
            <RefreshCw size={13} /> Refresh
          </button>
          <button className="atl-qb-top-btn" type="button" onClick={exportData}>
            Export
          </button>
          <button className="atl-qb-top-btn" type="button" onClick={() => setSidebarCollapsed(prev => !prev)}>
            {sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
          </button>
          <button className="atl-qb-top-btn atl-qb-top-btn--accent" type="button" onClick={openReminderCreate}>
            New Reminder
          </button>
        </div>
      </div>

      <div className="atl-layout atl-qb-body">
        <div className={`atl-qb-shell ${sidebarCollapsed ? 'atl-qb-shell--collapsed' : ''}`}>
          <aside className={`atl-qb-sidebar ${sidebarCollapsed ? 'atl-qb-sidebar--collapsed' : ''}`} aria-label="Activity timeline navigation">
            <div className="atl-material-texture" aria-hidden="true" />
            {sidebarCollapsed ? (
              <div className="atl-qb-collapsed-strip">
                <button className="atl-qb-strip-btn" data-tip="Open sidebar" onClick={() => setSidebarCollapsed(false)} type="button">
                  <ChevronRight size={18} />
                </button>
                <button className="atl-qb-strip-btn" data-tip="New Reminder" onClick={openReminderCreate} type="button">
                  <Plus size={18} />
                </button>

                <div className="atl-qb-strip-divider"></div>

                <button
                  className={`atl-qb-strip-btn ${viewMode === 'timeline' ? 'active' : ''}`}
                  data-tip="Timeline"
                  onClick={() => switchViewMode('timeline')}
                  type="button"
                >
                  <Sparkles size={18} />
                </button>
                <button
                  className={`atl-qb-strip-btn ${viewMode === 'calendar' ? 'active' : ''}`}
                  data-tip="Calendar"
                  onClick={() => switchViewMode('calendar')}
                  type="button"
                >
                  <CalendarDays size={18} />
                </button>
                <button
                  className={`atl-qb-strip-btn ${viewMode === 'reminders' ? 'active' : ''}`}
                  data-tip="Reminders"
                  onClick={() => switchViewMode('reminders')}
                  type="button"
                >
                  <Bell size={18} />
                </button>

                <div className="atl-qb-strip-spacer"></div>

                <button className="atl-qb-strip-btn" data-tip="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} type="button">
                  <ListChecks size={18} />
                </button>
                <button
                  className="atl-qb-strip-btn"
                  data-tip="Logout"
                  type="button"
                  onClick={() => {
                    void signOutAppSession();
                    localStorage.removeItem('token');
                    localStorage.removeItem('username');
                    navigate('/');
                  }}
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <>
                <div className="atl-qb-side-brand">
                  <div className="atl-qb-brand-wrap">
                    <div className="atl-qb-brand">cerbyl</div>
                    <div className="atl-qb-current-title">Activity timeline</div>
                  </div>
                  <button
                    className="atl-qb-side-close-btn"
                    type="button"
                    title="Collapse sidebar"
                    aria-label="Collapse activity timeline sidebar"
                    onClick={() => setSidebarCollapsed(true)}
                  >
                    <ChevronLeft size={14} />
                  </button>
                </div>

                <button className="atl-qb-new-reminder-btn" type="button" onClick={openReminderCreate}>
                  <Plus size={16} />
                  <span>New Reminder</span>
                </button>

                <div className="atl-qb-side-block">
                  <div className="atl-qb-side-label">Modes</div>
                  <nav className="atl-qb-view-nav" aria-label="Activity timeline modes">
                    <button className={`atl-qb-view-link ${viewMode === 'timeline' ? 'atl-qb-view-link--active' : ''}`} type="button" onClick={() => switchViewMode('timeline')}>
                      <Sparkles size={16} />
                      <span>Timeline</span>
                      <span className="atl-qb-nav-count">{timelineItemCount}</span>
                    </button>
                    <button className={`atl-qb-view-link ${viewMode === 'calendar' ? 'atl-qb-view-link--active' : ''}`} type="button" onClick={() => switchViewMode('calendar')}>
                      <CalendarDays size={16} />
                      <span>Calendar</span>
                      <span className="atl-qb-nav-count">{activitiesByDay.size}</span>
                    </button>
                    <button className={`atl-qb-view-link ${viewMode === 'reminders' ? 'atl-qb-view-link--active' : ''}`} type="button" onClick={() => switchViewMode('reminders')}>
                      <Bell size={16} />
                      <span>Reminders</span>
                      <span className="atl-qb-nav-count">{filteredReminders.length}</span>
                    </button>
                  </nav>
                </div>

                <div className="atl-qb-side-block atl-qb-side-block--grow">
                  <div className="atl-qb-side-label">Activity Filters</div>
                  <nav className="atl-qb-view-nav" aria-label="Activity filters">
                    {ACTIVITY_TYPES.map((type) => {
                      const meta = TYPE_META[type];
                      const Icon = meta.icon;
                      return (
                        <button
                          key={type}
                          className={`atl-qb-view-link ${selectedFilters.includes(type) ? 'atl-qb-view-link--active' : ''}`}
                          type="button"
                          onClick={() => toggleFilter(type)}
                        >
                          <Icon size={16} style={{ color: meta.color }} />
                          <span>{meta.label}</span>
                          <span className="atl-qb-nav-count">{stats[type]}</span>
                        </button>
                      );
                    })}
                  </nav>
                </div>

                <div className="atl-qb-side-block">
                  <div className="atl-qb-side-label">Reminder Lists</div>
                  <nav className="atl-qb-view-nav" aria-label="Reminder smart lists">
                    {['today', 'scheduled', 'flagged', 'all', 'completed'].map((smartKey) => (
                      <button
                        key={smartKey}
                        className={`atl-qb-view-link ${selectedSmartList === smartKey && !selectedListId ? 'atl-qb-view-link--active' : ''}`}
                        type="button"
                        onClick={() => {
                          setSmartList(smartKey);
                          switchViewMode('reminders');
                        }}
                      >
                        <Bell size={16} />
                        <span>{smartKey}</span>
                        <span className="atl-qb-nav-count">{smartListCounts?.[smartKey] || 0}</span>
                      </button>
                    ))}
                  </nav>
                </div>

                <div className="atl-qb-side-block">
                  <div className="atl-qb-side-label">Quick Stats</div>
                  <div className="atl-qb-stat-grid">
                    <div className="atl-qb-stat-card">
                      <span>{stats.total}</span>
                      <small>Activities</small>
                    </div>
                    <div className="atl-qb-stat-card">
                      <span>{stats.reminders}</span>
                      <small>Reminders</small>
                    </div>
                    <div className="atl-qb-stat-card">
                      <span>{stats.streak}</span>
                      <small>Streak</small>
                    </div>
                    <div className="atl-qb-stat-card">
                      <span>{activitiesByDay.size}</span>
                      <small>Days</small>
                    </div>
                  </div>
                </div>

                <div className="atl-qb-side-actions">
                  <button className="atl-qb-action-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>
                    <ListChecks size={14} />
                    <span>Dashboard</span>
                  </button>
                  <button
                    className="atl-qb-action-btn"
                    type="button"
                    onClick={() => {
                      void signOutAppSession();
                      localStorage.removeItem('token');
                      localStorage.removeItem('username');
                      navigate('/');
                    }}
                  >
                    <LogOut size={14} />
                    <span>Logout</span>
                  </button>
                </div>
              </>
            )}
          </aside>

          <main className="atl-main atl-qb-main">
            <div className="atl-material-texture" aria-hidden="true" />
            <section className="atl-command-bar">
              <div className="atl-command-copy">
                <p className="atl-eyebrow">Your learning record</p>
                <h1>Activity Timeline</h1>
                <p>Trace what you studied, return to unfinished work, and place reminders where they belong in time.</p>
              </div>
              <div className="atl-command-stats" aria-label="Timeline summary">
                <div>
                  <span><Flame size={14} /> Current streak</span>
                  <strong>{stats.streak}<small> {stats.streak === 1 ? 'day' : 'days'}</small></strong>
                </div>
                <div>
                  <span><CalendarClock size={14} /> Active days</span>
                  <strong>{activitiesByDay.size}</strong>
                </div>
                <div>
                  <span><Bell size={14} /> Reminders</span>
                  <strong>{stats.reminders}</strong>
                </div>
              </div>
            </section>

            <nav className="atl-mobile-modes" aria-label="Activity timeline mobile modes">
              {[
                ['timeline', Sparkles, 'Timeline'],
                ['calendar', CalendarDays, 'Calendar'],
                ['reminders', Bell, 'Reminders'],
              ].map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  className={viewMode === mode ? 'active' : ''}
                  type="button"
                  onClick={() => switchViewMode(mode)}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            <section className="atl-toolbar">
              <div className="atl-search">
                <Search size={15} />
                <input
                  ref={searchInputRef}
                  type="text"
                  aria-label="Search activities and reminders"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search activities and reminders"
                />
                {searchQuery ? (
                  <button type="button" aria-label="Clear search" onClick={() => setSearchQuery('')}><X size={14} /></button>
                ) : <kbd>/</kbd>}
              </div>
              <div className="atl-range-control" aria-label="Timeline date range">
                {[
                  ['7', '7 days'],
                  ['30', '30 days'],
                  ['all', 'All time'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={dateRange === value ? 'active' : ''}
                    onClick={() => setDateRange(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="atl-toolbar-meta">
                <span><Filter size={14} /> {selectedFilters.length}/{ACTIVITY_TYPES.length}</span>
                <span><BarChart3 size={14} /> {timelineItemCount}</span>
              </div>
            </section>

            {error && <div className="atl-error">{error}</div>}

            {loading ? (
              <div className="atl-loading">Loading timeline...</div>
            ) : (
              <div key={viewMode} className="atl-view-shell">
                {viewMode === 'timeline' && renderTimeline()}
                {viewMode === 'calendar' && renderCalendar()}
                {viewMode === 'reminders' && renderReminders()}
              </div>
            )}
          </main>
        </div>
      </div>

      {showDayModal && calendarDayPayload && (
        <div className="atl-modal-overlay" onClick={() => setShowDayModal(false)}>
          <div className="atl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="atl-modal-head">
              <h3>{calendarDayPayload.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h3>
              <button className="atl-icon-btn" type="button" aria-label="Close day details" onClick={() => setShowDayModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="atl-modal-body">
              <section>
                <h4>Reminders ({calendarDayPayload.reminders.length})</h4>
                {calendarDayPayload.reminders.length === 0 ? (
                  <p className="atl-muted">No reminders for this day.</p>
                ) : (
                  <ul className="atl-modal-list">
                    {calendarDayPayload.reminders.map((reminder) => (
                      <li key={`modal-r-${reminder.id}`}>
                        <button className="atl-inline-link" type="button" onClick={() => {
                          setShowDayModal(false);
                          openReminderEdit(reminder);
                        }}>
                          {reminder.title}
                        </button>
                        {reminder.reminder_date && (
                          <span>{new Date(reminder.reminder_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h4>Activities ({calendarDayPayload.activities.length})</h4>
                {calendarDayPayload.activities.length === 0 ? (
                  <p className="atl-muted">No activities for this day.</p>
                ) : (
                  <ul className="atl-modal-list">
                    {calendarDayPayload.activities.map((activity) => (
                      <li key={`modal-a-${activity.id}`}>
                        <button className="atl-inline-link" type="button" onClick={() => openActivity(activity)}>
                          {activity.title}
                        </button>
                        <span>{TYPE_META[activity.type]?.label || activity.type}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {showReminderModal && (
        <div className="atl-modal-overlay" onClick={() => setShowReminderModal(false)}>
          <div className="atl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="atl-modal-head">
              <h3>{editingReminder ? 'Edit Reminder' : 'Create Reminder'}</h3>
              <button className="atl-icon-btn" type="button" aria-label="Close reminder editor" onClick={() => setShowReminderModal(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="atl-modal-body atl-form-grid">
              <label>
                Title
                <input
                  type="text"
                  value={reminderForm.title}
                  onChange={(e) => setReminderForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Reminder title"
                />
              </label>

              <label>
                Description
                <textarea
                  value={reminderForm.description}
                  onChange={(e) => setReminderForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="Description"
                />
              </label>

              <label>
                Date & Time
                <input
                  type="datetime-local"
                  value={reminderForm.reminder_date}
                  onChange={(e) => setReminderForm((prev) => ({ ...prev, reminder_date: e.target.value }))}
                />
              </label>

              <label>
                Priority
                <select
                  value={reminderForm.priority}
                  onChange={(e) => setReminderForm((prev) => ({ ...prev, priority: e.target.value }))}
                >
                  <option value="none">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>

              <label>
                URL
                <input
                  type="url"
                  value={reminderForm.url}
                  onChange={(e) => setReminderForm((prev) => ({ ...prev, url: e.target.value }))}
                  placeholder="https://..."
                />
              </label>

              <label>
                List
                <select
                  value={reminderForm.list_id || ''}
                  onChange={(e) => setReminderForm((prev) => ({
                    ...prev,
                    list_id: e.target.value ? Number(e.target.value) : null,
                  }))}
                >
                  <option value="">No list</option>
                  {reminderLists.map((list) => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
              </label>

              <div>
                <span className="atl-form-label">Color</span>
                <div className="atl-color-row">
                  {REMINDER_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`atl-color-dot ${reminderForm.color === color ? 'active' : ''}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setReminderForm((prev) => ({ ...prev, color }))}
                      type="button"
                    />
                  ))}
                </div>
              </div>

              <label className="atl-flag-label">
                <input
                  type="checkbox"
                  checked={reminderForm.is_flagged}
                  onChange={(e) => setReminderForm((prev) => ({ ...prev, is_flagged: e.target.checked }))}
                />
                <Flag size={14} />
                Flag reminder
              </label>

              <div className="atl-form-actions">
                <button className="atl-btn atl-btn--ghost" type="button" onClick={() => setShowReminderModal(false)}>
                  Cancel
                </button>
                <button className="atl-btn atl-btn--primary" type="button" onClick={persistReminder}>
                  {editingReminder ? 'Save' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityTimeline;
