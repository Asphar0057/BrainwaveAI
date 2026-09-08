import { Swords, Clock, Target, Users, X } from 'lucide-react';
import './BattleNotification.css';

const BattleNotification = ({ battle, onAccept, onDecline, onClose }) => {
  return (
    <div className="battle-notification-overlay">
      <div className="battle-notification-modal">
        <button className="notification-close" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="notification-header">
          <div className="notification-icon">
            <Swords size={48} />
          </div>
          <h2>Battle Challenge!</h2>
        </div>

        <div className="notification-body">
          <div className="challenger-info">
            <div className="challenger-avatar">
              {(() => {
                const profilePicture = battle.challenger.picture_url || battle.challenger.picture || battle.challenger.profile_picture;
                const displayName = battle.challenger.username || battle.challenger.email || 'U';
                const initial = (battle.challenger.first_name?.[0] || displayName.charAt(0)).toUpperCase();
                
                if (profilePicture) {
                  return (
                    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                      <img 
                        src={profilePicture} 
                        alt={displayName}
                        referrerPolicy="no-referrer"
                        crossOrigin="anonymous"
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          const fallback = e.target.nextSibling;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                      <div 
                        className="challenger-avatar-placeholder"
                        style={{ 
                          display: 'none',
                          width: '100%',
                          height: '100%',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'absolute',
                          top: 0,
                          left: 0
                        }}
                      >
                        {initial}
                      </div>
                    </div>
                  );
                }
                
                return (
                  <div className="challenger-avatar-placeholder">
                    {initial}
                  </div>
                );
              })()}
            </div>
            <div className="challenger-details">
              <span className="challenger-label">Challenged by</span>
              <span className="challenger-name">
                {battle.challenger.first_name && battle.challenger.last_name
                  ? `${battle.challenger.first_name} ${battle.challenger.last_name}`
                  : battle.challenger.username}
              </span>
            </div>
          </div>

          <div className="battle-info">
            <div className="info-row">
              <Target size={18} />
              <div className="info-content">
                <span className="info-label">Subject</span>
                <span className="info-value">{battle.subject}</span>
              </div>
            </div>

            <div className="info-row">
              <Users size={18} />
              <div className="info-content">
                <span className="info-label">Difficulty</span>
                <span className="info-value difficulty-badge">{battle.difficulty}</span>
              </div>
            </div>

            <div className="info-row">
              <Clock size={18} />
              <div className="info-content">
                <span className="info-label">Questions</span>
                <span className="info-value">{battle.question_count} questions</span>
              </div>
            </div>

            <div className="info-row">
              <Clock size={18} />
              <div className="info-content">
                <span className="info-label">Time Limit</span>
                <span className="info-value">{Math.floor(battle.time_limit_seconds / 60)} minutes</span>
              </div>
            </div>
          </div>
        </div>

        <div className="notification-actions">
          <button className="decline-btn" onClick={onDecline}>
            <X size={16} />
            <span>Decline</span>
          </button>
          <button className="accept-btn" onClick={() => onAccept(battle.id)}>
            <Swords size={16} />
            <span>Accept Challenge</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BattleNotification;
