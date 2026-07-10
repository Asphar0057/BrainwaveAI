import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Swords, ChevronRight, Zap, Trophy, Target, MessageSquare, LayoutDashboard, LogOut } from 'lucide-react';
import './QuizHub.css';
import '../components/SocialHubChrome.css';
import ImportExportModal from '../components/ImportExportModal';
import ContextSelector from '../components/ContextSelector';
import ContextPanel from '../components/ContextPanel';
import contextService from '../services/contextService';

const QuizHub = () => {
  const navigate = useNavigate();
  const [showImportExport, setShowImportExport] = useState(false);
  const [hoveredSection, setHoveredSection] = useState(null);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [hsMode, setHsMode] = useState(() => localStorage.getItem('hs_mode_enabled') === 'true');
  const [userDocCount, setUserDocCount] = useState(0);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    contextService.listDocuments()
      .then(d => setUserDocCount(d.user_docs?.length || 0))
      .catch(() => {});
  }, []);

  const handleHsModeToggle = (val) => {
    setHsMode(val);
    localStorage.setItem('hs_mode_enabled', String(val));
  };

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

  return (
    <div className="qh">
      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
      <svg className="geo-bg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <circle cx="600" cy="400" r="360" fill="none" stroke="currentColor" strokeWidth="1"/>
        <circle cx="600" cy="400" r="260" fill="none" stroke="currentColor" strokeWidth="0.8"/>
        <circle cx="600" cy="400" r="168" fill="none" stroke="currentColor" strokeWidth="0.7"/>
        <circle cx="600" cy="400" r="90" fill="none" stroke="currentColor" strokeWidth="0.6"/>
        <line x1="600" y1="0" x2="600" y2="800" stroke="currentColor" strokeWidth="0.5"/>
        <line x1="0" y1="400" x2="1200" y2="400" stroke="currentColor" strokeWidth="0.5"/>
        <line x1="0" y1="800" x2="500" y2="0" stroke="currentColor" strokeWidth="0.4"/>
        <line x1="1200" y1="0" x2="700" y2="800" stroke="currentColor" strokeWidth="0.4"/>
        <circle cx="600" cy="40" r="5" fill="currentColor"/>
        <circle cx="600" cy="760" r="5" fill="currentColor"/>
        <circle cx="240" cy="400" r="5" fill="currentColor"/>
        <circle cx="960" cy="400" r="5" fill="currentColor"/>
        <circle cx="345" cy="146" r="3.5" fill="currentColor"/>
        <circle cx="855" cy="654" r="3.5" fill="currentColor"/>
        <circle cx="855" cy="146" r="3.5" fill="currentColor"/>
        <circle cx="345" cy="654" r="3.5" fill="currentColor"/>
        <rect x="24" y="24" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="0.8"/>
        <rect x="44" y="44" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="60" cy="60" r="3" fill="currentColor"/>
        <rect x="1104" y="704" width="72" height="72" fill="none" stroke="currentColor" strokeWidth="0.8"/>
        <rect x="1124" y="724" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="0.5"/>
        <circle cx="1140" cy="740" r="3" fill="currentColor"/>
        <circle cx="120" cy="200" r="2" fill="currentColor"/>
        <circle cx="160" cy="160" r="1.5" fill="currentColor"/>
        <circle cx="200" cy="200" r="2" fill="currentColor"/>
        <circle cx="160" cy="240" r="1.5" fill="currentColor"/>
        <circle cx="1080" cy="600" r="2" fill="currentColor"/>
        <circle cx="1040" cy="640" r="1.5" fill="currentColor"/>
        <circle cx="1000" cy="600" r="2" fill="currentColor"/>
        <circle cx="1040" cy="560" r="1.5" fill="currentColor"/>
      </svg>
      <div className="qh-ambient">
        <div className="qh-ambient-orb qh-ambient-orb-1"></div>
        <div className="qh-ambient-orb qh-ambient-orb-2"></div>
        <div className="qh-ambient-grid"></div>
      </div>

      <div className="qh-layout-body">
        <main className="qh-main">
        <section 
          className={`qh-section qh-section-solo ${hoveredSection === 'solo' ? 'qh-section-hovered' : ''}`}
          onClick={() => navigate('/solo-quiz')}
          onMouseEnter={() => setHoveredSection('solo')}
          onMouseMove={handleTileMove}
          onMouseLeave={(e) => { setHoveredSection(null); handleTileLeave(e); }}
        >
          <div className="cb-tile-texture" />
          <div className="qh-section-glow"></div>
          <div className="qh-section-inner">
            <div className="qh-section-icon">
              <User size={40} strokeWidth={1.5} />
            </div>
            
            <div className="qh-section-content">
              <div className="view-heading">
                <span className="view-kicker">Study Mode</span>
                <h2 className="view-title">Solo Practice</h2>
                <p className="view-sub">Practice at your own pace with adaptive questions</p>
              </div>
              
              <div className="qh-features">
                <div className="qh-feature">
                  <ChevronRight size={14} />
                  <span>Smart Questions</span>
                </div>
                <div className="qh-feature">
                  <ChevronRight size={14} />
                  <span>Personal Progress Tracking</span>
                </div>
                <div className="qh-feature">
                  <ChevronRight size={14} />
                  <span>Learn from Mistakes</span>
                </div>
              </div>
            </div>

            <button className="qh-section-cta">
              <span>Start Solo Quiz</span>
            </button>
          </div>
          <div className="qh-section-line"></div>
        </section>

        <div className="qh-divider">
          <span className="qh-divider-text">or</span>
        </div>

        <section 
          className={`qh-section qh-section-battle ${hoveredSection === 'battle' ? 'qh-section-hovered' : ''}`}
          onClick={() => navigate('/quiz-battles')}
          onMouseEnter={() => setHoveredSection('battle')}
          onMouseMove={handleTileMove}
          onMouseLeave={(e) => { setHoveredSection(null); handleTileLeave(e); }}
        >
          <div className="cb-tile-texture" />
          <div className="qh-section-glow"></div>
          <div className="qh-section-inner">
            <div className="qh-section-icon">
              <Swords size={40} strokeWidth={1.5} />
            </div>
            
            <div className="qh-section-content">
              <div className="view-heading">
                <span className="view-kicker">Challenge Mode</span>
                <h2 className="view-title">1v1 Battles</h2>
                <p className="view-sub">Go head-to-head against friends in real time</p>
              </div>
              
              <div className="qh-features">
                <div className="qh-feature">
                  <ChevronRight size={14} />
                  <span>Compete with Friends</span>
                </div>
                <div className="qh-feature">
                  <ChevronRight size={14} />
                  <span>Real-time Battles</span>
                </div>
                <div className="qh-feature">
                  <ChevronRight size={14} />
                  <span>Live Notifications</span>
                </div>
              </div>
            </div>

            <button className="qh-section-cta">
              <span>Start Battle</span>
            </button>
          </div>
          <div className="qh-section-line"></div>
        </section>
      </main>
      </div>

      <ImportExportModal
        isOpen={showImportExport}
        onClose={() => setShowImportExport(false)}
        mode="import"
        sourceType="questions"
        onSuccess={(result) => {
          if (result?.shouldNavigate) {
            if (result.destinationType === 'flashcards') {
              if (result.set_id) {
                navigate(`/flashcards?set_id=${result.set_id}&mode=preview`);
              } else {
                navigate('/flashcards');
              }
            } else if (result.destinationType === 'notes') {
              if (result.note_id) {
                navigate(`/notes/editor/${result.note_id}`);
              } else {
                navigate('/notes');
              }
            }
          } else {
            alert("Successfully converted questions!");
          }
        }}
      />

      <ContextPanel
        isOpen={contextPanelOpen}
        onClose={() => setContextPanelOpen(false)}
        hsMode={hsMode}
        onHsModeToggle={handleHsModeToggle}
        onDocUploaded={() => setUserDocCount(p => p + 1)}
      />

      <div style={{position:'fixed',top:'10px',right:'12px',zIndex:8000,display:'flex',alignItems:'center',gap:'8px'}}>
        <ContextSelector hsMode={hsMode} docCount={userDocCount} onOpen={() => setContextPanelOpen(true)} />
        <button
          onClick={(e) => { e.stopPropagation(); setShowImportExport(true); }}
          className="qh-nav-btn qh-nav-btn-accent"
        >
          <Zap size={16} />
          <span>Convert</span>
        </button>
      </div>
    </div>
  );
};

export default QuizHub;
