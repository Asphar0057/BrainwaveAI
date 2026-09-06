import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { getToolNavigation } from '../utils/toolNavigation';
import { getActiveWorkspace } from '../utils/workspace';

export default function ToolNavigation({ toolLabel, currentLabel }) {
  const { pathname } = useLocation();
  const navigation = getToolNavigation(pathname, getActiveWorkspace());
  const label = navigation.label || toolLabel || 'Workspace';
  return (
    <nav className="tool-navigation" aria-label="Tool navigation">
      <Link className="tool-navigation-back" to={navigation.parentPath} aria-label={`Back to ${navigation.parentLabel}`}>
        <ArrowLeft size={16} aria-hidden="true" /><span>{navigation.parentLabel}</span>
      </Link>
      <ChevronRight className="tool-navigation-divider" size={14} aria-hidden="true" />
      <span className="tool-navigation-current" aria-current="page" title={currentLabel && currentLabel !== label ? `${label} · ${currentLabel}` : label}>
        <strong>{label}</strong>
        {currentLabel && currentLabel.toLowerCase() !== label.toLowerCase() && <span className="tool-navigation-section">{currentLabel}</span>}
      </span>
    </nav>
  );
}
