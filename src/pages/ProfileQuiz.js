import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, ChevronLeft, ChevronRight, Play, SkipForward, Feather, Flame, Rocket } from 'lucide-react';
import './ProfileQuiz.css';
import { API_URL } from '../config';
import GeometricGrid from '../components/GeometricGrid';

const DECO_BOXES = [
  { variant: 'light', top: '9%', left: '3%', w: 130, h: 130, rot: -7 },
  { variant: 'dark', top: '14%', right: '4%', w: 190, h: 120, rot: 5 },
  { variant: 'dark', top: '46%', left: '1.5%', w: 70, h: 70, rot: 12 },
  { variant: 'light', bottom: '20%', left: '6%', w: 100, h: 100, rot: 9 },
  { variant: 'light', top: '58%', right: '2%', w: 120, h: 80, rot: -5 },
  { variant: 'dark', bottom: '8%', right: '6%', w: 170, h: 170, rot: -9 },
];

function DecoBoxes() {
  return (
    <div className="pq-deco-layer" aria-hidden>
      {DECO_BOXES.map((b, i) => (
        <div
          key={i}
          className={`pq-deco pq-deco--${b.variant}`}
          style={{
            top: b.top, left: b.left, right: b.right, bottom: b.bottom,
            width: b.w, height: b.h,
            '--r': `${b.rot}deg`,
            animationDelay: `${i * -3.4}s`,
          }}
        />
      ))}
    </div>
  );
}

function BgFx() {
  return (
    <>
      <div className="pq-bg-wash" />
      <div className="pq-bg-orb pq-bg-orb-1" />
      <div className="pq-bg-orb pq-bg-orb-2" />
      <GeometricGrid className="pq-bg-geo" linesClassName="pq-bg-geo-lines" numsClassName="pq-bg-geo-nums" />
      <DecoBoxes />
      <div className="pq-bg-grain" />
      <div className="pq-bg-vignette" />
    </>
  );
}

function StepIndicator({ step, canGoPreferences, onNavigate }) {
  return (
    <div className="pq-steps">
      <button type="button" className={`pq-step${step === 'form' ? ' pq-step--on' : ''}`} onClick={() => onNavigate('form')}>
        <span className="pq-step-num">01</span>PROFILE
      </button>
      <div className="pq-step-rule" />
      <button
        type="button"
        className={`pq-step${step === 'preferences' ? ' pq-step--on' : ''}${!canGoPreferences ? ' pq-step--disabled' : ''}`}
        onClick={() => canGoPreferences && onNavigate('preferences')}
        disabled={!canGoPreferences}
      >
        <span className="pq-step-num">02</span>PREFERENCES
      </button>
    </div>
  );
}

const ProfileQuiz = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState('welcome');
  const [subjectInput, setSubjectInput] = useState('');
  const [mainSubjectSuggestions, setMainSubjectSuggestions] = useState([]);
  const [showMainSuggestions, setShowMainSuggestions] = useState(false);
  const [otherSubjectSuggestions, setOtherSubjectSuggestions] = useState([]);
  const [showOtherSuggestions, setShowOtherSuggestions] = useState(false);
  const [showSkipWarning, setShowSkipWarning] = useState(false);

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
    light:     { chat: 5,  note: 3,  flashcard: 10, quiz: 2,  label: 'Light',     icon: Feather },
    regular:   { chat: 10, note: 5,  flashcard: 20, quiz: 5,  label: 'Regular',   icon: Flame },
    intensive: { chat: 20, note: 10, flashcard: 40, quiz: 10, label: 'Intensive', icon: Rocket },
  };
  const [userName, setUserName] = useState('');
  const [showBackWarning, setShowBackWarning] = useState(false);


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

  const handleStepNav = (target) => {
    if (target === currentStep) return;
    if (target === 'preferences' && !isFormValid()) return;
    setCurrentStep(target);
  };

  const confirmBack = () => {
    setShowBackWarning(false);
    setAnswers({
      learningStage: '',
      subjects: [],
      mainSubject: '',
      brainwaveGoal: '',
      learningPreferences: { q1: [], q2: [], q3: [], q4: [], q5: [] }
    });
    setSubjectInput('');
    setWeeklyGoalPreset('regular');
    setCurrentStep('welcome');
  };

  if (currentStep === 'welcome') {
    return (
      <div className="pq-root">
        <div className="pq-bg-fx" aria-hidden><BgFx /></div>

        <div className="pq-welcome">
          <div className="pq-welcome-grid">
            <div className="pq-tile pq-tile-hero">
              <div className="pq-tile-texture" />
              <div className="pq-hero-logo" />
              <h1 className="pq-hero-title">welcome to cerbyl</h1>
              <p className="pq-hero-tagline"><span className="pq-nav-dot" />LEARNING UNIFIED</p>
            </div>

            <button className="pq-tile pq-cta pq-cta--primary" onClick={() => setCurrentStep('form')}>
              <div className="pq-tile-texture" />
              <span className="pq-cta-num">01</span>
              <div className="pq-cta-body">
                <Play size={18} />
                <span className="pq-cta-label">take the quiz</span>
                <span className="pq-cta-sub">2 minutes &middot; personalizes everything</span>
              </div>
            </button>

            <button className="pq-tile pq-cta pq-cta--ghost" onClick={handleSkip}>
              <span className="pq-cta-num">&mdash;</span>
              <div className="pq-cta-body">
                <SkipForward size={16} />
                <span className="pq-cta-label">skip for now</span>
              </div>
            </button>

            <div className="pq-tile pq-tile-desc">
              <div className="pq-tile-texture" />
              <span className="pq-desc-label">YOUR PERSONALIZED AI TUTOR</span>
              <p className="pq-desc-text">
                Cerbyl adapts to your unique learning style, helping you master any subject with personalized guidance and support.
              </p>
            </div>
          </div>
        </div>

        {showSkipWarning && (
          <div className="pq-modal-overlay" onClick={cancelSkip}>
            <div className="pq-modal" onClick={(e) => e.stopPropagation()}>
              <div className="pq-tile-texture" />
              <h3 className="pq-modal-title">skip the quiz?</h3>
              <p className="pq-modal-text">
                Taking this quiz helps us understand your learning style and personalize your experience.
                We can adapt to your needs much better if you complete it!
              </p>
              <p className="pq-modal-emphasis">
                You can always take the quiz later from your profile section.
              </p>
              <div className="pq-modal-actions">
                <button className="pq-btn pq-btn--primary" onClick={cancelSkip}>Take Quiz</button>
                <button className="pq-btn pq-btn--accent" onClick={confirmSkip}>Skip Anyway</button>
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
      <div className="pq-root">
        <div className="pq-bg-fx" aria-hidden><BgFx /></div>

        <div className="pq-shell">
          <div className="pq-header">
            <div>
              <StepIndicator step="preferences" canGoPreferences onNavigate={handleStepNav} />
              <h1 className="pq-page-title">learning preferences</h1>
              <p className="pq-page-sub">help us personalize your learning experience</p>
            </div>
            <button className="pq-btn pq-btn--ghost pq-btn--sm" onClick={() => setCurrentStep('form')}>
              <ChevronLeft size={14} /> back to profile
            </button>
          </div>

          <div className="pq-form">
            {learningPreferenceQuestions.map((question, qIndex) => (
              <section key={question.id} className="pq-section">
                <span className="pq-section-num">{String(qIndex + 1).padStart(2, '0')}</span>
                <div className="pq-section-body">
                  <label className="pq-label">{question.question}</label>
                  <p className="pq-hint">{question.subtitle}</p>

                  <div className="pq-option-list">
                    {question.options.map((option) => {
                      const selected = answers.learningPreferences[question.id]?.includes(option.value) || false;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`pq-option${selected ? ' pq-option--selected' : ''}`}
                          onClick={() => handleAnswerSelect(question.id, option.value)}
                          aria-pressed={selected}
                        >
                          <span className="pq-option-letter">{option.value}</span>
                          <span className="pq-option-text">{option.text}</span>
                          {selected && <Check size={14} className="pq-option-check" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            ))}

            <div className="pq-actions pq-actions--row">
              <button className="pq-btn pq-btn--ghost pq-btn--lg" onClick={handleSkip}>
                Skip for now
              </button>
              <button
                className="pq-submit-cta"
                onClick={handleSubmit}
                disabled={!isFormValid()}
              >
                Complete Setup <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {showSkipWarning && (
          <div className="pq-modal-overlay" onClick={cancelSkip}>
            <div className="pq-modal" onClick={(e) => e.stopPropagation()}>
              <div className="pq-tile-texture" />
              <h3 className="pq-modal-title">are you sure you want to skip?</h3>
              <p className="pq-modal-text">
                This quick assessment helps us personalize your AI tutor to match your unique learning style.
                This significantly enhances your learning experience and makes study sessions more effective.
              </p>
              <p className="pq-modal-emphasis">
                We highly recommend completing this short assessment for the best experience.
              </p>
              <div className="pq-modal-actions">
                <button className="pq-btn pq-btn--primary" onClick={cancelSkip}>Continue Assessment</button>
                <button className="pq-btn pq-btn--accent" onClick={confirmSkip}>Skip Anyway</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (currentStep === 'complete') {
    return (
      <div className="pq-root">
        <div className="pq-bg-fx" aria-hidden><BgFx /></div>
        <div className="pq-complete-wrap">
          <div className="pq-complete-card">
            <div className="pq-tile-texture" />
            <div className="pq-hero-logo pq-hero-logo--sm" />
            <h1 className="pq-complete-title">all set!</h1>
            <p className="pq-complete-msg">
              Your AI tutor is now personalized to match your unique learning preferences
            </p>
            <p className="pq-complete-redirect"><span className="pq-pulse-dot" />redirecting to your dashboard&hellip;</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pq-root">
      <div className="pq-bg-fx" aria-hidden><BgFx /></div>

      <div className="pq-shell">
        <div className="pq-header">
          <div>
            <StepIndicator step="form" canGoPreferences={Boolean(isFormValid())} onNavigate={handleStepNav} />
            <h1 className="pq-page-title">profile</h1>
            <p className="pq-page-sub">customize your ai learning experience</p>
          </div>
          <button className="pq-btn pq-btn--ghost pq-btn--sm" onClick={() => setShowBackWarning(true)}>
            <ChevronLeft size={14} /> back
          </button>
        </div>

        <div className="pq-form">
          <section className="pq-section">
            <span className="pq-section-num">01</span>
            <div className="pq-section-body">
              <label className="pq-label">what best describes your learning journey?</label>
              <div className="pq-choice-list">
                {learningStages.map((stage) => {
                  const selected = answers.learningStage === stage;
                  return (
                    <button
                      key={stage}
                      className={`pq-choice${selected ? ' pq-choice--selected' : ''}`}
                      onClick={() => setAnswers(prev => ({ ...prev, learningStage: stage }))}
                    >
                      <span className="pq-choice-text">{stage}</span>
                      {selected && <Check size={14} className="pq-choice-check" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="pq-section">
            <span className="pq-section-num">02</span>
            <div className="pq-section-body">
              <label className="pq-label">what&apos;s your main subject or field of study?</label>
              <p className="pq-hint">type to search or add a custom subject</p>

              <div className="pq-input-container">
                <input
                  type="text"
                  className="pq-input"
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
                  <div className="pq-suggestions">
                    {mainSubjectSuggestions.map((subject, idx) => (
                      <div
                        key={idx}
                        className="pq-suggestion"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setAnswers(prev => ({ ...prev, mainSubject: subject }));
                          setMainSubjectSuggestions([]);
                          setShowMainSuggestions(false);
                        }}
                      >
                        {subject}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="pq-section">
            <span className="pq-section-num">03</span>
            <div className="pq-section-body">
              <label className="pq-label">what other subjects are you interested in?</label>
              <p className="pq-hint">type to search or add custom subjects (optional)</p>

              {answers.subjects.length > 0 && (
                <div className="pq-tags">
                  {answers.subjects.map((subject, idx) => (
                    <div key={idx} className="pq-tag">
                      {subject}
                      <button className="pq-tag-remove" onClick={() => removeSubject(subject)} aria-label={`Remove ${subject}`}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="pq-input-container">
                <input
                  type="text"
                  className="pq-input"
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
                  <div className="pq-suggestions">
                    {otherSubjectSuggestions.map((subject, idx) => (
                      <div
                        key={idx}
                        className="pq-suggestion"
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
          </section>

          <section className="pq-section">
            <span className="pq-section-num">04</span>
            <div className="pq-section-body">
              <label className="pq-label">what&apos;s your main goal?</label>
              <div className="pq-choice-list">
                {brainwaveGoals.map((goal) => {
                  const selected = answers.brainwaveGoal === goal.value;
                  return (
                    <button
                      key={goal.value}
                      className={`pq-choice${selected ? ' pq-choice--selected' : ''}`}
                      onClick={() => setAnswers(prev => ({ ...prev, brainwaveGoal: goal.value }))}
                    >
                      <span className="pq-choice-text">{goal.label}</span>
                      {selected && <Check size={14} className="pq-choice-check" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="pq-section">
            <span className="pq-section-num">05</span>
            <div className="pq-section-body">
              <label className="pq-label">weekly activity goals</label>
              <p className="pq-hint">how much do you plan to study each week?</p>
              <div className="pq-preset-grid">
                {Object.entries(weeklyGoalPresets).map(([key, preset]) => {
                  const Icon = preset.icon;
                  const selected = weeklyGoalPreset === key;
                  return (
                    <button
                      key={key}
                      className={`pq-preset${selected ? ' pq-preset--selected' : ''}`}
                      onClick={() => setWeeklyGoalPreset(key)}
                    >
                      <div className="pq-preset-top">
                        <span className="pq-preset-icon"><Icon size={20} /></span>
                        <span className="pq-preset-label">{preset.label}</span>
                      </div>
                      <div className="pq-preset-stats">
                        <div className="pq-preset-stat">
                          <span className="pq-preset-stat-num">{preset.chat}</span>
                          <span className="pq-preset-stat-label">chats</span>
                        </div>
                        <div className="pq-preset-stat">
                          <span className="pq-preset-stat-num">{preset.note}</span>
                          <span className="pq-preset-stat-label">notes</span>
                        </div>
                        <div className="pq-preset-stat">
                          <span className="pq-preset-stat-num">{preset.flashcard}</span>
                          <span className="pq-preset-stat-label">cards</span>
                        </div>
                        <div className="pq-preset-stat">
                          <span className="pq-preset-stat-num">{preset.quiz}</span>
                          <span className="pq-preset-stat-label">quizzes</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="pq-actions">
            <button
              className="pq-submit-cta"
              onClick={() => isFormValid() && setCurrentStep('preferences')}
              disabled={!isFormValid()}
            >
              continue to learning preferences <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {showBackWarning && (
        <div className="pq-modal-overlay" onClick={() => setShowBackWarning(false)}>
          <div className="pq-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pq-tile-texture" />
            <h3 className="pq-modal-title">go back?</h3>
            <p className="pq-modal-text">
              Leaving this page takes you back to the start and clears what you&apos;ve filled in so far.
            </p>
            <p className="pq-modal-emphasis">
              Your progress on this profile setup will be lost.
            </p>
            <div className="pq-modal-actions">
              <button className="pq-btn pq-btn--accent" onClick={() => setShowBackWarning(false)}>Stay Here</button>
              <button className="pq-btn pq-btn--primary" onClick={confirmBack}>Go Back</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileQuiz;
