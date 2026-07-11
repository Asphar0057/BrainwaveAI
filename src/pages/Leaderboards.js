import { useState, useEffect, useCallback } from 'react';
import { Trophy, Users } from 'lucide-react';
import './Leaderboards.css';
import SocialHubChrome from '../components/SocialHubChrome';
import { API_URL } from '../config';
const Leaderboards = () => {
  const token = localStorage.getItem('token');
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentUserRank, setCurrentUserRank] = useState(null);
  const [loading, setLoading] = useState(true);
  
  
  const [category, setCategory] = useState('global');

  useEffect(() => {
    fetchLeaderboard();
  }, [category]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/leaderboard?category=${category}&limit=50`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setLeaderboard(data.leaderboard || []);
        setCurrentUserRank(data.current_user_rank || null);
      }
    } catch (error) { /* silenced */ } finally {
      setLoading(false);
    }
  };

  const getXpDisplay = (score) => `${Number(score || 0).toLocaleString()} XP`;

  const getAvatarInitial = (entry) => (
    (entry.first_name?.[0] || entry.username?.[0] || '?').toUpperCase()
  );

  return (
    <div className="leaderboard-page with-social-chrome">
      <SocialHubChrome
        sideSections={[
          {
            label: 'Category',
            items: [
              { icon: Trophy, label: 'Global',       onClick: () => setCategory('global'),   active: category === 'global' },
              { icon: Users,  label: 'Friends Only', onClick: () => setCategory('friends'),  active: category === 'friends' },
            ],
          },
          {
            label: 'Ranking',
            items: [
              { icon: Trophy, label: 'All-Time XP', active: true },
            ],
          },
        ]}
      >
      <div className="leaderboard-container">
        <div className="leaderboard-welcome">
          <div className="view-heading">
            <span className="view-kicker">Rankings</span>
            <h2 className="view-title">Leaderboards</h2>
            <p className="view-sub">See where you stand by all-time XP</p>
          </div>
        </div>

        {currentUserRank && (
          <div className="current-user-rank">
            <div className="rank-badge">Your Rank: #{currentUserRank.rank}</div>
            <div className="rank-score">
              <Trophy size={16} />
              <span>{getXpDisplay(currentUserRank.score)}</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="loading-text">Loading leaderboard...</div>
        ) : leaderboard.length === 0 ? (
          <div className="empty-leaderboard">
            <Trophy size={48} />
            <p>No leaderboard data available</p>
            <p className="empty-hint">Start learning to appear on the leaderboard!</p>
          </div>
        ) : (
          <div className="leaderboard-list">
            {leaderboard.map((entry) => {
              const profilePicture = entry.picture_url || entry.picture || entry.photoURL || entry.photo_url || entry.profile_picture;
              return (
                <div
                  key={entry.user_id}
                  className={`leaderboard-entry ${entry.is_current_user ? 'current-user' : ''} ${entry.rank <= 3 ? 'top-three' : ''}`}
                >
                  <div className="entry-rank">
                    <span className="rank-number">#{entry.rank}</span>
                  </div>

                  <div className="entry-user">
                    <div className="entry-avatar">
                      {profilePicture && (
                        <img
                          src={profilePicture}
                          alt={entry.username}
                          referrerPolicy="no-referrer"
                          onError={(event) => { event.currentTarget.style.display = 'none'; }}
                        />
                      )}
                      <div className="entry-avatar-placeholder">
                        {getAvatarInitial(entry)}
                      </div>
                    </div>
                    <div className="entry-user-info">
                      <span className="entry-name">
                        {entry.first_name && entry.last_name
                          ? `${entry.first_name} ${entry.last_name}`
                          : entry.username}
                      </span>
                      {entry.is_current_user && (
                        <span className="you-badge">You</span>
                      )}
                    </div>
                  </div>

                  <div className="entry-score">
                    <Trophy size={16} />
                    <span>{getXpDisplay(entry.score)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </SocialHubChrome>
    </div>
  );
};

export default Leaderboards;
