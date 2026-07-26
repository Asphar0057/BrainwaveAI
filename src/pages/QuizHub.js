import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Swords, ChevronRight, Zap, Timer, Radio, ArrowUpRight } from 'lucide-react';
import './QuizHub.css';
import '../components/SocialHubChrome.css';
import ImportExportModal from '../components/ImportExportModal';
import ContextSelector from '../components/ContextSelector';
import ContextPanel from '../components/ContextPanel';
import QuizStudioBackground from '../components/QuizStudioBackground';
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
    card.style.setProperty('--mx', `${x}px`);
    card.style.setProperty('--my', `${y}px`);
  }, []);
  const handleTileLeave = useCallback((e) => {
    e.currentTarget.style.removeProperty('--mx');
    e.currentTarget.style.removeProperty('--my');
  }, []);

  return (
    <div className="qh">
      <QuizStudioBackground />
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
          <header className="qh-intro">
            <div>
              <span className="qh-intro-kicker">Quiz studio</span>
              <h1>Choose how you want to be tested.</h1>
              <p>Practice privately or bring a friend into the same question set.</p>
            </div>
            <div className="qh-intro-status" aria-live="polite">
              <span>{hoveredSection === 'battle' ? 'Live challenge' : 'Independent practice'}</span>
              <strong>{hoveredSection === 'battle' ? 'Same questions. Two players.' : 'Your topic. Your pace.'}</strong>
            </div>
          </header>

          <div className="qh-mode-stage" data-active={hoveredSection || 'solo'}>
            <button
              type="button"
              className="qh-mode-card qh-mode-card--solo"
              onClick={() => navigate('/solo-quiz')}
              onFocus={() => setHoveredSection('solo')}
              onBlur={() => setHoveredSection(null)}
              onMouseEnter={() => setHoveredSection('solo')}
              onMouseMove={handleTileMove}
              onMouseLeave={(event) => { setHoveredSection(null); handleTileLeave(event); }}
            >
              <div className="qh-mode-topline">
                <span>Solo quiz</span>
                <Brain size={18} />
              </div>
              <div className="qh-mode-copy">
                <h2>Build a quiz around what you need to learn.</h2>
                <p>Choose the topic, pressure level and feedback style before you begin.</p>
              </div>
              <div className="qh-mode-specs">
                <span><Timer size={13} /> Flexible timing</span>
                <span><Zap size={13} /> Adaptive option</span>
              </div>
              <div className="qh-mode-action">
                <span>Set up solo quiz</span>
                <ArrowUpRight size={17} />
              </div>
            </button>

            <div className="qh-choice-rail" aria-hidden="true">
              <span />
              <strong>or</strong>
              <span />
            </div>

            <button
              type="button"
              className="qh-mode-card qh-mode-card--battle"
              onClick={() => navigate('/quiz-battles')}
              onFocus={() => setHoveredSection('battle')}
              onBlur={() => setHoveredSection(null)}
              onMouseEnter={() => setHoveredSection('battle')}
              onMouseMove={handleTileMove}
              onMouseLeave={(event) => { setHoveredSection(null); handleTileLeave(event); }}
            >
              <div className="qh-mode-topline">
                <span>1v1 battle</span>
                <Swords size={18} />
              </div>
              <div className="qh-battle-score" aria-hidden="true">
                <div><small>You</small><strong>?</strong></div>
                <span>vs</span>
                <div><small>Friend</small><strong>?</strong></div>
              </div>
              <div className="qh-mode-copy">
                <h2>Put the same knowledge under live pressure.</h2>
                <p>Challenge a friend, choose the rules and settle it question by question.</p>
              </div>
              <div className="qh-mode-specs">
                <span><Radio size={13} /> Live status</span>
                <span><Zap size={13} /> Four battle modes</span>
              </div>
              <div className="qh-mode-action">
                <span>Enter battle arena</span>
                <ArrowUpRight size={17} />
              </div>
            </button>
          </div>

          <div className="qh-footnote">
            <span>Both modes use your selected learning context.</span>
            <button type="button" onClick={() => setContextPanelOpen(true)}>
              Review context <ChevronRight size={13} />
            </button>
          </div>
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

      <div className="qh-utility-bar">
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
