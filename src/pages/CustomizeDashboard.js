import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save,
  RotateCcw,
  Trash2,
  Plus,
  Palette,
  GripVertical,
  X,
  Check,
  Layout,
  Layers,
  FileText,
  Users,
  Clock,
  Flame,
  Network,
  BookOpen,
  Calendar,
  ChevronLeft,
  Lock,
  BarChart2,
  MessageSquare
} from 'lucide-react';
import './CustomizeDashboard.css';
import '../components/SocialHubChrome.css';

const WIDGET_DEFINITIONS = {
  'ai-tutor': {
    id: 'ai-tutor',
    title: 'AI Tutor',
    icon: MessageSquare,
    description: 'AI-powered study assistant',
    sizes: { S: { cols: 1, rows: 2 }, M: { cols: 1, rows: 3 }, L: { cols: 1, rows: 4 } },
    defaultSize: 'M',
    mandatory: false
  },
  'learning-hub-grid': {
    id: 'learning-hub-grid',
    title: 'Learning Hub',
    icon: BookOpen,
    description: 'Learning tools & resources',
    sizes: { S: { cols: 2, rows: 2 }, M: { cols: 2, rows: 3 }, L: { cols: 2, rows: 4 } },
    defaultSize: 'L',
    mandatory: false,
    fixedSize: false
  },
  'social-hub': {
    id: 'social-hub',
    title: 'Social Hub',
    icon: Users,
    description: 'Connect with learners',
    sizes: { S: { cols: 1, rows: 1 }, M: { cols: 1, rows: 2 }, L: { cols: 2, rows: 2 } },
    defaultSize: 'M',
    mandatory: false
  },
  'streak': {
    id: 'streak',
    title: 'Streak & Analytics',
    icon: Flame,
    description: 'Track your progress',
    sizes: { S: { cols: 1, rows: 1, disabled: true }, M: { cols: 1, rows: 2 }, L: { cols: 2, rows: 2 } },
    defaultSize: 'M',
    mandatory: false,
    minSize: 'M'
  },
  'notes': {
    id: 'notes',
    title: 'Notes',
    icon: FileText,
    description: 'Your study notes',
    sizes: { S: { cols: 1, rows: 1 }, M: { cols: 1, rows: 2 }, L: { cols: 2, rows: 2 } },
    defaultSize: 'M',
    mandatory: false
  },
  'flashcards': {
    id: 'flashcards',
    title: 'Flashcards',
    icon: Layers,
    description: 'Spaced repetition cards',
    sizes: { S: { cols: 1, rows: 1 }, M: { cols: 1, rows: 2 }, L: { cols: 2, rows: 2 } },
    defaultSize: 'M',
    mandatory: false
  },
  'activity': {
    id: 'activity',
    title: 'Activity',
    icon: Clock,
    description: 'Recent activity timeline',
    sizes: { S: { cols: 1, rows: 1 }, M: { cols: 1, rows: 2 }, L: { cols: 2, rows: 2 } },
    defaultSize: 'M',
    mandatory: false
  },
  'concept-web': {
    id: 'concept-web',
    title: 'Learning Path',
    icon: Network,
    description: 'Visualize topic connections',
    sizes: { S: { cols: 1, rows: 1 }, M: { cols: 1, rows: 2 }, L: { cols: 2, rows: 2 } },
    defaultSize: 'S',
    mandatory: false
  },
  'heatmap': {
    id: 'heatmap',
    title: 'Activity Heatmap',
    icon: Calendar,
    description: 'Last 12 months activity',
    sizes: { S: { cols: 2, rows: 1 }, M: { cols: 3, rows: 2 }, L: { cols: 4, rows: 2 } },
    defaultSize: 'L',
    mandatory: false
  },
  'quick-hub': {
    id: 'quick-hub',
    title: 'Weekly Hub',
    icon: BarChart2,
    description: 'Weekly stats + Social, Timeline & Paths',
    sizes: { S: { cols: 2, rows: 2 }, M: { cols: 4, rows: 2 }, L: { cols: 4, rows: 3 } },
    defaultSize: 'L',
    mandatory: false
  }
};

const DEFAULT_LAYOUT = {
  name: 'Default',
  widgets: [
    { id: 'ai-tutor', col: 1, row: 1, cols: 1, rows: 3, color: null, size: 'M' },
    { id: 'learning-hub-grid', col: 2, row: 1, cols: 2, rows: 3, color: null, size: 'L' },
    { id: 'quick-hub', col: 4, row: 1, cols: 1, rows: 5, color: null, size: 'L' },
    { id: 'streak', col: 1, row: 4, cols: 1, rows: 2, color: null, size: 'M' },
    { id: 'notes', col: 2, row: 4, cols: 1, rows: 2, color: null, size: 'M' },
    { id: 'flashcards', col: 3, row: 4, cols: 1, rows: 2, color: null, size: 'M' },
    { id: 'heatmap', col: 1, row: 6, cols: 4, rows: 2, color: null, size: 'L' }
  ]
};

const COLOR_PRESETS = [
  { name: 'Default', value: null },
  { name: 'Gold', value: '#D7B38C' },
  { name: 'Blue', value: '#4A90D9' },
  { name: 'Green', value: '#4CAF50' },
  { name: 'Purple', value: '#9C27B0' },
  { name: 'Red', value: '#E53935' },
  { name: 'Teal', value: '#009688' },
  { name: 'Orange', value: '#FF9800' },
  { name: 'Pink', value: '#E91E63' }
];

const BLANK_LAYOUT = {
  name: 'New Layout',
  widgets: []
};

const GRID_COLS = 4;
const GRID_ROWS = 8;

const CustomizeDashboard = () => {
  const navigate = useNavigate();
  
  
  const [placedWidgets, setPlacedWidgets] = useState([]);
  const [availableWidgets, setAvailableWidgets] = useState([]);
  const [savedLayouts, setSavedLayouts] = useState([]);
  const [currentLayoutName, setCurrentLayoutName] = useState('Default');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  
  const [draggedWidget, setDraggedWidget] = useState(null);
  const [dragSource, setDragSource] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  
  
  const [selectedWidget, setSelectedWidget] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [shakeWidget, setShakeWidget] = useState(null);

  
  const isLayoutLocked = currentLayoutName === 'Default';
  
  
  const [alertModal, setAlertModal] = useState({ show: false, message: '' });
  const [confirmModal, setConfirmModal] = useState({
    show: false,
    message: '',
    onConfirm: null
  });

  
  useEffect(() => {
    loadSavedLayouts();
    loadCurrentLayout();
  }, []);

  const loadSavedLayouts = () => {
    try {
      const saved = localStorage.getItem('dashboardLayouts');
      let layouts = saved ? JSON.parse(saved) : [];
      
      
      layouts = layouts.filter((l) => l.name !== 'Default');
      
      
      layouts = [DEFAULT_LAYOUT, ...layouts];
      
      setSavedLayouts(layouts);
    } catch (error) {
      console.error('Error loading layouts:', error);
      setSavedLayouts([DEFAULT_LAYOUT]);
    }
  };

  const loadCurrentLayout = () => {
    try {
      const layoutName = localStorage.getItem('currentLayoutName') || 'Default';
      
      
      if (layoutName === 'Default') {
        applyLayout(DEFAULT_LAYOUT, 'Default');
        return;
      }
      
      const savedLayout = localStorage.getItem('currentDashboardLayout');
      if (savedLayout) {
        const layout = JSON.parse(savedLayout);
        applyLayout(layout, layoutName);
      } else {
        applyLayout(DEFAULT_LAYOUT, 'Default');
      }
    } catch (error) {
      console.error('Error loading current layout:', error);
      applyLayout(DEFAULT_LAYOUT, 'Default');
    }
  };

  const applyLayout = (layout, name) => {
    setPlacedWidgets(layout.widgets || []);
    setCurrentLayoutName(name);
    
    
    const placedIds = (layout.widgets || []).map(w => w.id);
    const available = Object.keys(WIDGET_DEFINITIONS)
      .filter(id => !placedIds.includes(id))
      .map(id => ({ id, ...WIDGET_DEFINITIONS[id] }));
    setAvailableWidgets(available);
    setHasUnsavedChanges(false);
  };

  
  const triggerShake = (widgetId) => {
    setShakeWidget(widgetId);
    setTimeout(() => setShakeWidget(null), 500);
  };

  const handleDragStart = (e, widget, source) => {
    
    if (isLayoutLocked) {
      e.preventDefault();
      triggerShake(widget.id);
      return;
    }
    setDraggedWidget(widget);
    setDragSource(source);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', widget.id);
  };

  const handleDragOver = (e, col, row) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedWidget) return;
    
    const widgetDef = WIDGET_DEFINITIONS[draggedWidget.id];
    const defaultSizeKey = widgetDef.defaultSize || 'M';
    const size = dragSource === 'grid' 
      ? { cols: draggedWidget.cols, rows: draggedWidget.rows }
      : widgetDef.sizes[defaultSizeKey];
    
    
    const isValid = canPlaceWidget(col, row, size.cols, size.rows, draggedWidget.id);
    
    setDropTarget({ col, row, valid: isValid });
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e, col, row) => {
    e.preventDefault();
    e.stopPropagation();
    
    
    if (isLayoutLocked) {
      resetDragState();
      return;
    }
    
    if (!draggedWidget || !dropTarget?.valid) {
      resetDragState();
      return;
    }
    
    const widgetDef = WIDGET_DEFINITIONS[draggedWidget.id];
    const defaultSizeKey = widgetDef.defaultSize || 'M';
    const size = dragSource === 'grid'
      ? { cols: draggedWidget.cols, rows: draggedWidget.rows }
      : widgetDef.sizes[defaultSizeKey];
    
    if (dragSource === 'available') {
      
      const newWidget = {
        id: draggedWidget.id,
        col,
        row,
        cols: size.cols,
        rows: size.rows,
        color: null,
        size: defaultSizeKey
      };
      
      setPlacedWidgets(prev => [...prev, newWidget]);
      setAvailableWidgets(prev => prev.filter(w => w.id !== draggedWidget.id));
    } else if (dragSource === 'grid') {
      
      setPlacedWidgets(prev => prev.map(w => 
        w.id === draggedWidget.id ? { ...w, col, row } : w
      ));
    }
    
    setHasUnsavedChanges(true);
    resetDragState();
  };

  const resetDragState = () => {
    setDraggedWidget(null);
    setDragSource(null);
    setDropTarget(null);
  };

  const canPlaceWidget = (col, row, cols, rows, excludeId = null) => {
    
    if (col < 1 || row < 1 || col + cols - 1 > GRID_COLS || row + rows - 1 > GRID_ROWS) {
      return false;
    }
    
    
    for (const widget of placedWidgets) {
      if (widget.id === excludeId) continue;
      
      const wRight = widget.col + widget.cols - 1;
      const wBottom = widget.row + widget.rows - 1;
      const newRight = col + cols - 1;
      const newBottom = row + rows - 1;
      
      
      if (!(col > wRight || newRight < widget.col || row > wBottom || newBottom < widget.row)) {
        return false;
      }
    }
    
    return true;
  };

  
  const removeWidget = (widgetId) => {
    
    if (isLayoutLocked) {
      triggerShake(widgetId);
      return;
    }
    
    const widget = placedWidgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    const def = WIDGET_DEFINITIONS[widgetId];
    if (def.mandatory) {
      setAlertModal({ show: true, message: 'This widget is mandatory and cannot be removed.' });
      return;
    }
    
    setPlacedWidgets(prev => prev.filter(w => w.id !== widgetId));
    setAvailableWidgets(prev => [...prev, { id: widgetId, ...def }]);
    setSelectedWidget(null);
    setHasUnsavedChanges(true);
  };

  const setWidgetSize = (widgetId, size) => {
    
    if (isLayoutLocked) {
      triggerShake(widgetId);
      return;
    }
    
    const widget = placedWidgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    const def = WIDGET_DEFINITIONS[widgetId];
    
    
    if (def.fixedSize) {
      return;
    }
    
    const newSize = def.sizes[size];
    if (!newSize) return;
    
    
    if (canPlaceWidget(widget.col, widget.row, newSize.cols, newSize.rows, widgetId)) {
      setPlacedWidgets(prev => prev.map(w => 
        w.id === widgetId ? { ...w, cols: newSize.cols, rows: newSize.rows, size: size } : w
      ));
      setHasUnsavedChanges(true);
    } else {
      setAlertModal({ show: true, message: 'Cannot resize: not enough space. Try moving the widget first.' });
    }
  };

  const getWidgetSizeLabel = (widget) => {
    const def = WIDGET_DEFINITIONS[widget.id];
    if (!def || !def.sizes) return 'M';
    
    
    for (const [sizeKey, sizeVal] of Object.entries(def.sizes)) {
      if (widget.cols === sizeVal.cols && widget.rows === sizeVal.rows) {
        return sizeKey;
      }
    }
    return widget.size || 'M';
  };

  const setWidgetColor = (widgetId, color) => {
    
    if (isLayoutLocked) {
      triggerShake(widgetId);
      return;
    }
    
    setPlacedWidgets(prev => prev.map(w => 
      w.id === widgetId ? { ...w, color } : w
    ));
    setHasUnsavedChanges(true);
    setShowColorPicker(false);
  };

  
  const saveLayout = (name = currentLayoutName) => {
    
    if (name === 'Default') {
      setAlertModal({ show: true, message: 'Cannot modify the Default layout. Use "Save As" to create a new layout.' });
      return false;
    }
    
    const layout = {
      name,
      widgets: placedWidgets,
      timestamp: Date.now()
    };
    
    try {
      
      localStorage.setItem('currentDashboardLayout', JSON.stringify(layout));
      localStorage.setItem('currentLayoutName', name);
      
      
      const layouts = [...savedLayouts];
      const existingIndex = layouts.findIndex(l => l.name === name);
      
      if (existingIndex >= 0) {
        layouts[existingIndex] = layout;
      } else {
        layouts.push(layout);
      }
      
      localStorage.setItem('dashboardLayouts', JSON.stringify(layouts));
      setSavedLayouts(layouts);
      setCurrentLayoutName(name);
      setHasUnsavedChanges(false);
      setShowSaveModal(false);
      setNewLayoutName('');
      
      return true;
    } catch (error) {
      console.error('Error saving layout:', error);
      setAlertModal({ show: true, message: 'Failed to save layout' });
      return false;
    }
  };

  
  const createNewLayout = (name) => {
    if (!name.trim()) return;
    
    
    if (savedLayouts.some(l => l.name === name)) {
      setAlertModal({ show: true, message: 'A layout with this name already exists.' });
      return;
    }
    
    
    if (name === 'Default') {
      setAlertModal({ show: true, message: 'Cannot use "Default" as layout name.' });
      return;
    }
    
    const newLayout = {
      name,
      widgets: [...BLANK_LAYOUT.widgets],
      timestamp: Date.now()
    };
    
    try {
      
      localStorage.setItem('currentDashboardLayout', JSON.stringify(newLayout));
      localStorage.setItem('currentLayoutName', name);
      
      
      const layouts = [...savedLayouts, newLayout];
      localStorage.setItem('dashboardLayouts', JSON.stringify(layouts));
      setSavedLayouts(layouts);
      
      
      applyLayout(newLayout, name);
      
      setShowCreateModal(false);
      setNewLayoutName('');
    } catch (error) {
      console.error('Error creating layout:', error);
      setAlertModal({ show: true, message: 'Failed to create layout' });
    }
  };

  const loadLayout = (layout) => {
    
    if (layout.name === 'Default') {
      applyLayout(DEFAULT_LAYOUT, 'Default');
      
      localStorage.setItem('currentDashboardLayout', JSON.stringify(DEFAULT_LAYOUT));
      localStorage.setItem('currentLayoutName', 'Default');
    } else {
      applyLayout(layout, layout.name);
      
      localStorage.setItem('currentDashboardLayout', JSON.stringify(layout));
      localStorage.setItem('currentLayoutName', layout.name);
    }
  };

  const deleteLayout = (layoutName) => {
    if (layoutName === 'Default') {
      setAlertModal({ show: true, message: 'Cannot delete the default layout' });
      return;
    }
    
    const layouts = savedLayouts.filter(l => l.name !== layoutName);
    localStorage.setItem('dashboardLayouts', JSON.stringify(layouts));
    setSavedLayouts(layouts);
    
    if (currentLayoutName === layoutName) {
      applyLayout(DEFAULT_LAYOUT, 'Default');
    }
    
    setShowDeleteConfirm(null);
  };

  const resetLayoutToDefault = (layoutName) => {
    if (layoutName === 'Default') {
      return;
    }

    setConfirmModal({
      show: true,
      message: `Reset "${layoutName}" to default layout configuration?`,
      onConfirm: () => {
        const layouts = savedLayouts.map(l => {
          if (l.name === layoutName) {
            return {
              ...DEFAULT_LAYOUT,
              name: layoutName
            };
          }
          return l;
        });
        
        localStorage.setItem('dashboardLayouts', JSON.stringify(layouts));
        setSavedLayouts(layouts);
        
        if (currentLayoutName === layoutName) {
          applyLayout({ ...DEFAULT_LAYOUT, name: layoutName }, layoutName);
          localStorage.setItem('currentDashboardLayout', JSON.stringify({ ...DEFAULT_LAYOUT, name: layoutName }));
          setHasUnsavedChanges(false);
        }
        
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const resetToDefault = () => {
    
    if (currentLayoutName === 'Default') {
      return;
    }

    const resetCurrentLayout = () => {
      
      const resetLayout = {
        ...DEFAULT_LAYOUT,
        name: currentLayoutName
      };
      
      
      const layouts = savedLayouts.map(l => {
        if (l.name === currentLayoutName) {
          return resetLayout;
        }
        return l;
      });
      
      localStorage.setItem('dashboardLayouts', JSON.stringify(layouts));
      setSavedLayouts(layouts);
      
      
      applyLayout(resetLayout, currentLayoutName);
      localStorage.setItem('currentDashboardLayout', JSON.stringify(resetLayout));
      setHasUnsavedChanges(false);
    };

    if (hasUnsavedChanges) {
      setConfirmModal({
        show: true,
        message: `Reset "${currentLayoutName}" to default configuration?`,
        onConfirm: () => {
          resetCurrentLayout();
          setConfirmModal({ show: false, message: '', onConfirm: null });
        }
      });
      return;
    }
    
    setConfirmModal({
      show: true,
      message: `Reset "${currentLayoutName}" to default configuration?`,
      onConfirm: () => {
        resetCurrentLayout();
        setConfirmModal({ show: false, message: '', onConfirm: null });
      }
    });
  };

  const goBack = () => {
    if (hasUnsavedChanges) {
      setConfirmModal({
        show: true,
        message: 'You have unsaved changes. Leave anyway?',
        onConfirm: () => {
          navigate('/dashboard-cerbyl');
        }
      });
      return;
    }
    navigate('/dashboard-cerbyl');
  };

  
  const renderGridCells = () => {
    const cells = [];
    
    for (let row = 1; row <= GRID_ROWS; row++) {
      for (let col = 1; col <= GRID_COLS; col++) {
        const isDropTarget = dropTarget?.col === col && dropTarget?.row === row;
        const isOccupied = placedWidgets.some(w => 
          col >= w.col && col < w.col + w.cols &&
          row >= w.row && row < w.row + w.rows
        );
        
        cells.push(
          <div
            key={`${col}-${row}`}
            className={`cd-grid-cell ${isDropTarget ? (dropTarget.valid ? 'cd-drop-valid' : 'cd-drop-invalid') : ''} ${isOccupied ? 'cd-occupied' : ''}`}
            style={{
              gridColumn: col,
              gridRow: row
            }}
            onDragOver={(e) => handleDragOver(e, col, row)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, col, row)}
          />
        );
      }
    }
    
    return cells;
  };

  
  const renderPlacedWidgets = () => {
    return placedWidgets.map(widget => {
      const def = WIDGET_DEFINITIONS[widget.id];
      if (!def) return null;
      
      const Icon = def.icon;
      const isSelected = selectedWidget === widget.id;
      const isShaking = shakeWidget === widget.id;
      
      const handleWidgetClick = () => {
        if (isLayoutLocked) {
          triggerShake(widget.id);
          return;
        }
        setSelectedWidget(isSelected ? null : widget.id);
      };
      
      return (
        <div
          key={widget.id}
          className={`cd-placed-widget ${isSelected ? 'cd-selected' : ''} ${isShaking ? 'cd-shake' : ''} ${isLayoutLocked ? 'cd-locked' : ''}`}
          style={{
            gridColumn: `${widget.col} / span ${widget.cols}`,
            gridRow: `${widget.row} / span ${widget.rows}`,
            '--widget-color': widget.color || 'var(--accent)'
          }}
          draggable={!isLayoutLocked}
          onDragStart={(e) => handleDragStart(e, widget, 'grid')}
          onClick={handleWidgetClick}
        >
          <div className="cd-widget-drag-handle">
            {isLayoutLocked ? <Lock size={16} /> : <GripVertical size={16} />}
          </div>
          
          <div className="cd-widget-content">
            <Icon size={24} />
            <span className="cd-widget-title">{def.title}</span>
          </div>
          
          {isSelected && (
            <div className="cd-widget-controls">
              <div className="cd-controls-row">
                {!def.fixedSize && (
                  <>
                    <button 
                      className={`cd-size-btn ${getWidgetSizeLabel(widget) === 'S' ? 'active' : ''} ${def.minSize === 'M' || def.minSize === 'L' ? 'disabled' : ''}`}
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if (def.minSize !== 'M' && def.minSize !== 'L') {
                          setWidgetSize(widget.id, 'S'); 
                        }
                      }}
                      disabled={def.minSize === 'M' || def.minSize === 'L'}
                    >
                      S
                    </button>
                    <button 
                      className={`cd-size-btn ${getWidgetSizeLabel(widget) === 'M' ? 'active' : ''} ${def.minSize === 'L' ? 'disabled' : ''}`}
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if (def.minSize !== 'L') {
                          setWidgetSize(widget.id, 'M'); 
                        }
                      }}
                      disabled={def.minSize === 'L'}
                    >
                      M
                    </button>
                    <button 
                      className={`cd-size-btn ${getWidgetSizeLabel(widget) === 'L' ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setWidgetSize(widget.id, 'L'); }}
                    >
                      L
                    </button>
                    <div className="cd-controls-divider"></div>
                  </>
                )}
                <button 
                  className="cd-color-btn"
                  onClick={(e) => { e.stopPropagation(); setShowColorPicker(widget.id); }}
                >
                  <Palette size={14} />
                </button>
                {!def.mandatory && (
                  <button 
                    className="cd-remove-btn"
                    onClick={(e) => { e.stopPropagation(); removeWidget(widget.id); }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              
              {showColorPicker === widget.id && (
                <div className="cd-color-picker" onClick={(e) => e.stopPropagation()}>
                  {COLOR_PRESETS.map(preset => (
                    <button
                      key={preset.name}
                      className={`cd-color-option ${widget.color === preset.value ? 'cd-active' : ''}`}
                      style={{ '--preset-color': preset.value || 'var(--accent)' }}
                      onClick={() => setWidgetColor(widget.id, preset.value)}
                    >
                      {widget.color === preset.value && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="cd-page">
      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
      <header className="cd-header">
        <div className="cd-header-left">
          <span className="cd-logo" onClick={() => navigate('/search-hub')}>
            <img src="/logo.svg" alt="" style={{ height: '24px', marginRight: '8px', filter: 'brightness(0) saturate(100%) invert(77%) sepia(48%) saturate(456%) hue-rotate(359deg) brightness(95%) contrast(89%)' }} />
            cerbyl
          </span>
          <div className="cd-header-divider"></div>
          <span className="cd-subtitle">Customize Dashboard</span>
          {hasUnsavedChanges && <span className="cd-unsaved-badge">Unsaved</span>}
        </div>

        <div className="cd-header-right">
          <button className="cd-nav-btn cd-nav-btn-ghost" onClick={goBack}>
            <ChevronLeft size={16} />
            Back
          </button>
          {currentLayoutName !== 'Default' && (
            <button className="cd-nav-btn cd-nav-btn-ghost" onClick={resetToDefault}>
              <RotateCcw size={16} />
              Reset
            </button>
          )}
          <button className="cd-nav-btn cd-nav-btn-ghost" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            New layout
          </button>
          {currentLayoutName !== 'Default' && (
            <button className="cd-nav-btn cd-nav-btn-primary" onClick={() => saveLayout()}>
              <Save size={16} />
              Save
            </button>
          )}
        </div>
      </header>

      <div className="cd-main">
        <aside className="cd-sidebar">
          <div className="cd-sidebar-section">
            <h3>Available Widgets</h3>
            <p className="cd-sidebar-hint">Drag widgets to the grid</p>
            
            <div className="cd-available-list">
              {availableWidgets.map(widget => {
                const def = WIDGET_DEFINITIONS[widget.id];
                const Icon = def.icon;
                
                return (
                  <div
                    key={widget.id}
                    className="cd-available-widget"
                    draggable
                    onDragStart={(e) => handleDragStart(e, widget, 'available')}
                  >
                    <div className="cd-available-icon">
                      <Icon size={20} />
                    </div>
                    <div className="cd-available-info">
                      <span className="cd-available-title">{def.title}</span>
                      <span className="cd-available-desc">{def.description}</span>
                    </div>
                    <GripVertical size={16} className="cd-drag-indicator" />
                  </div>
                );
              })}
              
              {availableWidgets.length === 0 && (
                <div className="cd-empty-available">
                  All widgets are placed on the grid
                </div>
              )}
            </div>
          </div>
          
          <div className="cd-sidebar-section">
            <div className="cd-sidebar-section-header">
              <h3>Saved Layouts</h3>
              <button 
                className="cd-add-layout-btn"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus size={16} />
              </button>
            </div>
            
            <div className="cd-layouts-list">
              {savedLayouts.map((layout) => (
                <div
                  key={layout.name}
                  className={`cd-layout-item ${currentLayoutName === layout.name ? 'cd-active' : ''} ${layout.name === 'Default' ? 'cd-default-layout' : ''}`}
                >
                  <button
                    className="cd-layout-item-btn"
                    onClick={() => loadLayout(layout)}
                  >
                    {layout.name === 'Default' && <Lock size={12} className="cd-lock-icon" />}
                    {layout.name}
                    {currentLayoutName === layout.name && <Check size={14} />}
                  </button>
                  {layout.name !== 'Default' && (
                    <div className="cd-layout-actions">
                      <button
                        className="cd-layout-reset-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          resetLayoutToDefault(layout.name);
                        }}
                        title="Reset to default"
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        className="cd-layout-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(layout.name);
                        }}
                        title="Delete layout"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              
              {savedLayouts.length === 0 && (
                <div className="cd-empty-layouts">No saved layouts</div>
              )}
            </div>
          </div>
        </aside>

        <div className="cd-grid-container">
          <div className="cd-grid-info">
            <span>Current: <strong>{currentLayoutName}</strong></span>
            <span>{placedWidgets.length} widgets placed</span>
          </div>
          
          <div 
            className="cd-grid"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); resetDragState(); }}
          >
            {renderGridCells()}
            {renderPlacedWidgets()}
          </div>
          
          <div className="cd-grid-legend">
            <div className="cd-legend-item">
              <div className="cd-legend-color cd-legend-empty"></div>
              <span>Empty cell</span>
            </div>
            <div className="cd-legend-item">
              <div className="cd-legend-color cd-legend-valid"></div>
              <span>Valid drop</span>
            </div>
            <div className="cd-legend-item">
              <div className="cd-legend-color cd-legend-invalid"></div>
              <span>Invalid drop</span>
            </div>
          </div>
        </div>
      </div>

      {showSaveModal && (
        <div className="cd-modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="cd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cd-modal-header">
              <h3>Save Layout As</h3>
              <button onClick={() => setShowSaveModal(false)}><X size={20} /></button>
            </div>
            <div className="cd-modal-body">
              <label>Layout Name</label>
              <input
                type="text"
                value={newLayoutName}
                onChange={(e) => setNewLayoutName(e.target.value)}
                placeholder="Enter layout name..."
                autoFocus
              />
            </div>
            <div className="cd-modal-footer">
              <button className="cd-modal-cancel" onClick={() => setShowSaveModal(false)}>
                Cancel
              </button>
              <button 
                className="cd-modal-save" 
                onClick={() => newLayoutName.trim() && saveLayout(newLayoutName.trim())}
                disabled={!newLayoutName.trim()}
              >
                Save Layout
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="cd-modal-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div className="cd-modal cd-modal-small" onClick={(e) => e.stopPropagation()}>
            <div className="cd-modal-header">
              <h3>Delete Layout</h3>
              <button onClick={() => setShowDeleteConfirm(null)}><X size={20} /></button>
            </div>
            <div className="cd-modal-body">
              <p>Are you sure you want to delete "{showDeleteConfirm}"?</p>
            </div>
            <div className="cd-modal-footer">
              <button className="cd-modal-cancel" onClick={() => setShowDeleteConfirm(null)}>
                Cancel
              </button>
              <button 
                className="cd-modal-delete" 
                onClick={() => deleteLayout(showDeleteConfirm)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {alertModal.show && (
        <div className="cd-modal-overlay" onClick={() => setAlertModal({ show: false, message: '' })}>
          <div className="cd-modal cd-modal-small" onClick={(e) => e.stopPropagation()}>
            <div className="cd-modal-header">
              <h3>Notice</h3>
              <button onClick={() => setAlertModal({ show: false, message: '' })}><X size={20} /></button>
            </div>
            <div className="cd-modal-body">
              <p>{alertModal.message}</p>
            </div>
            <div className="cd-modal-footer">
              <button 
                className="cd-modal-save" 
                onClick={() => setAlertModal({ show: false, message: '' })}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal.show && (
        <div className="cd-modal-overlay" onClick={() => setConfirmModal({ show: false, message: '', onConfirm: null })}>
          <div className="cd-modal cd-modal-small" onClick={(e) => e.stopPropagation()}>
            <div className="cd-modal-header">
              <h3>Confirm</h3>
              <button onClick={() => setConfirmModal({ show: false, message: '', onConfirm: null })}><X size={20} /></button>
            </div>
            <div className="cd-modal-body">
              <p>{confirmModal.message}</p>
            </div>
            <div className="cd-modal-footer">
              <button 
                className="cd-modal-cancel" 
                onClick={() => setConfirmModal({ show: false, message: '', onConfirm: null })}
              >
                Cancel
              </button>
              <button 
                className="cd-modal-save" 
                onClick={confirmModal.onConfirm}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="cd-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="cd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cd-modal-header">
              <h3>Create New Layout</h3>
              <button onClick={() => setShowCreateModal(false)}><X size={20} /></button>
            </div>
            <div className="cd-modal-body">
              <label>Layout Name</label>
              <input
                type="text"
                value={newLayoutName}
                onChange={(e) => setNewLayoutName(e.target.value)}
                placeholder="Enter layout name..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newLayoutName.trim()) {
                    createNewLayout(newLayoutName.trim());
                  }
                }}
              />
              <p className="cd-modal-hint">New layouts start completely empty - drag widgets from the sidebar to build your custom layout</p>
            </div>
            <div className="cd-modal-footer">
              <button className="cd-modal-cancel" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button 
                className="cd-modal-save" 
                onClick={() => newLayoutName.trim() && createNewLayout(newLayoutName.trim())}
                disabled={!newLayoutName.trim()}
              >
                Create Layout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomizeDashboard;
