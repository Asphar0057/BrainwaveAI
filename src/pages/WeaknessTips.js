import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Brain, ArrowRight, Activity,
  Trophy, Clock, AlertCircle, Zap, TrendingUp
} from 'lucide-react';
import './WeaknessTips.css';
import '../components/SocialHubChrome.css';
import MathRenderer from '../components/MathRenderer';
import { queuedAIJsonFetch } from '../services/aiJobService';

const AccuracyMeter = ({ accuracy }) => {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, accuracy || 0));
  const offset = circumference * (1 - pct / 100);

  let arcColor = '#ef4444';
  if (pct >= 70) arcColor = '#10b981';
  else if (pct >= 50) arcColor = '#f59e0b';

  return (
    <svg width="130" height="130" viewBox="0 0 130 130" className="wt-accuracy-svg">
      <circle cx="65" cy="65" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
      <circle
        cx="65" cy="65" r={radius}
        fill="none"
        stroke={arcColor}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 65 65)"
        className="wt-accuracy-arc"
      />
      <text x="65" y="60" textAnchor="middle" className="wt-accuracy-num" fill="var(--text-primary)">
        {Math.round(pct)}%
      </text>
      <text x="65" y="78" textAnchor="middle" className="wt-accuracy-label" fill="var(--text-secondary)">
        ACCURACY
      </text>
    </svg>
  );
};

const getStatusBadge = (accuracy, attempts) => {
  if (!attempts || attempts === 0) return { label: 'NOT STARTED', cls: 'wt-badge--new' };
  if (accuracy < 30) return { label: 'CRITICAL', cls: 'wt-badge--critical' };
  if (accuracy < 55) return { label: 'NEEDS PRACTICE', cls: 'wt-badge--warn' };
  if (accuracy < 75) return { label: 'IMPROVING', cls: 'wt-badge--info' };
  return { label: 'PROGRESSING', cls: 'wt-badge--good' };
};

const PRIORITY_META = {
  high: { label: 'HIGH', color: '#ef4444' },
  medium: { label: 'MED', color: '#f59e0b' },
  low: { label: 'LOW', color: '#10b981' },
};

const WeaknessTips = () => {
  const { topic } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const userName = localStorage.getItem('username');

  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState(null);
  const [similarQuestions, setSimilarQuestions] = useState(null);

  const [generatingPractice, setGeneratingPractice] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState('medium');

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    loadTipsData();
  }, [topic]);

  const loadTipsData = async () => {
    setLoading(true);
    try {
      const suggestionsRes = await queuedAIJsonFetch(
        `/study_insights/topic_suggestions?user_id=${userName}&topic=${encodeURIComponent(topic)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (suggestionsRes.ok) {
        const data = await suggestionsRes.json();
        setSuggestions(data);
      }

      const questionsRes = await queuedAIJsonFetch(
        `/study_insights/similar_questions?user_id=${userName}&topic=${encodeURIComponent(topic)}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (questionsRes.ok) {
        const data = await questionsRes.json();
        setSimilarQuestions(data);
      }
    } catch (error) {
      console.error('Error loading tips:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePracticeQuestions = async () => {
    setGeneratingPractice(true);
    try {
      const difficultyMix = {
        easy: difficulty === 'easy' ? 7 : difficulty === 'medium' ? 3 : 1,
        medium: difficulty === 'easy' ? 2 : difficulty === 'medium' ? 5 : 3,
        hard: difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 6
      };

      const response = await queuedAIJsonFetch('/generate_practice_questions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: userName,
          topic: decodeURIComponent(topic),
          question_count: questionCount,
          difficulty_mix: difficultyMix,
          question_types: ['multiple_choice'],
          title: `Practice: ${decodeURIComponent(topic)}`
        })
      });

      const data = await response.json();

      if (response.ok && data.questions && data.questions.length > 0) {
        sessionStorage.setItem('quizData', JSON.stringify({
          questions: data.questions,
          topic: decodeURIComponent(topic),
          difficulty: difficulty,
          quiz_id: data.question_set_id,
          quizMode: 'standard',
          timingMode: 'timed',
        }));
        navigate('/solo-quiz/session');
      } else {
        alert(data.detail || 'Failed to generate questions. Please try again.');
      }
    } catch (error) {
      console.error('Error generating practice:', error);
      alert('Failed to generate practice questions. Please try again.');
    } finally {
      setGeneratingPractice(false);
    }
  };

  const accuracy = suggestions?.stats?.accuracy ?? 0;
  const attempts = suggestions?.stats?.attempts ?? 0;
  const badge = getStatusBadge(accuracy, attempts);
  const decodedTopic = decodeURIComponent(topic);

  const GeoBg = () => (
    <svg className="wt-geo-bg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12%" cy="18%" r="220" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <circle cx="12%" cy="18%" r="140" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
      <circle cx="88%" cy="78%" r="280" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <circle cx="88%" cy="78%" r="180" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
      <circle cx="55%" cy="50%" r="380" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
      <line x1="0" y1="28%" x2="100%" y2="18%" stroke="currentColor" strokeWidth="0.5" opacity="0.35" />
      <line x1="0" y1="65%" x2="100%" y2="55%" stroke="currentColor" strokeWidth="0.5" opacity="0.25" />
      <line x1="20%" y1="0" x2="30%" y2="100%" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
      <line x1="72%" y1="0" x2="65%" y2="100%" stroke="currentColor" strokeWidth="0.5" opacity="0.2" />
      <circle cx="25%" cy="42%" r="3" fill="currentColor" opacity="0.5" />
      <circle cx="70%" cy="22%" r="2" fill="currentColor" opacity="0.4" />
      <circle cx="45%" cy="75%" r="4" fill="currentColor" opacity="0.35" />
      <circle cx="82%" cy="40%" r="2.5" fill="currentColor" opacity="0.4" />
      <circle cx="15%" cy="70%" r="2" fill="currentColor" opacity="0.3" />
      <circle cx="60%" cy="10%" r="3" fill="currentColor" opacity="0.45" />
    </svg>
  );

  if (loading) {
    return (
      <div className="wt-page">
        <GeoBg />
        <div className="wt-orb wt-orb-1" />
        <div className="wt-orb wt-orb-2" />
        <div className="shc-topbar">
          <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
          <div className="shc-topbar-right">
            <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
          </div>
        </div>
        <div className="wt-loading">
          <div className="wt-loading-dots">
            <span /><span /><span />
          </div>
          <p className="wt-loading-text">ANALYSING WEAKNESS</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wt-page">
      <GeoBg />
      <div className="wt-orb wt-orb-1" />
      <div className="wt-orb wt-orb-2" />
      <div className="wt-orb wt-orb-3" />

      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>

      <div className="wt-body">
        <div className="wt-content">

          <button className="wt-back-btn" onClick={() => navigate('/weaknesses')}>
            <ChevronLeft size={15} />
            <span>Back to Weaknesses</span>
          </button>

          <div className="wt-hero">
            <div className="wt-hero-grid-overlay" aria-hidden="true" />
            <div className="wt-hero-left">
              <span className="wt-hero-kicker">WEAKNESS ANALYSIS</span>
              <h1 className="wt-hero-topic">{decodedTopic}</h1>
              <div className="wt-hero-meta">
                <span className={`wt-badge ${badge.cls}`}>{badge.label}</span>
                {attempts > 0 && (
                  <span className="wt-hero-attempts">{attempts} attempt{attempts !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
            <div className="wt-hero-right">
              <AccuracyMeter accuracy={accuracy} />
            </div>
          </div>

          {suggestions?.suggestions?.length > 0 && (
            <div className="wt-section">
              <div className="wt-section-head">
                <span className="wt-section-kicker">Personalized</span>
                <h2 className="wt-section-title">Study Recommendations</h2>
              </div>
              <div className="wt-recs-grid">
                {suggestions.suggestions.map((s, idx) => {
                  const meta = PRIORITY_META[s.priority] || PRIORITY_META.medium;
                  return (
                    <div key={idx} className={`wt-rec-card wt-rec-card--${s.priority}`} style={{ animationDelay: `${(idx + 1) * 0.1}s` }}>
                      <div className="wt-rec-num" style={{ background: meta.color }}>
                        {idx + 1}
                      </div>
                      <div className="wt-rec-body">
                        <div className="wt-rec-header">
                          <span className="wt-rec-title">{s.title}</span>
                          <span className="wt-rec-priority" style={{ color: meta.color, borderColor: meta.color }}>
                            {meta.label}
                          </span>
                        </div>
                        <p className="wt-rec-desc">{s.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="wt-section">
            <div className="wt-section-head">
              <span className="wt-section-kicker">AI-Powered</span>
              <h2 className="wt-section-title">Practice Generator</h2>
            </div>
            <div className="wt-gen-card">
              <div className="wt-gen-header">
                <div className="wt-gen-brain-wrap">
                  <Brain size={28} className="wt-gen-brain" />
                </div>
                <div>
                  <h4 className="wt-gen-card-title">Targeted Practice</h4>
                  <p className="wt-gen-card-sub">Custom questions locked to <strong>{decodedTopic}</strong></p>
                </div>
              </div>

              <div className="wt-gen-settings">
                <div className="wt-setting-group">
                  <label className="wt-setting-label">QUESTION COUNT</label>
                  <div className="wt-count-row">
                    <button
                      className="wt-count-btn"
                      onClick={() => setQuestionCount(Math.max(5, questionCount - 5))}
                      disabled={questionCount <= 5}
                      aria-label="Decrease"
                    >−</button>
                    <span className="wt-count-val">{questionCount}</span>
                    <button
                      className="wt-count-btn"
                      onClick={() => setQuestionCount(Math.min(20, questionCount + 5))}
                      disabled={questionCount >= 20}
                      aria-label="Increase"
                    >+</button>
                  </div>
                </div>

                <div className="wt-setting-group">
                  <label className="wt-setting-label">DIFFICULTY</label>
                  <div className="wt-pill-row">
                    {['easy', 'medium', 'hard'].map(d => (
                      <button
                        key={d}
                        className={`wt-pill ${difficulty === d ? 'wt-pill--active' : ''}`}
                        onClick={() => setDifficulty(d)}
                      >
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                className="wt-gen-btn"
                onClick={generatePracticeQuestions}
                disabled={generatingPractice}
              >
                {generatingPractice ? (
                  <>
                    <Clock size={18} className="wt-spin" />
                    <span>GENERATING QUESTIONS…</span>
                  </>
                ) : (
                  <>
                    <span>GENERATE PRACTICE</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              <div className="wt-gen-features">
                <div className="wt-gen-feat">
                  <Trophy size={15} />
                  <span>Instant feedback</span>
                </div>
                <div className="wt-gen-feat">
                  <Activity size={15} />
                  <span>Track progress</span>
                </div>
                <div className="wt-gen-feat">
                  <AlertCircle size={15} />
                  <span>Explanations</span>
                </div>
              </div>
            </div>
          </div>

          {suggestions?.study_tips?.length > 0 && (
            <div className="wt-section">
              <div className="wt-section-head">
                <span className="wt-section-kicker">Expert Advice</span>
                <h2 className="wt-section-title">Study Tips</h2>
              </div>
              <ul className="wt-tips-list">
                {suggestions.study_tips.map((tip, idx) => (
                  <li key={idx} className="wt-tip-item">
                    <span className="wt-tip-icon"><Zap size={14} /></span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {similarQuestions?.similar_questions?.length > 0 && (
            <div className="wt-section">
              <div className="wt-section-head">
                <span className="wt-section-kicker">From Your History</span>
                <h2 className="wt-section-title">
                  Practice Questions
                  <span className="wt-count-chip">{similarQuestions.total_found}</span>
                </h2>
              </div>
              <div className="wt-q-list">
                {similarQuestions.similar_questions.slice(0, 10).map((q, idx) => (
                  <div key={idx} className="wt-q-card">
                    <div className="wt-q-header">
                      <span className="wt-q-num">Q{idx + 1}</span>
                      <span className={`wt-q-diff wt-q-diff--${q.difficulty}`}>{q.difficulty}</span>
                      {q.is_new && <span className="wt-q-new">NEW</span>}
                    </div>
                    <MathRenderer content={q.question_text} className="wt-q-text" />
                    {!q.is_new && q.user_answer && (
                      <div className="wt-q-history">
                        <span className="wt-q-yours">Your answer: {q.user_answer}</span>
                        <span className="wt-q-correct">Correct: {q.correct_answer}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                className="wt-all-btn"
                onClick={() => navigate('/question-bank', { state: { topic: decodedTopic } })}
              >
                <TrendingUp size={16} />
                <span>Practice All Questions</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}

          {!suggestions?.suggestions?.length && !similarQuestions?.similar_questions?.length && (
            <div className="wt-empty">
              <div className="wt-empty-icon"><Brain size={48} /></div>
              <h3 className="wt-empty-title">No data yet</h3>
              <p className="wt-empty-sub">Keep practicing and we'll generate personalized recommendations</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default WeaknessTips;
