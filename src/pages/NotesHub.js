import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mic, BookOpen, ChevronRight
} from 'lucide-react';
import './NotesHub.css';
import '../components/SocialHubChrome.css';
import NotesLineField from '../components/NotesLineField';

const NotesHub = () => {
  const navigate = useNavigate();
  const [hoveredSection, setHoveredSection] = useState(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  return (
    <div className="nh notes-hub-page">
      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
      <NotesLineField />
      <div className="nh-ambient">
        <div className="nh-ambient-orb nh-ambient-orb-1"></div>
        <div className="nh-ambient-orb nh-ambient-orb-2"></div>
        <div className="nh-ambient-grid"></div>
      </div>

      <div className="nh-layout-body nh-qb-body">
        <div className="nh-qb-shell">
          <main className="nh-main nh-qb-main">
          <section
            className={`nh-section nh-section-ai ${hoveredSection === 'ai' ? 'nh-section-hovered' : ''}`}
            onClick={() => navigate('/notes/ai-media')}
            onMouseEnter={() => setHoveredSection('ai')}
            onMouseLeave={() => setHoveredSection(null)}
            role="link"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate('/notes/ai-media');
              }
            }}
          >
            <div className="nh-section-glow"></div>
            <div className="nh-section-inner">
              <div className="nh-section-icon">
                <Mic size={40} strokeWidth={1.5} />
              </div>

              <div className="nh-section-content">
                <div className="view-heading">
                  <span className="view-kicker">AI-Powered</span>
                  <h2 className="view-title">AI Media Notes</h2>
                  <p className="view-sub">Transcription from audio, video & YouTube</p>
                </div>

                <div className="nh-features">
                  <div className="nh-feature">
                    <ChevronRight size={14} />
                    <span>Audio & Video Files</span>
                  </div>
                  <div className="nh-feature">
                    <ChevronRight size={14} />
                    <span>YouTube Transcripts</span>
                  </div>
                  <div className="nh-feature">
                    <ChevronRight size={14} />
                    <span>Smart Notes</span>
                  </div>
                </div>
              </div>

              <span className="nh-section-cta" aria-hidden="true">
                <span>Start Generating</span>
              </span>
            </div>
            <div className="nh-section-line"></div>
          </section>

          <div className="nh-divider">
            <span className="nh-divider-text">or</span>
          </div>

          <section
            className={`nh-section nh-section-manual ${hoveredSection === 'manual' ? 'nh-section-hovered' : ''}`}
            onClick={() => navigate('/notes/my-notes')}
            onMouseEnter={() => setHoveredSection('manual')}
            onMouseLeave={() => setHoveredSection(null)}
            role="link"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                navigate('/notes/my-notes');
              }
            }}
          >
            <div className="nh-section-glow"></div>
            <div className="nh-section-inner">
              <div className="nh-section-icon">
                <BookOpen size={40} strokeWidth={1.5} />
              </div>

              <div className="nh-section-content">
                <div className="view-heading">
                  <span className="view-kicker">Manual</span>
                  <h2 className="view-title">My Notes</h2>
                  <p className="view-sub">Write, organize & manage your notes</p>
                </div>

                <div className="nh-features">
                  <div className="nh-feature">
                    <ChevronRight size={14} />
                    <span>Rich Text Editor</span>
                  </div>
                  <div className="nh-feature">
                    <ChevronRight size={14} />
                    <span>Organize Notes</span>
                  </div>
                  <div className="nh-feature">
                    <ChevronRight size={14} />
                    <span>Personal Library</span>
                  </div>
                </div>
              </div>

              <span className="nh-section-cta" aria-hidden="true">
                <span>View My Notes</span>
              </span>
            </div>
            <div className="nh-section-line"></div>
          </section>
          </main>
        </div>
      </div>
    </div>
  );
};

export default NotesHub;
