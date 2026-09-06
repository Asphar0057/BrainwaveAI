import ToolNavigation from '../components/ToolNavigation';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  Users,
  Activity,
  Zap,
  Database,
  Timer,
  AlertTriangle,
  Shield,
  ArrowLeft
} from 'lucide-react';
import './AdminAnalytics.css';
import { API_URL } from '../config';

const ADMIN_EMAILS = ['aditya.s.lanka@gmail.com', 'asphar057@gmail.com'];

const formatNumber = (value) => {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString();
};

const formatPercent = (value) => {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(1)}%`;
};

const formatSeconds = (value) => {
  if (!Number.isFinite(value)) return '0s';
  if (value >= 1) return `${value.toFixed(2)}s`;
  return `${(value * 1000).toFixed(0)}ms`;
};

const formatHourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`;

const formatDecimal = (value, decimals = 2) => {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toFixed(decimals);
};

const csvEscape = (value) => {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
};

const downloadCsv = (filename, columns, rows) => {
  const header = columns.map((col) => csvEscape(col.label)).join(',');
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const value = typeof col.value === 'function' ? col.value(row) : row[col.key];
        return csvEscape(value);
      })
      .join(',')
  );
  const csv = [header, ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(link);
};

const AdminAnalytics = () => {
  const navigate = useNavigate();

  let userEmail = localStorage.getItem('username');
  try {
    const profile = JSON.parse(localStorage.getItem('userProfile') || '{}');
    if (profile.email) {
      userEmail = profile.email;
    }
  } catch (e) {
    // silenced
  }

  useEffect(() => {
    if (!ADMIN_EMAILS.includes(userEmail)) {
      navigate('/dashboard');
    }
  }, [userEmail, navigate]);

  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [userDetail, setUserDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(30);
  const [trendMetric, setTrendMetric] = useState('ai_tokens');
  const [toolView, setToolView] = useState('ai');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSection, setActiveSection] = useState('all');
  const [toolSearchTerm, setToolSearchTerm] = useState('');
  const [toolMinRequests, setToolMinRequests] = useState(0);
  const [toolSort, setToolSort] = useState('ai_tokens');
  const [userMinAiTokens, setUserMinAiTokens] = useState(0);
  const [userMinTotalTokens, setUserMinTotalTokens] = useState(0);
  const [userOnlyActive, setUserOnlyActive] = useState(false);
  const [userSort, setUserSort] = useState('ai_tokens');
  const [dailyMinRequests, setDailyMinRequests] = useState(0);
  const [dailyMinErrors, setDailyMinErrors] = useState(0);
  const [tokenSourceMinCount, setTokenSourceMinCount] = useState(0);
  const [errorMinRate, setErrorMinRate] = useState(0);
  const [activitySearch, setActivitySearch] = useState('');
  const [activityOnlyAI, setActivityOnlyAI] = useState(false);
  const [activityErrorsOnly, setActivityErrorsOnly] = useState(false);
  const [activityMinTokens, setActivityMinTokens] = useState(0);
  const [endpointSearch, setEndpointSearch] = useState('');
  const [endpointMinRequests, setEndpointMinRequests] = useState(0);
  const [endpointSort, setEndpointSort] = useState('requests');
  const [providerMinRequests, setProviderMinRequests] = useState(0);
  const [actionMinCount, setActionMinCount] = useState(0);
  const [statusMinCount, setStatusMinCount] = useState(0);
  const [hourlyMinRequests, setHourlyMinRequests] = useState(0);

  useEffect(() => {
    if (ADMIN_EMAILS.includes(userEmail)) {
      loadOverview();
      loadUsers();

      const interval = setInterval(() => {
        loadOverview();
        loadUsers();
      }, 30000);

      return () => clearInterval(interval);
    }
  }, [dateRange, userEmail]);

  const loadOverview = async () => {
    try {
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('user_id') || localStorage.getItem('username');

      const response = await fetch(`${API_URL}/admin/analytics/overview?days=${dateRange}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-User-Id': userId,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setOverview(data);
      }
    } catch (error) {
      console.error('Error loading overview:', error);
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('user_id') || localStorage.getItem('username');

      const response = await fetch(`${API_URL}/admin/analytics/users?days=${dateRange}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-User-Id': userId,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserDetail = async (userId) => {
    try {
      const token = localStorage.getItem('token');
      const myUserId = localStorage.getItem('user_id') || localStorage.getItem('username');

      const response = await fetch(`${API_URL}/admin/analytics/user/${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-User-Id': myUserId,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserDetail(data);
      }
    } catch (error) {
      console.error('Error loading user detail:', error);
    }
  };

  const downloadAllCSV = async () => {
    try {
      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('user_id') || localStorage.getItem('username');

      const response = await fetch(`${API_URL}/admin/analytics/export/csv?days=${dateRange}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-User-Id': userId,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics_export_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading CSV:', error);
    }
  };

  const downloadUserCSV = async (userId, username) => {
    try {
      const token = localStorage.getItem('token');
      const myUserId = localStorage.getItem('user_id') || localStorage.getItem('username');

      const response = await fetch(`${API_URL}/admin/analytics/export/user/${userId}/csv`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-User-Id': myUserId,
        },
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user_${username}_analytics_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading user CSV:', error);
    }
  };

  const dailyUsage = useMemo(() => {
    const data = overview?.daily_usage || [];
    return [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [overview]);

  const dailyReport = useMemo(() => {
    return dailyUsage
      .map((day) => {
        const requests = day.requests || 0;
        const aiRequests = day.ai_requests || 0;
        const errors = day.errors || 0;
        return {
          ...day,
          error_rate: requests ? (errors / requests) * 100 : 0,
          ai_request_share: requests ? (aiRequests / requests) * 100 : 0,
          avg_tokens: requests ? day.total_tokens / requests : 0,
          avg_ai_tokens: aiRequests ? day.ai_tokens / aiRequests : 0,
        };
      })
      .filter((day) => (day.requests || 0) >= dailyMinRequests && (day.errors || 0) >= dailyMinErrors);
  }, [dailyUsage, dailyMinRequests, dailyMinErrors]);

  const hourlyReport = useMemo(() => {
    const data = overview?.hourly_usage || [];
    return [...data]
      .map((hour) => {
        const requests = hour.requests || 0;
        const aiRequests = hour.ai_requests || 0;
        const errors = hour.errors || 0;
        return {
          ...hour,
          error_rate: requests ? (errors / requests) * 100 : 0,
          ai_request_share: requests ? (aiRequests / requests) * 100 : 0,
        };
      })
      .filter((hour) => (hour.requests || 0) >= (Number(hourlyMinRequests) || 0))
      .sort((a, b) => (a.hour || 0) - (b.hour || 0));
  }, [overview, hourlyMinRequests]);

  const statusBuckets = useMemo(() => {
    const buckets = overview?.status_bucket_breakdown || {};
    const total = Object.values(buckets).reduce((sum, value) => sum + (value || 0), 0) || 1;
    return Object.entries(buckets).map(([bucket, count]) => ({
      bucket,
      count,
      share: (count / total) * 100,
    }));
  }, [overview]);

  const statusCodeRows = useMemo(() => {
    const minCount = Number(statusMinCount) || 0;
    return (overview?.status_code_breakdown || [])
      .filter((row) => (row.count || 0) >= minCount)
      .sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [overview, statusMinCount]);

  const providerRows = useMemo(() => {
    const minCount = Number(providerMinRequests) || 0;
    return (overview?.provider_usage || [])
      .filter((row) => (row.usage_count || 0) >= minCount)
      .sort((a, b) => (b.ai_tokens || 0) - (a.ai_tokens || 0));
  }, [overview, providerMinRequests]);

  const actionRows = useMemo(() => {
    const minCount = Number(actionMinCount) || 0;
    return (overview?.action_usage || [])
      .filter((row) => (row.usage_count || 0) >= minCount)
      .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
  }, [overview, actionMinCount]);

  const endpointRows = useMemo(() => {
    const term = endpointSearch.trim().toLowerCase();
    const minCount = Number(endpointMinRequests) || 0;
    const filtered = (overview?.endpoint_usage || []).filter((row) => {
      const label = `${row.method || ''} ${row.endpoint || ''}`.toLowerCase();
      if (term && !label.includes(term)) return false;
      if ((row.usage_count || 0) < minCount) return false;
      return true;
    });
    const sorted = [...filtered];
    switch (endpointSort) {
      case 'ai_tokens':
        sorted.sort((a, b) => (b.ai_tokens || 0) - (a.ai_tokens || 0));
        break;
      case 'errors':
        sorted.sort((a, b) => (b.error_rate || 0) - (a.error_rate || 0));
        break;
      case 'latency':
        sorted.sort((a, b) => (b.avg_latency || 0) - (a.avg_latency || 0));
        break;
      case 'requests':
      default:
        sorted.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
        break;
    }
    return sorted;
  }, [overview, endpointSearch, endpointMinRequests, endpointSort]);

  const topUsers = overview?.top_users || [];
  const busiestHour = hourlyReport.reduce((max, hour) => {
    if (!max || (hour.requests || 0) > (max.requests || 0)) return hour;
    return max;
  }, null);
  const maxHourlyRequests = Math.max(...hourlyReport.map((hour) => hour.requests || 0), 1);
  const statusTotal = statusBuckets.reduce((sum, bucket) => sum + (bucket.count || 0), 0) || 1;

  const trendConfig = {
    ai_tokens: { label: 'AI Tokens', color: 'var(--aa-accent)' },
    total_tokens: { label: 'Total Tokens', color: 'var(--aa-accent-soft)' },
    requests: { label: 'Requests', color: 'var(--aa-warm)' },
    ai_requests: { label: 'AI Requests', color: 'var(--aa-warm-strong)' },
  };

  const trendValues = dailyUsage.map((item) => item[trendMetric] || 0);
  const maxTrendValue = Math.max(...trendValues, 1);

  const toolUsage = overview?.tool_usage || [];
  const displayedTools = toolView === 'ai'
    ? toolUsage.filter((tool) => (tool.ai_requests || tool.ai_tokens))
    : toolUsage;

  const filteredTools = useMemo(() => {
    const term = toolSearchTerm.trim().toLowerCase();
    const minRequests = Number(toolMinRequests) || 0;
    const filtered = displayedTools.filter((tool) => {
      if (term && !tool.tool_name.toLowerCase().includes(term)) return false;
      if ((tool.usage_count || 0) < minRequests) return false;
      return true;
    });

    const sorted = [...filtered];
    switch (toolSort) {
      case 'requests':
        sorted.sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
        break;
      case 'errors':
        sorted.sort((a, b) => (b.error_rate || 0) - (a.error_rate || 0));
        break;
      case 'latency':
        sorted.sort((a, b) => (b.avg_latency || 0) - (a.avg_latency || 0));
        break;
      case 'ai_tokens':
      default:
        sorted.sort((a, b) => (b.ai_tokens || 0) - (a.ai_tokens || 0));
        break;
    }
    return sorted;
  }, [displayedTools, toolSearchTerm, toolMinRequests, toolSort]);

  const tokenSourceRows = useMemo(() => {
    const entries = Object.entries(overview?.token_sources || {}).map(([source, count]) => ({
      source,
      count,
    }));
    return entries
      .filter((row) => row.count >= tokenSourceMinCount)
      .sort((a, b) => b.count - a.count);
  }, [overview, tokenSourceMinCount]);

  const errorTools = useMemo(() => {
    const minRate = (Number(errorMinRate) || 0) / 100;
    return toolUsage
      .map((tool) => ({
        ...tool,
        error_count: Math.round((tool.error_rate || 0) * (tool.usage_count || 0)),
      }))
      .filter((tool) => (tool.error_rate || 0) >= minRate)
      .sort((a, b) => (b.error_rate || 0) - (a.error_rate || 0));
  }, [toolUsage, errorMinRate]);

  const slowTools = useMemo(() => {
    return toolUsage
      .filter((tool) => (tool.avg_latency || 0) > 0)
      .sort((a, b) => (b.avg_latency || 0) - (a.avg_latency || 0))
      .slice(0, 8);
  }, [toolUsage]);

  const filteredUsers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const minAiTokens = Number(userMinAiTokens) || 0;
    const minTotalTokens = Number(userMinTotalTokens) || 0;
    const filtered = users.filter((user) => {
      if (term && !`${user.username} ${user.email}`.toLowerCase().includes(term)) return false;
      if ((user.ai_tokens || 0) < minAiTokens) return false;
      if ((user.total_tokens || 0) < minTotalTokens) return false;
      if (userOnlyActive && !user.last_activity) return false;
      return true;
    });

    const sorted = [...filtered];
    switch (userSort) {
      case 'total_tokens':
        sorted.sort((a, b) => (b.total_tokens || 0) - (a.total_tokens || 0));
        break;
      case 'last_activity':
        sorted.sort((a, b) => new Date(b.last_activity || 0) - new Date(a.last_activity || 0));
        break;
      case 'error_rate':
        sorted.sort((a, b) => (b.error_rate || 0) - (a.error_rate || 0));
        break;
      case 'ai_tokens':
      default:
        sorted.sort((a, b) => (b.ai_tokens || 0) - (a.ai_tokens || 0));
        break;
    }
    return sorted;
  }, [users, searchTerm, userMinAiTokens, userMinTotalTokens, userOnlyActive, userSort]);

  const filteredActivities = useMemo(() => {
    const term = activitySearch.trim().toLowerCase();
    return (userDetail?.activities || []).filter((activity) => {
      if (activityOnlyAI && !activity.is_ai) return false;
      if (activityErrorsOnly && !(activity.status_code && activity.status_code >= 400)) return false;
      if ((activity.tokens_used || 0) < (Number(activityMinTokens) || 0)) return false;
      if (
        term &&
        !`${activity.tool_name} ${activity.action} ${activity.model || ''} ${activity.endpoint || ''}`
          .toLowerCase()
          .includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [userDetail, activitySearch, activityOnlyAI, activityErrorsOnly, activityMinTokens]);

  if (!ADMIN_EMAILS.includes(userEmail)) {
    return null;
  }

  const sectionOptions = [
    { id: 'all', label: 'All' },
    { id: 'overview', label: 'Overview' },
    { id: 'trends', label: 'Trends' },
    { id: 'ai', label: 'AI & Tokens' },
    { id: 'reliability', label: 'Reliability' },
    { id: 'operations', label: 'Operations' },
    { id: 'tools', label: 'Tools' },
    { id: 'users', label: 'Users' },
  ];

  const isSectionVisible = (sectionId) => activeSection === 'all' || activeSection === sectionId;

  const totalRequests = overview?.total_requests || 0;
  const totalTokens = overview?.total_tokens || 0;
  const aiRequests = overview?.ai_requests || 0;
  const aiTotalTokens = overview?.ai_tokens || 0;
  const aiPromptTokens = overview?.ai_prompt_tokens || 0;
  const aiCompletionTokens = overview?.ai_completion_tokens || 0;
  const promptRatio = aiTotalTokens ? (aiPromptTokens / aiTotalTokens) * 100 : 0;
  const completionRatio = aiTotalTokens ? (aiCompletionTokens / aiTotalTokens) * 100 : 0;
  const activeUsers = overview?.active_users || 0;
  const errorRate = overview?.error_rate || 0;
  const aiErrorRate = overview?.ai_error_rate || 0;
  const errorCount = Math.round((errorRate / 100) * totalRequests);
  const aiErrorCount = Math.round((aiErrorRate / 100) * aiRequests);
  const tokensPerRequest = totalRequests ? totalTokens / totalRequests : 0;
  const aiTokensPerRequest = aiRequests ? aiTotalTokens / aiRequests : 0;
  const requestsPerActiveUser = activeUsers ? totalRequests / activeUsers : 0;
  const tokensPerActiveUser = activeUsers ? totalTokens / activeUsers : 0;
  const activeRate = overview?.total_users ? (activeUsers / overview.total_users) * 100 : 0;
  const aiRequestShare = totalRequests ? (aiRequests / totalRequests) * 100 : 0;

  const downloadDailyReport = () => {
    downloadCsv(
      `daily_report_${dateRange}d_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'Date', value: (row) => row.date },
        { label: 'Requests', value: (row) => row.requests },
        { label: 'AI Requests', value: (row) => row.ai_requests },
        { label: 'Errors', value: (row) => row.errors },
        { label: 'Error Rate (%)', value: (row) => formatDecimal(row.error_rate, 2) },
        { label: 'Total Tokens', value: (row) => row.total_tokens },
        { label: 'AI Tokens', value: (row) => row.ai_tokens },
        { label: 'Avg Tokens/Request', value: (row) => formatDecimal(row.avg_tokens, 2) },
        { label: 'Avg AI Tokens/Request', value: (row) => formatDecimal(row.avg_ai_tokens, 2) },
        { label: 'AI Request Share (%)', value: (row) => formatDecimal(row.ai_request_share, 2) },
      ],
      dailyReport
    );
  };

  const downloadToolReport = () => {
    downloadCsv(
      `tool_usage_${toolView}_${dateRange}d_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'Tool', value: (row) => row.tool_name },
        { label: 'Requests', value: (row) => row.usage_count },
        { label: 'AI Requests', value: (row) => row.ai_requests },
        { label: 'Total Tokens', value: (row) => row.total_tokens },
        { label: 'AI Tokens', value: (row) => row.ai_tokens },
        { label: 'Prompt Tokens', value: (row) => row.prompt_tokens },
        { label: 'Completion Tokens', value: (row) => row.completion_tokens },
        { label: 'Avg Tokens', value: (row) => formatDecimal(row.avg_tokens, 2) },
        { label: 'Avg Latency (s)', value: (row) => formatDecimal(row.avg_latency, 2) },
        { label: 'Error Rate (%)', value: (row) => formatDecimal((row.error_rate || 0) * 100, 2) },
        { label: 'Last Activity', value: (row) => row.last_activity || '' },
      ],
      filteredTools
    );
  };

  const downloadUserReport = () => {
    downloadCsv(
      `user_analytics_${dateRange}d_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'User ID', value: (row) => row.id },
        { label: 'Username', value: (row) => row.username },
        { label: 'Email', value: (row) => row.email },
        { label: 'AI Requests', value: (row) => row.ai_requests },
        { label: 'AI Tokens', value: (row) => row.ai_tokens },
        { label: 'Total Tokens', value: (row) => row.total_tokens },
        { label: 'Coverage (%)', value: (row) => formatDecimal(row.ai_token_coverage || 0, 1) },
        { label: 'Error Rate (%)', value: (row) => formatDecimal(row.error_rate || 0, 2) },
        { label: 'Avg Latency (s)', value: (row) => formatDecimal(row.avg_latency || 0, 2) },
        { label: 'Tools Used', value: (row) => row.tools_used || '' },
        { label: 'Last Activity', value: (row) => row.last_activity || '' },
      ],
      filteredUsers
    );
  };

  const downloadTokenSources = () => {
    downloadCsv(
      `token_sources_${dateRange}d_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'Token Source', value: (row) => row.source },
        { label: 'Count', value: (row) => row.count },
      ],
      tokenSourceRows
    );
  };

  const downloadModelUsage = () => {
    downloadCsv(
      `model_usage_${dateRange}d_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'Model', value: (row) => row.model },
        { label: 'Requests', value: (row) => row.requests },
        { label: 'Total Tokens', value: (row) => row.total_tokens },
        { label: 'Prompt Tokens', value: (row) => row.prompt_tokens || 0 },
        { label: 'Completion Tokens', value: (row) => row.completion_tokens || 0 },
      ],
      overview?.model_usage || []
    );
  };

  const downloadStatusCodes = () => {
    downloadCsv(
      `status_codes_${dateRange}d_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'Status Code', value: (row) => row.status_code },
        { label: 'Count', value: (row) => row.count },
      ],
      statusCodeRows
    );
  };

  const downloadStatusBuckets = () => {
    downloadCsv(
      `status_buckets_${dateRange}d_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'Bucket', value: (row) => row.bucket },
        { label: 'Count', value: (row) => row.count },
        { label: 'Share (%)', value: (row) => formatDecimal(row.share || 0, 2) },
      ],
      statusBuckets
    );
  };

  const downloadHourlyUsage = () => {
    downloadCsv(
      `hourly_usage_${dateRange}d_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'Hour', value: (row) => formatHourLabel(row.hour) },
        { label: 'Requests', value: (row) => row.requests },
        { label: 'AI Requests', value: (row) => row.ai_requests },
        { label: 'Errors', value: (row) => row.errors },
        { label: 'Error Rate (%)', value: (row) => formatDecimal(row.error_rate || 0, 2) },
        { label: 'AI Request Share (%)', value: (row) => formatDecimal(row.ai_request_share || 0, 2) },
        { label: 'Total Tokens', value: (row) => row.total_tokens },
        { label: 'AI Tokens', value: (row) => row.ai_tokens },
      ],
      hourlyReport
    );
  };

  const downloadProviderUsage = () => {
    downloadCsv(
      `provider_usage_${dateRange}d_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'Provider', value: (row) => row.provider },
        { label: 'Requests', value: (row) => row.usage_count },
        { label: 'Total Tokens', value: (row) => row.total_tokens },
        { label: 'AI Tokens', value: (row) => row.ai_tokens },
        { label: 'Avg Latency (s)', value: (row) => formatDecimal(row.avg_latency || 0, 2) },
        { label: 'Error Rate (%)', value: (row) => formatDecimal((row.error_rate || 0) * 100, 2) },
      ],
      providerRows
    );
  };

  const downloadEndpointUsage = () => {
    downloadCsv(
      `endpoint_usage_${dateRange}d_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'Endpoint', value: (row) => row.endpoint },
        { label: 'Method', value: (row) => row.method || '' },
        { label: 'Requests', value: (row) => row.usage_count },
        { label: 'AI Requests', value: (row) => row.ai_requests },
        { label: 'Total Tokens', value: (row) => row.total_tokens },
        { label: 'AI Tokens', value: (row) => row.ai_tokens },
        { label: 'Avg Latency (s)', value: (row) => formatDecimal(row.avg_latency || 0, 2) },
        { label: 'Error Rate (%)', value: (row) => formatDecimal((row.error_rate || 0) * 100, 2) },
        { label: 'Error Count', value: (row) => row.error_count || 0 },
      ],
      endpointRows
    );
  };

  const downloadActionUsage = () => {
    downloadCsv(
      `action_usage_${dateRange}d_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'Action', value: (row) => row.action },
        { label: 'Requests', value: (row) => row.usage_count },
        { label: 'Total Tokens', value: (row) => row.total_tokens },
        { label: 'AI Tokens', value: (row) => row.ai_tokens },
      ],
      actionRows
    );
  };

  const downloadTopUsers = () => {
    downloadCsv(
      `top_users_${dateRange}d_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'User ID', value: (row) => row.id },
        { label: 'Username', value: (row) => row.username },
        { label: 'Email', value: (row) => row.email },
        { label: 'Requests', value: (row) => row.requests },
        { label: 'AI Requests', value: (row) => row.ai_requests },
        { label: 'Total Tokens', value: (row) => row.total_tokens },
        { label: 'AI Tokens', value: (row) => row.ai_tokens },
        { label: 'Error Rate (%)', value: (row) => formatDecimal((row.error_rate || 0) * 100, 2) },
        { label: 'Last Activity', value: (row) => row.last_activity || '' },
      ],
      topUsers
    );
  };

  const downloadReliabilityReport = () => {
    downloadCsv(
      `reliability_report_${dateRange}d_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'Tool', value: (row) => row.tool_name },
        { label: 'Requests', value: (row) => row.usage_count },
        { label: 'Error Rate (%)', value: (row) => formatDecimal((row.error_rate || 0) * 100, 2) },
        { label: 'Estimated Errors', value: (row) => row.error_count || 0 },
        { label: 'Avg Latency (s)', value: (row) => formatDecimal(row.avg_latency || 0, 2) },
      ],
      errorTools
    );
  };

  const downloadUserActivities = () => {
    if (!userDetail) return;
    downloadCsv(
      `user_${userDetail.user.username}_activities_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'Tool', value: (row) => row.tool_name },
        { label: 'Action', value: (row) => row.action },
        { label: 'Tokens Used', value: (row) => row.tokens_used },
        { label: 'Prompt Tokens', value: (row) => row.prompt_tokens },
        { label: 'Completion Tokens', value: (row) => row.completion_tokens },
        { label: 'Model', value: (row) => row.model || '' },
        { label: 'Provider', value: (row) => row.provider || '' },
        { label: 'Endpoint', value: (row) => row.endpoint || '' },
        { label: 'Method', value: (row) => row.method || '' },
        { label: 'Status Code', value: (row) => row.status_code || '' },
        { label: 'Latency (s)', value: (row) => row.duration_seconds || '' },
        { label: 'Token Source', value: (row) => row.token_source || '' },
        { label: 'Timestamp', value: (row) => row.timestamp },
        { label: 'AI Activity', value: (row) => (row.is_ai ? 'yes' : 'no') },
      ],
      filteredActivities
    );
  };

  const downloadUserToolSummary = () => {
    if (!userDetail) return;
    downloadCsv(
      `user_${userDetail.user.username}_tool_summary_${new Date().toISOString().split('T')[0]}.csv`,
      [
        { label: 'Tool', value: (row) => row.tool_name },
        { label: 'Requests', value: (row) => row.usage_count },
        { label: 'AI Tokens', value: (row) => row.ai_tokens },
        { label: 'Prompt Tokens', value: (row) => row.prompt_tokens },
        { label: 'Completion Tokens', value: (row) => row.completion_tokens },
        { label: 'Avg Tokens', value: (row) => formatDecimal(row.avg_tokens || 0, 2) },
        { label: 'Avg Latency (s)', value: (row) => formatDecimal(row.avg_latency || 0, 2) },
        { label: 'Error Rate (%)', value: (row) => formatDecimal((row.error_rate || 0) * 100, 2) },
        { label: 'Last Activity', value: (row) => row.last_activity || '' },
      ],
      userDetail.tool_summary || []
    );
  };

  return (
    <div className="admin-analytics">
      <div className="aa-topbar">
        <ToolNavigation />
      </div>
      <div className="aa-hero">
        <div>
          <span className="aa-eyebrow"><Shield size={13} /> Operations intelligence</span>
          <h1>Product health,<br />without the noise.</h1>
          <p>Real-time product usage, AI token efficiency, and reliability signals.</p>
        </div>
        <div className="aa-header-actions">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="aa-date-select"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
          <button onClick={downloadAllCSV} className="aa-btn-primary">
            <Download size={16} />
            Export All CSV
          </button>
        </div>
      </div>

      <div className="aa-section-nav">
        {sectionOptions.map((section) => (
          <button
            key={section.id}
            className={`aa-section-tab ${activeSection === section.id ? 'active' : ''}`}
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </div>

      {overview && isSectionVisible('overview') && (
        <>
          <div className="aa-kpi-grid">
            <div className="aa-kpi-card">
              <div className="aa-kpi-icon"><Users size={20} /></div>
              <div>
                <div className="aa-kpi-label">Total Users</div>
                <div className="aa-kpi-value">{formatNumber(overview.total_users)}</div>
                <div className="aa-kpi-sub">Active: {formatNumber(overview.active_users)}</div>
              </div>
            </div>
            <div className="aa-kpi-card">
              <div className="aa-kpi-icon"><Activity size={20} /></div>
              <div>
                <div className="aa-kpi-label">Requests</div>
                <div className="aa-kpi-value">{formatNumber(overview.total_requests)}</div>
                <div className="aa-kpi-sub">AI Calls: {formatNumber(overview.ai_requests)}</div>
              </div>
            </div>
            <div className="aa-kpi-card">
              <div className="aa-kpi-icon"><Zap size={20} /></div>
              <div>
                <div className="aa-kpi-label">AI Tokens</div>
                <div className="aa-kpi-value">{formatNumber(overview.ai_tokens)}</div>
                <div className="aa-kpi-sub">Coverage: {formatPercent(overview.ai_token_coverage)}</div>
              </div>
            </div>
            <div className="aa-kpi-card">
              <div className="aa-kpi-icon"><Database size={20} /></div>
              <div>
                <div className="aa-kpi-label">Total Tokens</div>
                <div className="aa-kpi-value">{formatNumber(overview.total_tokens)}</div>
                <div className="aa-kpi-sub">Prompt: {formatNumber(overview.ai_prompt_tokens)}</div>
              </div>
            </div>
            <div className="aa-kpi-card">
              <div className="aa-kpi-icon"><Timer size={20} /></div>
              <div>
                <div className="aa-kpi-label">Latency</div>
                <div className="aa-kpi-value">{formatSeconds(overview.avg_latency)}</div>
                <div className="aa-kpi-sub">AI Avg: {formatSeconds(overview.avg_ai_latency)}</div>
              </div>
            </div>
            <div className="aa-kpi-card">
              <div className="aa-kpi-icon"><AlertTriangle size={20} /></div>
              <div>
                <div className="aa-kpi-label">Error Rate</div>
                <div className="aa-kpi-value">{formatPercent(overview.error_rate)}</div>
                <div className="aa-kpi-sub">AI: {formatPercent(overview.ai_error_rate)}</div>
              </div>
            </div>
          </div>

          <div className="aa-metric-grid">
            <div className="aa-metric-card">
              <span>Active Rate</span>
              <strong>{formatPercent(activeRate)}</strong>
              <small>{formatNumber(activeUsers)} active users</small>
            </div>
            <div className="aa-metric-card">
              <span>New Users</span>
              <strong>{formatNumber(overview.new_users || 0)}</strong>
              <small>Last {dateRange} days</small>
            </div>
            <div className="aa-metric-card">
              <span>Requests / Active User</span>
              <strong>{formatDecimal(requestsPerActiveUser, 2)}</strong>
              <small>{formatNumber(totalRequests)} total requests</small>
            </div>
            <div className="aa-metric-card">
              <span>Tokens / Request</span>
              <strong>{formatDecimal(tokensPerRequest, 2)}</strong>
              <small>{formatNumber(totalTokens)} total tokens</small>
            </div>
            <div className="aa-metric-card">
              <span>AI Tokens / AI Request</span>
              <strong>{formatDecimal(aiTokensPerRequest, 2)}</strong>
              <small>{formatNumber(aiTotalTokens)} AI tokens</small>
            </div>
            <div className="aa-metric-card">
              <span>AI Request Share</span>
              <strong>{formatPercent(aiRequestShare)}</strong>
              <small>{formatNumber(aiRequests)} AI requests</small>
            </div>
            <div className="aa-metric-card">
              <span>Tokens / Active User</span>
              <strong>{formatDecimal(tokensPerActiveUser, 2)}</strong>
              <small>{formatNumber(activeUsers)} active users</small>
            </div>
            <div className="aa-metric-card">
              <span>Error Count</span>
              <strong>{formatNumber(errorCount)}</strong>
              <small>{formatPercent(errorRate)} overall rate</small>
            </div>
            <div className="aa-metric-card">
              <span>AI Error Count</span>
              <strong>{formatNumber(aiErrorCount)}</strong>
              <small>{formatPercent(aiErrorRate)} AI rate</small>
            </div>
          </div>
        </>
      )}

      {overview && isSectionVisible('trends') && (
        <div className="aa-section">
          <div className="aa-section-header">
            <div>
              <h2>Trends & Daily Report</h2>
              <p>Daily requests, tokens, and error behavior for the selected range.</p>
            </div>
            <div className="aa-section-actions">
              <div className="aa-filter-field">
                <span>Min Requests</span>
                <input
                  type="number"
                  min="0"
                  value={dailyMinRequests}
                  onChange={(e) => setDailyMinRequests(Math.max(0, Number(e.target.value) || 0))}
                  className="aa-filter-input"
                />
              </div>
              <div className="aa-filter-field">
                <span>Min Errors</span>
                <input
                  type="number"
                  min="0"
                  value={dailyMinErrors}
                  onChange={(e) => setDailyMinErrors(Math.max(0, Number(e.target.value) || 0))}
                  className="aa-filter-input"
                />
              </div>
              <button onClick={downloadDailyReport} className="aa-btn-secondary">
                <Download size={14} />
                Download CSV
              </button>
            </div>
          </div>
          <div className="aa-card">
            <div className="aa-card-header">
              <div>
                <h2>Daily Trend</h2>
                <p>{trendConfig[trendMetric]?.label} over the last {dateRange} days</p>
              </div>
              <div className="aa-toggle">
                {Object.keys(trendConfig).map((key) => (
                  <button
                    key={key}
                    className={`aa-toggle-btn ${trendMetric === key ? 'active' : ''}`}
                    onClick={() => setTrendMetric(key)}
                  >
                    {trendConfig[key].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="aa-chart">
              {dailyUsage.map((day) => {
                const value = day[trendMetric] || 0;
                const height = (value / maxTrendValue) * 100;
                const label = new Date(day.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                return (
                  <div key={day.date} className="aa-chart-bar">
                    <div
                      className="aa-chart-fill"
                      style={{ height: `${height}%`, background: trendConfig[trendMetric]?.color }}
                      title={`${label}: ${formatNumber(value)}`}
                    />
                    <span className="aa-chart-label">{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="aa-table">
            <div className="aa-table-row aa-table-header aa-table-row--daily">
              <span>Date</span>
              <span>Requests</span>
              <span>AI Requests</span>
              <span>Errors</span>
              <span>Error Rate</span>
              <span>Total Tokens</span>
              <span>AI Tokens</span>
              <span>Avg Tokens</span>
              <span>Avg AI Tokens</span>
            </div>
            {dailyReport.map((day) => (
              <div key={day.date} className="aa-table-row aa-table-row--daily">
                <span className="aa-tool-name">{day.date}</span>
                <span>{formatNumber(day.requests || 0)}</span>
                <span>{formatNumber(day.ai_requests || 0)}</span>
                <span>{formatNumber(day.errors || 0)}</span>
                <span>{formatPercent(day.error_rate || 0)}</span>
                <span>{formatNumber(day.total_tokens || 0)}</span>
                <span>{formatNumber(day.ai_tokens || 0)}</span>
                <span>{formatDecimal(day.avg_tokens || 0, 2)}</span>
                <span>{formatDecimal(day.avg_ai_tokens || 0, 2)}</span>
              </div>
            ))}
            {dailyReport.length === 0 && (
              <div className="aa-empty">No daily records match the current filters.</div>
            )}
          </div>
        </div>
      )}

      {overview && isSectionVisible('ai') && (
        <div className="aa-section">
          <div className="aa-section-header">
            <div>
              <h2>AI & Tokens</h2>
              <p>Prompt/completion mix, model usage, and token source breakdowns.</p>
            </div>
            <div className="aa-section-actions">
              <div className="aa-filter-field">
                <span>Min Source Count</span>
                <input
                  type="number"
                  min="0"
                  value={tokenSourceMinCount}
                  onChange={(e) => setTokenSourceMinCount(Math.max(0, Number(e.target.value) || 0))}
                  className="aa-filter-input"
                />
              </div>
              <button onClick={downloadTokenSources} className="aa-btn-secondary">
                <Download size={14} />
                Export Token Sources
              </button>
              <button onClick={downloadModelUsage} className="aa-btn-secondary">
                <Download size={14} />
                Export Model Usage
              </button>
            </div>
          </div>
          <div className="aa-grid">
            <div className="aa-card">
              <div className="aa-card-header">
                <div>
                  <h2>AI Token Mix</h2>
                  <p>Prompt vs completion distribution</p>
                </div>
                <div className="aa-token-total">{formatNumber(aiTotalTokens)} tokens</div>
              </div>
              <div className="aa-token-bar">
                <div
                  className="aa-token-segment aa-token-prompt"
                  style={{ width: `${promptRatio}%` }}
                  title={`Prompt ${formatNumber(aiPromptTokens)}`}
                />
                <div
                  className="aa-token-segment aa-token-completion"
                  style={{ width: `${completionRatio}%` }}
                  title={`Completion ${formatNumber(aiCompletionTokens)}`}
                />
              </div>
              <div className="aa-token-legend">
                <div className="aa-token-legend-item">
                  <span className="aa-token-dot aa-token-prompt" />
                  Prompt {formatNumber(aiPromptTokens)}
                </div>
                <div className="aa-token-legend-item">
                  <span className="aa-token-dot aa-token-completion" />
                  Completion {formatNumber(aiCompletionTokens)}
                </div>
              </div>
              <div className="aa-token-stats">
                <div>
                  <span>Prompt Share</span>
                  <strong>{formatPercent(promptRatio)}</strong>
                </div>
                <div>
                  <span>Completion Share</span>
                  <strong>{formatPercent(completionRatio)}</strong>
                </div>
              </div>
              <div className="aa-models">
                <h3>Model Usage</h3>
                <div className="aa-model-list">
                  {(overview.model_usage || []).map((model) => (
                    <div key={model.model} className="aa-model-item">
                      <div>
                        <span>{model.model}</span>
                        <strong>{formatNumber(model.total_tokens)}</strong>
                      </div>
                      <span>{formatNumber(model.requests)} calls</span>
                    </div>
                  ))}
                  {(!overview.model_usage || overview.model_usage.length === 0) && (
                    <div className="aa-empty">No model usage recorded yet.</div>
                  )}
                </div>
              </div>
            </div>
            <div className="aa-card">
              <div className="aa-card-header">
                <div>
                  <h2>Token Sources</h2>
                  <p>How usage attribution is being logged.</p>
                </div>
              </div>
              <div className="aa-list">
                {tokenSourceRows.map((source) => (
                  <div key={source.source} className="aa-list-item">
                    <span>{source.source}</span>
                    <strong>{formatNumber(source.count)}</strong>
                  </div>
                ))}
                {tokenSourceRows.length === 0 && (
                  <div className="aa-empty">No token source data available.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {overview && isSectionVisible('reliability') && (
        <div className="aa-section">
          <div className="aa-section-header">
            <div>
              <h2>Reliability & Latency</h2>
              <p>Error rates, latency signals, and high-risk tools.</p>
            </div>
            <div className="aa-section-actions">
              <div className="aa-filter-field">
                <span>Min Error Rate (%)</span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={errorMinRate}
                  onChange={(e) => setErrorMinRate(Math.max(0, Number(e.target.value) || 0))}
                  className="aa-filter-input"
                />
              </div>
              <button onClick={downloadReliabilityReport} className="aa-btn-secondary">
                <Download size={14} />
                Export Reliability
              </button>
            </div>
          </div>
          <div className="aa-grid">
            <div className="aa-card">
              <div className="aa-card-header">
                <div>
                  <h2>Reliability Snapshot</h2>
                  <p>Overall latency and error distribution.</p>
                </div>
              </div>
              <div className="aa-stat-grid">
                <div>
                  <span>Error Rate</span>
                  <strong>{formatPercent(errorRate)}</strong>
                </div>
                <div>
                  <span>AI Error Rate</span>
                  <strong>{formatPercent(aiErrorRate)}</strong>
                </div>
                <div>
                  <span>Avg Latency</span>
                  <strong>{formatSeconds(overview.avg_latency)}</strong>
                </div>
                <div>
                  <span>Avg AI Latency</span>
                  <strong>{formatSeconds(overview.avg_ai_latency)}</strong>
                </div>
                <div>
                  <span>Error Count</span>
                  <strong>{formatNumber(errorCount)}</strong>
                </div>
                <div>
                  <span>AI Error Count</span>
                  <strong>{formatNumber(aiErrorCount)}</strong>
                </div>
              </div>
            </div>
            <div className="aa-card">
              <div className="aa-card-header">
                <div>
                  <h2>Top Error Tools</h2>
                  <p>Highest error rate tools in range.</p>
                </div>
              </div>
              <div className="aa-list">
                {errorTools.slice(0, 8).map((tool) => (
                  <div key={tool.tool_name} className="aa-list-item">
                    <span>{tool.tool_name}</span>
                    <strong>{formatPercent((tool.error_rate || 0) * 100)}</strong>
                  </div>
                ))}
                {errorTools.length === 0 && (
                  <div className="aa-empty">No error signals above the filter threshold.</div>
                )}
              </div>
            </div>
            <div className="aa-card">
              <div className="aa-card-header">
                <div>
                  <h2>Slowest Tools</h2>
                  <p>Average latency leaders.</p>
                </div>
              </div>
              <div className="aa-list">
                {slowTools.map((tool) => (
                  <div key={tool.tool_name} className="aa-list-item">
                    <span>{tool.tool_name}</span>
                    <strong>{formatSeconds(tool.avg_latency || 0)}</strong>
                  </div>
                ))}
                {slowTools.length === 0 && (
                  <div className="aa-empty">No latency samples collected yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {overview && isSectionVisible('operations') && (
        <div className="aa-section">
          <div className="aa-section-header">
            <div>
              <h2>Operations & Traffic</h2>
              <p>Status distributions, hourly usage, and infrastructure hotspots.</p>
            </div>
          </div>
          <div className="aa-grid">
            <div className="aa-card">
              <div className="aa-card-header">
                <div>
                  <h2>Status Overview</h2>
                  <p>HTTP buckets and top status codes.</p>
                </div>
                <div className="aa-card-actions">
                  <button onClick={downloadStatusBuckets} className="aa-btn-secondary">
                    <Download size={14} />
                    Export Buckets
                  </button>
                  <button onClick={downloadStatusCodes} className="aa-btn-secondary">
                    <Download size={14} />
                    Export Codes
                  </button>
                </div>
              </div>
              <div className="aa-status-grid">
                {statusBuckets.map((bucket) => (
                  <div key={bucket.bucket} className="aa-status-card">
                    <span>{bucket.bucket}</span>
                    <strong>{formatNumber(bucket.count)}</strong>
                    <small>{formatPercent(bucket.share)}</small>
                  </div>
                ))}
              </div>
              <div className="aa-subtitle">Top Status Codes</div>
              <div className="aa-filter-bar">
                <div className="aa-filter-field">
                  <span>Min Count</span>
                  <input
                    type="number"
                    min="0"
                    value={statusMinCount}
                    onChange={(e) => setStatusMinCount(Math.max(0, Number(e.target.value) || 0))}
                    className="aa-filter-input"
                  />
                </div>
              </div>
              <div className="aa-list">
                {statusCodeRows.slice(0, 8).map((row) => (
                  <div key={row.status_code} className="aa-list-item">
                    <div className="aa-list-item-body">
                      <span>HTTP {row.status_code}</span>
                      <small>{formatNumber(row.count)} events</small>
                    </div>
                    <strong>{formatPercent((row.count / statusTotal) * 100)}</strong>
                  </div>
                ))}
                {statusCodeRows.length === 0 && (
                  <div className="aa-empty">No status codes match the current filters.</div>
                )}
              </div>
            </div>

            <div className="aa-card">
              <div className="aa-card-header">
                <div>
                  <h2>Hourly Traffic</h2>
                  <p>Requests by hour with AI share and errors.</p>
                </div>
                <div className="aa-card-actions">
                  <button onClick={downloadHourlyUsage} className="aa-btn-secondary">
                    <Download size={14} />
                    Export Hourly
                  </button>
                </div>
              </div>
              <div className="aa-filter-bar">
                <div className="aa-filter-field">
                  <span>Min Requests</span>
                  <input
                    type="number"
                    min="0"
                    value={hourlyMinRequests}
                    onChange={(e) => setHourlyMinRequests(Math.max(0, Number(e.target.value) || 0))}
                    className="aa-filter-input"
                  />
                </div>
              </div>
              <div className="aa-hourly-grid">
                {hourlyReport.map((hour) => {
                  const height = ((hour.requests || 0) / maxHourlyRequests) * 100;
                  return (
                    <div key={hour.hour} className="aa-hourly-item">
                      <div className="aa-hourly-bar">
                        <div
                          className="aa-hourly-fill"
                          style={{ height: `${height}%` }}
                          title={`${formatHourLabel(hour.hour)} · ${formatNumber(hour.requests)} req · ${formatPercent(hour.error_rate)} error`}
                        />
                      </div>
                      <span>{formatHourLabel(hour.hour)}</span>
                    </div>
                  );
                })}
                {hourlyReport.length === 0 && (
                  <div className="aa-empty">No hourly data matches the current filters.</div>
                )}
              </div>
              {busiestHour && (
                <div className="aa-hourly-summary">
                  Peak hour: {formatHourLabel(busiestHour.hour)} with {formatNumber(busiestHour.requests)} requests.
                </div>
              )}
            </div>
          </div>

          <div className="aa-grid">
            <div className="aa-card">
              <div className="aa-card-header">
                <div>
                  <h2>Providers</h2>
                  <p>Token usage and reliability by provider.</p>
                </div>
                <div className="aa-card-actions">
                  <button onClick={downloadProviderUsage} className="aa-btn-secondary">
                    <Download size={14} />
                    Export Providers
                  </button>
                </div>
              </div>
              <div className="aa-filter-bar">
                <div className="aa-filter-field">
                  <span>Min Requests</span>
                  <input
                    type="number"
                    min="0"
                    value={providerMinRequests}
                    onChange={(e) => setProviderMinRequests(Math.max(0, Number(e.target.value) || 0))}
                    className="aa-filter-input"
                  />
                </div>
              </div>
              <div className="aa-list">
                {providerRows.slice(0, 8).map((provider) => (
                  <div key={provider.provider} className="aa-list-item">
                    <div className="aa-list-item-body">
                      <span>{provider.provider}</span>
                      <small>
                        {formatNumber(provider.usage_count)} requests · {formatPercent((provider.error_rate || 0) * 100)} errors ·{' '}
                        {formatSeconds(provider.avg_latency || 0)}
                      </small>
                    </div>
                    <strong>{formatNumber(provider.ai_tokens)} AI tokens</strong>
                  </div>
                ))}
                {providerRows.length === 0 && (
                  <div className="aa-empty">No provider data matches the current filters.</div>
                )}
              </div>
            </div>

            <div className="aa-card">
              <div className="aa-card-header">
                <div>
                  <h2>Action Mix</h2>
                  <p>Top product actions by volume.</p>
                </div>
                <div className="aa-card-actions">
                  <button onClick={downloadActionUsage} className="aa-btn-secondary">
                    <Download size={14} />
                    Export Actions
                  </button>
                </div>
              </div>
              <div className="aa-filter-bar">
                <div className="aa-filter-field">
                  <span>Min Count</span>
                  <input
                    type="number"
                    min="0"
                    value={actionMinCount}
                    onChange={(e) => setActionMinCount(Math.max(0, Number(e.target.value) || 0))}
                    className="aa-filter-input"
                  />
                </div>
              </div>
              <div className="aa-list">
                {actionRows.slice(0, 8).map((action) => (
                  <div key={action.action} className="aa-list-item">
                    <div className="aa-list-item-body">
                      <span>{action.action}</span>
                      <small>{formatNumber(action.usage_count)} events</small>
                    </div>
                    <strong>{formatNumber(action.ai_tokens)} AI tokens</strong>
                  </div>
                ))}
                {actionRows.length === 0 && (
                  <div className="aa-empty">No actions match the current filters.</div>
                )}
              </div>
            </div>

            <div className="aa-card">
              <div className="aa-card-header">
                <div>
                  <h2>Top Users (AI)</h2>
                  <p>Highest AI token consumers in range.</p>
                </div>
                <div className="aa-card-actions">
                  <button onClick={downloadTopUsers} className="aa-btn-secondary">
                    <Download size={14} />
                    Export Top Users
                  </button>
                </div>
              </div>
              <div className="aa-list">
                {topUsers.slice(0, 6).map((user) => (
                  <div
                    key={user.id}
                    className="aa-list-item aa-list-item-clickable"
                    onClick={() => loadUserDetail(user.id)}
                  >
                    <div className="aa-list-item-body">
                      <span>{user.username}</span>
                      <small>
                        {formatNumber(user.ai_requests)} AI requests · {formatPercent((user.error_rate || 0) * 100)} errors
                      </small>
                    </div>
                    <strong>{formatNumber(user.ai_tokens)} tokens</strong>
                  </div>
                ))}
                {topUsers.length === 0 && (
                  <div className="aa-empty">No top-user data available.</div>
                )}
              </div>
            </div>
          </div>

          <div className="aa-section">
            <div className="aa-section-header">
              <div>
                <h2>Endpoint Hotspots</h2>
                <p>Endpoints ranked by traffic, latency, and errors.</p>
              </div>
              <div className="aa-section-actions">
                <button onClick={downloadEndpointUsage} className="aa-btn-secondary">
                  <Download size={14} />
                  Export Endpoints
                </button>
              </div>
            </div>
            <div className="aa-section-controls">
              <div className="aa-filter-bar">
                <div className="aa-filter-field">
                  <span>Search</span>
                  <input
                    type="text"
                    value={endpointSearch}
                    onChange={(e) => setEndpointSearch(e.target.value)}
                    placeholder="Method or endpoint"
                    className="aa-filter-input"
                  />
                </div>
                <div className="aa-filter-field">
                  <span>Min Requests</span>
                  <input
                    type="number"
                    min="0"
                    value={endpointMinRequests}
                    onChange={(e) => setEndpointMinRequests(Math.max(0, Number(e.target.value) || 0))}
                    className="aa-filter-input"
                  />
                </div>
                <div className="aa-filter-field">
                  <span>Sort</span>
                  <select
                    value={endpointSort}
                    onChange={(e) => setEndpointSort(e.target.value)}
                    className="aa-filter-select"
                  >
                    <option value="requests">Requests</option>
                    <option value="ai_tokens">AI Tokens</option>
                    <option value="errors">Error Rate</option>
                    <option value="latency">Latency</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="aa-table">
              <div className="aa-table-row aa-table-header aa-table-row--endpoint">
                <span>Endpoint</span>
                <span>Requests</span>
                <span>AI Requests</span>
                <span>AI Tokens</span>
                <span>Avg Latency</span>
                <span>Error Rate</span>
                <span>Errors</span>
              </div>
              {endpointRows.map((endpoint) => (
                <div key={`${endpoint.method}-${endpoint.endpoint}`} className="aa-table-row aa-table-row--endpoint">
                  <div className="aa-endpoint-cell">
                    <span className="aa-tool-name">{endpoint.endpoint}</span>
                    <small>{endpoint.method || 'n/a'}</small>
                  </div>
                  <span>{formatNumber(endpoint.usage_count)}</span>
                  <span>{formatNumber(endpoint.ai_requests)}</span>
                  <span>{formatNumber(endpoint.ai_tokens)}</span>
                  <span>{formatSeconds(endpoint.avg_latency || 0)}</span>
                  <span>{formatPercent((endpoint.error_rate || 0) * 100)}</span>
                  <span>{formatNumber(endpoint.error_count || 0)}</span>
                </div>
              ))}
              {endpointRows.length === 0 && (
                <div className="aa-empty">No endpoints match the current filters.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {overview && isSectionVisible('tools') && (
        <div className="aa-section">
          <div className="aa-section-header">
            <div>
              <h2>Tool Intelligence</h2>
              <p>Filter, inspect, and export tool-level usage.</p>
            </div>
            <div className="aa-section-actions">
              <button onClick={downloadToolReport} className="aa-btn-secondary">
                <Download size={14} />
                Export Tools CSV
              </button>
            </div>
          </div>
          <div className="aa-section-controls">
            <div className="aa-toggle">
              <button
                className={`aa-toggle-btn ${toolView === 'ai' ? 'active' : ''}`}
                onClick={() => setToolView('ai')}
              >
                AI Tools
              </button>
              <button
                className={`aa-toggle-btn ${toolView === 'all' ? 'active' : ''}`}
                onClick={() => setToolView('all')}
              >
                All Tools
              </button>
            </div>
            <div className="aa-filter-bar">
              <div className="aa-filter-field">
                <span>Search</span>
                <input
                  type="text"
                  value={toolSearchTerm}
                  onChange={(e) => setToolSearchTerm(e.target.value)}
                  placeholder="Tool name"
                  className="aa-filter-input"
                />
              </div>
              <div className="aa-filter-field">
                <span>Min Requests</span>
                <input
                  type="number"
                  min="0"
                  value={toolMinRequests}
                  onChange={(e) => setToolMinRequests(Math.max(0, Number(e.target.value) || 0))}
                  className="aa-filter-input"
                />
              </div>
              <div className="aa-filter-field">
                <span>Sort</span>
                <select
                  value={toolSort}
                  onChange={(e) => setToolSort(e.target.value)}
                  className="aa-filter-select"
                >
                  <option value="ai_tokens">AI Tokens</option>
                  <option value="requests">Requests</option>
                  <option value="errors">Error Rate</option>
                  <option value="latency">Latency</option>
                </select>
              </div>
            </div>
          </div>
          <div className="aa-table">
            <div className="aa-table-row aa-table-header">
              <span>Tool</span>
              <span>Requests</span>
              <span>AI Tokens</span>
              <span>Prompt</span>
              <span>Completion</span>
              <span>Avg Tokens</span>
              <span>Avg Latency</span>
              <span>Error Rate</span>
            </div>
            {filteredTools.map((tool) => (
              <div key={tool.tool_name} className="aa-table-row">
                <span className="aa-tool-name">{tool.tool_name}</span>
                <span>{formatNumber(tool.usage_count)}</span>
                <span>{formatNumber(tool.ai_tokens)}</span>
                <span>{formatNumber(tool.prompt_tokens)}</span>
                <span>{formatNumber(tool.completion_tokens)}</span>
                <span>{formatNumber(Math.round(tool.avg_tokens || 0))}</span>
                <span>{formatSeconds(tool.avg_latency || 0)}</span>
                <span>{formatPercent((tool.error_rate || 0) * 100)}</span>
              </div>
            ))}
            {filteredTools.length === 0 && (
              <div className="aa-empty">No tools match the current filters.</div>
            )}
          </div>
        </div>
      )}

      {isSectionVisible('users') && (
        <div className="aa-section">
          <div className="aa-section-header">
            <div>
              <h2>Users</h2>
              <p>Inspect usage, reliability, and AI cost by user.</p>
            </div>
            <div className="aa-section-actions">
              <button onClick={downloadUserReport} className="aa-btn-secondary">
                <Download size={14} />
                Export Users CSV
              </button>
            </div>
          </div>
          <div className="aa-section-controls">
            <div className="aa-filter-bar">
              <div className="aa-filter-field">
                <span>Search</span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Username or email"
                  className="aa-filter-input"
                />
              </div>
              <div className="aa-filter-field">
                <span>Min AI Tokens</span>
                <input
                  type="number"
                  min="0"
                  value={userMinAiTokens}
                  onChange={(e) => setUserMinAiTokens(Math.max(0, Number(e.target.value) || 0))}
                  className="aa-filter-input"
                />
              </div>
              <div className="aa-filter-field">
                <span>Min Total Tokens</span>
                <input
                  type="number"
                  min="0"
                  value={userMinTotalTokens}
                  onChange={(e) => setUserMinTotalTokens(Math.max(0, Number(e.target.value) || 0))}
                  className="aa-filter-input"
                />
              </div>
              <div className="aa-filter-field">
                <span>Sort</span>
                <select
                  value={userSort}
                  onChange={(e) => setUserSort(e.target.value)}
                  className="aa-filter-select"
                >
                  <option value="ai_tokens">AI Tokens</option>
                  <option value="total_tokens">Total Tokens</option>
                  <option value="last_activity">Last Activity</option>
                  <option value="error_rate">Error Rate</option>
                </select>
              </div>
              <label className="aa-filter-toggle">
                <input
                  type="checkbox"
                  checked={userOnlyActive}
                  onChange={(e) => setUserOnlyActive(e.target.checked)}
                />
                Active only
              </label>
            </div>
          </div>
          {loading ? (
            <div className="aa-loading">Loading users...</div>
          ) : (
            <div className="aa-users-table">
              <table>
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>AI Calls</th>
                    <th>AI Tokens</th>
                    <th>Total Tokens</th>
                    <th>Coverage</th>
                    <th>Last Activity</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id} onClick={() => loadUserDetail(user.id)}>
                      <td>{user.username}</td>
                      <td>{user.email}</td>
                      <td>{formatNumber(user.ai_requests)}</td>
                      <td>{formatNumber(user.ai_tokens)}</td>
                      <td>{formatNumber(user.total_tokens)}</td>
                      <td>{formatPercent(user.ai_token_coverage || 0)}</td>
                      <td>{user.last_activity ? new Date(user.last_activity).toLocaleString() : 'Never'}</td>
                      <td>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadUserCSV(user.id, user.username);
                          }}
                          className="aa-btn-small"
                        >
                          <Download size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsers.length === 0 && (
                <div className="aa-empty">No users match the current filters.</div>
              )}
            </div>
          )}
        </div>
      )}

      {userDetail && (
        <div className="aa-user-detail">
          <div className="aa-detail-header">
            <div>
              <h2>User Details: {userDetail.user.username}</h2>
              <p>{userDetail.user.email}</p>
            </div>
            <button onClick={() => setUserDetail(null)} className="aa-btn-secondary">
              Close
            </button>
          </div>

          <div className="aa-detail-actions">
            <button onClick={downloadUserActivities} className="aa-btn-secondary">
              <Download size={14} />
              Export Activities
            </button>
            <button onClick={downloadUserToolSummary} className="aa-btn-secondary">
              <Download size={14} />
              Export Tool Summary
            </button>
          </div>

          <div className="aa-detail-kpis">
            <div>
              <span>AI Tokens</span>
              <strong>{formatNumber(userDetail.ai_summary?.ai_tokens || 0)}</strong>
            </div>
            <div>
              <span>AI Calls</span>
              <strong>{formatNumber(userDetail.ai_summary?.ai_requests || 0)}</strong>
            </div>
            <div>
              <span>Prompt Tokens</span>
              <strong>{formatNumber(userDetail.ai_summary?.prompt_tokens || 0)}</strong>
            </div>
            <div>
              <span>Completion Tokens</span>
              <strong>{formatNumber(userDetail.ai_summary?.completion_tokens || 0)}</strong>
            </div>
            <div>
              <span>Coverage</span>
              <strong>{formatPercent(userDetail.ai_summary?.ai_token_coverage || 0)}</strong>
            </div>
          </div>

          <div className="aa-detail-tools">
            <h3>Tool Usage Summary</h3>
            <div className="aa-table">
              <div className="aa-table-row aa-table-header">
                <span>Tool</span>
                <span>Requests</span>
                <span>AI Tokens</span>
                <span>Avg Tokens</span>
                <span>Latency</span>
                <span>Error Rate</span>
              </div>
            {(userDetail.tool_summary || []).map((tool) => (
                <div key={tool.tool_name} className="aa-table-row">
                  <span className="aa-tool-name">{tool.tool_name}</span>
                  <span>{formatNumber(tool.usage_count)}</span>
                  <span>{formatNumber(tool.ai_tokens)}</span>
                  <span>{formatNumber(Math.round(tool.avg_tokens || 0))}</span>
                  <span>{formatSeconds(tool.avg_latency || 0)}</span>
                  <span>{formatPercent((tool.error_rate || 0) * 100)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="aa-detail-activities">
            <div className="aa-detail-activities-header">
              <h3>Recent Activities</h3>
              <span>{filteredActivities.length} records</span>
            </div>
            <div className="aa-detail-filters">
              <div className="aa-filter-field">
                <span>Search</span>
                <input
                  type="text"
                  value={activitySearch}
                  onChange={(e) => setActivitySearch(e.target.value)}
                  placeholder="Tool, action, model, endpoint"
                  className="aa-filter-input"
                />
              </div>
              <div className="aa-filter-field">
                <span>Min Tokens</span>
                <input
                  type="number"
                  min="0"
                  value={activityMinTokens}
                  onChange={(e) => setActivityMinTokens(Math.max(0, Number(e.target.value) || 0))}
                  className="aa-filter-input"
                />
              </div>
              <label className="aa-filter-toggle">
                <input
                  type="checkbox"
                  checked={activityOnlyAI}
                  onChange={(e) => setActivityOnlyAI(e.target.checked)}
                />
                AI only
              </label>
              <label className="aa-filter-toggle">
                <input
                  type="checkbox"
                  checked={activityErrorsOnly}
                  onChange={(e) => setActivityErrorsOnly(e.target.checked)}
                />
                Errors only
              </label>
            </div>
            <div className="aa-activities-list">
              {filteredActivities.map((activity) => (
                <div key={activity.id} className="aa-activity-item">
                  <div className="aa-activity-tool">{activity.tool_name}</div>
                  <div className="aa-activity-action">{activity.action}</div>
                  <div className="aa-activity-tokens">{formatNumber(activity.tokens_used)} tokens</div>
                  <div className="aa-activity-time">
                    {new Date(activity.timestamp).toLocaleString()}
                  </div>
                  <div className="aa-activity-metrics">
                    <span>Prompt: {formatNumber(activity.prompt_tokens || 0)}</span>
                    <span>Completion: {formatNumber(activity.completion_tokens || 0)}</span>
                    <span>Status: {activity.status_code || 'n/a'}</span>
                    <span>Latency: {formatSeconds(activity.duration_seconds || 0)}</span>
                  </div>
                  <div className="aa-activity-meta">
                    <span>{activity.model || 'n/a'}</span>
                    <span>{activity.provider || 'n/a'}</span>
                    <span>{activity.endpoint || 'endpoint unknown'}</span>
                  </div>
                </div>
              ))}
              {filteredActivities.length === 0 && (
                <div className="aa-empty">No activities match the current filters.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAnalytics;
