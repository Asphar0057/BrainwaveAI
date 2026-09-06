import ToolNavigation from './ToolNavigation';
import { getToolNavigation, isActiveToolPath } from '../utils/toolNavigation';
import useModalFocus from '../hooks/useModalFocus';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LayoutGrid, Users } from 'lucide-react';
import './SocialHubChrome.css';
import GeometricGrid from './GeometricGrid';

const StripBtn = ({ icon: Icon, label, onClick, active, pressed, disabled = false }) => (
  <button
    className={`shc-strip-btn ${active ? 'shc-strip-btn--active' : ''}`}
    type="button"
    onClick={onClick}
    data-tip={label}
    disabled={disabled}
    aria-label={label}
    aria-current={active && pressed === undefined ? 'page' : undefined}
    aria-pressed={pressed}
  >
    {Icon ? <Icon size={15} /> : null}
  </button>
);

const FOOTER_ITEMS = [
  { icon: Users,      label: 'Social Hub', path: '/social' },
  { icon: LayoutGrid, label: 'Dashboard',  path: '/dashboard-cerbyl' },
];

const REACTIVE_SURFACE_SELECTOR = [
  '.sq-generator-header',
  '.sq-generator-form',
  '.sq-quiz-card',
  '.sq-stat-card',
  '.sq-empty-state',
  '.solo-quiz-flow .question-card',
  '.solo-quiz-flow .battle-sidebar',
  '.solo-quiz-flow .answer-option',
  '.solo-quiz-flow .question-comparison-item',
  '.solo-quiz-flow .result-stat',
  '.solo-quiz-flow .insight-section',
  '.solo-quiz-flow .solo-review-question',
  '.fd-friend-card',
  '.fd-user-row',
  '.nh-route-card',
  '.nh-note-row',
  '.mn-intake-card',
  '.amn-library-card',
  '.mn-study-workspace .mn-notes-panel',
  '.mn-tab-content > .mn-notes-panel',
  '.mn-transcript-rail',
  '.mn-transcript-view',
  '.mn-tab',
  '.mn-tab-action-btn',
  '.mn-quiz-question',
  '.mn-flashcard',
  '.mn-moment-item',
  '.mn-workflow-strip span',
  '.mn-recipe-picker button',
  '.pce-mode-card',
  '.pce-surface-card',
  '.pce-session-card',
  '.pce-chapter-button',
  '.pce-bookmark-button',
  '.pce-subtitle-cue',
  '.nre-document-card',
  '.flashcards-page .fc-set-card-new',
  '.flashcards-page .fc-mode-btn',
  '.flashcards-page .fc-generator-workspace',
  '.flashcards-page .fc-stat-card',
  '.flashcards-page .fc-sr-summary-item',
  '.flashcards-page .fc-sr-stats-panel',
  '.flashcards-page .fc-sr-ai-section',
  '.flashcards-page .fc-review-card-item',
  '.flashcards-page .fc-review-set',
  '.flashcards-page .fc-source-card',
  '.flashcards-page .fc-source-upload-card',
  '.cxh-root .cxh-ledger',
  '.cxh-root .cxh-stack',
  '.cxh-root .cxh-library',
  '.cxh-root .cxh-ingest',
  '.cxh-root .cxh-doc-row',
  '.cxh-root .cxh-slot',
  '.flashcards-page.fc-focus-shell .fc-study-card-front',
  '.flashcards-page.fc-focus-shell .fc-study-card-back',
  '.flashcards-page.fc-focus-shell .fc-edit-card',
  '.flashcards-page.fc-focus-shell .fc-study-question-card',
  '.flashcards-page.fc-focus-shell .fc-mcq-option',
  '.flashcards-page.fc-focus-shell .fc-sr-card-front',
  '.flashcards-page.fc-focus-shell .fc-sr-card-back',
  '.flashcards-page.fc-focus-shell .fc-result-stat',
  '.lp-resume-path',
  '.lp-route-row',
  '.lp-planning-desk',
  '.lp-topics-panel',
  '.lpd-overview-card',
  '.lpd-toolkit-card',
  '.lpd-activity',
  '.lpd-resource-card',
  '.lpd-resource-tool-card',
  '.lpd-resource-lab',
  '.lpd-application-item',
  '.lpd-connection-section',
  '.lpd-section-panel',
  '.lpd-lesson-stage',
  '.lpd-quiz-question',
  '.lpd-quiz-item',
  '.lpd-summary-block',
  '.flashcards-page.fc-focus-shell .fc-sr-result-item',
  '.se-page .se-deck-card',
  '.se-page .se-upload-stage',
  '.se-page .se-slide-frame',
  '.se-page .se-explanation-panel',
  '.se-page .se-insight-section',
  '.se-page .se-insights-panel',
  '.se-page .se-definition-card',
  '.se-page .se-exam-question-card',
  '.af-activity-card',
  '.sp-item-card',
  '.leaderboard-entry',
  '.challenge-card',
  '.games-page .stat-card-main',
  '.games-page .dc-mission-card',
  '.games-page .section-card',
  '.games-page .bingo-cell',
  '.qb-create-generator',
  '.qb-create-header',
  '.qb-create-form',
  '.qb-gm-btn',
  '.qb-battle-card',
  '.qb-empty',
  '.qb-detail-card',
  '.battle-quiz-flow .question-card',
  '.battle-quiz-flow .battle-sidebar',
  '.battle-quiz-flow .answer-option',
  '.battle-quiz-flow .result-stat',
  '.battle-quiz-flow .player-result',
  '.battle-quiz-flow .question-comparison-item',
  '.qbd-hub .qbd-qh-focus',
  '.qbd-hub .qbd-qh-set-list',
  '.qbd-hub .qbd-document-card',
  '.qbd-hub .qbd-source-card',
  '.qbd-hub .qbd-custom-card',
  '.qbd-hub .qbd-generation-settings',
  '.qbd-hub .qbd-upload-section',
  '.qbd-hub .qbd-stat-box',
  '.qbd-hub .qbd-adaptive-box',
  '.qbd-hub .qbd-performance-section',
  '.qbd-hub .qbd-difficulty-section',
  '.qbd-hub .qbd-difficulty-card',
  '.qbd-hub .qbd-weak-topics',
  '.qbd-hub .qbd-preview-question',
  '.qbd-hub .qbd-question-card',
  '.qbd-hub .qbd-recommendations-panel',
  '.qbd-hub .qbd-recommendation-card',
  '.qbd-hub .qbd-topics-panel',
  '.qbd-hub .qbd-selected-sources-panel',
  '.qbd-hub .qbd-selected-source-item',
  '.qbd-hub .qbd-wrong-answers-panel',
  '.qbd-hub .qbd-wrong-answer-card',
  '.qbd-hub .qbd-weak-area-card',
  '.qbd-hub .qbd-weak-topic-card',
  '.wa-root .wa-diagnosis-summary',
  '.wa-root .wa-queue',
  '.wa-root .wa-topics-overview',
  '.wa-root .wa-topic-row',
  '.wa-root .wa-stage',
  '.wa-root .wa-weak-row',
  '.wa-root .wa-component-panel',
  '.wa-root .wa-activity-row',
  '.atl-panel',
  '.atl-activity-card',
  '.atl-reminder-card',
  '.xpv-quest-row',
  '.xpv-power-grid button',
  '.xpv-topic-arc',
  '.xpv-badge-grid button',
  '.xpv-reward-ledger > button',
  '.xpv-route-brief',
  '.wt-page .wt-rec-card',
  '.wt-page .wt-gen-card',
  '.wt-page .wt-tip-item',
  '.wt-page .wt-q-card',
  '.plx-card',
  '.playlist-detail-page .pdx-row',
  '.playlist-detail-page .detail-header',
  '.playlist-detail-page .playlist-item',
  '.kr-page .kr-card',
  '.kr-page .custom-kr-node',
  '.kr-page .kr-section-card',
  '.kr-page .kr-example-card',
  '.kr-page .kr-notes-editor-card',
  '.kr-page .kr-chat-messages',
  '.an-root .an-mega',
  '.an-root .an-chart-card',
  '.an-root .an-breakdown-card',
  '.an-root .an-ring-card',
  '.an-root .an-weekly-card',
  '.an-root .an-quiz-card',
  '.an-root .an-ws-card',
  '.an-root .an-deep-card',
  '.an-root .an-ml-hero',
  '.an-root .an-param-card',
  '.an-root .an-pts-item',
  '.an-root .an-transparency-note',
  '.an-root .an-profile-card',
  '.an-root .an-fsrs-stat',
  '.qh .qh-mode-card',
  '.sh-root .sh-search-surface',
  '.sh-root .sh-chip',
  '.sh-root .sh-result-card',
  '.sh-root .sh-ai-panel',
  '.sh-root .sh-create-card',
  '.pn-profile-workspace .pnw-identity',
  '.pn-profile-workspace .pnw-panel',
  '.pn-profile-workspace .pnw-signature',
  '.pn-profile-workspace .pnw-plan-section',
  '.pn-profile-workspace .pnw-mastery',
  '.pn-profile-workspace .pnw-plan-ledger article',
  '.pn-profile-workspace .pnw-subjects button',
  '.pn-profile-workspace .pnw-status-band > div',
  '.pn-profile-workspace .pnw-assessment-callout',
].join(',');

const SocialHubChrome = ({
  sideSections = [],
  brandKicker = 'Social',
  footerItems = FOOTER_ITEMS,
  topbarAction = { label: 'Dashboard', path: '/dashboard-cerbyl' },
  sidebarLead = null,
  sidebarTail = null,
  collapsedLeadItems = [],
  collapsedTailItems = [],
  noSidebar = false,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  children,
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toolLabel = getToolNavigation(pathname).label || brandKicker;
  const currentSections = sideSections.map(section => ({ ...section, items: section.items.map(item => ({
    ...item,
    active: item.active ?? (item.path ? isActiveToolPath(pathname, item.path) : item.label.toLowerCase() === toolLabel.toLowerCase()),
  })) }));
  const activeLabel = currentSections.flatMap(section => section.items).find(item => item.active && item.pressed === undefined)?.label;
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const setCollapsed = useCallback((nextValue) => {
    const resolved = typeof nextValue === 'function' ? nextValue(collapsed) : nextValue;
    if (controlledCollapsed === undefined) {
      setInternalCollapsed(resolved);
    }
    onCollapsedChange?.(resolved);
  }, [collapsed, controlledCollapsed, onCollapsedChange]);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(max-width: 1100px)');
    const syncToViewport = () => {
      if (controlledCollapsed === undefined) {
        setInternalCollapsed(media.matches);
      }
      onCollapsedChange?.(media.matches);
    };
    syncToViewport();
    media.addEventListener?.('change', syncToViewport);
    return () => media.removeEventListener?.('change', syncToViewport);
  }, [controlledCollapsed === undefined, onCollapsedChange]);
  const [narrow, setNarrow] = useState(() => window.innerWidth <= 720);
  useEffect(() => { const media = window.matchMedia('(max-width: 720px)'); const update = () => setNarrow(media.matches); media.addEventListener?.('change', update); return () => media.removeEventListener?.('change', update); }, []);
  const drawerOpen = narrow && !collapsed && !noSidebar;
  const drawerRef = useModalFocus(drawerOpen, () => setCollapsed(true));
  const activeSurfaceRef = useRef(null);
  const shellRef = useRef(null);

  useLayoutEffect(() => {
    const root = shellRef.current;
    if (!root || typeof MutationObserver === 'undefined') return undefined;

    const decorateSurfaces = (scope) => {
      if (scope instanceof Element && scope.matches(REACTIVE_SURFACE_SELECTOR)) {
        scope.classList.add('shc-neumorphic-surface');
      }
      scope.querySelectorAll?.(REACTIVE_SURFACE_SELECTOR).forEach((surface) => {
        surface.classList.add('shc-neumorphic-surface');
      });
    };

    decorateSurfaces(root);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) decorateSurfaces(node);
        });
      });
    });
    observer.observe(root, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  const clearReactiveSurface = useCallback(() => {
    const surface = activeSurfaceRef.current;
    if (!surface) return;
    surface.classList.remove('shc-reactive-active');
    surface.style.removeProperty('--shc-mx');
    surface.style.removeProperty('--shc-my');
    surface.style.removeProperty('--shc-rx');
    surface.style.removeProperty('--shc-ry');
    activeSurfaceRef.current = null;
  }, []);

  const handleSurfacePointerMove = useCallback((event) => {
    if (event.pointerType === 'touch') return;
    const surface = event.target.closest?.(REACTIVE_SURFACE_SELECTOR);
    if (!surface) {
      clearReactiveSurface();
      return;
    }

    if (activeSurfaceRef.current !== surface) {
      clearReactiveSurface();
      activeSurfaceRef.current = surface;
      surface.classList.add('shc-reactive-active');
    }

    const rect = surface.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const rotateX = ((y / rect.height) - 0.5) * -1.2;
    const rotateY = ((x / rect.width) - 0.5) * 1.2;

    surface.style.setProperty('--shc-mx', `${x}px`);
    surface.style.setProperty('--shc-my', `${y}px`);
    surface.style.setProperty('--shc-rx', `${rotateX.toFixed(2)}deg`);
    surface.style.setProperty('--shc-ry', `${rotateY.toFixed(2)}deg`);
  }, [clearReactiveSurface]);

  const handleSurfaceScroll = useCallback(() => {
    clearReactiveSurface();
  }, [clearReactiveSurface]);

  return (
    <div
      ref={shellRef}
      className="shc-shell"
      onPointerMove={handleSurfacePointerMove}
      onPointerLeave={clearReactiveSurface}
      onScrollCapture={handleSurfaceScroll}
    >
        <div className="shc-bg-fx" aria-hidden="true">
          <div className="shc-bg-wash" />
          <div className="shc-bg-orb shc-bg-orb--one" />
          <div className="shc-bg-orb shc-bg-orb--two" />
          <GeometricGrid
            className="shc-bg-geo"
            linesClassName="shc-bg-geo-lines"
            numsClassName="shc-bg-geo-nums"
          />
          <div className="shc-bg-grain" />
          <div className="shc-bg-vignette" />
        </div>

        <div className="shc-topbar">
          <ToolNavigation toolLabel={brandKicker} currentLabel={activeLabel} />
          {topbarAction && topbarAction.path !== '/dashboard-cerbyl' && topbarAction.path !== getToolNavigation(pathname).parentPath && (
            <div className="shc-topbar-right">
              <button className="shc-top-btn" type="button" onClick={() => navigate(topbarAction.path)}>
                {topbarAction.label}
              </button>
            </div>
          )}
        </div>

      <div className={`shc-body ${noSidebar ? 'shc-body--no-sidebar' : collapsed ? 'shc-body--collapsed' : ''}`}>
        {!noSidebar && (
          <aside ref={drawerRef} onClick={event => { if (drawerOpen && event.target.closest('button,a') && !event.target.closest('.shc-collapse-btn')) setCollapsed(true); }} role={drawerOpen ? "dialog" : undefined} aria-modal={drawerOpen ? "true" : undefined} aria-label={drawerOpen ? "Workspace navigation" : undefined} className={`shc-sidebar ${collapsed ? 'shc-sidebar--collapsed' : ''}`}>
            <div className="cb-tile-texture" aria-hidden />

            {collapsed ? (
              <div className="shc-strip">
                <button
                  className="shc-strip-btn shc-strip-btn--toggle"
                  type="button"
                  onClick={() => setCollapsed(false)}
                  data-tip="Expand"
                  aria-label="Expand Social Hub sidebar"
                  aria-expanded="false"
                >
                  <ChevronRight size={15} />
                </button>

                <div className="shc-strip-rule" />

                {collapsedLeadItems.map(item => (
                  <StripBtn
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    onClick={item.onClick}
                    active={item.active}
                    pressed={item.pressed}
                    disabled={item.disabled}
                  />
                ))}

                {collapsedLeadItems.length > 0 && <div className="shc-strip-rule" />}

                {currentSections.flatMap(s => s.items).map(item => (
                  <StripBtn
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    onClick={item.onClick}
                    active={item.active}
                    pressed={item.pressed}
                    disabled={item.disabled}
                  />
                ))}

                <div className="shc-strip-spacer" />
                <div className="shc-strip-rule" />

                {collapsedTailItems.map(item => (
                  <StripBtn
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    onClick={item.onClick}
                    active={item.active}
                    pressed={item.pressed}
                    disabled={item.disabled}
                  />
                ))}

                {footerItems.map(fi => (
                  <StripBtn key={fi.label} icon={fi.icon} label={fi.label} active={isActiveToolPath(pathname, fi.path)} onClick={() => navigate(fi.path)} />
                ))}
              </div>
            ) : (
              <>
                <div className="shc-sidebar-brand">
                  <div className="shc-brand-name">cerbyl</div>
                  <div className="shc-brand-kicker">{brandKicker}</div>
                  <button
                    className="shc-collapse-btn"
                    type="button"
                    onClick={() => setCollapsed(true)}
                    title="Collapse"
                    aria-label="Collapse Social Hub sidebar"
                    aria-expanded="true"
                  >
                    <ChevronLeft size={12} />
                  </button>
                </div>

                {sidebarLead && (
                  <div className="shc-sidebar-lead">
                    {sidebarLead}
                  </div>
                )}

                <div className="shc-side-sections">
                  {currentSections.map(section => (
                    <div key={section.label} className="shc-side-block">
                      <div className="shc-side-label">{section.label}</div>
                      <nav className="shc-view-nav">
                        {section.items.map(item => {
                          const Icon = item.icon;
                          return (
                            <button
                              key={item.label}
                              className={`shc-view-link ${item.active ? 'shc-view-link--active' : ''}`}
                              type="button"
                              onClick={item.onClick}
                              disabled={item.disabled}
                              aria-current={item.active && item.pressed === undefined ? 'page' : undefined}
                              aria-pressed={item.pressed}
                            >
                              {Icon ? <Icon size={15} /> : null}
                              <span>{item.label}</span>
                              {item.count != null && item.count > 0 && (
                                <span className="shc-nav-count">{item.count}</span>
                              )}
                            </button>
                          );
                        })}
                      </nav>
                    </div>
                  ))}
                </div>

                {sidebarTail && (
                  <div className="shc-sidebar-tail">
                    {sidebarTail}
                  </div>
                )}

                <div className="shc-side-footer-nav">
                  {footerItems.map(fi => {
                    const Icon = fi.icon;
                    return (
                      <button
                        key={fi.label}
                        className="shc-footer-action"
                        aria-current={isActiveToolPath(pathname, fi.path) ? 'page' : undefined}
                        type="button"
                        onClick={() => navigate(fi.path)}
                      >
                        {Icon ? <Icon size={15} /> : null}
                        <span>{fi.label}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </aside>
        )}

        {drawerOpen && <button type="button" className="shc-drawer-backdrop" tabIndex={-1} aria-label="Close navigation" onClick={() => setCollapsed(true)} />}
        <main className="shc-main" inert={drawerOpen ? "" : undefined}>
          <div className="cb-tile-texture" aria-hidden />
          {children}
        </main>
      </div>
    </div>
  );
};

export default SocialHubChrome;
