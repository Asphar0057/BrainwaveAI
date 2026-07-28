import { ChevronLeft, ChevronRight } from 'lucide-react';
import '../styles/SidebarShell.css';

export function SidebarShell({ collapsed, onToggleCollapse, brandKicker, brandLogo = 'cerbyl', children, collapsedContent, ariaLabel }) {
  return (
    <>
      {onToggleCollapse && (
        <button
          type="button"
          className="sb-mobile-sidebar-btn"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}
          title={collapsed ? 'Open sidebar' : 'Close sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      )}
      {onToggleCollapse && !collapsed && (
        <button
          type="button"
          className="sb-mobile-sidebar-backdrop"
          onClick={onToggleCollapse}
          aria-label="Close sidebar"
        />
      )}
      <aside className={`sb-sidebar ${collapsed ? 'sb-sidebar--collapsed' : ''}`} aria-label={ariaLabel}>
        <div className="sb-sidebar-texture" aria-hidden="true" />
        {collapsed ? (
          <div className="sb-collapsed-strip">
            {onToggleCollapse && (
              <button type="button" className="sb-strip-btn" data-tip="Open sidebar" aria-label="Open sidebar" title="Open sidebar" onClick={onToggleCollapse}>
                <ChevronRight size={18} />
              </button>
            )}
            {collapsedContent}
          </div>
        ) : (
          <>
            <div className="sb-sidebar-brand">
              <div className="sb-sidebar-logo">{brandLogo}</div>
              {brandKicker && <div className="sb-sidebar-kicker">{brandKicker}</div>}
              {onToggleCollapse && (
                <button type="button" className="sb-sidebar-close-btn" onClick={onToggleCollapse} aria-label="Collapse sidebar">
                  <ChevronLeft size={14} />
                </button>
              )}
            </div>
            {children}
          </>
        )}
      </aside>
    </>
  );
}

export function SidebarPrimaryButton({ icon, label, onClick, disabled }) {
  return (
    <button type="button" className="sb-primary-btn" onClick={onClick} disabled={disabled}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function SidebarSection({ heading, children }) {
  return (
    <div className="sb-sidebar-section">
      {heading && <p className="sb-sidebar-heading">{heading}</p>}
      <div className="sb-menu">{children}</div>
    </div>
  );
}

export function SidebarMenuItem({ icon, label, active, onClick, disabled, badge }) {
  return (
    <button type="button" className={`sb-menu-item ${active ? 'active' : ''}`} onClick={onClick} disabled={disabled}>
      {icon}
      <span>{label}</span>
      {badge != null && badge}
    </button>
  );
}

export function SidebarStats({ children }) {
  return <div className="sb-sidebar-stats">{children}</div>;
}

export function SidebarStatBox({ value, label }) {
  return (
    <div className="sb-stat-box">
      <div className="sb-stat-value">{value}</div>
      <div className="sb-stat-label">{label}</div>
    </div>
  );
}

export function SidebarActions({ children }) {
  return <div className="sb-sidebar-actions">{children}</div>;
}

export function SidebarAction({ icon, label, onClick }) {
  return (
    <button type="button" className="sb-sidebar-action" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function SidebarStripButton({ icon, tip, active, onClick, disabled }) {
  return (
    <button
      type="button"
      className={`sb-strip-btn ${active ? 'active' : ''}`}
      data-tip={tip}
      aria-label={tip}
      title={tip}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
    </button>
  );
}

export function SidebarStripDivider() {
  return <div className="sb-strip-divider" />;
}

export function SidebarStripSpacer() {
  return <div className="sb-strip-spacer" />;
}
