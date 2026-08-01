import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  '.lpd-overview-card',
  '.lpd-toolkit-card',
  '.lpd-activity',
  '.lpd-resource-card',
  '.lpd-application-item',
  '.lpd-connection-section',
  '.flashcards-page.fc-focus-shell .fc-sr-result-item',
  '.se-page .se-deck-card',
  '.se-page .se-upload-stage',
  '.se-page .se-slide-frame',
  '.se-page .se-explanation-panel',
  '.se-page .se-insight-section',
  '.af-activity-card',
  '.sp-item-card',
  '.leaderboard-entry',
  '.challenge-card',
  '.games-page .stat-card-main',
  '.games-page .dc-mission-card',
  '.games-page .section-card',
  '.games-page .bingo-cell',
  '.qb-create-generator',
  '.qb-gm-btn',
  '.qb-battle-card',
  '.qbd-hub .qbd-qh-focus',
  '.qbd-hub .qbd-qh-set-list',
  '.qbd-hub .qbd-qh-set-row',
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
  '.wa-root .wa-diagnosis-summary',
  '.wa-root .wa-queue',
  '.wa-root .wa-topics-overview',
  '.wa-root .wa-topic-row',
  '.wa-root .wa-component-panel',
  '.wa-root .wa-activity-row',
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
  '.qh .qh-mode-card',
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
  const activeSurfaceRef = useRef(null);

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
          <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
          {topbarAction && (
            <div className="shc-topbar-right">
              <button className="shc-top-btn" type="button" onClick={() => navigate(topbarAction.path)}>
                {topbarAction.label}
              </button>
            </div>
          )}
        </div>

      <div className={`shc-body ${noSidebar ? 'shc-body--no-sidebar' : collapsed ? 'shc-body--collapsed' : ''}`}>
        {!noSidebar && (
          <aside className={`shc-sidebar ${collapsed ? 'shc-sidebar--collapsed' : ''}`}>
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

                {sideSections.flatMap(s => s.items).map(item => (
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
                  <StripBtn key={fi.label} icon={fi.icon} label={fi.label} onClick={() => navigate(fi.path)} />
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
                  {sideSections.map(section => (
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

        <main className="shc-main">
          <div className="cb-tile-texture" aria-hidden />
          {children}
        </main>
      </div>
    </div>
  );
};

export default SocialHubChrome;
