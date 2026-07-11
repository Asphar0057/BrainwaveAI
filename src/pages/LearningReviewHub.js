import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map, HelpCircle, BookOpen, TrendingUp, Target, ChevronRight, Play } from 'lucide-react';
import './LearningReviewHub.css';
import { API_URL } from '../config';

const LearningReviewHub = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [userName, setUserName] = useState('User');
  const [hoveredCard, setHoveredCard] = useState(null);

  useEffect(() => {
    fetchUserProfile();
  }, [token]);

  const handleTileMove = useCallback((e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = x / rect.width - 0.5;
    const cy = y / rect.height - 0.5;
    card.style.setProperty('--mx', `${x}px`);
    card.style.setProperty('--my', `${y}px`);
    card.style.setProperty('--rx', `${(-cy * 7).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${(cx * 9).toFixed(2)}deg`);
  }, []);
  const handleTileLeave = useCallback((e) => {
    const card = e.currentTarget;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  }, []);

  const fetchUserProfile = async () => {
    try {
      const response = await fetch(`${API_URL}/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUserName(data.first_name || 'User');
      }
    } catch (error) { /* silenced */ }
  };

  const tools = [
    {
      icon: Map,
      title: 'Knowledge Map',
      description: 'Build interactive concept maps with expandable nodes. Navigate through topics progressively and master complex subjects.',
      path: '/knowledge-map',
      id: 'roadmap',
      cta: 'Build Map',
      stat: 'Visual Learning',
      featured: true
    },
    {
      icon: HelpCircle,
      title: 'Question Bank',
      description: 'Generate custom practice questions from your notes, slides, or any topic. Test and reinforce your knowledge.',
      path: '/question-bank',
      id: 'questions',
      cta: 'Create Questions',
      stat: 'Active Recall'
    },
    {
      icon: BookOpen,
      title: 'Slide Explorer',
      description: 'Upload presentations and get AI-powered insights, summaries, and key takeaways from your slides.',
      path: '/slide-explorer',
      id: 'slides',
      cta: 'Upload Slides',
      stat: 'AI Analysis'
    },
    {
      icon: TrendingUp,
      title: 'Statistics',
      description: 'Track learning progress, view performance metrics, and identify strengths and areas for improvement.',
      path: '/statistics',
      id: 'stats',
      cta: 'View Stats',
      stat: 'Progress Tracking'
    }
  ];

  return (
    <div className="lrh">
      <div className="lrh-ambient">
        <div className="lrh-ambient-orb lrh-ambient-orb-1"></div>
        <div className="lrh-ambient-orb lrh-ambient-orb-2"></div>
        <div className="lrh-ambient-grid"></div>
      </div>

      <main className="lrh-main">
        <section className="lrh-hero">
          <h2 className="lrh-hero-title">
            Welcome back, <span className="lrh-hero-name">{userName}</span>
          </h2>
          <p className="lrh-hero-subtitle">
            Select a tool — Learning Unified
          </p>
        </section>

        <section className="lrh-grid">
          {tools.map((tool, index) => {
            const IconComponent = tool.icon;
            const isHovered = hoveredCard === tool.id;
            return (
              <article 
                key={tool.id}
                className={`lrh-card ${tool.featured ? 'lrh-card-featured' : ''} ${isHovered ? 'lrh-card-hovered' : ''}`}
                onClick={() => navigate(tool.path)}
                onMouseEnter={() => setHoveredCard(tool.id)}
                onMouseMove={handleTileMove}
                onMouseLeave={(e) => { setHoveredCard(null); handleTileLeave(e); }}
                style={{ '--card-index': index }}
              >
                <div className="lrh-card-glow"></div>

                <div className="lrh-card-border"></div>

                <div className="lrh-card-inner">
                  <div className="cb-tile-texture" />
                  <div className="lrh-card-top">
                    <div className="lrh-card-icon-wrapper">
                      <div className="lrh-card-icon">
                        <IconComponent size={24} strokeWidth={1.5} />
                      </div>
                      <div className="lrh-card-icon-bg"></div>
                    </div>
                    <div className="lrh-card-badge">
                      <Target size={10} />
                      <span>{tool.stat}</span>
                    </div>
                  </div>

                  <div className="lrh-card-body">
                    <h3 className="lrh-card-title">{tool.title}</h3>
                    <p className="lrh-card-desc">{tool.description}</p>
                  </div>

                  <div className="lrh-card-footer">
                    <button className="lrh-card-cta">
                      <span>{tool.cta}</span>
                      <ChevronRight size={14} className="lrh-card-cta-icon" />
                    </button>
                  </div>
                </div>

                <div className="lrh-card-line"></div>
              </article>
            );
          })}
        </section>
      </main>
    </div>
  );
};

export default LearningReviewHub;
