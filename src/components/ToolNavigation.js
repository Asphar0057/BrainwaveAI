import { usePreviousPage } from './NavigationHistory';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { getToolNavigation } from '../utils/toolNavigation';
import { getActiveWorkspace } from '../utils/workspace';

export default function ToolNavigation({ toolLabel, currentLabel }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const previous = usePreviousPage();
  const navigation = getToolNavigation(pathname, getActiveWorkspace());
  const parentPath = previous ? `${previous.pathname}${previous.search || ''}${previous.hash || ''}` : navigation.parentPath;
  const parentLabel = previous ? getToolNavigation(previous.pathname).label || 'Previous page' : navigation.parentLabel;
  const label = navigation.label || toolLabel || 'Workspace';
  return (
    <nav className="tool-navigation" aria-label="Tool navigation">
      <Link className="tool-navigation-back" to={parentPath} aria-label={`Back to ${parentLabel}`} title={`Back to ${parentLabel}`} onClick={(event) => {
        if (previous && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault(); navigate(previous.delta);
        }
      }}>
        <ChevronLeft size={16} aria-hidden="true" /><span>{parentLabel}</span>
      </Link>
      <span className="tool-navigation-current" aria-current="page" title={currentLabel && currentLabel !== label ? `${label} · ${currentLabel}` : label}>
        <strong>{label}</strong>
        {currentLabel && currentLabel.toLowerCase() !== label.toLowerCase() && <span className="tool-navigation-section">{currentLabel}</span>}
      </span>
    </nav>
  );
}
