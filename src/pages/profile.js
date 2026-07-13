import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOutAppSession } from '../utils/authSession';
import { User, BookOpen, Target, Brain, Award, TrendingUp, Bell, LogOut, Trash2 } from 'lucide-react';
import './profile.css';
import '../components/SocialHubChrome.css';
import { API_URL } from '../config';
const Profile = () => {
  const token = localStorage.getItem('token');
  const [userName, setUserName] = useState('');
  const [profileData, setProfileData] = useState({
    username: '',
    firstName: '',
    lastName: '',
    email: '',
    fieldOfStudy: '',
    brainwaveGoal: '',
    preferredSubjects: [],
    difficultyLevel: 'intermediate',
    learningPace: 'moderate',
    primaryArchetype: '',
    secondaryArchetype: '',
    archetypeDescription: '',
    archetypeScores: {},
    showStudyInsights: true,
    notificationsEnabled: true
  });
  
  const [quizAnswers, setQuizAnswers] = useState({});
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [saveTimer, setSaveTimer] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [deleteStep, setDeleteStep] = useState('password');
  const [deleteForm, setDeleteForm] = useState({ password: '', otp: '' });
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState('');
  const lastSavedProfile = useRef(null);
  
  const navigate = useNavigate();

  const allSubjects = [
    'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Computer Science',
    'History', 'Geography', 'Literature', 'Languages', 'Art',
    'Music', 'Economics', 'Business', 'Psychology', 'Philosophy',
    'Engineering', 'Medicine', 'Law', 'Political Science', 'Sociology'
  ];

  const brainwaveGoals = {
    'exam_prep': 'Exam Preparation',
    'homework_help': 'Homework Assistance',
    'concept_mastery': 'Master Concepts',
    'skill_building': 'Build Skills',
    'career_prep': 'Career Development',
    'curiosity': 'Learn for Fun'
  };

  const archetypeInfo = {
    Logicor: {
      icon: '🧩',
      color: '#4A90E2',
      tagline: 'The Systematic Thinker',
      description: 'You excel at logical analysis and breaking down complex problems into manageable parts.'
    },
    Flowist: {
      icon: '⚡',
      color: '#50C878',
      tagline: 'The Dynamic Learner',
      description: 'You thrive through hands-on experiences and adapt easily to new challenges.'
    },
    Kinetiq: {
      icon: '⚙️',
      color: '#FF6B6B',
      tagline: 'The Movement Master',
      description: 'You learn best through physical engagement and kinesthetic experiences.'
    },
    Synth: {
      icon: '🔗',
      color: '#9B59B6',
      tagline: 'The Pattern Connector',
      description: 'You naturally see connections and integrate knowledge across domains.'
    },
    Dreamweaver: {
      icon: '✨',
      color: '#F39C12',
      tagline: 'The Visionary',
      description: 'You think in possibilities and excel with visual and imaginative approaches.'
    },
    Anchor: {
      icon: '⚓',
      color: '#34495E',
      tagline: 'The Structured Strategist',
      description: 'You value organization and thrive with clear systems and methodical approaches.'
    },
    Spark: {
      icon: '💡',
      color: '#E74C3C',
      tagline: 'The Creative Innovator',
      description: 'You\'re driven by creativity and love exploring novel ideas and methods.'
    },
    Empathion: {
      icon: '♥️',
      color: '#E91E63',
      tagline: 'The Empathetic Learner',
      description: 'You connect deeply with meaning and understand through emotional intelligence.'
    },
    Seeker: {
      icon: '',
      color: '#00BCD4',
      tagline: 'The Curious Explorer',
      description: 'You\'re motivated by discovery and love expanding your knowledge horizons.'
    },
    Resonant: {
      icon: '♪',
      color: '#8E44AD',
      tagline: 'The Adaptive Mind',
      description: 'You\'re highly flexible and tune into different learning environments effortlessly.'
    }
  };

  const autoSaveProfile = useCallback(async () => {
    if (autoSaving) return;

    const profileSnapshot = JSON.stringify(profileData);

    if (profileSnapshot === lastSavedProfile.current) {
      return;
    }
    
    setAutoSaving(true);
    
    try {
      const saveData = {
        ...profileData,
        user_id: userName,
        difficultyLevel: profileData.difficultyLevel || 'intermediate',
        learningPace: profileData.learningPace || 'moderate'
      };
      
            
      const response = await fetch(`${API_URL}/update_comprehensive_profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(saveData)
      });
      
      if (response.ok) {
        const responseData = await response.json().catch(() => ({}));
        lastSavedProfile.current = profileSnapshot;
        setLastSaved(new Date().toLocaleTimeString());
        localStorage.setItem('userProfile', profileSnapshot);
        if (responseData.username) {
          setUserName(responseData.username);
          localStorage.setItem('username', responseData.username);
        }
        if (responseData.access_token) {
          localStorage.setItem('token', responseData.access_token);
        }
      } else {
        
      }
    } catch (error) { /* silenced */ } finally {
      setAutoSaving(false);
    }
  }, [API_URL, token, userName, profileData, autoSaving, lastSavedProfile, setLastSaved, setAutoSaving]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');

    if (!token) {
      navigate('/login');
      return;
    }

    if (username) {
      setUserName(username);
      loadUserProfile(username);
    }
  }, [navigate]);

  useEffect(() => {
    if (!dataLoaded || !userName) {
      return;
    }

    if (saveTimer) {
      clearTimeout(saveTimer);
    }

    const profileSnapshot = JSON.stringify(profileData);

    if (profileSnapshot === lastSavedProfile.current) {
      setSaveTimer(null);
      return;
    }

    const newTimer = setTimeout(() => {
      autoSaveProfile();
    }, 3000);

    setSaveTimer(newTimer);

    return () => {
      clearTimeout(newTimer);
    };
  }, [profileData, userName, dataLoaded, autoSaveProfile]);

  const loadUserProfile = async (username) => {
    if (!username) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/get_comprehensive_profile?user_id=${username}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        const newProfileData = {
          username: data.username || username || '',
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          fieldOfStudy: data.fieldOfStudy || '',
          brainwaveGoal: data.brainwaveGoal || '',
          preferredSubjects: data.preferredSubjects || [],
          difficultyLevel: data.difficultyLevel || 'intermediate',
          learningPace: data.learningPace || 'moderate',
          primaryArchetype: data.primaryArchetype || '',
          secondaryArchetype: data.secondaryArchetype || '',
          archetypeDescription: data.archetypeDescription || '',
          archetypeScores: {},
          
          showStudyInsights: data.showStudyInsights === false ? false : true,
          notificationsEnabled: data.notificationsEnabled === false ? false : true
        };
        
        
        try {
          if (data.archetypeScores) {
            newProfileData.archetypeScores = typeof data.archetypeScores === 'string' 
              ? JSON.parse(data.archetypeScores) 
              : data.archetypeScores;
          }
        } catch (e) { /* silenced */ }

        setProfileData(newProfileData);
        lastSavedProfile.current = JSON.stringify(newProfileData);

        if (data.quizResponses) {
          try {
            const parsedQuiz = typeof data.quizResponses === 'string'
              ? JSON.parse(data.quizResponses)
              : data.quizResponses;
            setQuizAnswers(parsedQuiz);
          } catch (e) { /* silenced */ }
        }

        localStorage.setItem('userProfile', JSON.stringify(newProfileData));
        
        setDataLoaded(true);
        setLastSaved(new Date().toLocaleTimeString());
      } else {
        setDataLoaded(true);
      }
    } catch (error) {
            setDataLoaded(true);
    }
  };

  const handleInputChange = (field, value) => {
    setProfileData(prev => {
      const newData = {
        ...prev,
        [field]: value
      };
      
      
      if (field === 'showStudyInsights' || field === 'notificationsEnabled') {
        const currentProfile = localStorage.getItem('userProfile');
        if (currentProfile) {
          try {
            const parsed = JSON.parse(currentProfile);
            parsed[field] = value;
            localStorage.setItem('userProfile', JSON.stringify(parsed));
                      } catch (e) { /* silenced */ }
        }

        try {
          window.dispatchEvent(new Event('notification-settings-changed'));
        } catch (e) { /* silenced */ }
        
        
        const saveData = {
          ...newData,
          user_id: userName,
          difficultyLevel: newData.difficultyLevel || 'intermediate',
          learningPace: newData.learningPace || 'moderate'
        };
        
                
        fetch(`${API_URL}/update_comprehensive_profile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(saveData)
        }).then(response => {
          if (response.ok) {
            response.json().then(responseData => {
              if (responseData.username) {
                setUserName(responseData.username);
                localStorage.setItem('username', responseData.username);
              }
              if (responseData.access_token) {
                localStorage.setItem('token', responseData.access_token);
              }
            }).catch(() => {});
            lastSavedProfile.current = JSON.stringify(newData);
            setLastSaved(new Date().toLocaleTimeString());
          } else {
                      }
        }).catch(error => {
                  });
      }
      
      return newData;
    });
  };

  const toggleSubject = (subject) => {
    setProfileData(prev => ({
      ...prev,
      preferredSubjects: prev.preferredSubjects.includes(subject)
        ? prev.preferredSubjects.filter(s => s !== subject)
        : [...prev.preferredSubjects, subject]
    }));
  };  const goBack = () => {
    navigate('/dashboard-cerbyl');
  };

  const retakeQuiz = () => {
    navigate('/profile-quiz');
  };

  const handleLogout = () => {
    void signOutAppSession();
    navigate('/login');
  };

  const requestAccountDeletion = async (e) => {
    e.preventDefault();
    if (!deleteForm.password.trim()) {
      setDeleteStatus('Enter your password first.');
      return;
    }

    setDeleteLoading(true);
    setDeleteStatus('');
    try {
      const response = await fetch(`${API_URL}/account/delete/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ password: deleteForm.password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || `HTTP ${response.status}`);
      }
      const devOtp = data.dev_otp ? ` Dev OTP: ${data.dev_otp}` : '';
      setDeleteStatus(`${data.message || 'Deletion OTP sent to your email.'}${devOtp}`);
      setDeleteStep('otp');
    } catch (error) {
      setDeleteStatus(error.message || 'Could not send deletion OTP.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmAccountDeletion = async (e) => {
    e.preventDefault();
    if (!deleteForm.otp.trim()) {
      setDeleteStatus('Enter the deletion OTP.');
      return;
    }
    if (!window.confirm('This permanently deletes your account and learning data. Continue?')) {
      return;
    }

    setDeleteLoading(true);
    setDeleteStatus('');
    try {
      const response = await fetch(`${API_URL}/account/delete/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ otp: deleteForm.otp })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || `HTTP ${response.status}`);
      }
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      localStorage.removeItem('userProfile');
      sessionStorage.removeItem('justLoggedIn');
      navigate('/login');
    } catch (error) {
      setDeleteStatus(error.message || 'Could not delete account.');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (!dataLoaded) {
    return (
      <div className="profile-page">
        <div className="profile-container">
          <div className="loading-state">
            <div className="loading-spinner-container">
              <div className="loading-spinner-cube"></div>
              <div className="loading-spinner-cube"></div>
              <div className="loading-spinner-cube"></div>
            </div>
            <div className="loading-text">Loading your profile...</div>
          </div>
        </div>
      </div>
    );
  }

  const currentArchetype = profileData.primaryArchetype ? archetypeInfo[profileData.primaryArchetype] : null;
  const secondaryArchetypeInfo = profileData.secondaryArchetype ? archetypeInfo[profileData.secondaryArchetype] : null;

  return (
    <div className="profile-page">
      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
      <div className="profile-container">
        <div className="profile-grid">
          {profileData.primaryArchetype && (
            <section className="profile-card archetype-card full-width">
              <div className="card-header">
                <div className="header-content">
                  <Brain className="header-icon" />
                  <div>
                    <h2 className="card-title">Your Learning Archetype</h2>
                    <p className="card-subtitle">Personalized AI teaching style</p>
                  </div>
                </div>
                <button className="retake-btn" onClick={retakeQuiz}>
                  Retake Assessment
                </button>
              </div>

              <div className="archetype-display">
                <div className="archetype-main">
                  <div className="archetype-badge primary">PRIMARY</div>
                  <div className="archetype-icon-large">{currentArchetype?.icon}</div>
                  <h3 className="archetype-name">{profileData.primaryArchetype}</h3>
                  <p className="archetype-tagline">{currentArchetype?.tagline}</p>
                  <p className="archetype-description">{currentArchetype?.description}</p>
                </div>

                {profileData.secondaryArchetype && (
                  <div className="archetype-secondary">
                    <div className="archetype-badge secondary">SECONDARY</div>
                    <div className="archetype-icon-small">{secondaryArchetypeInfo?.icon}</div>
                    <h4 className="archetype-name-small">{profileData.secondaryArchetype}</h4>
                    <p className="archetype-tagline-small">{secondaryArchetypeInfo?.tagline}</p>
                  </div>
                )}
              </div>

              {Object.keys(profileData.archetypeScores).length > 0 && (
                <div className="archetype-scores">
                  <h4 className="scores-title">Your Archetype Breakdown</h4>
                  <div className="scores-grid">
                    {Object.entries(profileData.archetypeScores)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 5)
                      .map(([archetype, score]) => (
                        <div key={archetype} className="score-item">
                          <div className="score-header">
                            <span className="score-name">{archetype}</span>
                            <span className="score-value">{Math.round(score)}%</span>
                          </div>
                          <div className="score-bar">
                            <div className="score-fill" style={{ width: `${score}%` }}></div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {!profileData.primaryArchetype && (
            <section className="profile-card archetype-placeholder full-width">
              <div className="placeholder-content">
                <Brain className="placeholder-icon" />
                <h3 className="placeholder-title">Discover Your Learning Archetype</h3>
                <p className="placeholder-text">
                  Take our assessment to unlock personalized AI tutoring tailored to your unique learning style
                </p>
                <button className="quiz-btn" onClick={retakeQuiz}>
                  Take Learning Preferences Quiz
                </button>
              </div>
            </section>
          )}

          <section className="profile-card">
            <div className="card-header">
              <div className="header-content">
                <User className="header-icon" />
                <div>
                  <h2 className="card-title">Personal Information</h2>
                  <p className="card-subtitle">Your basic details</p>
                </div>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">First Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={profileData.firstName}
                  onChange={(e) => handleInputChange('firstName', e.target.value)}
                  placeholder="Enter your first name"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Last Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={profileData.lastName}
                  onChange={(e) => handleInputChange('lastName', e.target.value)}
                  placeholder="Enter your last name"
                />
              </div>

              <div className="form-group full-width">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  className="form-input"
                  value={profileData.username}
                  onChange={(e) => handleInputChange('username', e.target.value)}
                  placeholder="Choose a username"
                />
              </div>

              <div className="form-group full-width">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={profileData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="your.email@example.com"
                />
              </div>
            </div>
          </section>

          <section className="profile-card">
            <div className="card-header">
              <div className="header-content">
                <Target className="header-icon" />
                <div>
                  <h2 className="card-title">Learning Goals</h2>
                  <p className="card-subtitle">What you want to achieve</p>
                </div>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Main Subject</label>
                <select
                  className="form-select"
                  value={profileData.fieldOfStudy}
                  onChange={(e) => handleInputChange('fieldOfStudy', e.target.value)}
                >
                  <option value="">Select your main subject</option>
                  {allSubjects.map(subject => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Primary Goal</label>
                <select
                  className="form-select"
                  value={profileData.brainwaveGoal}
                  onChange={(e) => handleInputChange('brainwaveGoal', e.target.value)}
                >
                  <option value="">Select your goal</option>
                  {Object.entries(brainwaveGoals).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="profile-card full-width">
            <div className="card-header">
              <div className="header-content">
                <BookOpen className="header-icon" />
                <div>
                  <h2 className="card-title">Interested Subjects</h2>
                  <p className="card-subtitle">Topics you want to explore</p>
                </div>
              </div>
            </div>

            <div className="subjects-container">
              {profileData.preferredSubjects.length > 0 && (
                <div className="selected-subjects">
                  {profileData.preferredSubjects.map(subject => (
                    <button
                      key={subject}
                      className="subject-chip selected"
                      onClick={() => toggleSubject(subject)}
                    >
                      {subject}
                      <span className="remove-icon">×</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="available-subjects">
                {allSubjects
                  .filter(s => !profileData.preferredSubjects.includes(s))
                  .map(subject => (
                    <button
                      key={subject}
                      className="subject-chip available"
                      onClick={() => toggleSubject(subject)}
                    >
                      + {subject}
                    </button>
                  ))}
              </div>
            </div>
          </section>

          <section className="profile-card">
            <div className="card-header">
              <div className="header-content">
                <TrendingUp className="header-icon" />
                <div>
                  <h2 className="card-title">Study Insights</h2>
                  <p className="card-subtitle">Control your study insights experience</p>
                </div>
              </div>
            </div>

            <div className="study-insights-settings">
              <div className="setting-row">
                <div className="setting-info">
                  <span className="setting-label">Show Study Insights on Login</span>
                  <span className="setting-description">Display study insights page when you first log in each day</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={profileData.showStudyInsights !== false}
                    onChange={(e) => handleInputChange('showStudyInsights', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </section>

          <section className="profile-card">
            <div className="card-header">
              <div className="header-content">
                <Bell className="header-icon" />
                <div>
                  <h2 className="card-title">Notifications</h2>
                  <p className="card-subtitle">Control notification popups and badges</p>
                </div>
              </div>
            </div>

            <div className="study-insights-settings">
              <div className="setting-row">
                <div className="setting-info">
                  <span className="setting-label">Enable Notifications</span>
                  <span className="setting-description">Show notification popups and unread badges across the app</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={profileData.notificationsEnabled !== false}
                    onChange={(e) => handleInputChange('notificationsEnabled', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </section>

          <section className="profile-card full-width account-actions-card">
            <div className="card-header">
              <div className="header-content">
                <User className="header-icon" />
                <div>
                  <h2 className="card-title">Account</h2>
                  <p className="card-subtitle">Session and account controls</p>
                </div>
              </div>
              <button className="profile-action-btn" onClick={handleLogout}>
                <LogOut size={16} />
                Log Out
              </button>
            </div>

            <div className="delete-account-box">
              <div className="delete-account-copy">
                <div className="delete-account-title">
                  <Trash2 size={16} />
                  Delete Account
                </div>
                <p>Enter your password first. An OTP will be sent to your account email before deletion.</p>
              </div>

              {deleteStep === 'password' ? (
                <form className="delete-account-form" onSubmit={requestAccountDeletion}>
                  <input
                    type="password"
                    className="form-input"
                    value={deleteForm.password}
                    onChange={(e) => setDeleteForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Account password"
                    disabled={deleteLoading}
                  />
                  <button className="profile-danger-btn" type="submit" disabled={deleteLoading}>
                    {deleteLoading ? 'Sending OTP...' : 'Send Delete OTP'}
                  </button>
                </form>
              ) : (
                <form className="delete-account-form" onSubmit={confirmAccountDeletion}>
                  <input
                    type="text"
                    className="form-input"
                    value={deleteForm.otp}
                    onChange={(e) => setDeleteForm(prev => ({ ...prev, otp: e.target.value }))}
                    placeholder="6-digit deletion OTP"
                    inputMode="numeric"
                    maxLength={6}
                    disabled={deleteLoading}
                  />
                  <button className="profile-danger-btn" type="submit" disabled={deleteLoading}>
                    {deleteLoading ? 'Deleting...' : 'Delete Permanently'}
                  </button>
                </form>
              )}

              {deleteStatus && <div className="delete-account-status">{deleteStatus}</div>}
            </div>
          </section>

          {Object.keys(quizAnswers).length > 0 && (
            <section className="profile-card full-width">
              <div className="card-header">
                <div className="header-content">
                  <Award className="header-icon" />
                  <div>
                    <h2 className="card-title">Quiz Responses</h2>
                    <p className="card-subtitle">Your assessment answers</p>
                  </div>
                </div>
              </div>

              <div className="quiz-responses">
                {Object.entries(quizAnswers).map(([question, answer]) => (
                  <div key={question} className="quiz-item">
                    <div className="quiz-question">{formatQuestionText(question)}</div>
                    <div className="quiz-answer">{formatAnswerText(answer)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

const formatQuestionText = (key) => {
  const questions = {
    learningEnvironment: 'Learning Environment',
    problemSolving: 'Problem Solving Approach',
    newConcepts: 'Learning New Concepts',
    informationProcessing: 'Information Processing',
    feedback: 'Feedback Preference',
    studyPreference: 'Study Preference',
    challengeResponse: 'Response to Challenges',
    contentType: 'Preferred Content Type'
  };
  return questions[key] || key;
};

const formatAnswerText = (value) => {
  const answers = {
    structured: 'Structured & Organized',
    flexible: 'Flexible & Adaptive',
    collaborative: 'Collaborative',
    independent: 'Independent',
    break_down: 'Break Into Steps',
    visualize: 'Visualize Big Picture',
    experiment: 'Hands-on Experimentation',
    discuss: 'Discussion & Dialogue',
    reading: 'Reading & Text',
    visual: 'Visual & Diagrams',
    hands_on: 'Hands-on Practice',
    discussion: 'Discussion',
    logic: 'Logical Analysis',
    patterns: 'Pattern Recognition',
    emotion: 'Emotional Connection',
    action: 'Physical Action',
    detailed: 'Detailed Analysis',
    encouraging: 'Encouraging',
    constructive: 'Constructive',
    direct: 'Direct & Concise'
  };
  return answers[value] || value;
};

export default Profile;
