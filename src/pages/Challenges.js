import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Users, TrendingUp, Zap, Trophy, Plus, X } from 'lucide-react';
import './Challenges.css';
import SocialHubChrome from '../components/SocialHubChrome';
import { API_URL } from '../config';

const Challenges = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const actionRef = useRef(false);
  const loadVersion = useRef(0);
  const [filterType, setFilterType] = useState('active');
  const [showCreateModal, setShowCreateModal] = useState(false);
  
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [challengeType, setChallengeType] = useState('speed');
  const [subject, setSubject] = useState('');
  const [targetMetric, setTargetMetric] = useState('questions_answered');
  const [targetValue, setTargetValue] = useState(10);
  const [timeLimit, setTimeLimit] = useState(60);

  useEffect(() => {
    fetchChallenges();
  }, [filterType]);

  const fetchChallenges = async () => {
    const version = ++loadVersion.current;
    setLoading(true); setLoadError('');
    try {
      const response = await fetch(
        `${API_URL}/challenges?filter_type=${filterType}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error('Challenges could not be loaded.');
      if (response.ok) {
        const data = await response.json();
        if (version === loadVersion.current) setChallenges(data.challenges);
      }
    } catch (error) { if (version === loadVersion.current) setLoadError('Challenges could not be loaded.'); } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  };

  const handleCreateChallenge = async (e) => {
    e.preventDefault();
    if (!title || !targetMetric) {
      alert('Please fill in all required fields');
      return;
    }

    if (actionRef.current) return;
    actionRef.current = true; setActionPending(true);
    try {
      const response = await fetch(`${API_URL}/create_challenge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          description,
          challenge_type: challengeType,
          subject: subject || null,
          target_metric: targetMetric,
          target_value: parseFloat(targetValue),
          time_limit_minutes: parseInt(timeLimit)
        })
      });

      if (!response.ok) throw new Error('Could not update this challenge. Please try again.');
      if (response.ok) {
        setShowCreateModal(false);
        resetForm();
        fetchChallenges();
      }
    } catch (error) { alert(error.message || "Could not update this challenge. Please try again."); } finally { actionRef.current = false; setActionPending(false); }
  };

  const handleJoinChallenge = async (challengeId) => {
    if (actionRef.current) return;
    actionRef.current = true; setActionPending(true);
    try {
      const response = await fetch(`${API_URL}/join_challenge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ challenge_id: challengeId })
      });

      if (!response.ok) throw new Error('Could not update this challenge. Please try again.');
      if (response.ok) {
        fetchChallenges();
      }
    } catch (error) { alert(error.message || "Could not update this challenge. Please try again."); } finally { actionRef.current = false; setActionPending(false); }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setChallengeType('speed');
    setSubject('');
    setTargetMetric('questions_answered');
    setTargetValue(10);
    setTimeLimit(60);
  };

  const getChallengeIcon = (type) => {
    const icons = {
      speed: Zap,
      accuracy: Target,
      topic_mastery: Trophy,
      streak: TrendingUp
    };
    return icons[type] || Target;
  };

  const getChallengeTypeColor = (type) => {
    const colors = {
      speed: 'var(--warning)',
      accuracy: 'var(--accent)',
      topic_mastery: 'var(--success)',
      streak: 'var(--accent)'
    };
    return colors[type] || 'var(--accent)';
  };

  const formatTimeRemaining = (endsAt) => {
    if (!endsAt) return 'No time limit';
    const now = new Date();
    const end = new Date(endsAt);
    const diff = end - now;
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d remaining`;
    }
    return `${hours}h ${minutes}m remaining`;
  };

  return (
    <div className="challenges-page with-social-chrome">
      <svg className="geo-bg" viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="600" cy="400" r="360" fill="none" stroke="currentColor" strokeWidth="1"/>
        <circle cx="600" cy="400" r="260" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="600" cy="400" r="168" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="600" cy="400" r="90" fill="none" stroke="currentColor" strokeWidth="1"/>
        <line x1="600" y1="40" x2="600" y2="760" stroke="currentColor" strokeWidth="0.5"/>
        <line x1="240" y1="400" x2="960" y2="400" stroke="currentColor" strokeWidth="0.5"/>
        <line x1="346" y1="146" x2="854" y2="654" stroke="currentColor" strokeWidth="0.3"/>
        <line x1="854" y1="146" x2="346" y2="654" stroke="currentColor" strokeWidth="0.3"/>
        <circle cx="600" cy="40" r="4" fill="currentColor"/>
        <circle cx="960" cy="400" r="4" fill="currentColor"/>
        <circle cx="600" cy="760" r="4" fill="currentColor"/>
        <circle cx="240" cy="400" r="4" fill="currentColor"/>
        <rect x="580" y="20" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <rect x="940" y="380" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="854" cy="146" r="3" fill="currentColor" opacity="0.5"/>
        <circle cx="346" cy="146" r="3" fill="currentColor" opacity="0.5"/>
        <circle cx="854" cy="654" r="3" fill="currentColor" opacity="0.5"/>
        <circle cx="346" cy="654" r="3" fill="currentColor" opacity="0.5"/>
        <circle cx="120" cy="160" r="2" fill="currentColor" opacity="0.4"/>
        <circle cx="1050" cy="200" r="2" fill="currentColor" opacity="0.4"/>
        <circle cx="80" cy="600" r="2" fill="currentColor" opacity="0.4"/>
        <circle cx="1100" cy="580" r="2" fill="currentColor" opacity="0.4"/>
      </svg>

      <SocialHubChrome
        sideSections={[
          {
            label: 'Filter',
            items: [
              { icon: Zap,    label: 'Active',        onClick: () => setFilterType('active'),        active: filterType === 'active' },
              { icon: Trophy, label: 'Completed',     onClick: () => setFilterType('completed'),     active: filterType === 'completed' },
              { icon: Target, label: 'My Challenges', onClick: () => setFilterType('my_challenges'), active: filterType === 'my_challenges' },
              { icon: Users,  label: 'All',           onClick: () => setFilterType('all'),           active: filterType === 'all' },
            ],
          },
        ]}
      >
      <div className="challenges-container">
        <div className="challenges-welcome">
          <div className="challenges-welcome-left">
            <div className="view-heading">
              <span className="view-kicker">Daily Challenges</span>
              <h2 className="view-title">Challenges</h2>
              <p className="view-sub">Test yourself with today's curated challenges</p>
            </div>
          </div>
          <button className="create-challenge-btn" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            <span>Create Challenge</span>
          </button>
        </div>

        {loadError ? (<div role="alert"><p>{loadError}</p><button onClick={fetchChallenges}>Retry challenges</button></div>) : loading ? (
          <div className="loading-text">Loading challenges...</div>
        ) : challenges.length === 0 ? (
          <div className="empty-challenges">
            <Target size={48} />
            <p>No challenges found</p>
            <p className="empty-hint">Create a challenge to get started!</p>
          </div>
        ) : (
          <div className="challenges-grid">
            {challenges.map((challenge) => {
              const IconComponent = getChallengeIcon(challenge.challenge_type);
              const typeColor = getChallengeTypeColor(challenge.challenge_type);
              
              return (
                <div key={challenge.id} className="challenge-card">
                  <div className="challenge-header">
                    <div className="challenge-icon" style={{ color: typeColor }}>
                      <IconComponent size={32} />
                    </div>
                    <div className="challenge-status">
                      {challenge.status.toUpperCase()}
                    </div>
                  </div>

                  <div className="challenge-content">
                    <h3 className="challenge-title">{challenge.title}</h3>
                    {challenge.description && (
                      <p className="challenge-description">{challenge.description}</p>
                    )}

                    <div className="challenge-details">
                      <div className="detail-row">
                        <span className="detail-label">Type:</span>
                        <span className="detail-value">{challenge.challenge_type.replace('_', ' ')}</span>
                      </div>
                      {challenge.subject && (
                        <div className="detail-row">
                          <span className="detail-label">Subject:</span>
                          <span className="detail-value">{challenge.subject}</span>
                        </div>
                      )}
                      <div className="detail-row">
                        <span className="detail-label">Goal:</span>
                        <span className="detail-value">
                          {challenge.target_value} {challenge.target_metric.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">Time:</span>
                        <span className="detail-value">{formatTimeRemaining(challenge.ends_at)}</span>
                      </div>
                    </div>

                    <div className="challenge-stats">
                      <div className="stat">
                        <Users size={14} />
                        <span>{challenge.participant_count} participants</span>
                      </div>
                      {challenge.is_participating && (
                        <div className="stat progress">
                          <TrendingUp size={14} />
                          <span>{Math.round(challenge.user_progress)}% complete</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="challenge-footer">
                    {challenge.user_completed ? (
                      <div className="completed-badge">
                        <Trophy size={16} />
                        <span>Completed</span>
                      </div>
                    ) : challenge.is_participating ? (
                      <button 
                        className="challenge-btn continue"
                        onClick={() => navigate(`/challenge/${challenge.id}`)}
                      >
                        Continue Challenge
                      </button>
                    ) : challenge.status === 'active' ? (
                      <button 
                        className="challenge-btn join"
                        disabled={actionPending} onClick={() => handleJoinChallenge(challenge.id)}
                      >
                        Join Challenge
                      </button>
                    ) : (
                      <button className="challenge-btn disabled" disabled>
                        Challenge Ended
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </SocialHubChrome>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Challenge</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateChallenge} className="challenge-form">
              <div className="form-group">
                <label>Challenge Title*</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., 100 Questions in an Hour"
                  required
                />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your challenge..."
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label>Challenge Type*</label>
                <select value={challengeType} onChange={(e) => setChallengeType(e.target.value)}>
                  <option value="speed">Speed Challenge</option>
                  <option value="accuracy">Accuracy Challenge</option>
                  <option value="topic_mastery">Topic Mastery</option>
                  <option value="streak">Streak Challenge</option>
                </select>
              </div>

              <div className="form-group">
                <label>Subject (Optional)</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g., Mathematics"
                />
              </div>

              <div className="form-group">
                <label>Target Metric*</label>
                <select value={targetMetric} onChange={(e) => setTargetMetric(e.target.value)}>
                  <option value="questions_answered">Questions Answered</option>
                  <option value="accuracy_percentage">Accuracy Percentage</option>
                  <option value="study_hours">Study Hours</option>
                  <option value="streak_days">Streak Days</option>
                </select>
              </div>

              <div className="form-group">
                <label>Target Value*</label>
                <input
                  type="number"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  min="1"
                  required
                />
              </div>

              <div className="form-group">
                <label>Time Limit (minutes)*</label>
                <input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  min="5"
                  required
                />
              </div>

              <button type="submit" disabled={actionPending} className="submit-challenge-btn">
                <Plus size={16} />
                <span>Create Challenge</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Challenges;
