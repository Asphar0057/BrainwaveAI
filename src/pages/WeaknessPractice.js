import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const WeaknessPractice = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const { topic, difficulty, questions, questionSetId } = location.state || {};

    if (questions?.length > 0) {
      sessionStorage.setItem('quizData', JSON.stringify({
        questions,
        topic: topic || 'Weak Area Practice',
        difficulty: difficulty || 'medium',
        quiz_id: questionSetId,
        quizMode: 'standard',
        timingMode: 'timed',
      }));
      navigate('/solo-quiz/session', { replace: true });
    } else if (topic) {
      const quizDifficulty = { beginner: 'easy', intermediate: 'medium', advanced: 'hard' }[difficulty] || difficulty || 'medium';
      navigate('/solo-quiz', { replace: true, state: { autoStart: true, topics: [topic], difficulty: quizDifficulty, questionCount: 5 } });
    } else {
      navigate('/weaknesses', { replace: true });
    }
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexDirection: 'column', gap: 16,
      background: 'var(--bg-primary)', color: 'var(--text-primary)',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ width: 40, height: 40, border: '3px solid', borderColor: 'var(--accent) transparent transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--accent)', margin: 0 }}>Loading Practice</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default WeaknessPractice;
