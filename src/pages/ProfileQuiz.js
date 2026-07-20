import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './ProfileQuiz.css';
import { API_URL } from '../config';
import logo from '../assets/logo.svg';

const ProfileQuiz = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState('welcome');
  const [subjectInput, setSubjectInput] = useState('');
  const [mainSubjectSuggestions, setMainSubjectSuggestions] = useState([]);
  const [showMainSuggestions, setShowMainSuggestions] = useState(false);
  const [otherSubjectSuggestions, setOtherSubjectSuggestions] = useState([]);
  const [showOtherSuggestions, setShowOtherSuggestions] = useState(false);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  
  
  const mainSubjectRef = useRef(null);
  const otherSubjectsRef = useRef(null);
  const goalRef = useRef(null);
  const submitRef = useRef(null);
  
  
  const scrollToRef = (ref) => {
    setTimeout(() => {
      if (ref.current) {
        ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  };
  
  
  const prevMainSubjectRef = useRef('');

  
  const commonSubjects = [
    'Computer Science', 'Mathematics', 'Physics', 'Chemistry', 'Biology',
    'Engineering', 'Business Administration', 'Economics', 'Psychology', 'Sociology',
    'English Literature', 'History', 'Political Science', 'Philosophy', 'Art History',
    'Music', 'Theater', 'Communications', 'Journalism', 'Marketing',
    'Accounting', 'Finance', 'Statistics', 'Data Science', 'Information Technology',
    'Mechanical Engineering', 'Electrical Engineering', 'Civil Engineering', 'Chemical Engineering',
    'Biochemistry', 'Molecular Biology', 'Genetics', 'Neuroscience', 'Medicine',
    'Nursing', 'Public Health', 'Environmental Science', 'Geography', 'Anthropology',
    'Architecture', 'Graphic Design', 'Film Studies', 'Creative Writing', 'Linguistics',
    'Foreign Languages', 'Spanish', 'French', 'German', 'Chinese', 'Japanese',
    'Calculus', 'Algebra', 'Geometry', 'Trigonometry', 'Linear Algebra',
    'Organic Chemistry', 'Physical Chemistry', 'Analytical Chemistry', 'Inorganic Chemistry',
    'Quantum Physics', 'Thermodynamics', 'Electromagnetism', 'Optics', 'Mechanics',
    'Cell Biology', 'Ecology', 'Microbiology', 'Zoology', 'Botany',
    'Software Engineering', 'Web Development', 'Mobile Development', 'Artificial Intelligence',
    'Machine Learning', 'Cybersecurity', 'Database Management', 'Network Administration',
    'Game Development', 'UI/UX Design', 'Digital Marketing', 'Social Media Marketing',
    'Human Resources', 'Operations Management', 'Supply Chain Management', 'Project Management',
    'Law', 'Criminal Justice', 'International Relations', 'Education', 'Special Education'
  ];
  const [answers, setAnswers] = useState({
    learningStage: '',
    subjects: [],
    mainSubject: '',
    brainwaveGoal: '',
    learningPreferences: {
      q1: [],
      q2: [],
      q3: [],
      q4: [],
      q5: []
    }
  });
  const [weeklyGoalPreset, setWeeklyGoalPreset] = useState('regular');
  const weeklyGoalPresets = {
    light:     { chat: 5,  note: 3,  flashcard: 10, quiz: 2, label: 'Light',     desc: '5 chats · 3 notes · 10 cards · 2 quizzes' },
    regular:   { chat: 10, note: 5,  flashcard: 20, quiz: 5, label: 'Regular',   desc: '10 chats · 5 notes · 20 cards · 5 quizzes' },
    intensive: { chat: 20, note: 10, flashcard: 40, quiz: 10, label: 'Intensive', desc: '20 chats · 10 notes · 40 cards · 10 quizzes' },
  };
  const [userName, setUserName] = useState('');

  
  useEffect(() => {
    
    if (answers.mainSubject.length >= 3 && prevMainSubjectRef.current.length < 3 && currentStep === 'form') {
      scrollToRef(otherSubjectsRef);
    }
    prevMainSubjectRef.current = answers.mainSubject;
  }, [answers.mainSubject, currentStep]);

  const inspirationalQuotes = [
    "The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice.",
    "Education is not the filling of a pail, but the lighting of a fire.",
    "Live as if you were to die tomorrow. Learn as if you were to live forever.",
    "The beautiful thing about learning is that no one can take it away from you.",
    "Learning is not attained by chance, it must be sought for with ardor and attended to with diligence."
  ];

  const randomQuote = inspirationalQuotes[Math.floor(Math.random() * inspirationalQuotes.length)];

  const learningStages = [
    'High School Student',
    'Undergraduate Student',
    'Graduate Student',
    'Professional / Working',
    'Self-Learner / Hobbyist',
    'Career Changer',
    'Lifelong Learner'
  ];

  const brainwaveGoals = [
    { value: 'exam_prep', label: 'Ace my exams' },
    { value: 'homework_help', label: 'Get homework help' },
    { value: 'concept_mastery', label: 'Master difficult concepts' },
    { value: 'skill_building', label: 'Build new skills' },
    { value: 'career_prep', label: 'Prepare for my career' },
    { value: 'curiosity', label: 'Learn out of curiosity' }
  ];

  const learningPreferenceQuestions = [
    {
      id: 'q1',
      question: "When you're learning something new, which approach helps you understand fastest?",
      subtitle: "select all that apply",
      options: [
        { value: 'A', text: 'Step-by-step explanation with clear logic and definitions' },
        { value: 'B', text: 'Worked examples first, then I infer the rule/pattern' },
        { value: 'C', text: 'Visuals (diagrams/mind maps) showing relationships' },
        { value: 'D', text: 'Real-world applications/case studies that show "why it matters"' }
      ]
    },
    {
      id: 'q2',
      question: "Which study method improves your retention the most over a week?",
      subtitle: "select all that apply",
      options: [
        { value: 'A', text: 'Active recall (self-quizzing without notes)' },
        { value: 'B', text: 'Spaced repetition (reviewing over multiple days)' },
        { value: 'C', text: 'Rewriting/organizing notes into a clean structure' },
        { value: 'D', text: 'Teaching/explaining the concept to someone (or to myself)' }
      ]
    },
    {
      id: 'q3',
      question: "What type of practice gives you the biggest score jump in exams?",
      subtitle: "select all that apply",
      options: [
        { value: 'A', text: 'Topic-wise practice sets (one concept at a time)' },
        { value: 'B', text: 'Mixed practice (questions from different topics in one set)' },
        { value: 'C', text: 'Timed mocks under exam conditions' },
        { value: 'D', text: 'Error-focused drills (repeat only what I get wrong)' }
      ]
    },
    {
      id: 'q4',
      question: "When you make mistakes, what feedback style helps you improve quickest?",
      subtitle: "select all that apply",
      options: [
        { value: 'A', text: 'Exact step where I went wrong + corrected steps' },
        { value: 'B', text: 'Hints that guide me to the answer without revealing it' },
        { value: 'C', text: 'A "why this works" explanation + a similar follow-up question' },
        { value: 'D', text: 'A summary of my common mistake patterns + a targeted plan' }
      ]
    },
    {
      id: 'q5',
      question: "How should your learning path be structured to keep you progressing?",
      subtitle: "select all that apply",
      options: [
        { value: 'A', text: 'Strict linear path: must master basics before moving on' },
        { value: 'B', text: 'Adaptive path: difficulty adjusts based on my quiz performance' },
        { value: 'C', text: 'Goal-based path: jump to what I need for an exam/career goal' },
        { value: 'D', text: 'Concept-map path: I choose nodes, but prerequisites are recommended' }
      ]
    }
  ];

  useEffect(() => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');

    if (!token) {
      navigate('/login');
      return;
    }

    if (username) {
      setUserName(username);
      checkQuizStatus(username, token);
    }
  }, [navigate]);

  const checkQuizStatus = async (username, token) => {
    try {
      const response = await fetch(`${API_URL}/check_profile_quiz?user_id=${username}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
                if (data.completed) {
                    navigate('/dashboard-cerbyl');
        }
      }
    } catch (error) { /* silenced */ }
  };

  const generateMainSubjectSuggestions = (input) => {
    if (!input || input.length < 2) {
      setMainSubjectSuggestions([]);
      setShowMainSuggestions(false);
      return;
    }

    const filtered = commonSubjects.filter(subject => 
      subject.toLowerCase().includes(input.toLowerCase())
    ).slice(0, 8);

    setMainSubjectSuggestions(filtered);
    setShowMainSuggestions(filtered.length > 0);
  };

  const generateOtherSubjectSuggestions = (input) => {
    if (!input || input.length < 2) {
      setOtherSubjectSuggestions([]);
      setShowOtherSuggestions(false);
      return;
    }

    const filtered = commonSubjects.filter(subject => 
      subject.toLowerCase().includes(input.toLowerCase()) &&
      !answers.subjects.includes(subject) &&
      subject !== answers.mainSubject
    ).slice(0, 8);

    setOtherSubjectSuggestions(filtered);
    setShowOtherSuggestions(filtered.length > 0);
  };

  const handleSubjectInputChange = (e) => {
    const value = e.target.value;
    setSubjectInput(value);
    generateOtherSubjectSuggestions(value);
  };

  const addSubject = (subject) => {
    if (!answers.subjects.includes(subject)) {
      setAnswers(prev => {
        const newSubjects = [...prev.subjects, subject];
                
        if (newSubjects.length === 1) {
          scrollToRef(goalRef);
        }
        return {
          ...prev,
          subjects: newSubjects
        };
      });
    }
    setSubjectInput('');
    setOtherSubjectSuggestions([]);
    setShowOtherSuggestions(false);
  };

  const removeSubject = (subject) => {
    setAnswers(prev => ({
      ...prev,
      subjects: prev.subjects.filter(s => s !== subject)
    }));
  };

  const handleSkip = () => {
    setShowSkipWarning(true);
  };

  const confirmSkip = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${API_URL}/save_complete_profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userName,
          learning_stage: answers.learningStage,
          preferred_subjects: answers.subjects,
          main_subject: answers.mainSubject,
          brainwave_goal: answers.brainwaveGoal,
          quiz_completed: false,
          quiz_skipped: true
        })
      });

      if (response.ok) {
        const data = await response.json();
                        
        
        sessionStorage.setItem('justCompletedOnboarding', 'true');
        sessionStorage.setItem('isFirstTimeUser', 'true');
        
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        navigate('/dashboard-cerbyl');
      } else {
                navigate('/dashboard-cerbyl');
      }
    } catch (error) {
            navigate('/dashboard-cerbyl');
    }
  };

  const cancelSkip = () => {
    setShowSkipWarning(false);
  };

  const isFormValid = () => {
    return answers.learningStage && 
           answers.subjects.length > 0 && 
           answers.mainSubject && 
           answers.brainwaveGoal;
  };

  if (currentStep === 'welcome') {
    return (
      <div className="profile-quiz-page">
        <div className="bento-background">
          <div className="bento-bg-box bento-bg-1"></div>
          <div className="bento-bg-box bento-bg-2"></div>
          <div className="bento-bg-box bento-bg-3"></div>
          <div className="bento-bg-box bento-bg-4"></div>
          <div className="bento-bg-box bento-bg-5"></div>
          <div className="bento-bg-box bento-bg-6"></div>
          <div className="bento-bg-box bento-bg-7"></div>
          <div className="bento-bg-box bento-bg-8"></div>
        </div>
        
        <div className="bento-grid">
          <div className="connection-network">
            <div className="node node-1"></div>
            <div className="node node-2"></div>
            <div className="node node-3"></div>
            <div className="node node-4"></div>
            <div className="node node-5"></div>
            <div className="node node-6"></div>
            <div className="node node-7"></div>
            <div className="node node-8"></div>
            <svg className="connection-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
              <line x1="25" y1="25" x2="50" y2="25" className="connection-line" />
              <line x1="50" y1="12.5" x2="75" y2="12.5" className="connection-line" />
              <line x1="75" y1="25" x2="87.5" y2="25" className="connection-line" />
              <line x1="50" y1="37.5" x2="75" y2="37.5" className="connection-line" />
              <line x1="37.5" y1="62.5" x2="62.5" y2="62.5" className="connection-line" />
              <line x1="50" y1="75" x2="75" y2="75" className="connection-line" />
              <line x1="25" y1="25" x2="25" y2="62.5" className="connection-line" />
              <line x1="75" y1="37.5" x2="75" y2="62.5" className="connection-line" />
            </svg>
          </div>

          <div className="bento-box bento-text-large">
            <h1 className="bento-large-title">
              <img src={logo} alt="" style={{ height: '40px', marginRight: '12px', verticalAlign: 'middle', filter: 'brightness(0) saturate(100%) invert(77%) sepia(48%) saturate(456%) hue-rotate(359deg) brightness(95%) contrast(89%)' }} />
              welcome to cerbyl
            </h1>
          </div>

          <div className="bento-box bento-quote-top">
            <p className="bento-quote-text">{randomQuote}</p>
          </div>

          <div className="bento-box bento-symbol-top">
            <img src={logo} alt="cerbyl" className="bento-logo-icon" />
          </div>

          <div className="bento-box bento-main-cta" onClick={() => setCurrentStep('form')}>
            <div className="bento-cta-content">
              <svg className="bento-cta-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <span className="bento-cta-text">take quiz</span>
            </div>
          </div>

          <div className="bento-box bento-skip-cta" onClick={handleSkip}>
            <div className="bento-cta-content">
              <svg className="bento-skip-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 18l2.29-2.29-4.88-4.88-4 4L2 7.41 3.41 6l6 6 4-4 6.3 6.29L22 12v6z"/>
              </svg>
              <span className="bento-cta-text">skip quiz</span>
            </div>
          </div>

          <div className="bento-box bento-accent-light"></div>
          <div className="bento-box bento-accent-medium"></div>

          <div className="bento-box bento-accent-mid"></div>
          <div className="bento-box bento-accent-strong"></div>

          <div className="bento-box bento-accent-dark"></div>

          <div className="bento-box bento-description">
            <h3 className="bento-desc-title">your personalized ai tutor</h3>
            <p className="bento-desc-text">
              Cerbyl adapts to your unique learning style, helping you master any subject with personalized guidance and support.
            </p>
          </div>

          <div className="bento-box bento-accent-subtle"></div>
        </div>
        
        {showSkipWarning && (
          <div className="skip-warning-overlay">
            <div className="skip-warning-modal">
              <h3>skip the quiz?</h3>
              <p>
                Taking this quiz helps us understand your learning style and personalize your experience. 
                We can adapt to your needs much better if you complete it!
              </p>
              <p className="warning-emphasis">
                You can always take the quiz later from your profile section.
              </p>
              <div className="warning-actions">
                <button className="continue-assessment-btn" onClick={cancelSkip}>
                  Take Quiz
                </button>
                <button className="confirm-skip-btn" onClick={confirmSkip}>
                  Skip Anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (currentStep === 'preferences') {
    const isFormValid = () => {
      return answers.learningPreferences.q1.length > 0 && 
             answers.learningPreferences.q2.length > 0 && 
             answers.learningPreferences.q3.length > 0 && 
             answers.learningPreferences.q4.length > 0 && 
             answers.learningPreferences.q5.length > 0;
    };

    const handleAnswerSelect = (questionId, value) => {
      setAnswers(prev => {
        const currentAnswers = prev.learningPreferences[questionId] || [];
        const newAnswers = currentAnswers.includes(value)
          ? currentAnswers.filter(v => v !== value)
          : [...currentAnswers, value];
        
        return {
          ...prev,
          learningPreferences: {
            ...prev.learningPreferences,
            [questionId]: newAnswers
          }
        };
      });
    };

    const handleSubmit = async () => {
      if (!isFormValid()) return;

      try {
        const token = localStorage.getItem('token');
        const preset = weeklyGoalPresets[weeklyGoalPreset] || weeklyGoalPresets.regular;

        await fetch(`${API_URL}/save_complete_profile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            user_id: userName,
            learning_stage: answers.learningStage,
            preferred_subjects: answers.subjects,
            main_subject: answers.mainSubject,
            brainwave_goal: answers.brainwaveGoal,
            learning_preferences: answers.learningPreferences,
            quiz_completed: true
          })
        });

        await fetch(`${API_URL}/api/set_weekly_goals?user_id=${encodeURIComponent(userName)}&chat_goal=${preset.chat}&note_goal=${preset.note}&flashcard_goal=${preset.flashcard}&quiz_goal=${preset.quiz}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }); 

        setCurrentStep('complete');
        sessionStorage.setItem('justCompletedOnboarding', 'true');
        sessionStorage.setItem('isFirstTimeUser', 'true');
        sessionStorage.setItem('justLoggedIn', 'true');
        
        setTimeout(() => {
          navigate('/dashboard-cerbyl');
        }, 3000);
      } catch (error) {
        console.error('Error saving profile:', error);
      }
    };
    
    return (
      <div className="profile-quiz-page">
        <div className="bento-background">
          <div className="bento-bg-box bento-bg-1"></div>
          <div className="bento-bg-box bento-bg-2"></div>
          <div className="bento-bg-box bento-bg-3"></div>
          <div className="bento-bg-box bento-bg-4"></div>
          <div className="bento-bg-box bento-bg-5"></div>
          <div className="bento-bg-box bento-bg-6"></div>
          <div className="bento-bg-box bento-bg-7"></div>
          <div className="bento-bg-box bento-bg-8"></div>
        </div>
        
        <div className="quiz-container">
          <div className="quiz-header">
            <h1 className="quiz-title">Learning Preferences</h1>
            <p className="quiz-subtitle">Help us personalize your learning experience</p>
          </div>

          <div className="quiz-all-questions">
            {learningPreferenceQuestions.map((question, qIndex) => (
              <div key={question.id} className="question-section">
                <div className="question-header">
                  <span className="question-number">Question {qIndex + 1}</span>
                  <h2 className="question-text">{question.question}</h2>
                  <p className="question-subtitle">{question.subtitle}</p>
                </div>

                <div className="options-list">
                  {question.options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`option-button ${answers.learningPreferences[question.id]?.includes(option.value) ? 'selected' : ''}`}
                      onClick={() => handleAnswerSelect(question.id, option.value)}
                      aria-pressed={answers.learningPreferences[question.id]?.includes(option.value) || false}
                    >
                      <span className="option-letter">{option.value})</span>
                      <span className="option-text">{option.text}</span>
                      {answers.learningPreferences[question.id]?.includes(option.value) && (
                        <span className="option-checkmark">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div className="quiz-actions">
              <button
                className="submit-quiz-btn"
                onClick={handleSubmit}
                disabled={!isFormValid()}
              >
                Complete Setup
              </button>
              <button className="skip-quiz-link" onClick={handleSkip}>
                Skip for now
              </button>
            </div>
          </div>
        </div>

        {showSkipWarning && (
          <div className="skip-warning-overlay">
            <div className="skip-warning-modal">
              <h3>are you sure you want to skip?</h3>
              <p>
                This quick assessment helps us personalize your AI tutor to match your unique learning style. 
                This significantly enhances your learning experience and makes study sessions more effective.
              </p>
              <p className="warning-emphasis">
                We highly recommend completing this short assessment for the best experience.
              </p>
              <div className="warning-actions">
                <button className="continue-assessment-btn" onClick={cancelSkip}>
                  Continue Assessment
                </button>
                <button className="confirm-skip-btn" onClick={confirmSkip}>
                  Skip Anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (currentStep === 'complete') {
    return (
      <div className="profile-quiz-page">
        <div className="quiz-container">
          <div className="quiz-completion">
            <h1 className="completion-title">All Set!</h1>
            <p className="completion-message">
              Your AI tutor is now personalized to match your unique learning preferences
            </p>
            <p className="redirect-message">Redirecting to your dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-quiz-page">
      <div className="bento-background">
        <div className="bento-bg-box bento-bg-1"></div>
        <div className="bento-bg-box bento-bg-2"></div>
        <div className="bento-bg-box bento-bg-3"></div>
        <div className="bento-bg-box bento-bg-4"></div>
        <div className="bento-bg-box bento-bg-5"></div>
        <div className="bento-bg-box bento-bg-6"></div>
        <div className="bento-bg-box bento-bg-7"></div>
        <div className="bento-bg-box bento-bg-8"></div>
      </div>
      
      <div className="quiz-container">
        <div className="quiz-header-single">
          <div className="quiz-header-left">
            <h1 className="quiz-title-single">profile</h1>
            <p className="quiz-subtitle-single">customize your ai learning experience</p>
          </div>
          <button className="back-to-dashboard-btn" onClick={() => navigate('/dashboard-cerbyl')}>
            ◄ back to dashboard
          </button>
        </div>

        <div className="quiz-form">
          <div className="form-section">
            <label className="form-label">what best describes your learning journey?</label>
            <div className="button-group-vertical">
              {learningStages.map((stage) => (
                <button
                  key={stage}
                  className={`choice-btn-vertical ${answers.learningStage === stage ? 'selected' : ''}`}
                  onClick={() => {
                    setAnswers(prev => ({ ...prev, learningStage: stage }));
                    scrollToRef(mainSubjectRef);
                  }}
                >
                  {stage}
                </button>
              ))}
            </div>
          </div>

          {answers.learningStage && (
            <div className="form-section" ref={mainSubjectRef}>
              <label className="form-label">what's your main subject or field of study?</label>
              <p className="form-hint">type to search or add a custom subject</p>
              
              <div className="subject-input-container">
                <input
                  type="text"
                  className="subject-input"
                  placeholder="e.g., Computer Science, Biology, Mathematics..."
                  value={answers.mainSubject}
                  onChange={(e) => {
                    setAnswers(prev => ({ ...prev, mainSubject: e.target.value }));
                    generateMainSubjectSuggestions(e.target.value);
                  }}
                  autoComplete="off"
                  onFocus={() => {
                    if (answers.mainSubject.length >= 2) {
                      generateMainSubjectSuggestions(answers.mainSubject);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowMainSuggestions(false), 200);
                  }}
                />

                {showMainSuggestions && mainSubjectSuggestions.length > 0 && (
                  <div className="suggestions-dropdown">
                    {mainSubjectSuggestions.map((subject, idx) => (
                      <div
                        key={idx}
                        className="suggestion-item"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setAnswers(prev => ({ ...prev, mainSubject: subject }));
                          setMainSubjectSuggestions([]);
                          setShowMainSuggestions(false);
                          scrollToRef(otherSubjectsRef);
                        }}
                      >
                        {subject}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {answers.mainSubject && (
            <div className="form-section" ref={otherSubjectsRef}>
              <label className="form-label">what other subjects are you interested in?</label>
              <p className="form-hint">type to search or add custom subjects (optional)</p>
              
              {answers.subjects.length > 0 && (
                <div className="selected-subjects">
                  {answers.subjects.map((subject, idx) => (
                    <div key={idx} className="subject-tag">
                      {subject}
                      <button
                        className="remove-subject"
                        onClick={() => removeSubject(subject)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="subject-input-container">
                <input
                  type="text"
                  className="subject-input"
                  placeholder="e.g., Calculus, Organic Chemistry, Data Structures..."
                  value={subjectInput}
                  onChange={handleSubjectInputChange}
                  autoComplete="off"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && subjectInput.trim() && subjectInput !== answers.mainSubject) {
                      addSubject(subjectInput.trim());
                    }
                  }}
                  onFocus={() => {
                    if (subjectInput.length >= 2) {
                      generateOtherSubjectSuggestions(subjectInput);
                    }
                  }}
                  onBlur={() => {
                    setTimeout(() => setShowOtherSuggestions(false), 200);
                  }}
                />

                {showOtherSuggestions && otherSubjectSuggestions.length > 0 && (
                  <div className="suggestions-dropdown">
                    {otherSubjectSuggestions.map((subject, idx) => (
                      <div
                        key={idx}
                        className="suggestion-item"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          addSubject(subject);
                        }}
                      >
                        {subject}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {answers.mainSubject && (
            <div className="form-section" ref={goalRef}>
              <label className="form-label">what's your main goal?</label>
              <div className="button-group-vertical">
                {brainwaveGoals.map((goal) => (
                  <button
                    key={goal.value}
                    className={`choice-btn-vertical ${answers.brainwaveGoal === goal.value ? 'selected' : ''}`}
                    onClick={() => {
                      setAnswers(prev => ({ ...prev, brainwaveGoal: goal.value }));
                      scrollToRef(submitRef);
                    }}
                  >
                    {goal.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {answers.mainSubject && answers.brainwaveGoal && (
            <div className="form-section">
              <label className="form-label">weekly activity goals</label>
              <p className="form-hint">how much do you plan to study each week?</p>
              <div className="button-group-horizontal">
                {Object.entries(weeklyGoalPresets).map(([key, preset]) => (
                  <button
                    key={key}
                    className={`choice-btn-horizontal ${weeklyGoalPreset === key ? 'selected' : ''}`}
                    onClick={() => setWeeklyGoalPreset(key)}
                  >
                    <span className="goal-preset-label">{preset.label}</span>
                    <span className="goal-preset-desc">{preset.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {answers.mainSubject && answers.brainwaveGoal && (
            <div className="form-section" ref={submitRef}>
              <button
                className="submit-btn"
                onClick={() => setCurrentStep('preferences')}
              >
                continue to learning preferences
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileQuiz;
