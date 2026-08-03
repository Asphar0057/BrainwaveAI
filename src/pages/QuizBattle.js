import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Swords, Users, Clock, X, Check, Zap, Trophy, Shield,
  Flame, Crown, Sparkles, ChevronRight, BookOpen, Database,
  Gauge, ArrowRight, AlertCircle, LoaderCircle, ArrowLeft
} from 'lucide-react';
import './QuizBattle.css';
import SocialHubChrome from '../components/SocialHubChrome';
import { API_URL } from '../config';
import useSharedWebSocket from '../hooks/useSharedWebSocket';
import BattleNotification from './BattleNotification.js';

const QuizBattle = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [battles, setBattles] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('battles');
  const [statusFilter, setStatusFilter] = useState('active');
  const [pendingBattle, setPendingBattle] = useState(null);
  const [showNotification, setShowNotification] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState('');
  const [subject, setSubject] = useState('');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [questionCount, setQuestionCount] = useState(10);
  const [gameMode, setGameMode] = useState('classic');
  const [classicTimeLimit, setClassicTimeLimit] = useState(300);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const { isConnected } = useSharedWebSocket(token, (message) => {
    if (message.type === 'battle_answer_submitted' || message.type === 'battle_opponent_completed') {
      return;
    }

    if (message.type === 'battle_challenge') {
      setPendingBattle(message.battle);
      setShowNotification(true);
      fetchBattles();

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('New Battle Challenge!', {
          body: `${message.battle.challenger?.first_name || 'Someone'} challenged you to a quiz battle!`,
          icon: '/battle-icon.png'
        });
      }
    } else if (message.type === 'battle_accepted') {
      setShowNotification(false);
      fetchBattles();
      if (message.battle_id) {
        setTimeout(() => navigate(`/quiz-battle/${message.battle_id}`), 500);
      }
    } else if (message.type === 'battle_started') {
      if (message.battle_id) {
        navigate(`/quiz-battle/${message.battle_id}`);
      }
    } else if (message.type === 'battle_declined') {
      setShowNotification(false);
      fetchBattles();
    }
  });

  useEffect(() => {
    fetchBattles();
    fetchFriends();

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const pollInterval = setInterval(() => {
      if (!isConnected) fetchBattles();
    }, 10000);

    return () => clearInterval(pollInterval);
  }, [statusFilter, isConnected]);

  const fetchBattles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/quiz_battles?status=${statusFilter}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setBattles(data.battles || []);
      } else {
        throw new Error('Failed to fetch battles');
      }
    } catch (error) {
      console.error('Error fetching battles:', error);
      setError('Unable to load battles. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, token]);

  const fetchFriends = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/friends`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setFriends(data.friends || []);
      }
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  }, [token]);

  const getTimeLimitForMode = (mode, count) => {
    if (mode === 'blitz') return count * 15;
    if (mode === 'sudden_death') return count * 30;
    if (mode === 'classic') return classicTimeLimit;
    return 300; // speed
  };

  const handleCreateBattle = async (e) => {
    e.preventDefault();
    if (!selectedFriend || !subject) {
      setError('Please select a friend and enter a subject');
      return;
    }

    setError(null);
    setCreating(true);

    try {
      const response = await fetch(`${API_URL}/create_quiz_battle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          opponent_id: parseInt(selectedFriend),
          subject,
          difficulty,
          question_count: questionCount,
          time_limit_seconds: getTimeLimitForMode(gameMode, questionCount),
          game_mode: gameMode
        })
      });

      if (response.ok) {
        setActiveView('battles');
        setSelectedFriend('');
        setSubject('');
        setDifficulty('intermediate');
        setQuestionCount(10);
        setGameMode('classic');
        setClassicTimeLimit(300);
        fetchBattles();

        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('Battle Challenge Sent!', {
            body: 'Your opponent has been notified.',
            icon: '/battle-icon.png'
          });
        }
      } else {
        throw new Error('Failed to create battle');
      }
    } catch (error) {
      console.error('Error creating battle:', error);
      setError('Unable to create battle. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleAcceptBattle = async (battleId = null) => {
    const id = battleId || pendingBattle?.id;
    if (!id) return;

    try {
      const response = await fetch(`${API_URL}/accept_quiz_battle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ battle_id: id })
      });

      if (response.ok) {
        setShowNotification(false);
        setPendingBattle(null);
        setTimeout(() => navigate(`/quiz-battle/${id}`), 300);
      } else {
        throw new Error('Failed to accept battle');
      }
    } catch (error) {
      console.error('Error accepting battle:', error);
      setError('Unable to accept battle. Please try again.');
    }
  };

  const handleDeclineBattle = async () => {
    if (!pendingBattle) return;

    try {
      const response = await fetch(`${API_URL}/decline_quiz_battle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ battle_id: pendingBattle.id })
      });

      if (response.ok) {
        setShowNotification(false);
        setPendingBattle(null);
        fetchBattles();
      } else {
        throw new Error('Failed to decline battle');
      }
    } catch (error) {
      console.error('Error declining battle:', error);
    }
  };

  const getBattleStatusColor = useCallback((status) => {
    const colors = {
      pending: 'var(--qb-warning)',
      active: 'var(--qb-accent)',
      completed: 'var(--qb-success)',
      expired: 'var(--qb-danger)'
    };
    return colors[status] || 'var(--qb-text-secondary)';
  }, []);

  const getBattleWinner = useCallback((battle) => {
    if (battle.status !== 'completed') return null;
    if (battle.your_score > battle.opponent_score) return 'win';
    if (battle.your_score < battle.opponent_score) return 'loss';
    return 'draw';
  }, []);

  const renderAvatar = useCallback((user) => {
    const profilePicture = user.picture_url || user.picture || user.profile_picture;
    const displayName = user.username || user.email || 'U';
    const initial = (user.first_name?.[0] || displayName.charAt(0)).toUpperCase();

    if (profilePicture) {
      return (
        <div className="qb-opponent-avatar">
          <img
            src={profilePicture}
            alt={displayName}
            referrerPolicy="no-referrer"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>
      );
    }

    return <div className="qb-opponent-avatar">{initial}</div>;
  }, []);

  const filters = useMemo(() => ['pending', 'active', 'completed', 'all'], []);

  const selectBattleView = (filter) => {
    setActiveView('battles');
    setStatusFilter(filter);
  };

  const sideSections = [{
    label: 'Battle Workspace',
    items: filters.map((filter) => ({
      label: `${filter.charAt(0).toUpperCase()}${filter.slice(1)} battles`,
      icon: filter === 'pending' ? Clock : filter === 'active' ? Flame : filter === 'completed' ? Trophy : Database,
      active: activeView === 'battles' && statusFilter === filter,
      onClick: () => selectBattleView(filter),
    })),
  }];

  return (
    <div className="qb-page with-social-chrome">
      <SocialHubChrome
        brandKicker="Quiz Battles"
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        sidebarLead={(
          <button className="qb-sidebar-create" type="button" onClick={() => setActiveView('create')}>
            <Swords size={16} />
            <span>Create battle</span>
          </button>
        )}
        sideSections={sideSections}
        collapsedLeadItems={[{
          label: 'Create battle', icon: Swords, active: activeView === 'create', onClick: () => setActiveView('create'),
        }]}
        collapsedTailItems={[{ label: 'Quiz modes', icon: ArrowLeft, onClick: () => navigate('/quiz-hub') }]}
        sidebarTail={(
          <button className="qb-sidebar-return" type="button" onClick={() => navigate('/quiz-hub')}>
            <ArrowLeft size={15} />
            <span>Quiz modes</span>
          </button>
        )}
      >
        <main className="qb-content">
          <div className="qb-container">
            {activeView === 'create' ? (
              <div className="qb-create-generator">
                <div className="qb-create-header">
                  <div className="qb-create-heading">
                    <div className="qb-create-heading-top">
                      <span className="qb-create-kicker">1v1 battle brief</span>
                      <button type="button" onClick={() => setActiveView('battles')}>
                        <ArrowLeft size={13} /> Battles
                      </button>
                    </div>
                    <Swords size={30} className="qb-create-icon" />
                    <h1 className="qb-create-title">Set the terms of the challenge.</h1>
                    <p className="qb-create-subtitle">Choose the opponent, topic and pressure. Both players get the same test.</p>
                  </div>
                  <div className="qb-live-brief" aria-live="polite">
                    <div className="qb-live-match">
                      <div><span>You</span><strong>Ready</strong></div>
                      <em>vs</em>
                      <div>
                        <span>Opponent</span>
                        <strong>{friends.find(friend => String(friend.id) === String(selectedFriend))?.username || 'Choose a friend'}</strong>
                      </div>
                    </div>
                    <div className="qb-live-topic">
                      <span>Battle topic</span>
                      <strong>{subject.trim() || 'Waiting for a subject'}</strong>
                    </div>
                    <div className="qb-live-specs">
                      <span><strong>{questionCount}</strong> questions</span>
                      <span><strong>{difficulty}</strong> level</span>
                      <span><strong>{gameMode.replace('_', ' ')}</strong> mode</span>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleCreateBattle} className="qb-create-form">
                  <div className="qb-cform-row">
                    <div className="qb-cform-group">
                      <label className="qb-cform-label">
                        <Users size={13} />
                        Opponent
                      </label>
                      <select
                        className="qb-cform-select"
                        value={selectedFriend}
                        onChange={(e) => setSelectedFriend(e.target.value)}
                        required
                      >
                        <option value="">Select a friend...</option>
                        {friends.map(f => (
                          <option key={f.id} value={f.id}>
                            {f.first_name && f.last_name
                              ? `${f.first_name} ${f.last_name}`
                              : f.username}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="qb-cform-group">
                      <label className="qb-cform-label">
                        <BookOpen size={13} />
                        Subject / Topic
                      </label>
                      <input
                        type="text"
                        className="qb-cform-input"
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="e.g., Mathematics, History..."
                        required
                      />
                    </div>
                  </div>

                  <div className="qb-cform-row">
                    <div className="qb-cform-group">
                      <label className="qb-cform-label">
                        <Gauge size={13} />
                        Difficulty
                      </label>
                      <select
                        className="qb-cform-select"
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value)}
                      >
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>

                    <div className="qb-cform-group">
                      <label className="qb-cform-label">
                        <Database size={13} />
                        Questions (5–20)
                      </label>
                      <input
                        type="number"
                        className="qb-cform-input"
                        value={questionCount}
                        onChange={(e) => setQuestionCount(Math.min(20, Math.max(5, parseInt(e.target.value) || 5)))}
                        min="5"
                        max="20"
                        required
                      />
                    </div>
                  </div>

                  <div className="qb-cform-group">
                    <label className="qb-cform-label">
                      <Swords size={13} />
                      Game Mode
                    </label>
                    <div className="qb-game-mode-grid">
                      <button
                        type="button"
                        className={`qb-gm-btn ${gameMode === 'classic' ? 'active' : ''}`}
                        aria-pressed={gameMode === 'classic'}
                        onClick={() => setGameMode('classic')}
                      >
                        <Trophy size={20} className="qb-gm-icon" />
                        <span className="qb-gm-name">Classic</span>
                        <p className="qb-gm-desc">Most correct answers wins.</p>
                      </button>

                      <button
                        type="button"
                        className={`qb-gm-btn ${gameMode === 'speed' ? 'active' : ''}`}
                        aria-pressed={gameMode === 'speed'}
                        onClick={() => setGameMode('speed')}
                      >
                        <Zap size={20} className="qb-gm-icon" />
                        <span className="qb-gm-name">Speed Battle</span>
                        <p className="qb-gm-desc">Fastest to finish all questions wins the tie.</p>
                      </button>

                      <button
                        type="button"
                        className={`qb-gm-btn ${gameMode === 'blitz' ? 'active' : ''}`}
                        aria-pressed={gameMode === 'blitz'}
                        onClick={() => setGameMode('blitz')}
                      >
                        <Flame size={20} className="qb-gm-icon" />
                        <span className="qb-gm-name">Blitz</span>
                        <p className="qb-gm-desc">15 seconds per question. Think fast.</p>
                      </button>

                      <button
                        type="button"
                        className={`qb-gm-btn ${gameMode === 'sudden_death' ? 'active' : ''}`}
                        aria-pressed={gameMode === 'sudden_death'}
                        onClick={() => setGameMode('sudden_death')}
                      >
                        <Shield size={20} className="qb-gm-icon" />
                        <span className="qb-gm-name">Sudden Death</span>
                        <p className="qb-gm-desc">One wrong answer ends your run.</p>
                      </button>
                    </div>
                  </div>

                  {gameMode === 'classic' && (
                    <div className="qb-cform-group">
                      <label className="qb-cform-label">
                        <Clock size={13} />
                        Time Limit
                      </label>
                      <div className="qb-time-opt-grid">
                        {[
                          { val: 120,  label: '2 min',  desc: 'Quick' },
                          { val: 300,  label: '5 min',  desc: 'Standard' },
                          { val: 600,  label: '10 min', desc: 'Extended' },
                          { val: 900,  label: '15 min', desc: 'Marathon' },
                        ].map(({ val, label, desc }) => (
                          <button
                            key={val}
                            type="button"
                            className={`qb-time-opt-btn ${classicTimeLimit === val ? 'active' : ''}`}
                            aria-pressed={classicTimeLimit === val}
                            onClick={() => setClassicTimeLimit(val)}
                          >
                            <span className="qb-time-opt-val">{label}</span>
                            <span className="qb-time-opt-desc">{desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="qb-form-error">
                      <AlertCircle size={16} />
                      <span>{error}</span>
                    </div>
                  )}

                  <button type="submit" className="qb-cform-submit" disabled={creating}>
                    {creating ? <LoaderCircle size={18} className="qb-inline-spinner" /> : <Swords size={18} />}
                    <span>{creating ? 'Sending challenge…' : 'Send challenge'}</span>
                  </button>
                </form>
              </div>
            ) : (
              <>
                <section className="qb-welcome-section">
                  <div className="qb-welcome-left">
                    <div className="qb-view-kicker">Live Arena</div>
                    <h1 className="qb-view-title">Your 1v1 arena.</h1>
                    <p className="qb-welcome-desc">
                      Challenge a friend, agree on the rules and answer the same questions under pressure.
                    </p>
                    <div className={`qb-connection-status ${isConnected ? 'is-live' : ''}`}>
                      <span aria-hidden="true" />
                      {isConnected ? 'Live updates connected' : 'Refreshing every 10 seconds'}
                    </div>
                    <div className="qb-mobile-filters" aria-label="Filter battles">
                      {filters.map(filter => (
                        <button
                          key={filter}
                          type="button"
                          className={statusFilter === filter ? 'active' : ''}
                          onClick={() => setStatusFilter(filter)}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="qb-create-btn" onClick={() => setActiveView('create')}>
                    CREATE BATTLE
                  </button>
                </section>

                {loading ? (
                  <div className="qb-loading">
                    <div className="qb-spinner"></div>
                    <p className="qb-loading-text">Loading battles...</p>
                  </div>
                ) : error ? (
                  <div className="qb-error-state">
                    <AlertCircle size={48} className="qb-error-icon" />
                    <p className="qb-error-text">{error}</p>
                    <button className="qb-retry-btn" onClick={fetchBattles}>
                      <ChevronRight size={18} />
                      Retry
                    </button>
                  </div>
                ) : battles.length === 0 ? (
                  <div className="qb-empty">
                    <Swords size={72} className="qb-empty-icon" />
                    <h3 className="qb-empty-title">No Battles Found</h3>
                    <p className="qb-empty-desc">
                      Challenge a friend to start your first battle and show off your knowledge!
                    </p>
                    <button className="qb-empty-action" type="button" onClick={() => setActiveView('create')}>
                      Create a battle <ArrowRight size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="qb-battle-grid">
                    {battles.map((battle) => {
                      const winner = getBattleWinner(battle);
                      const statusColor = getBattleStatusColor(battle.status);

                      return (
                        <article key={battle.id} className="qb-battle-card">
                          <div className="qb-battle-header">
                            <div className="qb-battle-status" style={{ color: statusColor }}>
                              {battle.status.toUpperCase()}
                            </div>
                            {winner && (
                              <div className={`qb-battle-result ${winner}`}>
                                {winner === 'win' ? (
                                  <><Crown size={16} />Victory!</>
                                ) : winner === 'draw' ? (
                                  <><Shield size={16} />Draw</>
                                ) : (
                                  <><X size={16} />Defeat</>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="qb-opponent-section">
                            <div className="qb-opponent-header">
                              {renderAvatar(battle.opponent)}
                              <div className="qb-opponent-info">
                                <h4 className="qb-opponent-name">
                                  VS {battle.opponent.first_name || battle.opponent.username}
                                </h4>
                                <div className="qb-battle-subject">
                                  <Sparkles size={16} />
                                  {battle.subject}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="qb-details-grid">
                            <div className="qb-detail-card">
                              <Gauge size={18} className="qb-detail-icon" />
                              <div className="qb-detail-label">Difficulty</div>
                              <div className="qb-detail-value">{battle.difficulty}</div>
                            </div>
                            <div className="qb-detail-card">
                              <Database size={18} className="qb-detail-icon" />
                              <div className="qb-detail-label">Questions</div>
                              <div className="qb-detail-value">{battle.question_count}</div>
                            </div>
                            <div className="qb-detail-card">
                              <Clock size={18} className="qb-detail-icon" />
                              <div className="qb-detail-label">Time</div>
                              <div className="qb-detail-value">{Math.floor(battle.time_limit_seconds / 60)} min</div>
                            </div>
                          </div>

                          <div className="qb-scores-container">
                            <div className="qb-scores-grid">
                              <div className="qb-score-box">
                                <span className="qb-score-label">Your Score</span>
                                <span className="qb-score-value">{battle.your_score || 0}</span>
                                {battle.your_completed && <Check size={20} className="qb-completed-icon" />}
                              </div>
                              <div className="qb-vs-divider">VS</div>
                              <div className="qb-score-box">
                                <span className="qb-score-label">Opponent</span>
                                <span className="qb-score-value">{battle.opponent_score || 0}</span>
                                {battle.opponent_completed && <Check size={20} className="qb-completed-icon" />}
                              </div>
                            </div>
                          </div>

                          {battle.status === 'pending' && !battle.is_challenger && (
                            <button className="qb-action-btn" onClick={() => handleAcceptBattle(battle.id)}>
                              <Zap size={18} />
                              Accept Challenge
                              <ArrowRight size={16} />
                            </button>
                          )}
                          {battle.status === 'active' && !battle.your_completed && (
                            <button className="qb-action-btn" onClick={() => navigate(`/quiz-battle/${battle.id}`)}>
                              <Flame size={18} />
                              Continue Battle
                              <ArrowRight size={16} />
                            </button>
                          )}
                          {battle.status === 'completed' && (
                            <button
                              className="qb-action-btn"
                              onClick={() => navigate(`/quiz-battle/${battle.id}`)}
                              style={{
                                background: winner === 'win'
                                  ? 'var(--qb-gradient-victory)'
                                  : winner === 'loss'
                                  ? 'var(--qb-gradient-defeat)'
                                  : 'var(--qb-gradient-draw)'
                              }}
                            >
                              <Trophy size={18} />
                              View Results
                              <ChevronRight size={16} />
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </SocialHubChrome>

      {showNotification && pendingBattle && (
        <BattleNotification
          battle={pendingBattle}
          onAccept={handleAcceptBattle}
          onDecline={handleDeclineBattle}
          onClose={() => setShowNotification(false)}
        />
      )}

    </div>
  );
};

export default QuizBattle;
