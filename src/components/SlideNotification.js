import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Calendar, Award, Flame, TrendingUp, X, Zap, BookOpen, UserPlus, Users, Share2, Swords, MessageSquare, FileText, Target, Clock, Trophy, ArrowUpRight } from 'lucide-react';
import './SlideNotification.css';

let lastNotificationSoundAt = 0;

const playNotificationSound = () => {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  if (now - lastNotificationSoundAt < 700) return;
  lastNotificationSoundAt = now;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const audioContext = new AudioContextClass();
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.42);
    gain.connect(audioContext.destination);

    [880, 1175].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + index * 0.1);
      oscillator.connect(gain);
      oscillator.start(audioContext.currentTime + index * 0.1);
      oscillator.stop(audioContext.currentTime + 0.34 + index * 0.08);
    });

    setTimeout(() => {
      audioContext.close().catch(() => {});
    }, 700);
  } catch (error) {
    lastNotificationSoundAt = 0;
  }
};

const SlideNotification = ({ notification, onClose, onMarkRead, style = {} }) => {
  const [visible, setVisible] = useState(false);
  const [isValid, setIsValid] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    
    if (!notification || !notification.id || (!notification.title && !notification.message)) {
            setIsValid(false);
      if (onClose) {
        setTimeout(() => onClose(), 0);
      }
      return;
    }

    
    setVisible(true);
    playNotificationSound();

    
    const dismissTimer = setTimeout(() => {
      handleClose(false);
    }, 12000);

    return () => {
      clearTimeout(dismissTimer);
    };
  }, [notification]);

  
  if (!isValid || !notification || !notification.id) {
    return null;
  }

  const handleClose = (markRead = false) => {
    setVisible(false);
    setTimeout(() => {
      if (markRead && onMarkRead && notification.id) {
        onMarkRead(notification.id);
      }
      onClose();
    }, 300);
  };

  const handleClick = () => {
    
    if (notification.notification_type === 'study_insights' || notification.notification_type === 'welcome_insights') {
      const profile = localStorage.getItem('userProfile');
      let showStudyInsights = true;
      if (profile) {
        try {
          const parsed = JSON.parse(profile);
          showStudyInsights = parsed.showStudyInsights !== false;
        } catch (e) { /* silenced */ }
      }
      
      if (!showStudyInsights) {
        
        handleClose(false);
        return;
      }
    }
    
    
    switch (notification.notification_type) {
      case 'reminder':
      case 'calendar_event':
      case 'inactivity':
        navigate('/activity-timeline');
        break;
      case 'level_up':
      case 'streak_milestone':
      case 'streak_broken':
      case 'achievement':
        navigate('/profile');
        break;
      case 'quiz_result':
      case 'quiz_excellent':
      case 'quiz_poor_performance':
      case 'quiz_completed':
      case 'quiz_milestone':
        navigate('/quiz-hub');
        break;
      case 'flashcard_excellent':
      case 'flashcard_review':
      case 'flashcard_reviewed':
      case 'flashcard_mastered':
      case 'flashcards_milestone':
        navigate('/flashcards');
        break;
      case 'proactive_ai':
        navigate('/ai-chat');
        break;
      case 'ai_chat_milestone':
        navigate('/ai-chat');
        break;
      case 'notes_milestone':
        navigate('/notes');
        break;
      case 'questions_milestone':
        navigate('/question-bank');
        break;
      case 'study_time_milestone':
        navigate('/analytics');
        break;
      case 'friend_request':
        navigate('/friends?view=requests', { state: { activeView: 'requests' } });
        break;
      case 'friend_accepted':
      case 'friend_rejected':
      case 'friend_removed':
        navigate('/friends');
        break;
      case 'share_received':
      case 'content_shared':
        navigate('/social');
        break;
      case 'battle_challenge':
      case 'battle_result':
      case 'battle_accepted':
      case 'battle_declined':
      case 'battle_started':
      case 'battle_won':
      case 'battle_lost':
        navigate('/quiz-battles');
        break;
      case 'challenge_completed':
      case 'challenge_joined':
        navigate('/challenges');
        break;
      case 'study_insights':
      case 'welcome_insights':
        navigate('/study-insights');
        break;
      case 'welcome':
        
        break;
      default:
        navigate('/dashboard-cerbyl');
    }
    handleClose(true);
  };

  const getIcon = () => {
    switch (notification.notification_type) {
      case 'reminder':
      case 'calendar_event':
      case 'inactivity':
        return <Calendar size={20} />;
      case 'level_up':
        return <TrendingUp size={20} />;
      case 'streak_milestone':
      case 'streak_broken':
        return <Flame size={20} />;
      case 'achievement':
        return <Award size={20} />;
      case 'ai_chat_milestone':
        return <MessageSquare size={20} />;
      case 'notes_milestone':
        return <FileText size={20} />;
      case 'flashcards_milestone':
        return <BookOpen size={20} />;
      case 'questions_milestone':
        return <Target size={20} />;
      case 'quiz_milestone':
      case 'quiz_completed':
        return <Trophy size={20} />;
      case 'study_time_milestone':
        return <Clock size={20} />;
      case 'quiz_result':
      case 'quiz_excellent':
      case 'flashcard_excellent':
        return <Award size={20} />;
      case 'quiz_poor_performance':
      case 'flashcard_review':
      case 'flashcard_reviewed':
        return <BookOpen size={20} />;
      case 'flashcard_mastered':
        return <Award size={20} />;
      case 'proactive_ai':
        return <Zap size={20} />;
      case 'friend_request':
        return <UserPlus size={20} />;
      case 'friend_accepted':
      case 'friend_rejected':
      case 'friend_removed':
        return <Users size={20} />;
      case 'share_received':
      case 'content_shared':
        return <Share2 size={20} />;
      case 'battle_challenge':
      case 'battle_result':
      case 'battle_accepted':
      case 'battle_declined':
      case 'battle_started':
      case 'battle_won':
      case 'battle_lost':
        return <Swords size={20} />;
      case 'challenge_completed':
      case 'challenge_joined':
        return <Trophy size={20} />;
      case 'study_insights':
      case 'welcome_insights':
        return <TrendingUp size={20} />;
      case 'welcome':
        return <Bell size={20} />;
      default:
        return <Bell size={20} />;
    }
  };

  const getIconColor = () => 'var(--accent)';

  const getTypeLabel = () => {
    switch (notification.notification_type) {
      case 'reminder':
        return 'Reminder';
      case 'calendar_event':
        return 'Calendar Event';
      case 'inactivity':
        return 'Welcome Back';
      case 'level_up':
        return 'Level Up!';
      case 'streak_milestone':
        return 'Streak Milestone';
      case 'streak_broken':
        return 'Streak Alert';
      case 'achievement':
        return 'Achievement';
      case 'ai_chat_milestone':
        return 'AI Chat Milestone';
      case 'notes_milestone':
        return 'Notes Milestone';
      case 'flashcards_milestone':
        return 'Flashcards Milestone';
      case 'questions_milestone':
        return 'Practice Milestone';
      case 'quiz_milestone':
        return 'Quiz Milestone';
      case 'quiz_completed':
        return 'Quiz Completed';
      case 'study_time_milestone':
        return 'Study Time';
      case 'quiz_result':
      case 'quiz_excellent':
        return 'Quiz Result';
      case 'quiz_poor_performance':
        return 'Study Suggestion';
      case 'flashcard_excellent':
        return 'Flashcard Session';
      case 'flashcard_review':
      case 'flashcard_reviewed':
        return 'Study Suggestion';
      case 'flashcard_mastered':
        return 'Flashcard Mastery';
      case 'proactive_ai':
        return 'AI Tutor';
      case 'friend_request':
        return 'Friend Request';
      case 'friend_accepted':
        return 'Friend Accepted';
      case 'friend_rejected':
        return 'Friend Request';
      case 'friend_removed':
        return 'Friend Update';
      case 'share_received':
      case 'content_shared':
        return 'Shared Content';
      case 'battle_challenge':
        return 'Battle Challenge';
      case 'battle_result':
      case 'battle_accepted':
      case 'battle_declined':
      case 'battle_started':
      case 'battle_won':
      case 'battle_lost':
        return 'Battle Update';
      case 'challenge_completed':
        return 'Challenge Completed';
      case 'challenge_joined':
        return 'Challenge Joined';
      case 'study_insights':
      case 'welcome_insights':
        return 'Study Insights';
      case 'welcome':
        return 'Notification';
      default:
        return 'Notification';
    }
  };

  const handlePointerMove = (event) => {
    if (event.pointerType === 'touch') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--sn-mx', `${event.clientX - bounds.left}px`);
    event.currentTarget.style.setProperty('--sn-my', `${event.clientY - bounds.top}px`);
  };

  const actionLabel = notification.notification_type === 'welcome'
    ? 'Acknowledge'
    : 'View details';

  return (
    <div className={`slide-notif ${visible ? 'show' : ''}`} style={style}>
      <div
        className="slide-notif-card"
        onPointerMove={handlePointerMove}
      >
        <span className="slide-notif-rail" aria-hidden="true" />
        <button
          className="slide-notif-hitarea"
          type="button"
          onClick={handleClick}
          aria-label={`${getTypeLabel()}: ${notification.title}. ${actionLabel}`}
        />
        <div className="slide-notif-header">
          <div className="slide-notif-icon" style={{ color: getIconColor() }}>
            {getIcon()}
          </div>
          <div className="slide-notif-title">
            <span className="slide-notif-type">{getTypeLabel()}</span>
            <span className="slide-notif-time">Just now</span>
          </div>
          <button 
            className="slide-notif-close" 
            onClick={(e) => { e.stopPropagation(); handleClose(false); }}
            aria-label="Dismiss notification"
            type="button"
          >
            <X size={16} />
          </button>
        </div>
        <div className="slide-notif-body">
          <h4 className="slide-notif-heading">{notification.title}</h4>
          <p className="slide-notif-message">{notification.message}</p>
        </div>
        <div className="slide-notif-footer">
          <span className="slide-notif-action">{actionLabel}</span>
          <ArrowUpRight className="slide-notif-action-icon" size={15} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
};

export default SlideNotification;
