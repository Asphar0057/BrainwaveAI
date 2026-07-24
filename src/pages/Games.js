import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Trophy, Target, Activity as ActivityIcon, Swords, Award, BarChart3,
  MessageSquare, LayoutDashboard, Zap, ChevronLeft, ChevronRight,
  Gamepad2, Sparkles
} from 'lucide-react';
import AbstractFx from '../components/AbstractFx';
import './Games.css';
import '../components/SocialHubChrome.css';
import { API_URL } from '../config';

const Games = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 860 : false
  ));
  
  const [gamificationStats, setGamificationStats] = useState({
    total_points: 0,
    level: 1,
    experience: 0,
    rank: null,
    weekly_points: 0,
    weekly_study_minutes: 0
  });
  
  const [bingoStats, setBingoStats] = useState({});
  const [weeklyProgress, setWeeklyProgress] = useState({
    study_minutes: 0,
    ai_chats: 0,
    notes_created: 0,
    questions_answered: 0,
    quizzes_completed: 0,
    flashcards_created: 0,
    solo_quizzes: 0,
    flashcards_reviewed: 0,
    flashcards_mastered: 0
  });
  
  const [recentActivities, setRecentActivities] = useState([]);
  const [pointsToNextLevel, setPointsToNextLevel] = useState(100);
  const [dailyChallenge, setDailyChallenge] = useState(null);
  const [dailyChallengeProgress, setDailyChallengeProgress] = useState(0);

  const bingoTasks = [
    { id: 1, title: 'Chat 50 Times', stat: 'ai_chats', target: 50, points: 50 },
    { id: 2, title: 'Answer 20 Questions', stat: 'questions_answered', target: 20, points: 100 },
    { id: 3, title: 'Create 5 Notes', stat: 'notes_created', target: 5, points: 50 },
    { id: 4, title: 'Study 5 Hours', stat: 'study_hours', target: 5, points: 200 },
    { id: 5, title: 'Complete 3 Quizzes', stat: 'quizzes_completed', target: 3, points: 150 },
    { id: 6, title: 'Create 10 Flashcards', stat: 'flashcards_created', target: 10, points: 100 },
    { id: 7, title: '7 Day Streak', stat: 'streak', target: 7, points: 300 },
    { id: 8, title: 'Win 3 Battles', stat: 'battles_won', target: 3, points: 150 },
    { id: 9, title: 'Solo Quiz Master', stat: 'solo_quizzes', target: 5, points: 200 },
    { id: 10, title: 'Chat 100 Times', stat: 'ai_chats', target: 100, points: 100 },
    { id: 11, title: 'Create 10 Notes', stat: 'notes_created', target: 10, points: 100 },
    { id: 12, title: 'Answer 50 Questions', stat: 'questions_answered', target: 50, points: 200 },
    { id: 13, title: 'Complete 5 Quizzes', stat: 'quizzes_completed', target: 5, points: 250 },
    { id: 14, title: 'Win 5 Battles', stat: 'battles_won', target: 5, points: 250 },
    { id: 15, title: 'Review 50 Cards', stat: 'flashcards_reviewed', target: 50, points: 150 },
    { id: 16, title: 'Master Level', stat: 'level', target: 5, points: 1000 }
  ];

  useEffect(() => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');

    if (!token) {
      navigate('/login');
      return;
    }

    if (username) {
      loadAllData(username);
    }
    
  }, [navigate]);

  const loadAllData = async (username) => {
    try {
      
      await Promise.all([
        loadGamificationStats(username),
        loadBingoStats(username),
        loadWeeklyProgress(username),
        loadRecentActivities(username),
        loadDailyChallenge(username)
      ]);
    } catch (error) { /* silenced */ } finally {
      setLoading(false);
    }
  };
  
  

  const loadGamificationStats = async (username) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/get_gamification_stats?user_id=${username}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setGamificationStats(data);
        
        
        if (data.xp_to_next_level !== undefined) {
          setPointsToNextLevel(data.xp_to_next_level);
        } else {
          const expForNextLevel = calculateExpForLevel(data.level + 1);
          setPointsToNextLevel(expForNextLevel - data.experience);
        }
      }
    } catch (error) { /* silenced */ }
  };

  const loadBingoStats = async (username) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/get_weekly_bingo_stats?user_id=${username}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
                        
        
        if (data.stats) {
          setBingoStats(data.stats);
                  } else {
                  }
      } else {
              }
    } catch (error) { /* silenced */ }
  };

  const loadWeeklyProgress = async (username) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/get_weekly_activity_progress?user_id=${username}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
                setWeeklyProgress(data);
      }
    } catch (error) { /* silenced */ }
  };

  const loadRecentActivities = async (username) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/get_recent_point_activities?user_id=${username}&limit=5`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setRecentActivities(data.activities || []);
      }
    } catch (error) { /* silenced */ }
  };

  const loadDailyChallenge = async (username) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/get_daily_challenge?user_id=${username}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setDailyChallenge(data.challenge);
        setDailyChallengeProgress(data.progress || 0);
      }
    } catch (error) {
            
      generateFallbackChallenge();
    }
  };

  const generateFallbackChallenge = () => {
    const challenges = [
      { id: 1, title: 'Knowledge Sprint', description: 'Answer 15 questions correctly', target: 15, type: 'questions_answered', reward: 100, icon: 'target' },
      { id: 2, title: 'Chat Master', description: 'Have 25 AI conversations', target: 25, type: 'ai_chats', reward: 75, icon: 'chat' },
      { id: 3, title: 'Note Taker', description: 'Create 5 new notes', target: 5, type: 'notes_created', reward: 150, icon: 'note' },
      { id: 4, title: 'Study Marathon', description: 'Study for 2 hours', target: 120, type: 'study_minutes', reward: 200, icon: 'clock' },
      { id: 5, title: 'Quiz Champion', description: 'Complete 3 quizzes with 80%+', target: 3, type: 'quizzes_completed', reward: 175, icon: 'trophy' },
      { id: 6, title: 'Flashcard Creator', description: 'Create 20 flashcards', target: 20, type: 'flashcards_created', reward: 125, icon: 'cards' },
      { id: 7, title: 'Perfect Score', description: 'Get 100% on any quiz', target: 1, type: 'perfect_quizzes', reward: 250, icon: 'star' }
    ];
    
    const today = new Date().getDate();
    const challengeIndex = today % challenges.length;
    const selectedChallenge = challenges[challengeIndex];
    
    setDailyChallenge(selectedChallenge);
    const currentProgress = weeklyProgress[selectedChallenge.type] || 0;
    setDailyChallengeProgress(currentProgress);
  };

  const calculateExpForLevel = (level) => {
    
    const thresholds = [0, 100, 282, 500, 800, 1200, 1700, 2300, 3000];
    if (level < thresholds.length) {
      return thresholds[level];
    } else {
      return 3000 + ((level - 8) * 1000);
    }
  };

  const isTaskCompleted = (task) => {
    
    const statValue = weeklyProgress[task.stat] || 0;
    
    if (task.stat === 'study_hours') {
      const hours = Math.floor(weeklyProgress.study_minutes / 60);
      return hours >= task.target;
    }
    return statValue >= task.target;
  };

  const getProgress = (task) => {
    
    let statValue = weeklyProgress[task.stat] || 0;
    
    if (task.stat === 'study_hours') {
      statValue = Math.floor(weeklyProgress.study_minutes / 60);
    }
    return Math.min((statValue / task.target) * 100, 100);
  };

  const completedCount = bingoTasks.filter(isTaskCompleted).length;
  const totalTasks = bingoTasks.length;

  const levelProgress = gamificationStats.experience > 0 
    ? ((gamificationStats.experience % calculateExpForLevel(gamificationStats.level)) / calculateExpForLevel(gamificationStats.level + 1)) * 100
    : 0;

  const studyHoursCompleted = Math.floor(weeklyProgress.study_minutes / 60);

  const getChallengeIcon = (iconType) => {
    const icons = {
      target: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="6"/>
          <circle cx="12" cy="12" r="2"/>
        </svg>
      ),
      chat: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
      note: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
      ),
      clock: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
      trophy: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
          <path d="M4 22h16"/>
          <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
          <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
        </svg>
      ),
      cards: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="6" width="20" height="12"/>
          <path d="M12 6V2"/>
          <path d="M12 18v4"/>
        </svg>
      ),
      star: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      )
    };
    return icons[iconType] || icons.target;
  };

  const getDailyChallengeProgress = () => {
    if (!dailyChallenge) return 0;
    const current = weeklyProgress[dailyChallenge.type] || 0;
    return Math.min((current / dailyChallenge.target) * 100, 100);
  };

  const isDailyChallengeComplete = () => {
    if (!dailyChallenge) return false;
    const current = weeklyProgress[dailyChallenge.type] || 0;
    return current >= dailyChallenge.target;
  };

  if (loading) {
    return (
      <div className="games-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading your stats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="games-page">
      <div className="gm-bg-fx" aria-hidden>
        <div className="gm-bg-orb gm-bg-orb-1" />
        <div className="gm-bg-orb gm-bg-orb-2" />
        <div className="gm-bg-orb gm-bg-orb-3" />
        <AbstractFx variant="circles" />
        <div className="gm-bg-vignette" />
      </div>
      <header className="gm-topbar">
        <span className="gm-topbar-tagline"><span>LEARNING,</span> UNIFIED</span>
        <div className="gm-topbar-actions">
          <button type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
          <button type="button" onClick={() => loadAllData(localStorage.getItem('username'))}>Refresh</button>
          <button type="button" onClick={() => setSidebarCollapsed((prev) => !prev)}>
            {sidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}
          </button>
          <button className="gm-topbar-accent" type="button" onClick={() => navigate('/challenges')}>Challenges</button>
        </div>
      </header>

      <div className={`gm-layout ${sidebarCollapsed ? 'gm-layout--collapsed' : ''}`}>
        {!sidebarCollapsed && (
          <aside className="gm-sidebar" aria-label="Games navigation">
            <div className="gm-side-brand">
              <div className="gm-side-logo">cerbyl</div>
              <div className="gm-side-kicker">Games</div>
              <button type="button" onClick={() => setSidebarCollapsed(true)} aria-label="Hide Games sidebar">
                <ChevronLeft size={14} />
              </button>
            </div>

            <div className="gm-side-panel">
              <span className="gm-side-heading">Playground</span>
              <button className="gm-side-item active" type="button" onClick={() => document.querySelector('.dc-mission-card')?.scrollIntoView({ behavior: 'smooth' })}>
                <Zap size={16} />
                <span>Daily Challenge</span>
                <strong>{Math.round(getDailyChallengeProgress())}%</strong>
              </button>
              <button className="gm-side-item" type="button" onClick={() => document.querySelector('.bingo-card')?.scrollIntoView({ behavior: 'smooth' })}>
                <BarChart3 size={16} />
                <span>Weekly Board</span>
                <strong>{completedCount}/{totalTasks}</strong>
              </button>
              <button className="gm-side-item" type="button" onClick={() => document.querySelector('.recent-card')?.scrollIntoView({ behavior: 'smooth' })}>
                <Award size={16} />
                <span>Recent Activity</span>
              </button>
            </div>

            <div className="gm-side-panel">
              <span className="gm-side-heading">Compete & Connect</span>
              <button className="gm-side-item" type="button" onClick={() => navigate('/leaderboards')}><Trophy size={16} /><span>Leaderboards</span></button>
              <button className="gm-side-item" type="button" onClick={() => navigate('/challenges')}><Target size={16} /><span>Challenges</span></button>
              <button className="gm-side-item" type="button" onClick={() => navigate('/friends')}><Users size={16} /><span>Friends</span></button>
              <button className="gm-side-item" type="button" onClick={() => navigate('/activity-feed')}><ActivityIcon size={16} /><span>Activity Feed</span></button>
              <button className="gm-side-item" type="button" onClick={() => navigate('/social')}><Swords size={16} /><span>Social Hub</span></button>
            </div>

            <div className="gm-side-score">
              <div><strong>{gamificationStats.level}</strong><span>Level</span></div>
              <div><strong>{gamificationStats.total_points.toLocaleString()}</strong><span>Points</span></div>
            </div>

            <div className="gm-side-footer">
              <button type="button" onClick={() => navigate('/ai-chat')}><MessageSquare size={15} />AI Chat</button>
              <button type="button" onClick={() => navigate('/dashboard-cerbyl')}><LayoutDashboard size={15} />Dashboard</button>
            </div>
          </aside>
        )}

        <main className="gm-main">
          {sidebarCollapsed && (
            <button className="gm-sidebar-reopen" type="button" onClick={() => setSidebarCollapsed(false)} aria-label="Show Games sidebar">
              <ChevronRight size={16} />
            </button>
          )}
      <div className="games-container">
        <section className="gm-hero">
          <div className="gm-hero-copy">
            <span className="gm-hero-kicker"><Gamepad2 size={14} /> Learning Arcade</span>
            <h1>Turn progress into momentum.</h1>
            <p>Complete focused challenges, build streaks, and climb the leaderboard while your real study activity powers every score.</p>
            <div className="gm-hero-actions">
              <button type="button" className="gm-primary-action" onClick={() => document.querySelector('.dc-mission-card')?.scrollIntoView({ behavior: 'smooth' })}>
                <Zap size={16} /> Today's Mission
              </button>
              <button type="button" className="gm-secondary-action" onClick={() => navigate('/leaderboards')}>
                <Trophy size={16} /> View Leaderboard
              </button>
            </div>
          </div>
          <div className="gm-hero-orbit" aria-hidden="true">
            <div className="gm-orbit-ring gm-orbit-ring--outer" />
            <div className="gm-orbit-ring gm-orbit-ring--inner" />
            <div className="gm-orbit-core"><Sparkles size={28} /><strong>{gamificationStats.weekly_points}</strong><span>points this week</span></div>
            <span className="gm-orbit-node gm-orbit-node--one"><Trophy size={15} /></span>
            <span className="gm-orbit-node gm-orbit-node--two"><Target size={15} /></span>
            <span className="gm-orbit-node gm-orbit-node--three"><Zap size={15} /></span>
          </div>
        </section>

        <div className="stats-cards">
          <div className="stat-card-main level-card">
            <div className="stat-card-gradient"></div>
            <span className="stat-label">level</span>
            <span className="stat-value">{gamificationStats.level}</span>
            <div className="level-bar">
              <div 
                className="level-bar-fill" 
                style={{ width: `${levelProgress}%` }}
              />
            </div>
            <span className="stat-hint">{pointsToNextLevel} xp to next level</span>
          </div>
          
          <div className="stat-card-main points-card">
            <div className="stat-card-gradient"></div>
            <span className="stat-label">total points</span>
            <span className="stat-value">{gamificationStats.total_points.toLocaleString()}</span>
            <span className="stat-hint">all time</span>
          </div>
          
          <div className="stat-card-main weekly-card">
            <div className="stat-card-gradient"></div>
            <span className="stat-label">this week</span>
            <span className="stat-value">{gamificationStats.weekly_points}</span>
            <span className="stat-hint">weekly points</span>
          </div>
        </div>

        {dailyChallenge && (
          <div className={`dc-mission-card ${isDailyChallengeComplete() ? 'dc-complete' : 'dc-active'}`}>
            <div className="dc-left">
              <div className="dc-label-row">
                <span className="dc-kicker">Today's Mission</span>
                {isDailyChallengeComplete() && <span className="dc-done-badge">✓ Completed</span>}
              </div>
              <div className="dc-icon-title">
                <div className="dc-icon">{getChallengeIcon(dailyChallenge.icon)}</div>
                <div>
                  <h3 className="dc-title">{dailyChallenge.title}</h3>
                  <p className="dc-desc">{dailyChallenge.description}</p>
                </div>
              </div>
              <div className="dc-progress-row">
                <div className="dc-bar-wrap">
                  <div className="dc-bar-fill" style={{ width: `${getDailyChallengeProgress()}%` }} />
                </div>
                <span className="dc-nums">
                  {weeklyProgress[dailyChallenge.type] || 0}
                  <span className="dc-sep">/</span>
                  {dailyChallenge.target}
                </span>
              </div>
            </div>
            <div className="dc-right">
              <div className={`dc-ring ${isDailyChallengeComplete() ? 'dc-ring--done' : ''}`}>
                <svg viewBox="0 0 80 80" className="dc-ring-svg">
                  <defs>
                    <linearGradient id="dc-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="var(--accent)" />
                      <stop offset="100%" stopColor="var(--purple)" />
                    </linearGradient>
                  </defs>
                  <circle cx="40" cy="40" r="34" className="dc-ring-bg" />
                  <circle
                    cx="40" cy="40" r="34"
                    className="dc-ring-fg"
                    strokeDasharray={`${2 * Math.PI * 34}`}
                    strokeDashoffset={`${2 * Math.PI * 34 * (1 - getDailyChallengeProgress() / 100)}`}
                  />
                </svg>
                <span className="dc-ring-pct">{Math.round(getDailyChallengeProgress())}%</span>
              </div>
              <div className="dc-reward">
                <span className="dc-reward-label">Reward</span>
                <span className="dc-reward-pts">+{dailyChallenge.reward}</span>
                <span className="dc-reward-unit">points</span>
              </div>
            </div>
          </div>
        )}

        <div className="content-grid">

          <div className="section-card bingo-card">
            <div className="section-header">
              <div className="view-heading">
                <span className="view-kicker">This Week</span>
                <h2 className="view-title">Weekly Challenges</h2>
                <p className="view-sub">Fresh challenges updated every week</p>
              </div>
              <span className="completion-badge">{completedCount}/{totalTasks}</span>
            </div>
            <div className="bingo-board">
              {bingoTasks.map((task) => {
                const completed = isTaskCompleted(task);
                const progress = getProgress(task);
                
                let statValue = weeklyProgress[task.stat] || 0;
                if (task.stat === 'study_hours') {
                  statValue = Math.floor(weeklyProgress.study_minutes / 60);
                }

                const tier = task.points >= 200 ? 'high' : task.points >= 100 ? 'mid' : 'low';
                return (
                  <div
                    key={task.id}
                    className={`bingo-cell bingo-cell--${tier} ${completed ? 'completed' : ''}`}
                  >
                    <div className="cell-header">
                      <span className="cell-points">+{task.points}</span>
                      {completed && (
                        <div className="check-icon">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="cell-title">{task.title}</div>
                    <div className="cell-progress">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="progress-text">
                        {statValue}/{task.target}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="section-card recent-card">
            <div className="section-header">
              <div className="view-heading">
                <span className="view-kicker">Your History</span>
                <h2 className="view-title">Recent Activity</h2>
                <p className="view-sub">Your latest learning activity</p>
              </div>
            </div>
            <div className="activity-list">
              {recentActivities.length === 0 ? (
                <div className="no-activity">
                  <p>No recent activity</p>
                  <span>Start learning to earn points!</span>
                </div>
              ) : (
                recentActivities.map((activity, index) => (
                  <div key={index} className="recent-item">
                    <div className="recent-content">
                      <span className="recent-desc">{activity.description}</span>
                      <span className="recent-time">{activity.time_ago}</span>
                    </div>
                    <span className="recent-points">+{activity.points}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="section-card points-card">
            <div className="section-header">
              <div className="view-heading">
                <span className="view-kicker">How It Works</span>
                <h2 className="view-title">Point System</h2>
                <p className="view-sub">Earn points by completing learning activities</p>
              </div>
            </div>
            <div className="points-list">
              <div className="points-item">
                <span>ai chat message</span>
                <span>+1</span>
              </div>
              <div className="points-item">
                <span>answer question</span>
                <span>+2</span>
              </div>
              <div className="points-item">
                <span>battle loss</span>
                <span>+2</span>
              </div>
              <div className="points-item">
                <span>battle draw</span>
                <span>+5</span>
              </div>
              <div className="points-item">
                <span>flashcard set</span>
                <span>+10</span>
              </div>
              <div className="points-item">
                <span>battle win</span>
                <span>+10</span>
              </div>
              <div className="points-item">
                <span>complete quiz</span>
                <span>+15</span>
              </div>
              <div className="points-item">
                <span>create note</span>
                <span>+20</span>
              </div>
              <div className="points-item">
                <span>quiz 80%+ score</span>
                <span>+30</span>
              </div>
              <div className="points-item highlight">
                <span>solo quiz (max)</span>
                <span>+40</span>
              </div>
              <div className="points-item">
                <span>study 1 hour</span>
                <span>+50</span>
              </div>
              <div className="points-item-note">
                Solo quiz points scale with difficulty, questions & score
              </div>
            </div>
          </div>
        </div>
      </div>
        </main>
      </div>

    </div>
  );
};

export default Games;
