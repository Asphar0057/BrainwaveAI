import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LayoutGrid, Users } from 'lucide-react';
import './SocialHubChrome.css';
import GeometricGrid from './GeometricGrid';

const StripBtn = ({ icon: Icon, label, onClick, active }) => (
  <button
    className={`shc-strip-btn ${active ? 'shc-strip-btn--active' : ''}`}
    type="button"
    onClick={onClick}
    data-tip={label}
  >
    {Icon ? <Icon size={15} /> : null}
  </button>
);

const FOOTER_ITEMS = [
  { icon: Users,      label: 'Social Hub', path: '/social' },
  { icon: LayoutGrid, label: 'Dashboard',  path: '/dashboard-cerbyl' },
];

const SocialHubChrome = ({
  sideSections = [],
  brandKicker = 'Social',
  footerItems = FOOTER_ITEMS,
  topbarAction = { label: 'Dashboard', path: '/dashboard-cerbyl' },
  noSidebar = false,
  children,
}) => {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="shc-shell">
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
                >
                  <ChevronRight size={15} />
                </button>

                <div className="shc-strip-rule" />

                {sideSections.flatMap(s => s.items).map(item => (
                  <StripBtn
                    key={item.label}
                    icon={item.icon}
                    label={item.label}
                    onClick={item.onClick}
                    active={item.active}
                  />
                ))}

                <div className="shc-strip-spacer" />
                <div className="shc-strip-rule" />

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
                  >
                    <ChevronLeft size={12} />
                  </button>
                </div>

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
