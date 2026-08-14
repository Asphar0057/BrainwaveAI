import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Loader as LoaderIcon,
  Lock as LockIcon,
  CheckCircle as CheckCircleIcon,
  Circle as CircleIcon,
  Play as PlayIcon,
  Pause as PauseIcon,
  Award as AwardIcon,
  Clock as ClockIcon,
  Target as TargetIcon,
  BookOpen as BookOpenIcon,
  MessageCircle as MessageCircleIcon,
  FileText as FileTextIcon,
  Brain as BrainIcon,
  ChevronRight as ChevronRightIcon,
  ChevronLeft as ChevronLeftIcon,
  Sparkles as SparklesIcon,
  Zap as ZapIcon,
  Download as DownloadIcon,
  Calendar as CalendarIcon,
  Lightbulb as LightbulbIcon,
  Map as MapIcon,
  TrendingUp as TrendingUpIcon,
  Image as ImageIconBase,
  GitBranch as GitBranchIcon,
  Timer as TimerIcon,
  MessageSquare as MessageSquareIcon,
  LayoutDashboard as LayoutDashboardIcon,
  BarChart3 as BarChart3Icon,
  ExternalLink as ExternalLinkIcon,
  Globe2 as Globe2Icon,
  Link as LinkIcon,
  Search as SearchIcon,
  Star as StarIcon,
} from 'lucide-react';
import learningPathService from '../services/learningPathService';
import MathRenderer from '../components/MathRenderer';
import SocialHubChrome from '../components/SocialHubChrome';
import { sanitizeUrl } from '../utils/sanitize';
import './LearningPathDetail.css';

const safeIcon = (Icon) => Icon || (() => null);

const Loader = safeIcon(LoaderIcon);
const Lock = safeIcon(LockIcon);
const CheckCircle = safeIcon(CheckCircleIcon);
const Circle = safeIcon(CircleIcon);
const Play = safeIcon(PlayIcon);
const Pause = safeIcon(PauseIcon);
const Award = safeIcon(AwardIcon);
const Clock = safeIcon(ClockIcon);
const Target = safeIcon(TargetIcon);
const BookOpen = safeIcon(BookOpenIcon);
const MessageCircle = safeIcon(MessageCircleIcon);
const FileText = safeIcon(FileTextIcon);
const Brain = safeIcon(BrainIcon);
const ChevronRight = safeIcon(ChevronRightIcon);
const ChevronLeft = safeIcon(ChevronLeftIcon);
const Sparkles = safeIcon(SparklesIcon);
const Zap = safeIcon(ZapIcon);
const Download = safeIcon(DownloadIcon);
const Calendar = safeIcon(CalendarIcon);
const Lightbulb = safeIcon(LightbulbIcon);
const Map = safeIcon(MapIcon);
const TrendingUp = safeIcon(TrendingUpIcon);
const ImageIcon = safeIcon(ImageIconBase);
const GitBranch = safeIcon(GitBranchIcon);
const Timer = safeIcon(TimerIcon);
const MessageSquare = safeIcon(MessageSquareIcon);
const LayoutDashboard = safeIcon(LayoutDashboardIcon);
const BarChart3 = safeIcon(BarChart3Icon);
const ExternalLink = safeIcon(ExternalLinkIcon);
const Globe2 = safeIcon(Globe2Icon);
const Link = safeIcon(LinkIcon);
const Search = safeIcon(SearchIcon);
const Star = safeIcon(StarIcon);

const PATH_PANEL_MIN_WIDTH = 240;
const PATH_PANEL_MAX_WIDTH = 560;
const PATH_PANEL_DEFAULT_WIDTH = 380;
const PATH_PANEL_STORAGE_KEY = 'learningPathDetailPathPanelWidth';

// Older completion quizzes may include answer-key prefixes from the original
// fallback generator. Never reveal those labels while the learner is answering.
const displayQuizOption = (option) => String(option || '').replace(/^\s*(?:correct|incorrect)\s*:\s*/i, '');

const LearningPathDetail = () => {
  const navigate = useNavigate();
  const { pathId } = useParams();
  
  const [path, setPath] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [workspaceSection, setWorkspaceSection] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 720
  );
  const [learnSection, setLearnSection] = useState('content');
  const [coreSectionIndex, setCoreSectionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  
  const [userNote, setUserNote] = useState('');
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  
  
  const [showCompletionQuiz, setShowCompletionQuiz] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState([]);
  const [currentQuizQuestion, setCurrentQuizQuestion] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  
  
  const [difficultyView, setDifficultyView] = useState('intermediate');
  const [resourceRatings, setResourceRatings] = useState({});
  const [completedResources, setCompletedResources] = useState([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [sessionLoggedMinutes, setSessionLoggedMinutes] = useState(null);
  const [timeSpentMinutes, setTimeSpentMinutes] = useState(0);
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceSearchQuery, setResourceSearchQuery] = useState('');
  const [resourceSearchProvider, setResourceSearchProvider] = useState('auto');
  const [resourceSearchResults, setResourceSearchResults] = useState([]);
  const [resourceLoading, setResourceLoading] = useState(false);
  const [resourceMessage, setResourceMessage] = useState('');
  const [pathPanelWidth, setPathPanelWidth] = useState(() => {
    if (typeof window === 'undefined') return PATH_PANEL_DEFAULT_WIDTH;
    const stored = Number(window.localStorage.getItem(PATH_PANEL_STORAGE_KEY));
    if (!Number.isFinite(stored)) return PATH_PANEL_DEFAULT_WIDTH;
    return Math.min(PATH_PANEL_MAX_WIDTH, Math.max(PATH_PANEL_MIN_WIDTH, stored));
  });
  const [isResizingPathPanel, setIsResizingPathPanel] = useState(false);
  const pathMainRef = useRef(null);
  const workspaceScrollRef = useRef(null);
  const resizeFrameRef = useRef(null);

  useEffect(() => {
    loadPathDetails();
  }, [pathId]);

  useEffect(() => {
    if (!path?.id || !workspaceScrollRef.current) return undefined;

    const resetWorkspaceScroll = () => {
      const workspace = workspaceScrollRef.current;
      if (!workspace) return;
      workspace.scrollTop = 0;
      workspace.closest('.shc-main')?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    };

    resetWorkspaceScroll();
    const frame = window.requestAnimationFrame(resetWorkspaceScroll);
    return () => window.cancelAnimationFrame(frame);
  }, [path?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PATH_PANEL_STORAGE_KEY, String(pathPanelWidth));
  }, [pathPanelWidth]);

  useEffect(() => () => {
    if (resizeFrameRef.current) {
      window.cancelAnimationFrame(resizeFrameRef.current);
    }
    document.body.classList.remove('lpd-is-resizing');
  }, []);

  useEffect(() => {
    if (selectedNode) {
      loadNodeNote();
      setSessionActive(false);
      setSessionSeconds(0);
      setSessionLoggedMinutes(null);
      const initialTime = selectedNode.progress?.time_spent_minutes ?? selectedNode.progress?.time_spent ?? 0;
      setTimeSpentMinutes(initialTime || 0);
      
      if (selectedNode.progress) {
        setDifficultyView(selectedNode.progress.difficulty_view || 'intermediate');
        setResourceRatings(selectedNode.progress.resource_ratings || {});
        setCompletedResources(selectedNode.progress.resources_completed || []);
      }
      setResourceUrl('');
      setResourceSearchResults([]);
      setResourceMessage('');
      setResourceSearchQuery(`${selectedNode.title} ${path?.topic_prompt || ''}`.trim());
    }
  }, [selectedNode, path?.topic_prompt]);

  const loadNodeNote = async () => {
    if (!selectedNode) return;
    
    try {
      const response = await learningPathService.getNodeNote(pathId, selectedNode.id);
      setUserNote(response.content || '');
    } catch (error) {
      console.error('Error loading note:', error);
    }
  };

  useEffect(() => {
    if (!sessionActive) return;
    const timer = setInterval(() => {
      setSessionSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionActive]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRovingTabKey = (event, ids, activeId, setActiveId, elementPrefix) => {
    const currentIndex = ids.indexOf(activeId);
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % ids.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + ids.length) % ids.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = ids.length - 1;
    else return;

    event.preventDefault();
    const nextId = ids[nextIndex];
    setActiveId(nextId);
    window.requestAnimationFrame(() => document.getElementById(`${elementPrefix}${nextId}`)?.focus());
  };

  const clampPathPanelWidth = (value, maxWidth = PATH_PANEL_MAX_WIDTH) => (
    Math.min(maxWidth, Math.max(PATH_PANEL_MIN_WIDTH, value))
  );

  const writePathPanelWidth = (width) => {
    const main = pathMainRef.current;
    if (main) {
      main.style.setProperty('--lpd-path-panel-width', `${width}px`);
    }
  };

  const handlePathPanelResizeStart = (event) => {
    if (window.innerWidth <= 1200) return;
    event.preventDefault();

    const main = pathMainRef.current || event.currentTarget.closest('.lpd-main');
    const mainWidth = main?.getBoundingClientRect().width || 0;
    const maxWidth = mainWidth
      ? Math.min(PATH_PANEL_MAX_WIDTH, Math.max(PATH_PANEL_MIN_WIDTH, Math.round(mainWidth * 0.55)))
      : PATH_PANEL_MAX_WIDTH;
    const startX = event.clientX;
    const startWidth = pathPanelWidth;
    let currentWidth = startWidth;
    let pendingWidth = startWidth;

    setIsResizingPathPanel(true);
    document.body.classList.add('lpd-is-resizing');
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const handlePointerMove = (moveEvent) => {
      pendingWidth = clampPathPanelWidth(startWidth + moveEvent.clientX - startX, maxWidth);
      if (resizeFrameRef.current) return;
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        currentWidth = pendingWidth;
        writePathPanelWidth(currentWidth);
      });
    };

    const handlePointerUp = () => {
      if (resizeFrameRef.current) {
        window.cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      currentWidth = pendingWidth;
      writePathPanelWidth(currentWidth);
      setPathPanelWidth(currentWidth);
      setIsResizingPathPanel(false);
      document.body.classList.remove('lpd-is-resizing');
      window.localStorage.setItem(PATH_PANEL_STORAGE_KEY, String(currentWidth));
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handlePathPanelResizeKeyDown = (event) => {
    const step = event.shiftKey ? 48 : 24;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setPathPanelWidth((width) => clampPathPanelWidth(width - step));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setPathPanelWidth((width) => clampPathPanelWidth(width + step));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setPathPanelWidth(PATH_PANEL_MIN_WIDTH);
    } else if (event.key === 'End') {
      event.preventDefault();
      setPathPanelWidth(PATH_PANEL_MAX_WIDTH);
    }
  };

  const logTimeSpent = async (minutes) => {
    if (!selectedNode || minutes <= 0) return;
    try {
      const response = await learningPathService.updateTimeSpent(pathId, selectedNode.id, minutes);
      if (response?.total_time_spent !== undefined) {
        setTimeSpentMinutes(response.total_time_spent);
      } else {
        setTimeSpentMinutes((prev) => prev + minutes);
      }
      setSessionLoggedMinutes(minutes);
    } catch (error) {
      console.error('Error logging time spent:', error);
    }
  };

  const handleSessionToggle = async () => {
    if (!sessionActive) {
      setSessionLoggedMinutes(null);
      setSessionSeconds(0);
      setSessionActive(true);
      return;
    }

    setSessionActive(false);
    const minutes = Math.max(1, Math.round(sessionSeconds / 60));
    await logTimeSpent(minutes);
    setSessionSeconds(0);
  };

  const handleSaveNote = async () => {
    if (!selectedNode) return;
    
    try {
      setNoteLoading(true);
      await learningPathService.saveNodeNote(pathId, selectedNode.id, userNote);
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } catch (error) {
      console.error('Error saving note:', error);
      alert('Failed to save note');
    } finally {
      setNoteLoading(false);
    }
  };

  const loadPathDetails = async () => {
    try {
      setLoading(true);
      const response = await learningPathService.getPath(pathId);
      setPath(response.path);
      setNodes(response.path.nodes || []);
      
      
      const activeNode = response.path.nodes?.find(
        n => n.progress.status === 'unlocked' || n.progress.status === 'in_progress'
      );
      if (activeNode) {
        setSelectedNode(activeNode);
      }
    } catch (error) {
      console.error('Error loading path:', error);
      alert('Failed to load learning path');
      navigate('/learning-paths');
    } finally {
      setLoading(false);
    }
  };

  const handleStartNode = async (node) => {
    if (node.progress.status === 'locked') {
      alert('This node is locked. Complete previous nodes first.');
      return;
    }

    try {
      setActionLoading(true);
      await learningPathService.startNode(pathId, node.id);
      await loadPathDetails();
    } catch (error) {
      console.error('Error starting node:', error);
      alert('Failed to start node');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompleteNode = async (node) => {
    if (node.progress.status === 'completed') {
      return;
    }

    try {
      setActionLoading(true);
      
      
      const quizResponse = await learningPathService.getCompletionQuiz(pathId, node.id);
      
      if (quizResponse.error) {
        alert('Failed to load completion quiz: ' + quizResponse.error);
        return;
      }
      
      
      const questions = quizResponse.questions || [];
      if (!questions.length) {
        alert('The completion check is not ready yet. Review the node and try again.');
        return;
      }
      setQuizQuestions(questions);
      setCurrentQuizQuestion(0);
      setQuizAnswers({});
      setQuizSubmitted(false);
      setQuizScore(0);
      setShowCompletionQuiz(true);
      
    } catch (error) {
      console.error('Error loading completion quiz:', error);
      alert('Failed to load completion quiz: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleQuizAnswer = (questionIndex, answerIndex) => {
    setQuizAnswers({
      ...quizAnswers,
      [questionIndex]: answerIndex
    });
  };

  const handleQuizSubmit = async () => {
    if (!quizQuestions.length) return;
    
    let correct = 0;
    quizQuestions.forEach((q, idx) => {
      if (quizAnswers[idx] === q.correct_answer) {
        correct++;
      }
    });
    
    const score = Math.round((correct / quizQuestions.length) * 100);
    setQuizScore(score);
    setQuizSubmitted(true);
    
    
    if (score >= 75) {
      try {
        setActionLoading(true);
        const response = await learningPathService.completeNode(
          pathId, 
          selectedNode.id,
          { 
            quiz_score: score,
            quiz_correct: correct,
            quiz_total: quizQuestions.length
          }
        );
        
        if (response.success) {
          setTimeout(() => {
            setShowCompletionQuiz(false);
            alert(`Node completed! +${response.xp_earned} XP`);
            loadPathDetails();
          }, 2000);
        }
      } catch (error) {
        console.error('Error completing node:', error);
        alert('Failed to complete node: ' + error.message);
      } finally {
        setActionLoading(false);
      }
    }
  };

  const handleQuizRetry = () => {
    setCurrentQuizQuestion(0);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(0);
  };

  const handleQuizClose = () => {
    setShowCompletionQuiz(false);
    setQuizQuestions([]);
    setCurrentQuizQuestion(0);
    setQuizAnswers({});
    setQuizSubmitted(false);
    setQuizScore(0);
  };

  useEffect(() => {
    if (!showCompletionQuiz) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !actionLoading) handleQuizClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [showCompletionQuiz, actionLoading]);

  useEffect(() => {
    setWorkspaceSection('overview');
    setLearnSection('content');
    setCoreSectionIndex(0);
  }, [selectedNode?.id]);

  const handleDifficultyChange = async (newDifficulty) => {
    if (!selectedNode) return;
    
    try {
      await learningPathService.updateDifficultyView(pathId, selectedNode.id, newDifficulty);
      setDifficultyView(newDifficulty);
    } catch (error) {
      console.error('Error updating difficulty view:', error);
    }
  };

  const handleResourceRate = async (resourceId, rating) => {
    if (!selectedNode) return;
    
    try {
      await learningPathService.rateResource(pathId, selectedNode.id, resourceId, rating);
      setResourceRatings({ ...resourceRatings, [resourceId]: rating });
    } catch (error) {
      console.error('Error rating resource:', error);
    }
  };

  const handleResourceComplete = async (resourceId, timeSpent) => {
    if (!selectedNode) return;
    
    try {
      await learningPathService.markResourceCompleted(pathId, selectedNode.id, resourceId, timeSpent);
      setCompletedResources((prev) => Array.from(new Set([...prev, resourceId])));
    } catch (error) {
      console.error('Error marking resource completed:', error);
    }
  };

  const syncNodeResources = (resources) => {
    setSelectedNode((prev) => prev ? { ...prev, supplementary_resources: resources } : prev);
    setNodes((prev) => prev.map((node) => (
      node.id === selectedNode?.id ? { ...node, supplementary_resources: resources } : node
    )));
  };

  const handleAddResource = async (resource = null) => {
    if (!selectedNode || resourceLoading) return;
    const payload = resource || { url: resourceUrl };
    if (!payload.url?.trim()) {
      setResourceMessage('Paste a valid resource URL first.');
      return;
    }

    try {
      setResourceLoading(true);
      setResourceMessage('');
      const response = await learningPathService.addResource(pathId, selectedNode.id, payload);
      syncNodeResources(response.resources || []);
      setResourceUrl('');
      setResourceMessage('Resource saved to this node.');
    } catch (error) {
      console.error('Error adding resource:', error);
      setResourceMessage(error.message || 'Failed to add resource.');
    } finally {
      setResourceLoading(false);
    }
  };

  const handleSearchResources = async () => {
    if (!selectedNode || resourceLoading) return;
    const query = resourceSearchQuery.trim();
    if (!query) {
      setResourceMessage('Enter a search query first.');
      return;
    }

    try {
      setResourceLoading(true);
      setResourceMessage('');
      const response = await learningPathService.searchResources(pathId, selectedNode.id, query, {
        provider: resourceSearchProvider,
        includeYoutube: false,
        maxResults: 8
      });
      setResourceSearchResults(response.resources || []);
      if ((response.resources || []).length === 0) {
        const configured = response.configured || {};
        const enabled = Object.entries(configured).filter(([, value]) => value).map(([key]) => key);
        setResourceMessage(
          enabled.length
            ? 'No resources found for that query.'
            : 'Add BRAVE_SEARCH_API_KEY or TAVILY_API_KEY to enable web resource search.'
        );
      }
    } catch (error) {
      console.error('Error searching resources:', error);
      setResourceMessage(error.message || 'Resource search failed.');
    } finally {
      setResourceLoading(false);
    }
  };

  const handleExportToNotes = async () => {
    if (!selectedNode) return;
    
    try {
      setActionLoading(true);
      
      
      const response = await learningPathService.exportToNotes(pathId, selectedNode.id, {
        include_resources: true,
        include_summary: true
      });
      
      
      const token = localStorage.getItem('token');
      const userName = localStorage.getItem('username');
      
      const createNoteResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/api/create_note`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userName,
          title: response.note_title,
          content: response.note_content
        })
      });

      if (createNoteResponse.ok) {
        const newNote = await createNoteResponse.json();
        const noteId = newNote.id || newNote.note_id;
        
        
        navigate(`/notes/editor/${noteId}`);
      } else {
        throw new Error('Failed to create note');
      }
      
    } catch (error) {
      console.error('Error exporting to notes:', error);
      alert('Failed to export to notes');
    } finally {
      setActionLoading(false);
    }
  };

  const handleExportToFlashcards = async () => {
    if (!selectedNode) return;
    
    try {
      const response = await learningPathService.exportToFlashcards(pathId, selectedNode.id);
      
      
      navigate('/flashcards', {
        state: {
          generatedFlashcards: {
            title: response.deck_title,
            cards: response.flashcards,
            tags: response.tags
          }
        }
      });
    } catch (error) {
      console.error('Error exporting to flashcards:', error);
      alert('Failed to export to flashcards');
    }
  };

  const handleExportToCalendar = async () => {
    if (!selectedNode) return;
    
    const scheduledDate = prompt('Enter date and time (YYYY-MM-DDTHH:MM:SS):');
    if (!scheduledDate) return;
    
    try {
      const response = await learningPathService.exportToCalendar(pathId, selectedNode.id, {
        scheduled_date: scheduledDate,
        duration_minutes: selectedNode.estimated_minutes || 30
      });
      
      alert('Study session added to calendar!');
      
    } catch (error) {
      console.error('Error exporting to calendar:', error);
      alert('Failed to add to calendar');
    }
  };

  const handleActivityClick = async (activity) => {
    if (!selectedNode || actionLoading) return;

    try {
      setActionLoading(true);

      const count = activity.count || activity.question_count || null;
      const response = await learningPathService.generateNodeContent(
        pathId,
        selectedNode.id,
        activity.type,
        count
      );

      if (response.error) {
        alert('Failed to generate content: ' + response.error);
        return;
      }

      
      await learningPathService.updateNodeProgress(
        pathId,
        selectedNode.id,
        activity.type,
        false, 
        { started_at: new Date().toISOString() }
      );

      
      await loadPathDetails();

      
      switch (activity.type) {
        case 'notes':
          
          const token = localStorage.getItem('token');
          const userName = localStorage.getItem('username');
          
          const createNoteResponse = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/api/create_note`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              user_id: userName,
              title: `${path.title} - ${selectedNode.title}`,
              content: response.content
            })
          });

          if (createNoteResponse.ok) {
            const newNote = await createNoteResponse.json();
            const noteId = newNote.id || newNote.note_id;
            navigate(`/notes/editor/${noteId}`);
          } else {
            throw new Error('Failed to create note');
          }
          break;

        case 'flashcards':
          navigate('/flashcards', {
            state: {
              generatedFlashcards: {
                title: `${path.title} - ${selectedNode.title}`,
                cards: response.flashcards,
                fromLearningPath: true
              }
            }
          });
          break;

        case 'quiz':
          navigate('/question-bank', {
            state: {
              generatedQuestions: {
                title: `${path.title} - ${selectedNode.title}`,
                questions: response.questions,
                fromLearningPath: true
              }
            }
          });
          break;

        case 'chat':
          navigate('/ai-chat', {
            state: {
              initialMessage: `${response.prompt}\n\n[Context: Learning Path "${path.title}" - Node "${selectedNode.title}"]`
            }
          });
          break;

        default:
          alert('Unknown activity type');
      }

    } catch (error) {
      console.error('Error generating content:', error);
      alert('Failed to generate content: ' + error.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getNodeStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={24} className="lp-node-icon-completed" />;
      case 'in_progress':
        return <Play size={24} className="lp-node-icon-progress" />;
      case 'unlocked':
        return <Circle size={24} className="lp-node-icon-unlocked" />;
      case 'locked':
      default:
        return <Lock size={24} className="lp-node-icon-locked" />;
    }
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'notes': return <FileText size={18} />;
      case 'flashcards': return <Brain size={18} />;
      case 'quiz': return <Target size={18} />;
      case 'chat': return <MessageCircle size={18} />;
      default: return <BookOpen size={18} />;
    }
  };

  const activityPlan = selectedNode?.content_plan || [];
  const activityMap = activityPlan.reduce((acc, activity) => {
    if (activity?.type && !acc[activity.type]) {
      acc[activity.type] = activity;
    }
    return acc;
  }, {});

  const toolkitDefaults = {
    notes: {
      description: 'Turn this chapter into clean, structured notes.',
    },
    flashcards: {
      description: 'Build recall with quick, spaced cards.',
      count: 8,
    },
    quiz: {
      description: 'Stress test understanding with scenario questions.',
      question_count: 6,
    },
    chat: {
      description: 'Ask follow-up questions and edge cases.',
    },
  };

  const toolkitItems = ['notes', 'flashcards', 'quiz', 'chat'].map((type) => {
    const fallback = toolkitDefaults[type] || {};
    const planItem = activityMap[type] || { type, ...fallback };
    const completed = selectedNode?.progress?.evidence?.[type]?.completed;
    const count = planItem.count || planItem.question_count;
    return {
      type,
      activity: planItem,
      description: planItem.description || fallback.description || 'Start this learning activity.',
      count,
      completed,
      label: type.toUpperCase(),
    };
  });

  const normalizeResource = (resource, fallbackType = 'resource') => {
    if (!resource) return null;
    const url = resource.url || resource.link || resource.href || '';
    const title = resource.title || resource.name || url || 'Resource';
    const id = resource.id || url || title;
    const source = resource.source || resource.provider || resource.site || resource.author || '';
    return {
      ...resource,
      id,
      url,
      title,
      description: resource.description || resource.summary || resource.content || '',
      type: resource.type || resource.resource_type || fallbackType,
      source,
      estimated_minutes: resource.estimated_minutes || resource.time_minutes || resource.duration_minutes,
    };
  };

  const resourceCatalog = [
    ...(Array.isArray(selectedNode?.primary_resources) ? selectedNode.primary_resources.map((resource) => normalizeResource(resource, 'primary')) : []),
    ...(Array.isArray(selectedNode?.supplementary_resources) ? selectedNode.supplementary_resources.map((resource) => normalizeResource(resource, 'supplementary')) : []),
    ...(Array.isArray(selectedNode?.practice_resources) ? selectedNode.practice_resources.map((resource) => normalizeResource(resource, 'practice')) : []),
    ...(Array.isArray(selectedNode?.video_resources) ? selectedNode.video_resources.map((resource) => normalizeResource(resource, 'video')) : []),
    ...(Array.isArray(selectedNode?.resources) ? selectedNode.resources.map((resource) => normalizeResource(resource, 'resource')) : []),
  ].filter(Boolean).filter((resource, index, all) => (
    all.findIndex((candidate) => candidate.url === resource.url && candidate.title === resource.title) === index
  ));

  const getResourceIcon = (resource) => {
    const url = (resource?.url || '').toLowerCase();
    const type = (resource?.type || '').toLowerCase();
    if (type.includes('video') || url.includes('youtube.com') || url.includes('youtu.be')) {
      return <Play size={18} />;
    }
    if (type.includes('reference') || url.includes('docs') || url.includes('github')) {
      return <FileText size={18} />;
    }
    return <Globe2 size={18} />;
  };

  const renderResourceCard = (resource, options = {}) => {
    const rating = resourceRatings[resource.id] || 0;
    const isCompleted = completedResources.includes(resource.id);
    const sourceLabel = resource.source || 'Saved resource';
    const resourceTitle = resource.title || sourceLabel;
    const resourceType = resource.type || 'resource';
    const durationLabel = resource.duration_seconds
      ? `${Math.max(1, Math.round(resource.duration_seconds / 60))} min video`
      : null;
    const minutesLabel = resource.estimated_minutes ? `${resource.estimated_minutes} min` : null;
    return (
      <div
        key={`${resource.id}-${options.mode || 'saved'}`}
        className={`lpd-resource-card ${options.mode === 'result' ? 'lpd-resource-card--result' : ''}`}
        title={resourceTitle}
        aria-label={resourceTitle}
      >
        <div className="lpd-resource-card-main">
          <div className="lpd-resource-card-icon">
            {getResourceIcon(resource)}
          </div>
          <div className="lpd-resource-card-body">
            <div className="lpd-resource-card-kicker">
              <span>{resourceType}</span>
              {sourceLabel && <small>{sourceLabel}</small>}
            </div>
            <h4 title={resourceTitle}>{resourceTitle}</h4>
            {resource.description ? (
              <p>{resource.description}</p>
            ) : (
              <p className="lpd-resource-muted">Open the resource to review this material for the current node.</p>
            )}
            <div className="lpd-resource-card-meta">
              {minutesLabel && <span>{minutesLabel}</span>}
              {durationLabel && <span>{durationLabel}</span>}
              {resource.auto_discovered && <span>Auto found</span>}
            </div>
          </div>
        </div>
        <div className="lpd-resource-card-actions">
          <div className="lpd-resource-primary-actions">
            {sanitizeUrl(resource.url) && (
              <a href={sanitizeUrl(resource.url)} target="_blank" rel="noopener noreferrer" title="Open resource" aria-label={`Open ${resourceTitle}`}>
                <ExternalLink size={15} />
                <span>Open</span>
              </a>
            )}
            {options.mode === 'result' ? (
              <button type="button" onClick={() => handleAddResource(resource)} disabled={resourceLoading}>
                <Link size={14} />
                Save
              </button>
            ) : (
              <>
                {isCompleted ? (
                  <span className="lpd-resource-done"><CheckCircle size={13} /> Done</span>
                ) : (
                  <button type="button" onClick={() => handleResourceComplete(resource.id, resource.estimated_minutes || 10)}>
                    <CheckCircle size={14} />
                    Done
                  </button>
                )}
              </>
            )}
          </div>
          {options.mode !== 'result' && (
            <div className="lpd-resource-rating-row">
              <span>Rate</span>
              <div className="lpd-resource-stars" aria-label="Rate resource">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={rating >= value ? 'active' : ''}
                    onClick={() => handleResourceRate(resource.id, value)}
                    title={`${value} star`}
                  >
                    <Star size={13} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const nodeProgressPct = selectedNode?.progress?.progress_pct || 0;
  const estimatedMinutes = selectedNode?.estimated_minutes || 0;
  const loggedMinutes = Math.max(0, timeSpentMinutes || 0);
  const remainingMinutes = Math.max(0, estimatedMinutes - loggedMinutes);
  const focusTargetMinutes = Math.max(5, Math.min(25, remainingMinutes || estimatedMinutes || 25));
  const focusTargetSeconds = focusTargetMinutes * 60;
  const focusSessionPct = Math.min(100, Math.round((sessionSeconds / focusTargetSeconds) * 100));
  const completedActivityCount = activityPlan.filter(
    (activity) => selectedNode?.progress?.evidence?.[activity.type]?.completed
  ).length;
  const plannedActivityCount = activityPlan.length || 0;
  const activityCompletionPct = plannedActivityCount
    ? Math.round((completedActivityCount / plannedActivityCount) * 100)
    : nodeProgressPct;

  const nextActivity = selectedNode?.content_plan?.find(
    (activity) => !selectedNode.progress?.evidence?.[activity.type]?.completed
  ) || selectedNode?.content_plan?.[0];

  const nextActivityLabel = nextActivity?.type
    ? nextActivity.type.replace(/_/g, ' ').toUpperCase()
    : 'ALL ACTIVITIES COMPLETE';

  if (loading) {
    return (
      <div className="lpd-shell with-social-chrome">
        <SocialHubChrome
          brandKicker="Learning Path"
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          sideSections={[{ label: 'Current route', items: [{ label: 'Loading path', icon: Loader, active: true, disabled: true }] }]}
          footerItems={[{ icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard-cerbyl' }]}
          sidebarLead={(
            <button className="lpd-side-primary" type="button" onClick={() => navigate('/learning-paths')}>
              <ChevronLeft size={15} /> All learning paths
            </button>
          )}
        >
          <div className="lpd-main-wrap lpd-status-wrap">
            <div className="lpd-loading">
              <Loader className="lpd-spinner" size={32} />
              <span className="lpd-hero-kicker">Preparing workspace</span>
              <strong>Loading learning path</strong>
              <p>Bringing your sequence, progress, and study materials into focus.</p>
            </div>
          </div>
        </SocialHubChrome>
      </div>
    );
  }

  if (!path) {
    return null;
  }

  const detailSections = [{
    label: 'Path nodes',
    items: nodes.map((node, index) => {
      const isActive = selectedNode?.id === node.id;
      const isLocked = node.progress.status === 'locked';
      const NodeIcon = node.progress.status === 'completed'
        ? CheckCircle
        : node.progress.status === 'in_progress'
        ? Play
        : isLocked
        ? Lock
        : Circle;
      return {
        label: `${String(index + 1).padStart(2, '0')} · ${node.title}`,
        icon: NodeIcon,
        active: isActive,
        disabled: isLocked,
        count: !isLocked && node.progress.progress_pct ? `${Math.round(node.progress.progress_pct)}%` : undefined,
        onClick: () => setSelectedNode(node),
      };
    }),
  }];

  return (
    <div className="lpd-shell with-social-chrome">
      {actionLoading && (
        <div className="lpd-loading-overlay">
          <div className="lpd-loading-content">
            <Loader className="lpd-spinner" size={40} />
            <p>Generating content…</p>
          </div>
        </div>
      )}

      <SocialHubChrome
        brandKicker="Learning Path"
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        sideSections={detailSections}
        collapsedLeadItems={[{ icon: ChevronLeft, label: 'All learning paths', onClick: () => navigate('/learning-paths') }]}
        footerItems={[{ icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard-cerbyl' }]}
        sidebarLead={(
          <button className="lpd-side-primary" type="button" onClick={() => navigate('/learning-paths')}>
            <ChevronLeft size={15} />
            <span>All learning paths</span>
          </button>
        )}
        sidebarTail={(
          <div className="lpd-sidebar-summary">
            <span>Current route</span>
            <strong>{path.title}</strong>
            <div className="lpd-summary-track" role="progressbar" aria-label="Learning path completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(path.progress.completion_percentage)}>
              <i style={{ width: `${path.progress.completion_percentage}%` }} />
            </div>
            <small>{Math.round(path.progress.completion_percentage)}% complete</small>
          </div>
        )}
      >
      <div className="lpd-main-wrap" ref={workspaceScrollRef}>
        <div className="cb-tile-texture lpd-page-texture" aria-hidden />
        {/* Hero header */}
        <div className="lpd-hero">
          <div className="lpd-hero-left">
            <span className="lpd-hero-kicker">LEARNING PATH</span>
            <h1 className="lpd-hero-title">{path.title}</h1>
            {path.description && <p className="lpd-hero-desc">{path.description}</p>}
          </div>
          <div className="lpd-hero-right">
            <div className="lpd-hero-pills">
              <span className={`lpd-hero-pill lpd-hero-pill--${path.difficulty}`}>{path.difficulty}</span>
              <span className="lpd-hero-pill"><Clock size={12} /> {Math.round(path.estimated_hours)}h</span>
              <span className="lpd-hero-pill"><BookOpen size={12} /> {path.completed_nodes}/{path.total_nodes} nodes</span>
              <span className="lpd-hero-pill lpd-hero-pill--xp"><Award size={12} /> {path.progress.total_xp_earned} XP</span>
            </div>
          </div>
        </div>

        <div className="lpd-main" ref={pathMainRef}>
        <div className="lpd-details">
          {selectedNode ? (
            <>
              <div className="lpd-details-head">
                <div className="lpd-details-info">
                  <h2>{selectedNode.title.toUpperCase()}</h2>
                  <p>{selectedNode.description}</p>
                </div>
                <div className="lpd-status-badge">
                  {getNodeStatusIcon(selectedNode.progress.status)}
                  <span>{selectedNode.progress.status.replace('_', ' ').toUpperCase()}</span>
                </div>
              </div>

              <nav className="lpd-workspace-tabs" aria-label="Node workspace sections" role="tablist">
                {[
                  { id: 'overview', label: 'Overview', icon: <Map size={16} />, meta: `${completedActivityCount}/${plannedActivityCount || 0}` },
                  { id: 'learn', label: 'Learn', icon: <BookOpen size={16} />, meta: selectedNode.core_sections?.length || 0 },
                  { id: 'resources', label: 'Resources', icon: <Globe2 size={16} />, meta: resourceCatalog.length },
                  { id: 'notes', label: 'Notes', icon: <FileText size={16} />, meta: userNote.trim() ? 'Saved' : 'Draft' },
                ].map((section) => (
                  <button
                    type="button"
                    role="tab"
                    key={section.id}
                    id={`lpd-tab-${section.id}`}
                    aria-controls={`lpd-panel-${section.id}`}
                    aria-selected={workspaceSection === section.id}
                    tabIndex={workspaceSection === section.id ? 0 : -1}
                    className={workspaceSection === section.id ? 'active' : ''}
                    onClick={() => setWorkspaceSection(section.id)}
                    onKeyDown={(event) => handleRovingTabKey(
                      event,
                      ['overview', 'learn', 'resources', 'notes'],
                      workspaceSection,
                      setWorkspaceSection,
                      'lpd-tab-',
                    )}
                  >
                    <span className="lpd-tab-icon">{section.icon}</span>
                    <span>{section.label}</span>
                    <small>{section.meta}</small>
                  </button>
                ))}
              </nav>

              {workspaceSection === 'overview' && (
              <section id="lpd-panel-overview" className="lpd-section-panel lpd-section-panel--overview" aria-labelledby="lpd-tab-overview" role="tabpanel">
              <div className="lpd-overview">
                <div className="lpd-overview-card lpd-overview-next">
                  <div className="cb-tile-texture" />
                  <div className="lpd-overview-label">
                    {nextActivity ? getActivityIcon(nextActivity.type) : <CheckCircle size={14} />}
                    Next Task
                  </div>
                  <h4>{nextActivityLabel}</h4>
                  <p>{nextActivity ? nextActivity.description : 'All planned work for this node is complete.'}</p>
                  <div className="lpd-overview-foot">
                    <span>{completedActivityCount}/{plannedActivityCount || 1} activities done</span>
                    <strong>{Math.max(0, plannedActivityCount - completedActivityCount)} left</strong>
                  </div>
                  <button
                    className="lpd-overview-btn"
                    onClick={() => nextActivity && handleActivityClick(nextActivity)}
                    disabled={!nextActivity || actionLoading}
                  >
                    <Play size={14} />
                    {nextActivity ? 'Launch Activity' : 'All Done'}
                  </button>
                </div>
                <div className="lpd-overview-card lpd-overview-focus">
                  <div className="cb-tile-texture" />
                  <div className="lpd-overview-label">
                    <Timer size={14} />
                    Focus Session
                  </div>
                  <div className="lpd-focus-timer">{formatDuration(sessionSeconds)}</div>
                  <div className="lpd-overview-track" aria-label="Current focus session progress">
                    <span style={{ width: `${focusSessionPct}%` }} />
                  </div>
                  <div className="lpd-focus-meta">
                    <span>{focusTargetMinutes} min target</span>
                    <strong>{remainingMinutes} min left</strong>
                  </div>
                  <div className="lpd-focus-actions">
                    <button className="lpd-focus-btn" onClick={handleSessionToggle}>
                      {sessionActive ? (
                        <>
                          <Pause size={14} />
                          End & Log
                        </>
                      ) : (
                        <>
                          <Play size={14} />
                          Start Focus
                        </>
                      )}
                    </button>
                    <button className="lpd-focus-btn lpd-focus-secondary" onClick={() => logTimeSpent(5)}>
                      +5 min
                    </button>
                  </div>
                  <div className="lpd-overview-foot">
                    <span>Total logged</span>
                    <strong>{loggedMinutes} min</strong>
                  </div>
                  {sessionLoggedMinutes ? (
                    <div className="lpd-focus-toast">Logged {sessionLoggedMinutes} min</div>
                  ) : null}
                </div>
                <div className="lpd-overview-card lpd-overview-progress">
                  <div className="cb-tile-texture" />
                  <div className="lpd-overview-label">
                    <BarChart3 size={14} />
                    Node Progress
                  </div>
                  <div className="lpd-pulse-score">
                    <strong>{Math.max(nodeProgressPct, activityCompletionPct)}%</strong>
                    <span>current node progress</span>
                  </div>
                  <div className="lpd-overview-track" aria-label="Node progress">
                    <span style={{ width: `${Math.max(nodeProgressPct, activityCompletionPct)}%` }} />
                  </div>
                  <div className="lpd-overview-metric">
                    <span>Activities</span>
                    <strong>{completedActivityCount}/{plannedActivityCount || 1}</strong>
                  </div>
                  <div className="lpd-overview-metric">
                    <span>Time left</span>
                    <strong>{remainingMinutes} min</strong>
                  </div>
                  <div className="lpd-overview-metric">
                    <span>XP Ready</span>
                    <strong>+{selectedNode.reward?.xp || 50}</strong>
                  </div>
                </div>
              </div>

              <div className="lpd-block">
                <h3 className="lpd-block-title">
                  <Sparkles size={16} />
                  LEARNING TOOLKIT
                </h3>
                <div className="lpd-toolkit">
                  {toolkitItems.map((item) => (
                    <button
                      key={item.type}
                      className={`lpd-toolkit-card ${item.completed ? 'is-complete' : ''}`}
                      onClick={() => handleActivityClick(item.activity)}
                      disabled={actionLoading}
                      type="button"
                    >
                      <div className="cb-tile-texture" />
                      <div className="lpd-toolkit-icon">
                        {getActivityIcon(item.type)}
                      </div>
                      <div className="lpd-toolkit-body">
                        <span className="lpd-toolkit-title">{item.label}</span>
                        <p>{item.description}</p>
                      </div>
                      <div className="lpd-toolkit-meta">
                        {item.completed ? (
                          <span className="lpd-toolkit-status done">Done</span>
                        ) : (
                          <span className="lpd-toolkit-status">{item.count ? `${item.count} items` : 'Ready'}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              </section>
              )}

              {workspaceSection === 'resources' && (
              <section id="lpd-panel-resources" className="lpd-section-panel lpd-section-panel--resources" aria-labelledby="lpd-tab-resources" role="tabpanel">
              <div className="lpd-block lpd-resource-lab">
                <div className="lpd-resource-lab-head">
                  <div>
                    <h3 className="lpd-block-title">
                      <Globe2 size={16} />
                      RESOURCE LAB
                    </h3>
                    <p>Attach an article, docs page, course, or search the web for material tied to this node.</p>
                  </div>
                  <span>{resourceCatalog.length} saved</span>
                </div>

                <div className="lpd-resource-tools">
                  <div className="lpd-resource-tool-card">
                    <div className="lpd-resource-tool-label">
                      <Link size={15} />
                      <span>Add a resource</span>
                    </div>
                    <div className="lpd-resource-input-row">
                      <div className="lpd-resource-input">
                        <input
                          value={resourceUrl}
                          onChange={(event) => setResourceUrl(event.target.value)}
                          placeholder="Paste an article, docs, GitHub, or course URL"
                          type="url"
                        />
                      </div>
                      <button type="button" onClick={() => handleAddResource()} disabled={resourceLoading}>
                        {resourceLoading ? <Loader className="lpd-spinner" size={14} /> : <CheckCircle size={14} />}
                        Add
                      </button>
                    </div>
                  </div>

                  <div className="lpd-resource-tool-card">
                    <div className="lpd-resource-tool-label">
                      <Search size={15} />
                      <span>Search for this node</span>
                    </div>
                    <div className="lpd-resource-search-row">
                      <div className="lpd-resource-input">
                        <input
                          value={resourceSearchQuery}
                          onChange={(event) => setResourceSearchQuery(event.target.value)}
                          placeholder="Search for videos, docs, explainers, and practice resources"
                          type="search"
                        />
                      </div>
                      <select value={resourceSearchProvider} onChange={(event) => setResourceSearchProvider(event.target.value)}>
                        <option value="auto">Auto</option>
                        <option value="tavily">Tavily</option>
                        <option value="brave">Brave</option>
                      </select>
                      <button type="button" onClick={handleSearchResources} disabled={resourceLoading}>
                        {resourceLoading ? <Loader className="lpd-spinner" size={14} /> : <Globe2 size={14} />}
                        Search
                      </button>
                    </div>
                  </div>
                </div>

                {resourceMessage && <div className="lpd-resource-message">{resourceMessage}</div>}

                {resourceSearchResults.length > 0 && (
                  <div className="lpd-resource-results">
                    <div className="lpd-resource-subhead">Search Results</div>
                    <div className="lpd-resource-grid">
                      {resourceSearchResults.map((resource) => renderResourceCard(resource, { mode: 'result' }))}
                    </div>
                  </div>
                )}

                <div className="lpd-resource-results">
                  <div className="lpd-resource-subhead">Saved Resources</div>
                  {resourceCatalog.length > 0 ? (
                    <div className="lpd-resource-grid">
                      {resourceCatalog.map((resource) => renderResourceCard(resource))}
                    </div>
                  ) : (
                    <div className="lpd-resource-empty">
                      <BookOpen size={22} />
                      <span>No resources saved for this node yet.</span>
                    </div>
                  )}
                </div>
              </div>
              </section>
              )}

              {workspaceSection === 'learn' && (
              <section id="lpd-panel-learn" className="lpd-section-panel lpd-section-panel--learn" aria-labelledby="lpd-tab-learn" role="tabpanel">
              <nav className="lpd-learn-subnav" aria-label="Learning material sections" role="tablist">
                {[
                  { id: 'content', label: 'Core lesson', meta: selectedNode.core_sections?.length || 0 },
                  { id: 'connections', label: 'Connections', meta: 'Map' },
                  { id: 'practice', label: 'Practice', meta: selectedNode.content_plan?.length || 0 },
                ].map((section) => (
                  <button
                    type="button"
                    role="tab"
                    key={section.id}
                    id={`lpd-learn-tab-${section.id}`}
                    aria-controls={`lpd-learn-panel-${section.id}`}
                    aria-selected={learnSection === section.id}
                    tabIndex={learnSection === section.id ? 0 : -1}
                    className={learnSection === section.id ? 'active' : ''}
                    onClick={() => setLearnSection(section.id)}
                    onKeyDown={(event) => handleRovingTabKey(
                      event,
                      ['content', 'connections', 'practice'],
                      learnSection,
                      setLearnSection,
                      'lpd-learn-tab-',
                    )}
                  >
                    <span>{section.label}</span>
                    <small>{section.meta}</small>
                  </button>
                ))}
              </nav>

              {learnSection === 'content' && (
              <div id="lpd-learn-panel-content" className="lpd-learn-view lpd-learn-view--content" role="tabpanel" aria-labelledby="lpd-learn-tab-content">
              <div className="lpd-block lpd-difficulty-toggle">
                <h3 className="lpd-block-title">
                  <TrendingUp size={16} />
                  DIFFICULTY LEVEL
                </h3>
                <div className="lpd-difficulty-buttons">
                  <button
                    className={`lpd-difficulty-btn ${difficultyView === 'beginner' ? 'active' : ''}`}
                    aria-pressed={difficultyView === 'beginner'}
                    onClick={() => handleDifficultyChange('beginner')}
                  >
                    Beginner
                  </button>
                  <button
                    className={`lpd-difficulty-btn ${difficultyView === 'intermediate' ? 'active' : ''}`}
                    aria-pressed={difficultyView === 'intermediate'}
                    onClick={() => handleDifficultyChange('intermediate')}
                  >
                    Intermediate
                  </button>
                  <button
                    className={`lpd-difficulty-btn ${difficultyView === 'advanced' ? 'active' : ''}`}
                    aria-pressed={difficultyView === 'advanced'}
                    onClick={() => handleDifficultyChange('advanced')}
                  >
                    Advanced
                  </button>
                </div>
              </div>

              {selectedNode.core_sections && selectedNode.core_sections.length > 0 && (
                <div className="lpd-lesson-stage">
                  <nav className="lpd-lesson-index" aria-label="Core lesson index">
                    {selectedNode.core_sections.map((section, idx) => (
                      <button
                        type="button"
                        key={`${section.title}-${idx}`}
                        className={coreSectionIndex === idx ? 'active' : ''}
                        aria-current={coreSectionIndex === idx ? 'step' : undefined}
                        onClick={() => setCoreSectionIndex(idx)}
                      >
                        <span>{String(idx + 1).padStart(2, '0')}</span>
                        <strong>{section.title}</strong>
                      </button>
                    ))}
                  </nav>
                  <article className="lpd-lesson-canvas">
                    <header>
                      <span>Lesson {coreSectionIndex + 1} of {selectedNode.core_sections.length}</span>
                      <h3>{selectedNode.core_sections[coreSectionIndex]?.title}</h3>
                    </header>
                    <div className="lpd-lesson-scroll">
                      <MathRenderer content={selectedNode.core_sections[coreSectionIndex]?.content} className="lpd-section-text" />
                      {selectedNode.core_sections[coreSectionIndex]?.example && (
                        <div className="lpd-section-example">
                          <strong>Example:</strong> {selectedNode.core_sections[coreSectionIndex].example}
                        </div>
                      )}
                      {selectedNode.core_sections[coreSectionIndex]?.visual_description && (
                        <div className="lpd-section-visual">
                          <ImageIcon size={14} />
                          <span>{selectedNode.core_sections[coreSectionIndex].visual_description}</span>
                        </div>
                      )}
                      {selectedNode.core_sections[coreSectionIndex]?.practice_question && (
                        <div className="lpd-section-practice">
                          <Target size={14} />
                          <span><strong>Quick Check:</strong> {selectedNode.core_sections[coreSectionIndex].practice_question}</span>
                        </div>
                      )}
                    </div>
                    <footer>
                      <button type="button" disabled={coreSectionIndex === 0} onClick={() => setCoreSectionIndex((value) => Math.max(0, value - 1))}>
                        <ChevronLeft size={14} /> Previous
                      </button>
                      <button type="button" disabled={coreSectionIndex === selectedNode.core_sections.length - 1} onClick={() => setCoreSectionIndex((value) => Math.min(selectedNode.core_sections.length - 1, value + 1))}>
                        Next <ChevronRight size={14} />
                      </button>
                    </footer>
                  </article>
                </div>
              )}
              </div>
              )}

              {learnSection === 'connections' && (
              <div id="lpd-learn-panel-connections" className="lpd-learn-view lpd-learn-view--connections" role="tabpanel" aria-labelledby="lpd-learn-tab-connections">
              {selectedNode.connection_map && Object.keys(selectedNode.connection_map).length > 0 && (
                <div className="lpd-block">
                  <h3 className="lpd-block-title">
                    <GitBranch size={16} />
                    HOW THIS CONNECTS
                  </h3>
                  <div className="lpd-connection-map">
                    {selectedNode.connection_map.builds_on && selectedNode.connection_map.builds_on.length > 0 && (
                      <div className="lpd-connection-section">
                        <h4>Builds On:</h4>
                        <ul>
                          {selectedNode.connection_map.builds_on.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedNode.connection_map.leads_to && selectedNode.connection_map.leads_to.length > 0 && (
                      <div className="lpd-connection-section">
                        <h4>Leads To:</h4>
                        <ul>
                          {selectedNode.connection_map.leads_to.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedNode.connection_map.related_topics && selectedNode.connection_map.related_topics.length > 0 && (
                      <div className="lpd-connection-section">
                        <h4>Related Topics:</h4>
                        <ul>
                          {selectedNode.connection_map.related_topics.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedNode.real_world_applications && selectedNode.real_world_applications.length > 0 && (
                <div className="lpd-block">
                  <h3 className="lpd-block-title">
                    <Sparkles size={16} />
                    REAL-WORLD APPLICATIONS
                  </h3>
                  <div className="lpd-applications">
                    {selectedNode.real_world_applications.map((app, idx) => (
                      <div key={idx} className="lpd-application-item">
                        <div className="lpd-application-icon">
                          <Lightbulb size={16} />
                        </div>
                        <p>{app}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedNode.summary && selectedNode.summary.length > 0 && (
                <div className="lpd-block lpd-summary-block">
                  <h3 className="lpd-block-title">
                    <CheckCircle size={16} />
                    KEY TAKEAWAYS
                  </h3>
                  <ul className="lpd-summary-list">
                    {selectedNode.summary.map((item, idx) => (
                      <li key={idx}>
                        <CheckCircle size={12} />
                        <MathRenderer content={item} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              </div>
              )}

              {learnSection === 'practice' && (
              <div id="lpd-learn-panel-practice" className="lpd-learn-view lpd-learn-view--practice" role="tabpanel" aria-labelledby="lpd-learn-tab-practice">
              <div className="lpd-block">
                <h3 className="lpd-block-title">
                  <Target size={16} />
                  LEARNING OBJECTIVES
                </h3>
                <ul className="lpd-objectives">
                  {selectedNode.objectives?.map((obj, i) => (
                    <li key={i}>
                      <CheckCircle size={14} />
                      <span>{obj}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {selectedNode.prerequisites && selectedNode.prerequisites.length > 0 && (
                <div className="lpd-block">
                  <h3 className="lpd-block-title">
                    <BookOpen size={16} />
                    PREREQUISITES
                  </h3>
                  <ul className="lpd-prerequisites">
                    {selectedNode.prerequisites.map((prereq, i) => (
                      <li key={i}>
                        <Circle size={12} />
                        <span>{prereq}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="lpd-block">
                <h3 className="lpd-block-title">
                  <Sparkles size={16} />
                  ACTIVITIES
                </h3>
                <div className="lpd-activities">
                  {selectedNode.content_plan?.map((activity, i) => {
                    const isCompleted = selectedNode.progress?.evidence?.[activity.type]?.completed;
                    return (
                      <button
                        type="button"
                        key={i} 
                        className={`lpd-activity ${isCompleted ? 'lpd-activity-completed' : ''}`}
                        onClick={() => handleActivityClick(activity)}
                      >
                        <div className="lpd-activity-icon">
                          {getActivityIcon(activity.type)}
                        </div>
                        <div className="lpd-activity-info">
                          <h4>{activity.type.toUpperCase()}</h4>
                          <p>{activity.description}</p>
                          {(activity.count || activity.question_count) && (
                            <span className="lpd-activity-count">
                              {activity.count || activity.question_count} {activity.count ? 'items' : 'questions'}
                            </span>
                          )}
                        </div>
                        {isCompleted ? (
                          <CheckCircle size={16} className="lpd-activity-check" />
                        ) : (
                          <ChevronRight size={16} className="lpd-activity-chevron" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              </div>
              )}
              </section>
              )}

              {workspaceSection === 'notes' && (
              <section id="lpd-panel-notes" className="lpd-section-panel lpd-section-panel--notes" aria-labelledby="lpd-tab-notes" role="tabpanel">
              <div className="lpd-block">
                <h3 className="lpd-block-title">
                  <FileText size={16} />
                  MY NOTES
                </h3>
                <div className="lpd-notes-section">
                  <textarea
                    className="lpd-notes-textarea"
                    placeholder="Write your notes, reflections, or key takeaways here..."
                    value={userNote}
                    onChange={(e) => setUserNote(e.target.value)}
                    rows={6}
                  />
                  <button
                    className="lpd-btn lpd-btn-save-note"
                    onClick={handleSaveNote}
                    disabled={noteLoading}
                  >
                    {noteLoading ? (
                      <>
                        <Loader className="lpd-spinner" size={14} />
                        Saving...
                      </>
                    ) : noteSaved ? (
                      <>
                        <CheckCircle size={14} />
                        Saved!
                      </>
                    ) : (
                      <>
                        <FileText size={14} />
                        Save Note
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="lpd-block">
                <h3 className="lpd-block-title">
                  <Award size={16} />
                  COMPLETION REWARD
                </h3>
                <div className="lpd-reward">
                  <Zap size={24} />
                  <span>+{selectedNode.reward?.xp || 50} XP</span>
                </div>
              </div>

              <div className="lpd-block">
                <h3 className="lpd-block-title">
                  <Download size={16} />
                  EXPORT & INTEGRATE
                </h3>
                <div className="lpd-export-buttons">
                  <button className="lpd-export-btn" onClick={handleExportToNotes}>
                    <FileText size={14} />
                    <span>Export to Notes</span>
                  </button>
                  <button className="lpd-export-btn" onClick={handleExportToFlashcards}>
                    <Brain size={14} />
                    <span>Export to Flashcards</span>
                  </button>
                  <button className="lpd-export-btn" onClick={handleExportToCalendar}>
                    <Calendar size={14} />
                    <span>Add to Calendar</span>
                  </button>
                </div>
              </div>
              </section>
              )}

              <div className="lpd-actions">
                {selectedNode.progress.status === 'unlocked' && (
                  <button
                    className="lpd-btn lpd-btn-start"
                    onClick={() => handleStartNode(selectedNode)}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <Loader className="lpd-spinner" size={14} />
                    ) : (
                      <>
                        <Play size={14} />
                        <span>START NODE</span>
                      </>
                    )}
                  </button>
                )}
                
                {selectedNode.progress.status === 'in_progress' && (
                  <button
                    className="lpd-btn lpd-btn-complete"
                    onClick={() => handleCompleteNode(selectedNode)}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <Loader className="lpd-spinner" size={14} />
                    ) : (
                      <>
                        <CheckCircle size={14} />
                        <span>COMPLETE NODE</span>
                      </>
                    )}
                  </button>
                )}
                
                {selectedNode.progress.status === 'completed' && (
                  <div className="lpd-completed">
                    <CheckCircle size={18} />
                    <span>COMPLETED</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="lpd-empty">
              <BookOpen size={48} />
              <p>SELECT A NODE TO VIEW DETAILS</p>
            </div>
          )}
        </div>
        </div>
      </div>
      </SocialHubChrome>

      {showCompletionQuiz && (
        <div className="lpd-quiz-overlay">
          <div className="lpd-quiz-modal" role="dialog" aria-modal="true" aria-labelledby="lpd-completion-quiz-title">
            <div className="lpd-quiz-header">
              <h2 id="lpd-completion-quiz-title">COMPLETION QUIZ</h2>
              <p>Score 75% or higher to complete this node</p>
            </div>

            {!quizSubmitted ? (
              <>
                <div className="lpd-quiz-progress">
                  <span>Question {currentQuizQuestion + 1} of {quizQuestions.length}</span>
                  <div className="lpd-quiz-progress-bar">
                    <div 
                      className="lpd-quiz-progress-fill"
                      style={{ width: `${((currentQuizQuestion + 1) / quizQuestions.length) * 100}%` }}
                    />
                  </div>
                </div>

                {quizQuestions[currentQuizQuestion] && (
                  <div className="lpd-quiz-question">
                    <h3>{quizQuestions[currentQuizQuestion].question}</h3>
                    <div className="lpd-quiz-options">
                      {quizQuestions[currentQuizQuestion].options?.map((option, idx) => (
                        <button
                          key={idx}
                          className={`lpd-quiz-option ${quizAnswers[currentQuizQuestion] === idx ? 'selected' : ''}`}
                          onClick={() => handleQuizAnswer(currentQuizQuestion, idx)}
                        >
                          <span className="lpd-option-letter">{String.fromCharCode(65 + idx)}</span>
                          <span className="lpd-option-text">{displayQuizOption(option)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="lpd-quiz-actions">
                  <button 
                    className="lpd-btn lpd-btn-secondary"
                    onClick={handleQuizClose}
                  >
                    Cancel
                  </button>
                  
                  {currentQuizQuestion > 0 && (
                    <button
                      className="lpd-btn lpd-btn-secondary"
                      onClick={() => setCurrentQuizQuestion(currentQuizQuestion - 1)}
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>
                  )}
                  
                  {currentQuizQuestion < quizQuestions.length - 1 ? (
                    <button
                      className="lpd-btn lpd-btn-primary"
                      onClick={() => setCurrentQuizQuestion(currentQuizQuestion + 1)}
                      disabled={quizAnswers[currentQuizQuestion] === undefined}
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button
                      className="lpd-btn lpd-btn-complete"
                      onClick={handleQuizSubmit}
                      disabled={Object.keys(quizAnswers).length !== quizQuestions.length || actionLoading}
                    >
                      {actionLoading ? (
                        <>
                          <Loader className="lpd-spinner" size={14} />
                          Submitting...
                        </>
                      ) : (
                        <>
                          <CheckCircle size={16} />
                          Submit Quiz
                        </>
                      )}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="lpd-quiz-results">
                <div className={`lpd-quiz-score ${quizScore >= 75 ? 'passed' : 'failed'}`}>
                  <div className="lpd-score-circle">
                    <span className="lpd-score-number">{quizScore}%</span>
                  </div>
                  <h3>{quizScore >= 75 ? 'PASSED!' : 'NOT PASSED'}</h3>
                  <p>
                    {quizScore >= 75 
                      ? 'Congratulations! You can now complete this node.'
                      : 'You need 75% or higher. Review the material and try again.'}
                  </p>
                </div>

                <div className="lpd-quiz-breakdown">
                  <h4>QUIZ BREAKDOWN</h4>
                  {quizQuestions.map((q, idx) => {
                    const userAnswer = quizAnswers[idx];
                    const isCorrect = userAnswer === q.correct_answer;
                    return (
                      <div key={idx} className={`lpd-quiz-item ${isCorrect ? 'correct' : 'incorrect'}`}>
                        <div className="lpd-quiz-item-header">
                          {isCorrect ? <CheckCircle size={16} /> : <Circle size={16} />}
                          <span>Question {idx + 1}</span>
                        </div>
                        <p className="lpd-quiz-item-question">{q.question}</p>
                        {!isCorrect && (
                          <div className="lpd-quiz-item-answer">
                            <p><strong>Your answer:</strong> {displayQuizOption(q.options[userAnswer])}</p>
                            <p><strong>Correct answer:</strong> {displayQuizOption(q.options[q.correct_answer])}</p>
                            {q.explanation && <MathRenderer content={q.explanation} className="lpd-explanation" />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="lpd-quiz-actions">
                  {quizScore >= 75 ? (
                    <button
                      className="lpd-btn lpd-btn-complete"
                      onClick={handleQuizClose}
                      disabled={actionLoading}
                    >
                      {actionLoading ? (
                        <>
                          <Loader className="lpd-spinner" size={14} />
                          Completing...
                        </>
                      ) : (
                        'Continue'
                      )}
                    </button>
                  ) : (
                    <>
                      <button
                        className="lpd-btn lpd-btn-secondary"
                        onClick={handleQuizClose}
                      >
                        Review Material
                      </button>
                      <button
                        className="lpd-btn lpd-btn-primary"
                        onClick={handleQuizRetry}
                      >
                        Retry Quiz
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LearningPathDetail;
