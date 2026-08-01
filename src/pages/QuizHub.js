/*
 * THESIS: Quiz is a decision desk, not a detached arena; two testing routes share one calm workspace.
 * OWN-WORLD: Friends' warm graphite shell, indexed cards, slim accent rails and a single geometric field.
 * STORY: confirm the learning context, choose solo or live pressure, then enter the existing quiz flow.
 * FIRST VIEWPORT: exact shared sidebar, restrained hero, compact context toolbar and two equal route cards.
 * FORM: an Operate-mode extension of SocialHubChrome; the existing Friends/Notes system remains authoritative.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight, BookOpen, Brain, CircleHelp, FileInput,
  Radio, Swords, Timer, Zap
} from 'lucide-react';
import './QuizHub.css';
import SocialHubChrome from '../components/SocialHubChrome';
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
      .then((data) => setUserDocCount(data.user_docs?.length || 0))
      .catch(() => {});
  }, []);

  const handleHsModeToggle = (value) => {
    setHsMode(value);
    localStorage.setItem('hs_mode_enabled', String(value));
  };

  const openMode = (path) => navigate(path);
  const handleModeKeyDown = (event, path) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openMode(path);
  };

  const sidebarLead = (
    <button className="qh-side-primary" type="button" onClick={() => openMode('/solo-quiz')}>
      <Brain size={15} />
      <span>New practice</span>
    </button>
  );

  const sidebarTail = (
    <div className="qh-context-card">
      <span className="qh-context-card-label">Study context</span>
      <ContextSelector
        hsMode={hsMode}
        docCount={userDocCount}
        onOpen={() => setContextPanelOpen(true)}
      />
      <small>{hsMode ? 'Curriculum context is active' : userDocCount ? `${userDocCount} source${userDocCount === 1 ? '' : 's'} available` : 'Add a source when you need one'}</small>
    </div>
  );

  return (
    <div className="qh with-social-chrome">
      <SocialHubChrome
        brandKicker="Quiz"
        sidebarLead={sidebarLead}
        sidebarTail={sidebarTail}
        sideSections={[
          {
            label: 'Quiz studio',
            items: [
              { icon: CircleHelp, label: 'Choose a mode', active: true, onClick: () => {} },
              { icon: Brain, label: 'Solo setup', onClick: () => openMode('/solo-quiz') },
              { icon: Swords, label: 'Battle arena', onClick: () => openMode('/quiz-battles') },
            ],
          },
          {
            label: 'Study tools',
            items: [
              { icon: BookOpen, label: 'Question Hub', onClick: () => openMode('/question-bank') },
              { icon: FileInput, label: 'Convert questions', onClick: () => setShowImportExport(true) },
            ],
          },
        ]}
      >
        <main className="qh-main">
          <header className="qh-hero">
            <span className="qh-kicker">Quiz studio</span>
            <h1>Choose how you want to be tested.</h1>
            <p>Practice privately or bring a friend into the same question set.</p>
          </header>

          <section className="qh-workspace" aria-labelledby="qh-routes-heading">
            <div className="qh-toolbar">
              <div>
                <span>Practice routes</span>
                <strong id="qh-routes-heading">Select the pressure that fits this session</strong>
              </div>
              <div className="qh-toolbar-status" aria-live="polite">
                <span>{hoveredSection === 'battle' ? 'Live challenge' : 'Independent practice'}</span>
                <strong>{hoveredSection === 'battle' ? 'Same questions · two players' : 'Your topic · your pace'}</strong>
              </div>
            </div>

            <div className="qh-mode-grid">
              <section
                className="qh-mode-card qh-mode-card--solo"
                role="link"
                tabIndex="0"
                aria-label="Start Solo Practice"
                onClick={() => openMode('/solo-quiz')}
                onKeyDown={(event) => handleModeKeyDown(event, '/solo-quiz')}
                onFocus={() => setHoveredSection('solo')}
                onBlur={() => setHoveredSection(null)}
                onPointerEnter={() => setHoveredSection('solo')}
                onPointerLeave={() => setHoveredSection(null)}
              >
                <span className="qh-card-spine" aria-hidden="true"><i /></span>
                <div className="qh-card-header">
                  <span className="qh-card-index">01</span>
                  <span className="qh-card-heading">
                    <small>Practice independently</small>
                    <strong>Solo Practice</strong>
                  </span>
                  <span className="qh-card-icon"><Brain size={20} /></span>
                </div>

                <div className="qh-card-workarea">
                  <div className="qh-question-preview" aria-hidden="true">
                    <span className="qh-preview-label">Question preview</span>
                    <span className="qh-preview-prompt" />
                    <span className="qh-preview-option is-selected"><i>A</i><b /></span>
                    <span className="qh-preview-option"><i>B</i><b /></span>
                    <span className="qh-preview-option"><i>C</i><b /></span>
                  </div>
                  <div className="qh-card-copy">
                    <h2>Build a quiz around what you need to learn.</h2>
                    <p>Choose the topic, pressure level and feedback style before you begin.</p>
                  </div>
                </div>

                <div className="qh-card-footer">
                  <span className="qh-card-spec"><Timer size={13} />Flexible timing</span>
                  <span className="qh-card-spec"><Zap size={13} />Adaptive option</span>
                  <span className="qh-card-action">Start Solo Quiz <ArrowUpRight size={16} /></span>
                </div>
              </section>

              <section
                className="qh-mode-card qh-mode-card--battle"
                role="link"
                tabIndex="0"
                aria-label="Enter 1v1 Battles"
                onClick={() => openMode('/quiz-battles')}
                onKeyDown={(event) => handleModeKeyDown(event, '/quiz-battles')}
                onFocus={() => setHoveredSection('battle')}
                onBlur={() => setHoveredSection(null)}
                onPointerEnter={() => setHoveredSection('battle')}
                onPointerLeave={() => setHoveredSection(null)}
              >
                <span className="qh-card-spine" aria-hidden="true"><i /></span>
                <div className="qh-card-header">
                  <span className="qh-card-index">02</span>
                  <span className="qh-card-heading">
                    <small>Challenge a connection</small>
                    <strong>1v1 Battles</strong>
                  </span>
                  <span className="qh-card-icon"><Swords size={20} /></span>
                </div>

                <div className="qh-card-workarea">
                  <div className="qh-versus-preview" aria-hidden="true">
                    <div><small>You</small><strong>?</strong></div>
                    <span className="qh-live-signal">
                      <i /><i /><i /><i />
                      <b>vs</b>
                    </span>
                    <div><small>Friend</small><strong>?</strong></div>
                  </div>
                  <div className="qh-card-copy">
                    <h2>Put the same knowledge under live pressure.</h2>
                    <p>Challenge a friend, choose the rules and settle it question by question.</p>
                  </div>
                </div>

                <div className="qh-card-footer">
                  <span className="qh-card-spec"><Radio size={13} />Live status</span>
                  <span className="qh-card-spec"><Zap size={13} />Four battle modes</span>
                  <span className="qh-card-action">Enter battle arena <ArrowUpRight size={16} /></span>
                </div>
              </section>
            </div>

            <div className="qh-context-note">
              <span>Both modes use your selected learning context.</span>
              <button type="button" onClick={() => setContextPanelOpen(true)}>
                Review context <ArrowUpRight size={13} />
              </button>
            </div>
          </section>
        </main>
      </SocialHubChrome>

      <ImportExportModal
        isOpen={showImportExport}
        onClose={() => setShowImportExport(false)}
        mode="import"
        sourceType="questions"
        onSuccess={(result) => {
          if (result?.shouldNavigate) {
            if (result.destinationType === 'flashcards') {
              navigate(result.set_id ? `/flashcards?set_id=${result.set_id}&mode=preview` : '/flashcards');
            } else if (result.destinationType === 'notes') {
              navigate(result.note_id ? `/notes/editor/${result.note_id}` : '/notes');
            }
          } else {
            alert('Successfully converted questions!');
          }
        }}
      />

      <ContextPanel
        isOpen={contextPanelOpen}
        onClose={() => setContextPanelOpen(false)}
        hsMode={hsMode}
        onHsModeToggle={handleHsModeToggle}
        onDocUploaded={() => setUserDocCount((count) => count + 1)}
      />
    </div>
  );
};

export default QuizHub;
