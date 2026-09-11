import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pencil, Plus, User } from 'lucide-react';
import '../pages/DashboardCerbyl.css';
import './CerbylSidebar.css';

function SidebarAction({ item, className, children, onActivate }) {
  const props = { className, 'aria-label': item.ariaLabel, 'aria-current': item.active ? 'page' : undefined, onClick: event => { item.onClick?.(event); onActivate?.(); } };
  return item.to
    ? <Link {...props} to={item.to}>{children}</Link>
    : <button {...props} type="button">{children}</button>;
}

// The B2C sidebar is the shared template; roles supply content and actions only.
export default function CerbylSidebar({
  open, onOpenChange, brandKicker = 'Dashboard', displayName, profilePhoto,
  initial, profileSubtitle, profileTo, onProfile, profileLabel,
  onEditProfile, editProfileLabel = 'Edit profile picture', editProfileText = 'Edit PFP',
  quickLinks = [], workspaceLinks = [], navigationLabel = 'Dashboard navigation',
}) {
  const collapseRef = useRef(null), expandRef = useRef(null), previousOpen = useRef(open);
  useEffect(() => {
    if (previousOpen.current !== open) (open ? collapseRef : expandRef).current?.focus();
    previousOpen.current = open;
  }, [open]);
  const profile = { to: profileTo, onClick: onProfile, ariaLabel: profileLabel };
  const closeMobile = () => { if (window.matchMedia?.('(max-width: 720px)')?.matches) onOpenChange(false); };
  return <div className={`cb-side-slot ${open ? '' : 'cb-side-slot--collapsed'}`}>
    <aside className={`cb-side ${open ? '' : 'cb-side--collapsed'}`} aria-label={`${brandKicker} sidebar`} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); onOpenChange(false); } }}>
      <div className="cb-tile-texture" aria-hidden="true" />
      {open ? <>
        <div className="cb-brand">
          <span className="cb-brand-name">cerbyl</span>
          <span className="cb-brand-kicker">{brandKicker}</span>
          <button ref={collapseRef} className="cb-sidebar-collapse" type="button" onClick={() => onOpenChange(false)} title="Collapse" aria-label="Collapse dashboard sidebar" aria-expanded="true"><ChevronLeft size={12} /></button>
        </div>
        <div className="cb-logo-wrap">
          {profilePhoto ? <img src={profilePhoto} alt={`${displayName} profile`} className="cb-brand-pfp" referrerPolicy="no-referrer" />
            : <div className="cb-brand-pfp cb-brand-pfp--fallback" aria-label="Profile avatar">{initial || displayName?.[0]?.toUpperCase() || 'C'}</div>}
          {onEditProfile && <button className="cb-pfp-edit-btn" onClick={onEditProfile} aria-label={editProfileLabel} title={editProfileLabel}><Pencil size={12} />{editProfileText}</button>}
        </div>
        <nav className="cb-side-groups" aria-label={navigationLabel}>
          <div className="cb-side-sections">
            {quickLinks.map(item => <SidebarAction key={item.label} item={item} className="cb-side-section" onActivate={closeMobile}>
              <span className="cb-side-dot" /><span className="cb-side-label">{item.label}</span><span className="cb-side-plus" aria-hidden="true"><Plus size={12} strokeWidth={2.4} /></span>
            </SidebarAction>)}
          </div>
          <div className="cb-side-nav">
            {workspaceLinks.map(item => <SidebarAction key={item.label} item={item} className="cb-side-link" onActivate={closeMobile}><span className="cb-side-link-dot" /><span className="cb-side-link-label">{item.label}</span></SidebarAction>)}
          </div>
        </nav>
        <SidebarAction item={profile} className="cb-user-chip" onActivate={closeMobile}>
          <span className="cb-user-meta"><span className="cb-user-name">{displayName}</span><span className="cb-user-sub">{profileSubtitle}</span></span>
        </SidebarAction>
      </> : <div className="cb-side-strip">
        <button ref={expandRef} className="cb-side-strip-btn" type="button" onClick={() => onOpenChange(true)} aria-label="Expand dashboard sidebar" aria-expanded="false" data-tip="Expand"><ChevronRight size={15} /></button>
        <div className="cb-side-strip-rule" />
        <SidebarAction item={{ ...profile, ariaLabel: 'Open profile' }} className="cb-side-strip-btn cb-side-strip-btn--profile">
          {profilePhoto ? <img src={profilePhoto} alt="Open profile" className="cb-side-strip-avatar" referrerPolicy="no-referrer" /> : <User size={15} aria-label="Open profile" />}
        </SidebarAction>
      </div>}
    </aside>
  </div>;
}
