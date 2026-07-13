import React, { useState, useRef, useEffect, useCallback } from 'react';
import { sanitizeHtml, sanitizeUrl } from '../utils/sanitize';
import { createPortal } from 'react-dom';
import {
  Type, Heading1, Heading2, Heading3, List, ListOrdered,
  CheckSquare, Code, Quote, AlertCircle, ChevronRight,
  Minus, GripVertical, Plus, Trash2, MoreVertical, Copy,
  ArrowUp, ArrowDown, Image, Link2, Table, FileText,
  Lightbulb, Star, Zap, BookOpen, Calendar, Tag,
  Hash, AtSign, MapPin, Clock, Paperclip, Palette,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Indent, Outdent, Columns, Youtube, ExternalLink,
  GitBranch, X, Minimize2, Download, ArrowRight, Pen
} from 'lucide-react';
import './BlockEditor.css';
import CodeBlock from './CodeBlock';
import TableBlock from './TableBlock';
import FileViewer from './FileViewer';
import MathRenderer from './MathRenderer';

const BLOCK_TYPES = [
  
  { type: 'paragraph', label: 'Text', icon: Type, description: 'Plain text paragraph', category: 'Basic' },
  { type: 'heading1', label: 'Heading 1', icon: Heading1, description: 'Large section heading', category: 'Basic' },
  { type: 'heading2', label: 'Heading 2', icon: Heading2, description: 'Medium section heading', category: 'Basic' },
  { type: 'heading3', label: 'Heading 3', icon: Heading3, description: 'Small section heading', category: 'Basic' },
  
  
  { type: 'bulletList', label: 'Bullet list', icon: List, description: 'Unordered list', category: 'Lists' },
  { type: 'numberedList', label: 'Numbered list', icon: ListOrdered, description: 'Ordered list', category: 'Lists' },
  { type: 'todo', label: 'To-do', icon: CheckSquare, description: 'Checkbox list item', category: 'Lists' },
  
  
  { type: 'code', label: 'Code', icon: Code, description: 'Code block with syntax', category: 'Advanced' },
  { type: 'quote', label: 'Quote', icon: Quote, description: 'Blockquote', category: 'Advanced' },
  { type: 'callout', label: 'Callout', icon: AlertCircle, description: 'Highlighted info box', category: 'Advanced' },
  { type: 'toggle', label: 'Toggle', icon: ChevronRight, description: 'Collapsible section', category: 'Advanced' },
  { type: 'table', label: 'Table', icon: Table, description: 'Structured data table', category: 'Advanced' },
  { type: 'canvas', label: 'Canvas', icon: Pen, description: 'Freehand sketch block', category: 'Media' },
  
  
  { type: 'divider', label: 'Divider', icon: Minus, description: 'Horizontal line', category: 'Special' },
  { type: 'image', label: 'Image', icon: Image, description: 'Embed an image', category: 'Media' },
  { type: 'file', label: 'File', icon: Paperclip, description: 'Attach PDF or Word doc', category: 'Media' },
  { type: 'link', label: 'Link', icon: Link2, description: 'Bookmark or link', category: 'Special' },
  
  
  { type: 'info', label: 'Info', icon: Lightbulb, description: 'Information callout', category: 'Callouts' },
  { type: 'warning', label: 'Warning', icon: AlertCircle, description: 'Warning callout', category: 'Callouts' },
  { type: 'success', label: 'Success', icon: Star, description: 'Success callout', category: 'Callouts' },
  { type: 'tip', label: 'Tip', icon: Zap, description: 'Tip or hint', category: 'Callouts' },
  
  
  { type: 'page', label: 'Page', icon: FileText, description: 'Sub-page reference', category: 'Organization' },
  { type: 'bookmark', label: 'Bookmark', icon: BookOpen, description: 'Bookmark link', category: 'Organization' },
  { type: 'date', label: 'Date', icon: Calendar, description: 'Date mention', category: 'Organization' },
  { type: 'tag', label: 'Tag', icon: Tag, description: 'Tag or label', category: 'Organization' },
  
  
  { type: 'column', label: 'Column', icon: Columns, description: 'Single column block', category: 'Layout' },
  { type: 'row', label: 'Row', icon: Minus, description: 'Horizontal row container', category: 'Layout' },
  
  
  { type: 'youtube', label: 'YouTube', icon: Youtube, description: 'Embed YouTube video', category: 'Embeds' },
  { type: 'embed', label: 'Embed', icon: ExternalLink, description: 'Embed external content', category: 'Embeds' },
  { type: 'mermaid', label: 'Mermaid', icon: GitBranch, description: 'Flowchart diagram', category: 'Advanced' },
];

const MermaidBlock = ({ block, updateBlock, readOnly, darkMode }) => {
  const [showPreview, setShowPreview] = React.useState(false);
  const [renderError, setRenderError] = React.useState(null);
  const mermaidRef = React.useRef(null);
  const [mermaid, setMermaid] = React.useState(null);
  const [renderedSvg, setRenderedSvg] = React.useState('');
  const [isRendering, setIsRendering] = React.useState(false);

  const isMermaidErrorSvg = React.useCallback((svg) => {
    const raw = String(svg || '');
    if (!raw) return true;
    return /class=["']error-text["']|syntax error in text|parse error|lexical error|mermaid version/i.test(raw);
  }, []);

  
  React.useEffect(() => {
    let mounted = true;
    import('mermaid').then((m) => {
      if (!mounted) return;
      const instance = m.default;
      instance.initialize({ 
        startOnLoad: false,
        theme: darkMode ? 'dark' : 'default',
        securityLevel: 'loose',
      });
      setMermaid(instance);
    });
    return () => { mounted = false; };
  }, []);

  React.useEffect(() => {
    if (!mermaid) return;
    mermaid.initialize({
      startOnLoad: false,
      theme: darkMode ? 'dark' : 'default',
      securityLevel: 'loose',
    });
  }, [mermaid, darkMode]);

  
  React.useEffect(() => {
    if (!showPreview) return;
    if (!block.content || !mermaidRef.current || !mermaid) return;
    let cancelled = false;
    const renderDiagram = async () => {
      try {
        setRenderError(null);
        setIsRendering(true);
        mermaidRef.current.innerHTML = '';
        const timestamp = Date.now();
        const randomArr = new Uint32Array(1);
        crypto.getRandomValues(randomArr);
        const id = `mermaid_${timestamp}_${randomArr[0]}`;
        const { svg } = await mermaid.render(id, block.content);
        if (isMermaidErrorSvg(svg)) {
          throw new Error('Invalid Mermaid syntax');
        }
        if (cancelled) return;
        mermaidRef.current.innerHTML = sanitizeHtml(svg);
        setRenderedSvg(svg);
      } catch (error) {
        if (cancelled) return;
        setRenderError(error.message || 'Invalid diagram syntax');
        setRenderedSvg('');
        if (mermaidRef.current) {
          mermaidRef.current.innerHTML = '';
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    };
    renderDiagram();
    return () => { cancelled = true; };
  }, [showPreview, block.content, mermaid, darkMode, isMermaidErrorSvg]);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(block.content || '');
    } catch (error) {
    // silenced
  }
  };

  const handleCopySvg = async () => {
    if (!renderedSvg) return;
    try {
      await navigator.clipboard.writeText(renderedSvg);
    } catch (error) {
    // silenced
  }
  };

  const handleDownloadSvg = () => {
    if (!renderedSvg) return;
    const blob = new Blob([renderedSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'diagram.svg';
    link.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="block-mermaid-wrapper">
      <div className="mermaid-header">
        <GitBranch size={18} />
        <span>Mermaid Diagram</span>
        <div className="mermaid-actions">
          <button
            className="mermaid-toggle-btn"
            onClick={handleCopyCode}
            title="Copy code"
            disabled={!block.content}
          >
            Copy Code
          </button>
          <button
            className="mermaid-toggle-btn"
            onClick={handleCopySvg}
            title="Copy SVG"
            disabled={!renderedSvg}
          >
            Copy SVG
          </button>
          <button
            className="mermaid-toggle-btn"
            onClick={handleDownloadSvg}
            title="Download SVG"
            disabled={!renderedSvg}
          >
            Download
          </button>
          <button
            className="mermaid-toggle-btn"
            onClick={() => setShowPreview(!showPreview)}
            title={showPreview ? "Show code" : "Show preview"}
          >
            {showPreview ? <Code size={14} /> : <span>👁️</span>}
            {showPreview ? "Code" : "Preview"}
          </button>
        </div>
      </div>
      {!showPreview ? (
        <div className="mermaid-code-editor">
          <textarea
            value={block.content || ''}
            onChange={(e) => {
              if (readOnly) return;
              updateBlock(block.id, { content: e.target.value });
            }}
            placeholder="graph TD&#10;    A[Start] --> B{Decision}&#10;    B -->|Yes| C[End]&#10;    B -->|No| D[Continue]"
            className="mermaid-textarea"
            readOnly={readOnly}
            rows={8}
          />
        </div>
      ) : (
        <div className="mermaid-preview">
          {block.content ? (
            <div className="mermaid-render">
              {renderError ? (
                <div className="mermaid-error">
                  <strong>Error:</strong> {renderError}
                </div>
              ) : isRendering ? (
                <div className="mermaid-empty">Rendering diagram...</div>
              ) : (
                <div ref={mermaidRef} className="mermaid-diagram" />
              )}
            </div>
          ) : (
            <div className="mermaid-empty">No diagram code yet</div>
          )}
        </div>
      )}
    </div>
  );
};

const SimpleBlockEditor = ({
  blocks,
  onChange,
  readOnly = false,
  darkMode = false,
  onOpenCanvas,
  focusBlockId,
  typingFontFamily = "'Inter', sans-serif",
  typingTextColor = null,
  typingFontSize = null
}) => {
  const [hoveredBlockId, setHoveredBlockId] = useState(null);
  const [showBlockMenu, setShowBlockMenu] = useState(null);
  const [blockMenuPosition, setBlockMenuPosition] = useState({ top: 0, left: 0 });
  const [draggedBlockId, setDraggedBlockId] = useState(null);
  const [dropIndicator, setDropIndicator] = useState(null); 
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
  const [activeBlockId, setActiveBlockId] = useState(null);
  const [selectedMenuIndex, setSelectedMenuIndex] = useState(0);
  const [viewingFile, setViewingFile] = useState(null);
  const [lastKeyPress, setLastKeyPress] = useState({ key: '', time: 0 });
  const [showStyleMenu, setShowStyleMenu] = useState(null);
  const [styleMenuPosition, setStyleMenuPosition] = useState({ top: 0, left: 0 });
  const [columnMenuOpen, setColumnMenuOpen] = useState({}); 
  const blockRefs = useRef({});
  const blockWrapperRefs = useRef({});
  const slashMenuRef = useRef(null);
  const draggedBlockIdRef = useRef(null);
  const styleMenuRef = useRef(null);
  const menuCloseTimeoutRef = useRef(null);
  const focusHandledRef = useRef(null);
  const showBlockMenuRef = useRef(null);

  
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showBlockMenu && !e.target.closest('.sbe-dropdown-menu') && !e.target.closest('.block-menu-dropdown') && !e.target.closest('.block-control-btn')) {
        setShowBlockMenu(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBlockMenu]);

  const updateBlock = useCallback((blockId, updates) => {
    const newBlocks = blocks.map(b =>
      b.id === blockId ? { ...b, ...updates } : b
    );
    onChange(newBlocks);
  }, [blocks, onChange]);

  const handleFileUpload = async (blockId, file) => {
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:8000'}/api/upload-attachment`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const data = await response.json();
      
      updateBlock(blockId, {
        properties: {
          fileName: data.filename,
          fileUrl: data.url,
          fileSize: data.size,
          fileType: data.type
        }
      });
    } catch (error) {
            alert('Failed to upload file');
    }
  };

  const addBlock = useCallback((index, parentId = null) => {
    const newBlock = {
      id: Date.now() + Math.random(),
      type: 'paragraph',
      content: '',
      properties: {
        style: {
          fontFamily: typingFontFamily
        }
      },
      parent_block_id: parentId
    };
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    onChange(newBlocks);
    setTimeout(() => blockRefs.current[newBlock.id]?.focus(), 0);
  }, [blocks, onChange, typingFontFamily]);

  const handleCanvasAction = useCallback((targetBlock) => {
    if (!targetBlock) return;
    if (targetBlock.type === 'canvas') {
      onOpenCanvas?.(targetBlock.id);
      return;
    }
    const newBlock = {
      id: Date.now() + Math.random(),
      type: 'canvas',
      content: '',
      properties: {},
      parent_block_id: targetBlock.parent_block_id || null
    };
    const allBlocks = [...blocks];
    const targetIndex = allBlocks.findIndex(b => b.id === targetBlock.id);
    if (targetIndex === -1) return;
    allBlocks.splice(targetIndex + 1, 0, newBlock);
    onChange(allBlocks);
    setTimeout(() => onOpenCanvas?.(newBlock.id), 0);
  }, [blocks, onChange, onOpenCanvas]);

  const indentBlock = useCallback((blockId) => {
    const index = blocks.findIndex(b => b.id === blockId);
    if (index <= 0) return; 
    
    const prevBlock = blocks[index - 1];
    updateBlock(blockId, { parent_block_id: prevBlock.id });
  }, [blocks, updateBlock]);

  const outdentBlock = useCallback((blockId) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block?.parent_block_id) return; 
    
    const parentBlock = blocks.find(b => b.id === block.parent_block_id);
    updateBlock(blockId, { parent_block_id: parentBlock?.parent_block_id || null });
  }, [blocks, updateBlock]);

  const deleteBlock = useCallback((blockId) => {
    if (blocks.length === 1) return;
    const index = blocks.findIndex(b => b.id === blockId);
    const newBlocks = blocks.filter(b => b.id !== blockId);
    onChange(newBlocks);
    if (index > 0) {
      setTimeout(() => blockRefs.current[blocks[index - 1].id]?.focus(), 0);
    }
  }, [blocks, onChange]);

  const duplicateBlock = useCallback((blockId) => {
    const index = blocks.findIndex(b => b.id === blockId);
    const block = blocks[index];
    const newBlock = { ...block, id: Date.now() + Math.random() };
    const newBlocks = [...blocks];
    newBlocks.splice(index + 1, 0, newBlock);
    onChange(newBlocks);
  }, [blocks, onChange]);

  const moveBlock = useCallback((blockId, direction) => {
    const index = blocks.findIndex(b => b.id === blockId);
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === blocks.length - 1)) return;
    
    const newBlocks = [...blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
    onChange(newBlocks);
  }, [blocks, onChange]);

  const handleEditableLinkClick = useCallback((event) => {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const anchor = target?.closest?.('a[href]');
    if (!anchor || !event.currentTarget.contains(anchor)) return;

    const safeHref = sanitizeUrl(anchor.getAttribute('href'));
    if (!safeHref) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    window.open(safeHref, '_blank', 'noopener,noreferrer');
  }, []);

  const insertTextWithTypingFont = useCallback((editable, text) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editable) return false;

    const range = selection.getRangeAt(0);
    if (!editable.contains(range.commonAncestorContainer)) return false;

    range.deleteContents();
    const currentTextNode = range.collapsed && range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer
      : null;
    const currentFontRun = currentTextNode?.parentElement;
    const runColor = typingTextColor || '';
    const runSize = typingFontSize || '';

    if (
      currentFontRun?.dataset?.noteFont === typingFontFamily &&
      (currentFontRun?.dataset?.noteColor || '') === runColor &&
      (currentFontRun?.dataset?.noteSize || '') === runSize &&
      editable.contains(currentFontRun)
    ) {
      const nextOffset = range.startOffset + text.length;
      currentTextNode.insertData(range.startOffset, text);
      range.setStart(currentTextNode, nextOffset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      editable.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    const fontSpan = document.createElement('span');
    fontSpan.style.fontFamily = typingFontFamily;
    fontSpan.dataset.noteFont = typingFontFamily;
    if (typingTextColor) {
      fontSpan.style.color = typingTextColor;
      fontSpan.dataset.noteColor = typingTextColor;
    }
    if (typingFontSize) {
      fontSpan.style.fontSize = typingFontSize;
      fontSpan.dataset.noteSize = typingFontSize;
    }
    const textNode = document.createTextNode(text);
    fontSpan.appendChild(textNode);
    range.insertNode(fontSpan);

    range.setStart(textNode, textNode.data.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    editable.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, [typingFontFamily, typingTextColor, typingFontSize]);

  const handleNativeBeforeInput = useCallback((event, editable) => {
    if (
      readOnly ||
      event.isComposing ||
      event.inputType !== 'insertText' ||
      event.data === null ||
      event.data === undefined
    ) {
      return;
    }

    if (insertTextWithTypingFont(editable, event.data)) {
      event.preventDefault();
    }
  }, [insertTextWithTypingFont, readOnly]);

  const handleKeyDown = (e, blockId, index) => {
    
    if (showSlashMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMenuIndex(prev => (prev + 1) % BLOCK_TYPES.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMenuIndex(prev => (prev - 1 + BLOCK_TYPES.length) % BLOCK_TYPES.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const selectedType = BLOCK_TYPES[selectedMenuIndex];
        const el = blockRefs.current[blockId];
        
        if (el) {
          
          const content = el.textContent.replace(/\/$/, '').trim();
          el.textContent = content;
          
          
          updateBlock(blockId, { type: selectedType.type, content });
          
          
          setShowSlashMenu(false);
          
          
          setTimeout(() => {
            el.focus();
            const range = document.createRange();
            const sel = window.getSelection();
            if (el.childNodes.length > 0) {
              range.selectNodeContents(el);
              range.collapse(false);
            } else {
              range.setStart(el, 0);
              range.setEnd(el, 0);
            }
            sel.removeAllRanges();
            sel.addRange(range);
          }, 0);
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
        
        const el = blockRefs.current[blockId];
        if (el) {
          const content = el.textContent.replace(/\/$/, '');
          el.textContent = content;
          updateBlock(blockId, { content });
        }
        return;
      }
      return;
    }

    
    const now = Date.now();
    if (e.key === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const el = blockRefs.current[blockId];
      
      if (el && (el.textContent === '' || window.getSelection()?.anchorOffset === 0)) {
        if (lastKeyPress.key === 'd' && (now - lastKeyPress.time) < 500) {
          
          e.preventDefault();
          deleteBlock(blockId);
          setLastKeyPress({ key: '', time: 0 });
          return;
        } else {
          setLastKeyPress({ key: 'd', time: now });
        }
      }
    } else if (e.key !== 'd') {
      setLastKeyPress({ key: '', time: 0 });
    }

    
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      switch(e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          document.execCommand('bold');
          return;
        case 'i':
          e.preventDefault();
          document.execCommand('italic');
          return;
        case 'u':
          e.preventDefault();
          document.execCommand('underline');
          return;
        case 'e':
          e.preventDefault();
          document.execCommand('insertHTML', false, '<code>' + window.getSelection().toString() + '</code>');
          return;
        default:
          break;
      }
    }

    if (
      e.key === ' ' &&
      !e.isComposing &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      const editable = blockRefs.current[blockId];
      if (insertTextWithTypingFont(editable, ' ')) {
        e.preventDefault();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addBlock(index);
    } else if (e.key === 'Backspace') {
      const el = blockRefs.current[blockId];
      if (el && el.textContent === '') {
        e.preventDefault();
        deleteBlock(blockId);
      }
    }
  };

  const handleInput = (e, blockId) => {
    const content = e.currentTarget.innerHTML || '';
    
    
    const trimmedContent = content.trim();
    
    
    if (trimmedContent.endsWith(' ') && content.length > 1) {
      const beforeSpace = trimmedContent.slice(0, -1);
      
      
      if (beforeSpace === '#') {
        updateBlock(blockId, { type: 'heading1', content: '' });
        e.currentTarget.textContent = '';
        return;
      } else if (beforeSpace === '##') {
        updateBlock(blockId, { type: 'heading2', content: '' });
        e.currentTarget.textContent = '';
        return;
      } else if (beforeSpace === '###') {
        updateBlock(blockId, { type: 'heading3', content: '' });
        e.currentTarget.textContent = '';
        return;
      }
      
      else if (beforeSpace === '-' || beforeSpace === '*') {
        updateBlock(blockId, { type: 'bulletList', content: '' });
        e.currentTarget.textContent = '';
        return;
      } else if (beforeSpace === '1.' || beforeSpace.match(/^\d+\.$/)) {
        updateBlock(blockId, { type: 'numberedList', content: '' });
        e.currentTarget.textContent = '';
        return;
      }
      
      else if (beforeSpace === '[]' || beforeSpace === '[ ]') {
        updateBlock(blockId, { type: 'todo', content: '', properties: { checked: false } });
        e.currentTarget.textContent = '';
        return;
      }
      
      else if (beforeSpace === '>') {
        updateBlock(blockId, { type: 'quote', content: '' });
        e.currentTarget.textContent = '';
        return;
      }
      
      else if (beforeSpace === '```') {
        updateBlock(blockId, { type: 'code', content: '' });
        e.currentTarget.textContent = '';
        return;
      }
      
      else if (beforeSpace === '---' || beforeSpace === '***') {
        updateBlock(blockId, { type: 'divider', content: '' });
        e.currentTarget.textContent = '';
        return;
      }
    }
    
    
    const lastChar = content[content.length - 1];
    const beforeLastChar = content[content.length - 2];
    
    if (lastChar === '/' && (!beforeLastChar || beforeLastChar === ' ' || content.length === 1)) {
      
      const el = blockRefs.current[blockId];
      if (el) {
        const rect = el.getBoundingClientRect();
        setSlashMenuPosition({ top: rect.bottom + 4, left: rect.left });
      }
      setShowSlashMenu(true);
      setActiveBlockId(blockId);
      setSelectedMenuIndex(0);
    } else if (showSlashMenu && !content.includes('/')) {
      setShowSlashMenu(false);
    }
    
    
    updateBlock(blockId, { content });
  };

  const handleDragStart = useCallback((e, blockId) => {
    
    e.stopPropagation();
    
    
    draggedBlockIdRef.current = blockId;
    setDraggedBlockId(blockId);
    
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', blockId.toString());
    
    
    const blockWrapper = blockWrapperRefs.current[blockId];
    if (blockWrapper) {
      const rect = blockWrapper.getBoundingClientRect();
      
      
      const clone = blockWrapper.cloneNode(true);
      clone.style.position = 'absolute';
      clone.style.top = '-9999px';
      clone.style.left = '-9999px';
      clone.style.width = `${rect.width}px`;
      clone.style.background = '#1a1a1a';
      clone.style.color = '#ffffff';
      clone.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      clone.style.borderRadius = '6px';
      clone.style.padding = '8px 12px';
      clone.style.opacity = '0.95';
      clone.style.pointerEvents = 'none';
      clone.id = 'drag-ghost';
      
      
      const allElements = clone.querySelectorAll('*');
      allElements.forEach(el => {
        el.style.color = '#ffffff';
      });
      
      document.body.appendChild(clone);
      
      
      e.dataTransfer.setDragImage(clone, 20, rect.height / 2);
      
      
      requestAnimationFrame(() => {
        setTimeout(() => {
          const ghost = document.getElementById('drag-ghost');
          if (ghost) {
            document.body.removeChild(ghost);
          }
        }, 0);
      });
    }
  }, []);

  const handleDragOver = useCallback((e, targetBlockId) => {
    e.preventDefault();
    e.stopPropagation();
    
    const draggedId = draggedBlockIdRef.current;
    if (!draggedId || draggedId === targetBlockId) {
      return;
    }
    
    e.dataTransfer.dropEffect = 'move';
    
    
    const blockWrapper = blockWrapperRefs.current[targetBlockId];
    if (blockWrapper) {
      const rect = blockWrapper.getBoundingClientRect();
      const mouseY = e.clientY;
      const midpoint = rect.top + rect.height / 2;
      
      
      const snapZone = rect.height * 0.3;
      const distanceFromTop = mouseY - rect.top;
      const distanceFromBottom = rect.bottom - mouseY;
      
      let position;
      let inSnapZone = false;
      
      if (distanceFromTop < snapZone) {
        position = 'above';
        inSnapZone = true;
      } else if (distanceFromBottom < snapZone) {
        position = 'below';
        inSnapZone = true;
      } else {
        position = mouseY < midpoint ? 'above' : 'below';
      }
      
      
      if (inSnapZone) {
        blockWrapper.classList.add('in-snap-zone');
      } else {
        blockWrapper.classList.remove('in-snap-zone');
      }
      
      setDropIndicator({ blockId: targetBlockId, position });
    }
  }, []);

  const handleDragEnter = useCallback((e, targetBlockId) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    
    
    Object.values(blockWrapperRefs.current).forEach(wrapper => {
      if (wrapper) {
        wrapper.classList.remove('in-snap-zone');
      }
    });
    
    
    const relatedTarget = e.relatedTarget;
    const currentTarget = e.currentTarget;
    
    if (!currentTarget.contains(relatedTarget)) {
      setDropIndicator(null);
    }
  }, []);

  const handleDrop = useCallback((e, targetBlockId) => {
    e.preventDefault();
    e.stopPropagation();
    
    const draggedId = draggedBlockIdRef.current;
    
    if (!draggedId || draggedId === targetBlockId) {
      draggedBlockIdRef.current = null;
      setDraggedBlockId(null);
      setDropIndicator(null);
      return;
    }
    
    const dragIndex = blocks.findIndex(b => b.id === draggedId);
    let targetIndex = blocks.findIndex(b => b.id === targetBlockId);
    
    if (dragIndex === -1 || targetIndex === -1) {
      draggedBlockIdRef.current = null;
      setDraggedBlockId(null);
      setDropIndicator(null);
      return;
    }
    
    
    if (dropIndicator?.position === 'below') {
      targetIndex += 1;
    }
    
    
    if (dragIndex < targetIndex) {
      targetIndex -= 1;
    }
    
    const newBlocks = [...blocks];
    const [draggedBlock] = newBlocks.splice(dragIndex, 1);
    newBlocks.splice(targetIndex, 0, draggedBlock);
    
    
    const targetWrapper = blockWrapperRefs.current[draggedBlock.id];
    if (targetWrapper) {
      targetWrapper.classList.add('magnetic-snap');
      setTimeout(() => {
        targetWrapper.classList.remove('magnetic-snap');
      }, 400);
    }
    
    onChange(newBlocks);
    
    draggedBlockIdRef.current = null;
    setDraggedBlockId(null);
    setDropIndicator(null);
  }, [blocks, onChange, dropIndicator]);

  const handleDragEnd = useCallback(() => {
    
    Object.values(blockWrapperRefs.current).forEach(wrapper => {
      if (wrapper) {
        wrapper.classList.remove('in-snap-zone');
      }
    });
    
    draggedBlockIdRef.current = null;
    setDraggedBlockId(null);
    setDropIndicator(null);
  }, []);

  
  const handleEditorDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleEditorDrop = useCallback((e) => {
    e.preventDefault();
    
    draggedBlockIdRef.current = null;
    setDraggedBlockId(null);
    setDropIndicator(null);
  }, []);

  
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (slashMenuRef.current && !slashMenuRef.current.contains(e.target) && !e.target.closest('.sbe-slash-menu')) {
        setShowSlashMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showBlockMenu && !e.target.closest('.sbe-dropdown-menu') && !e.target.closest('.block-menu-dropdown') && !e.target.closest('.block-control-btn')) {
        setShowBlockMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBlockMenu]);

  
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showStyleMenu && styleMenuRef.current && !styleMenuRef.current.contains(e.target)) {
        setShowStyleMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStyleMenu]);

  useEffect(() => {
    if (!focusBlockId) return;
    if (focusHandledRef.current === focusBlockId) return;
    focusHandledRef.current = focusBlockId;
    requestAnimationFrame(() => {
      const target = blockRefs.current[focusBlockId];
      if (target && typeof target.focus === 'function') {
        target.focus();
      }
    });
  }, [focusBlockId, blocks]);

  useEffect(() => {
    showBlockMenuRef.current = showBlockMenu;
  }, [showBlockMenu]);

  const renderBlockContent = (block) => {
    
    if (block.type === 'code') {
      return (
        <CodeBlock
          code={block.content || ''}
          language={block.properties?.language || 'javascript'}
          onChange={(newCode, newLang) => {
            updateBlock(block.id, {
              content: newCode,
              properties: { ...block.properties, language: newLang }
            });
          }}
          readOnly={readOnly}
        />
      );
    }

    
    if (block.type === 'table') {
      return (
        <TableBlock
          data={block.properties?.tableData || {}}
          onChange={(tableData) => {
            updateBlock(block.id, {
              properties: { ...block.properties, tableData }
            });
          }}
          readOnly={readOnly}
        />
      );
    }

    const handleContentInput = (e) => {
      const selection = window.getSelection();
      const hasSelection = selection && selection.rangeCount > 0;
      const range = hasSelection ? selection.getRangeAt(0) : null;
      const cursorOffset = range?.startOffset;
      const cursorNode = range?.startContainer;
      
      handleInput(e, block.id);
      
      if (!cursorNode || cursorOffset === undefined) return;

      requestAnimationFrame(() => {
        try {
          const newRange = document.createRange();
          const newSelection = window.getSelection();
          newRange.setStart(cursorNode, cursorOffset);
          newRange.collapse(true);
          newSelection.removeAllRanges();
          newSelection.addRange(newRange);
        } catch (err) { /* silenced */ }
      });
    };
    
    
    const blockStyle = block.properties?.style || {};
    const customStyle = {
      backgroundColor: blockStyle.backgroundColor || 'transparent',
      color: darkMode ? '#ffffff' : (blockStyle.color || 'inherit'),
      textAlign: blockStyle.textAlign || 'left',
      padding: blockStyle.spacing === 'compact' ? '2px' : blockStyle.spacing === 'relaxed' ? '8px' : '4px',
      fontFamily: blockStyle.fontFamily || 'inherit',
    };
    
    
    const hasLatex = block.content && (block.content.includes('$') || block.content.includes('\\(') || block.content.includes('\\['));
    
    const props = {
      ref: (el) => { 
        blockRefs.current[block.id] = el;
        
        if (el) {
          el.onbeforeinput = (event) => handleNativeBeforeInput(event, el);
          if (el.innerHTML !== block.content) {
            el.innerHTML = sanitizeHtml(block.content);
          }
        }
      },
      contentEditable: !readOnly && block.type !== 'divider',
      suppressContentEditableWarning: true,
      onClick: handleEditableLinkClick,
      onInput: handleContentInput,
      onBlur: (e) => {
        const content = (e.currentTarget.innerHTML || '').replace(/\u200B/g, '');
        if (content !== block.content) {
          updateBlock(block.id, { content });
        }
      },
      onKeyDown: (e) => handleKeyDown(e, block.id, blocks.findIndex(b => b.id === block.id)),
      className: `block-content block-${block.type}`,
      'data-placeholder': block.content ? '' : `Type something...`,
      style: customStyle
    };

    
    if (hasLatex) {
      const ContentTag = block.type === 'heading1' ? 'h1' : 
                         block.type === 'heading2' ? 'h2' : 
                         block.type === 'heading3' ? 'h3' : 
                         block.type === 'quote' ? 'blockquote' : 'div';
      
      return (
        <ContentTag 
          className={`block-content block-${block.type}`} 
          style={customStyle}
          contentEditable={!readOnly && block.type !== 'divider'}
          suppressContentEditableWarning={true}
          onClick={handleEditableLinkClick}
          onInput={handleContentInput}
          onBlur={(e) => {
            const content = (e.currentTarget.innerHTML || '').replace(/\u200B/g, '');
            if (content !== block.content) {
              updateBlock(block.id, { content });
            }
          }}
          onKeyDown={(e) => handleKeyDown(e, block.id, blocks.findIndex(b => b.id === block.id))}
          ref={(el) => { 
            blockRefs.current[block.id] = el;
            if (el) {
              el.onbeforeinput = (event) => handleNativeBeforeInput(event, el);
            }
          }}
        >
          <MathRenderer content={block.content} />
        </ContentTag>
      );
    }

    switch (block.type) {
      case 'heading1':
        return <h1 {...props} />;
      case 'heading2':
        return <h2 {...props} />;
      case 'heading3':
        return <h3 {...props} />;
      case 'quote':
        return <blockquote {...props} />;
      case 'callout':
        return (
          <div className="block-callout-inner">
            <AlertCircle size={20} />
            <div {...props} />
          </div>
        );
      case 'divider':
        return <hr className="block-divider-line" />;
      case 'file':
        return (
          <div className="block-file-inner">
            {!block.properties?.fileUrl ? (
              <div className="file-upload-zone">
                <input
                  type="file"
                  accept=".pdf,.docx,.doc"
                  onChange={(e) => handleFileUpload(block.id, e.target.files[0])}
                  style={{ display: 'none' }}
                  id={`file-input-${block.id}`}
                  disabled={readOnly}
                />
                <label htmlFor={`file-input-${block.id}`} className="file-upload-label">
                  <Paperclip size={20} />
                  <span>Click to upload PDF or Word document</span>
                </label>
              </div>
            ) : (
              <div className="file-attachment">
                <FileText size={24} className="file-icon" />
                <div 
                  className="file-details"
                  onClick={() => setViewingFile({
                    url: block.properties.fileUrl,
                    name: block.properties.fileName,
                    type: block.properties.fileType
                  })}
                  style={{ cursor: 'pointer' }}
                >
                  <span className="file-name">
                    {block.properties.fileName}
                  </span>
                  <span className="file-size">
                    {(block.properties.fileSize / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
                {!readOnly && (
                  <button
                    className="file-remove-btn"
                    onClick={() => updateBlock(block.id, { properties: {} })}
                    title="Remove file"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      case 'todo':
        return (
          <div className="block-todo-inner">
            <input
              type="checkbox"
              checked={block.properties?.checked || false}
              onChange={(e) => updateBlock(block.id, {
                properties: { ...block.properties, checked: e.target.checked }
              })}
            />
            <div {...props} />
          </div>
        );
      case 'toggle':
        return (
          <div className="block-toggle-inner">
            <button
              className="toggle-button"
              onClick={() => updateBlock(block.id, {
                properties: { ...block.properties, expanded: !block.properties?.expanded }
              })}
            >
              <ChevronRight 
                size={16} 
                style={{ 
                  transform: block.properties?.expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s'
                }}
              />
            </button>
            <div {...props} />
          </div>
        );
      case 'info':
        return (
          <div className="block-callout-inner block-info">
            <Lightbulb size={20} />
            <div {...props} />
          </div>
        );
      case 'warning':
        return (
          <div className="block-callout-inner block-warning">
            <AlertCircle size={20} />
            <div {...props} />
          </div>
        );
      case 'success':
        return (
          <div className="block-callout-inner block-success">
            <Star size={20} />
            <div {...props} />
          </div>
        );
      case 'tip':
        return (
          <div className="block-callout-inner block-tip">
            <Zap size={20} />
            <div {...props} />
          </div>
        );
      case 'image':
        return (
          <div className="block-image-wrapper">
            <Image size={48} style={{ opacity: 0.3 }} />
            <div {...props} placeholder="Add image URL or description..." />
          </div>
        );
      case 'link':
        return (
          <div className="block-link-wrapper">
            <Link2 size={16} />
            <div {...props} placeholder="Paste link..." />
          </div>
        );
      case 'table':
        return (
          <div className="block-table-wrapper">
            <Table size={16} />
            <div {...props} placeholder="Table content..." />
          </div>
        );
      case 'canvas': {
        const preview = block.properties?.canvasPreview;
        return (
          <div
            className="block-canvas-wrapper"
            ref={(el) => {
              blockRefs.current[block.id] = el;
            }}
            tabIndex={0}
          >
            <div
              className="block-canvas-preview"
              role="button"
              tabIndex={0}
              onClick={() => onOpenCanvas?.(block.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenCanvas?.(block.id);
                }
              }}
            >
              {preview ? (
                <img src={preview} alt="Canvas preview" />
              ) : (
                <div className="block-canvas-placeholder">
                  <Pen size={20} />
                  <span>Click to sketch</span>
                </div>
              )}
            </div>
            {!readOnly && (
              <div className="block-canvas-actions">
                <button
                  type="button"
                  className="block-canvas-btn"
                  onClick={() => onOpenCanvas?.(block.id)}
                >
                  Open Canvas
                </button>
              </div>
            )}
          </div>
        );
      }
      case 'page':
        return (
          <div className="block-page-wrapper">
            <FileText size={16} />
            <div {...props} placeholder="Page name..." />
          </div>
        );
      case 'bookmark':
        return (
          <div className="block-bookmark-wrapper">
            <BookOpen size={16} />
            <div {...props} placeholder="Bookmark title..." />
          </div>
        );
      case 'date':
        return (
          <div className="block-date-wrapper">
            <Calendar size={16} />
            <div {...props} placeholder="Date..." />
          </div>
        );
      case 'tag':
        return (
          <div className="block-tag-wrapper">
            <Tag size={16} />
            <div {...props} placeholder="Tag name..." />
          </div>
        );
      case 'youtube':
        const extractYouTubeId = (url) => {
          if (!url) return null;
          const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
          const match = url.match(regExp);
          return (match && match[2].length === 11) ? match[2] : null;
        };
        
        const handleYouTubeInput = (e) => {
          if (!e || !e.currentTarget) return;
          const url = e.currentTarget.textContent || '';
          if (!url.trim()) return;
          
          const videoId = extractYouTubeId(url);
          if (videoId) {
            updateBlock(block.id, {
              properties: {
                ...block.properties,
                embedUrl: `https://www.youtube.com/embed/${videoId}`,
                originalUrl: url
              }
            });
          }
        };
        
        return (
          <div className="block-youtube-wrapper">
            <div className="youtube-header">
              <Youtube size={18} />
              <span>YouTube Video</span>
              {block.properties?.embedUrl && !readOnly && (
                <button
                  className="remove-embed-btn"
                  onClick={() => updateBlock(block.id, { properties: {} })}
                  title="Remove video"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {block.properties?.embedUrl ? (
              <div className="youtube-player">
                <iframe
                  width="100%"
                  height="450"
                  src={block.properties.embedUrl}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="YouTube video"
                />
              </div>
            ) : (
              <div 
                {...props} 
                placeholder="Paste YouTube URL (e.g., https://youtube.com/watch?v=...)"
                onBlur={handleYouTubeInput}
                onPaste={(e) => {
                  setTimeout(() => handleYouTubeInput(e), 100);
                }}
                className="youtube-input"
              />
            )}
          </div>
        );
      case 'embed':
        const handleEmbedInput = (e) => {
          if (!e || !e.currentTarget) return;
          const url = (e.currentTarget.textContent || '').trim();
          if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            updateBlock(block.id, {
              properties: {
                ...block.properties,
                embedUrl: url
              }
            });
          }
        };
        
        return (
          <div className="block-generic-embed-wrapper">
            <div className="embed-header">
              <ExternalLink size={18} />
              <span>Embedded Content</span>
              {block.properties?.embedUrl && !readOnly && (
                <button
                  className="remove-embed-btn"
                  onClick={() => updateBlock(block.id, { properties: {} })}
                  title="Remove embed"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            {block.properties?.embedUrl ? (
              <div className="embed-player">
                <iframe
                  width="100%"
                  height="500"
                  src={sanitizeUrl(block.properties.embedUrl) || 'about:blank'}
                  frameBorder="0"
                  title="Embedded content"
                  sandbox="allow-scripts allow-popups"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div 
                {...props} 
                placeholder="Paste embed URL (Figma, Google Maps, CodePen, etc.)"
                onBlur={handleEmbedInput}
                onPaste={(e) => {
                  setTimeout(() => handleEmbedInput(e), 100);
                }}
                className="embed-input"
              />
            )}
          </div>
        );
      case 'mermaid':
        return <MermaidBlock block={block} updateBlock={updateBlock} readOnly={readOnly} darkMode={darkMode} />;
      case 'column':
        
        const columnWidth = block.properties?.width || '50%';
        const columnBgColor = block.properties?.bgColor || 'none';
        const isCollapsed = block.properties?.collapsed || false;
        const isSticky = block.properties?.sticky || false;
        const showFullMenu = columnMenuOpen[block.id] || false;
        
        
        const childBlocks = blocks.filter(b => b.parent_block_id === block.id);
        const hasChildren = childBlocks.length > 0;
        
        const isLocked = block.properties?.locked || false;
        const linkedTo = block.properties?.linkedTo || null;
        
        const widthOptions = ['25%', '33%', '50%', '66%', '75%', '100%'];
        const colorOptions = ['none', 'blue', 'green', 'purple', 'orange', 'pink', 'gray', 'accent'];
        
        const setColumnWidth = (width) => {
          updateBlock(block.id, {
            properties: { ...block.properties, width }
          });
        };
        
        const setColumnColor = (bgColor) => {
          updateBlock(block.id, {
            properties: { ...block.properties, bgColor }
          });
        };
        
        const toggleCollapse = () => {
          updateBlock(block.id, {
            properties: { ...block.properties, collapsed: !isCollapsed }
          });
        };
        
        const toggleSticky = () => {
          updateBlock(block.id, {
            properties: { ...block.properties, sticky: !isSticky }
          });
        };
        
        const toggleLock = () => {
          updateBlock(block.id, {
            properties: { ...block.properties, locked: !isLocked }
          });
        };
        
        const cloneColumn = () => {
          const newBlock = {
            ...block,
            id: Date.now() + Math.random(),
            properties: { ...block.properties }
          };
          const currentIndex = blocks.findIndex(b => b.id === block.id);
          const newBlocks = [...blocks];
          newBlocks.splice(currentIndex + 1, 0, newBlock);
          onChange(newBlocks);
        };
        
        const splitColumn = () => {
          
          const currentWidth = parseInt(columnWidth);
          const halfWidth = Math.floor(currentWidth / 2) + '%';
          
          
          updateBlock(block.id, {
            properties: { ...block.properties, width: halfWidth }
          });
          
          
          const newBlock = {
            id: Date.now() + Math.random(),
            type: 'column',
            content: '',
            properties: { width: halfWidth, bgColor: 'none' },
            parent_block_id: null
          };
          
          const currentIndex = blocks.findIndex(b => b.id === block.id);
          const newBlocks = [...blocks];
          newBlocks.splice(currentIndex + 1, 0, newBlock);
          onChange(newBlocks);
        };
        
        const mergeWithNext = () => {
          
          const currentIndex = blocks.findIndex(b => b.id === block.id);
          const nextBlock = blocks[currentIndex + 1];
          
          if (nextBlock && nextBlock.type === 'column') {
            
            const nextChildren = blocks.filter(b => b.parent_block_id === nextBlock.id);
            const updatedBlocks = blocks.map(b => {
              if (nextChildren.find(child => child.id === b.id)) {
                return { ...b, parent_block_id: block.id };
              }
              return b;
            }).filter(b => b.id !== nextBlock.id);
            
            onChange(updatedBlocks);
          }
        };
        
        const exportColumn = () => {
          
          const columnContent = childBlocks.map(b => b.content).join('\n\n');
          const blob = new Blob([columnContent], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `column-${block.id}.txt`;
          a.click();
          URL.revokeObjectURL(url);
        };
        
        const applyTemplate = (template) => {
          const currentIndex = blocks.findIndex(b => b.id === block.id);
          const newBlocks = [...blocks];
          
          
          newBlocks.splice(currentIndex, 1);
          
          
          if (template === 'two-column') {
            newBlocks.splice(currentIndex, 0,
              { id: Date.now(), type: 'column', content: '', properties: { width: '50%' }, parent_block_id: null },
              { id: Date.now() + 1, type: 'column', content: '', properties: { width: '50%' }, parent_block_id: null }
            );
          } else if (template === 'three-column') {
            newBlocks.splice(currentIndex, 0,
              { id: Date.now(), type: 'column', content: '', properties: { width: '33%' }, parent_block_id: null },
              { id: Date.now() + 1, type: 'column', content: '', properties: { width: '33%' }, parent_block_id: null },
              { id: Date.now() + 2, type: 'column', content: '', properties: { width: '33%' }, parent_block_id: null }
            );
          } else if (template === 'sidebar-left') {
            newBlocks.splice(currentIndex, 0,
              { id: Date.now(), type: 'column', content: '', properties: { width: '25%' }, parent_block_id: null },
              { id: Date.now() + 1, type: 'column', content: '', properties: { width: '75%' }, parent_block_id: null }
            );
          } else if (template === 'sidebar-right') {
            newBlocks.splice(currentIndex, 0,
              { id: Date.now(), type: 'column', content: '', properties: { width: '75%' }, parent_block_id: null },
              { id: Date.now() + 1, type: 'column', content: '', properties: { width: '25%' }, parent_block_id: null }
            );
          }
          
          onChange(newBlocks);
          setColumnMenuOpen(prev => ({ ...prev, [block.id]: false }));
        };
        
        const addBlockInside = () => {
          const newBlock = {
            id: Date.now() + Math.random(),
            type: 'paragraph',
            content: '',
            properties: {},
            parent_block_id: block.id
          };
          const newBlocks = [...blocks];
          const currentIndex = blocks.findIndex(b => b.id === block.id);
          newBlocks.splice(currentIndex + 1, 0, newBlock);
          onChange(newBlocks);
          setTimeout(() => blockRefs.current[newBlock.id]?.focus(), 0);
        };
        
        return (
          <div 
            className={`block-column-container ${isCollapsed ? 'collapsed' : ''} ${isSticky ? 'sticky' : ''}`}
            data-column-width={columnWidth}
            data-bg-color={columnBgColor !== 'none' ? columnBgColor : undefined}
            data-locked={isLocked ? 'true' : undefined}
          >
            {!readOnly && (
              <>
                <button 
                  className="column-settings-btn"
                  onClick={() => setColumnMenuOpen(prev => ({ ...prev, [block.id]: !showFullMenu }))}
                  title="Column settings"
                >
                  {columnWidth}
                </button>
                
                {showFullMenu && (
                  <div className="column-settings-dialog">
                    <div className="column-dialog-header">
                      <span>Column Settings</span>
                      <button 
                        className="column-dialog-close"
                        onClick={() => setColumnMenuOpen(prev => ({ ...prev, [block.id]: false }))}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    
                    <div className="column-dialog-body">
                      <div className="column-dialog-section">
                        <div className="column-dialog-label">Width</div>
                        <div className="column-dialog-options">
                          {widthOptions.map(width => (
                            <button
                              key={width}
                              className={`column-option-btn ${columnWidth === width ? 'active' : ''}`}
                              onClick={() => setColumnWidth(width)}
                            >
                              {width}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="column-dialog-section">
                        <div className="column-dialog-label">Background Color</div>
                        <div className="column-dialog-colors">
                          {colorOptions.map(color => (
                            <button
                              key={color}
                              className={`column-color-option ${columnBgColor === color ? 'active' : ''}`}
                              data-color={color}
                              onClick={() => setColumnColor(color)}
                              title={color === 'none' ? 'No background' : color}
                            />
                          ))}
                        </div>
                      </div>
                      
                      <div className="column-dialog-section">
                        <div className="column-dialog-label">Templates</div>
                        <div className="column-dialog-options">
                          <button className="column-option-btn" onClick={() => applyTemplate('two-column')}>
                            2 Col
                          </button>
                          <button className="column-option-btn" onClick={() => applyTemplate('three-column')}>
                            3 Col
                          </button>
                          <button className="column-option-btn" onClick={() => applyTemplate('sidebar-left')}>
                            L Side
                          </button>
                          <button className="column-option-btn" onClick={() => applyTemplate('sidebar-right')}>
                            R Side
                          </button>
                        </div>
                      </div>
                      
                      <div className="column-dialog-section">
                        <div className="column-dialog-label">Actions</div>
                        <div className="column-dialog-actions">
                          <button 
                            className="column-action-btn"
                            onClick={() => { toggleCollapse(); setColumnMenuOpen(prev => ({ ...prev, [block.id]: false })); }}
                          >
                            <Minimize2 size={16} />
                            <span>{isCollapsed ? 'Expand' : 'Collapse'}</span>
                          </button>
                          <button 
                            className="column-action-btn"
                            onClick={() => { toggleSticky(); setColumnMenuOpen(prev => ({ ...prev, [block.id]: false })); }}
                          >
                            <Star size={16} />
                            <span>{isSticky ? 'Unpin' : 'Pin'}</span>
                          </button>
                          <button 
                            className={`column-action-btn ${isLocked ? 'active' : ''}`}
                            onClick={() => { toggleLock(); setColumnMenuOpen(prev => ({ ...prev, [block.id]: false })); }}
                          >
                            <Star size={16} />
                            <span>{isLocked ? 'Unlock' : 'Lock'}</span>
                          </button>
                          <button 
                            className="column-action-btn"
                            onClick={() => { cloneColumn(); setColumnMenuOpen(prev => ({ ...prev, [block.id]: false })); }}
                          >
                            <Copy size={16} />
                            <span>Clone</span>
                          </button>
                          <button 
                            className="column-action-btn"
                            onClick={() => { splitColumn(); setColumnMenuOpen(prev => ({ ...prev, [block.id]: false })); }}
                          >
                            <Columns size={16} />
                            <span>Split</span>
                          </button>
                          <button 
                            className="column-action-btn"
                            onClick={() => { mergeWithNext(); setColumnMenuOpen(prev => ({ ...prev, [block.id]: false })); }}
                          >
                            <ArrowRight size={16} />
                            <span>Merge →</span>
                          </button>
                          <button 
                            className="column-action-btn"
                            onClick={() => { exportColumn(); setColumnMenuOpen(prev => ({ ...prev, [block.id]: false })); }}
                          >
                            <Download size={16} />
                            <span>Export</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                
                {isCollapsed && (
                  <button className="column-expand-btn" onClick={toggleCollapse}>
                    <ChevronRight size={16} /> Expand
                  </button>
                )}
              </>
            )}
            
            {!isCollapsed && (
              <div className="column-content-area">
                {isLocked && (
                  <div className="column-locked-badge">
                    <Star size={12} />
                    <span>Locked</span>
                  </div>
                )}
                {!hasChildren && !readOnly && !isLocked && (
                  <button className="column-add-first-block" onClick={addBlockInside}>
                    <Plus size={16} />
                    <span>Click to add content or type /</span>
                  </button>
                )}
                {childBlocks.map((childBlock, childIndex) => {
                  const childIsDragging = draggedBlockId === childBlock.id;
                  
                  return (
                    <div
                      key={childBlock.id}
                      ref={(el) => { blockWrapperRefs.current[childBlock.id] = el; }}
                      data-block-id={childBlock.id}
                      className={`block-wrapper block-in-column ${childIsDragging ? 'dragging' : ''}`}
                      onMouseEnter={() => {
                        if (!readOnly && !draggedBlockId) {
                          clearTimeout(menuCloseTimeoutRef.current);
                          setHoveredBlockId(childBlock.id);
                        }
                      }}
                      onMouseLeave={() => {
                        if (!readOnly && !draggedBlockId && showBlockMenu !== childBlock.id) {
                          scheduleHideControls(childBlock.id);
                        }
                      }}
                    >
                      {!readOnly && (
                        <div 
                          className={`block-controls ${shouldShowControls(childBlock.id) ? 'visible' : ''}`}
                          onMouseEnter={() => handleControlsMouseEnter(childBlock.id)}
                          onMouseLeave={() => handleControlsMouseLeave(childBlock.id)}
                          style={shouldShowControls(childBlock.id) ? { opacity: '1 !important', pointerEvents: 'auto !important' } : {}}
                        >
                          <div 
                            className="block-control-btn drag-handle" 
                            title="Drag to reorder"
                            aria-label="Drag to reorder"
                            draggable="true"
                            onDragStart={(e) => handleDragStart(e, childBlock.id)}
                            onDragEnd={handleDragEnd}
                          >
                            <GripVertical size={16} />
                          </div>
                          <button
                            className="block-control-btn"
                            onClick={() => {
                              const newBlock = {
                                id: Date.now() + Math.random(),
                                type: 'paragraph',
                                content: '',
                                properties: {},
                                parent_block_id: block.id
                              };
                              const allBlocks = [...blocks];
                              const childBlockIndex = allBlocks.findIndex(b => b.id === childBlock.id);
                              allBlocks.splice(childBlockIndex + 1, 0, newBlock);
                              onChange(allBlocks);
                              setTimeout(() => blockRefs.current[newBlock.id]?.focus(), 0);
                            }}
                            title="Add block"
                            aria-label="Add block"
                          >
                            <Plus size={16} />
                          </button>
                          <button
                            className="block-control-btn canvas-action"
                            onClick={() => handleCanvasAction(childBlock)}
                            title={childBlock.type === 'canvas' ? 'Open canvas' : 'Add canvas'}
                            aria-label={childBlock.type === 'canvas' ? 'Open canvas' : 'Add canvas'}
                          >
                            <Pen size={16} />
                          </button>
                          <button
                            className="block-control-btn"
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setBlockMenuPosition({ top: rect.bottom + 4, left: rect.left });
                              setShowBlockMenu(showBlockMenu === childBlock.id ? null : childBlock.id);
                            }}
                            title="More options"
                            aria-label="More options"
                          >
                            <MoreVertical size={16} />
                          </button>

                          {showBlockMenu === childBlock.id && createPortal(
                            <div 
                              className="sbe-dropdown-menu"
                              style={{ 
                                position: 'fixed',
                                top: blockMenuPosition.top,
                                left: blockMenuPosition.left,
                                display: 'block',
                                opacity: 1,
                                pointerEvents: 'auto',
                                visibility: 'visible',
                                background: darkMode ? '#1a1a1a' : '#ffffff',
                                backgroundColor: darkMode ? '#1a1a1a' : '#ffffff',
                                boxShadow: darkMode ? '0 8px 32px rgba(0,0,0,0.7)' : '0 8px 32px rgba(0,0,0,0.2)',
                                border: darkMode ? '1px solid #444' : '1px solid #ddd',
                                borderRadius: '0px',
                                zIndex: 999999,
                                padding: '6px',
                                minWidth: '200px',
                                maxWidth: '280px',
                                maxHeight: '400px',
                                overflowY: 'auto'
                              }}
                              onMouseEnter={() => {
                                clearTimeout(menuCloseTimeoutRef.current);
                                setHoveredBlockId(childBlock.id);
                              }}
                            >
                              <div style={{ padding: '6px 10px 4px', fontSize: '11px', fontWeight: 600, color: darkMode ? '#888' : '#666', textTransform: 'uppercase', background: darkMode ? '#1a1a1a' : '#ffffff' }}>Turn into</div>
                              {BLOCK_TYPES.slice(0, 10).map(blockType => (
                                <button
                                  key={blockType.type}
                                  onClick={() => {
                                    updateBlock(childBlock.id, { type: blockType.type });
                                    setShowBlockMenu(null);
                                  }}
                                  style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 10px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    background: childBlock.type === blockType.type ? (darkMode ? '#333' : '#e8e8e8') : (darkMode ? '#1a1a1a' : '#ffffff'),
                                    backgroundColor: childBlock.type === blockType.type ? (darkMode ? '#333' : '#e8e8e8') : (darkMode ? '#1a1a1a' : '#ffffff'),
                                    color: darkMode ? '#fff' : '#333'
                                  }}
                                  onMouseEnter={(e) => { e.target.style.background = darkMode ? '#333' : '#f0f0f0'; }}
                                  onMouseLeave={(e) => { e.target.style.background = childBlock.type === blockType.type ? (darkMode ? '#333' : '#e8e8e8') : (darkMode ? '#1a1a1a' : '#ffffff'); }}
                                >
                                  <blockType.icon size={14} /> {blockType.label}
                                </button>
                              ))}
                              <div style={{ height: '1px', background: darkMode ? '#444' : '#e0e0e0', margin: '6px 0' }} />
                              <div style={{ padding: '6px 10px 4px', fontSize: '11px', fontWeight: 600, color: darkMode ? '#888' : '#666', textTransform: 'uppercase', background: darkMode ? '#1a1a1a' : '#ffffff' }}>Actions</div>
                              <button 
                                onClick={() => { duplicateBlock(childBlock.id); setShowBlockMenu(null); }}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', background: darkMode ? '#1a1a1a' : '#ffffff', color: darkMode ? '#fff' : '#333' }}
                                onMouseEnter={(e) => { e.target.style.background = darkMode ? '#333' : '#f0f0f0'; }}
                                onMouseLeave={(e) => { e.target.style.background = darkMode ? '#1a1a1a' : '#ffffff'; }}
                              >
                                <Copy size={14} /> Duplicate
                              </button>
                              <button 
                                onClick={() => { deleteBlock(childBlock.id); setShowBlockMenu(null); }}
                                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', background: darkMode ? '#1a1a1a' : '#ffffff', color: darkMode ? '#fff' : '#333' }}
                                onMouseEnter={(e) => { e.target.style.background = darkMode ? '#333' : '#f0f0f0'; }}
                                onMouseLeave={(e) => { e.target.style.background = darkMode ? '#1a1a1a' : '#ffffff'; }}
                              >
                                <Trash2 size={14} /> Delete
                              </button>
                            </div>,
                            document.body
                          )}
                        </div>
                      )}
                      
                      <div className="block-content-wrapper">
                        {renderBlockContent(childBlock, {
                          ref: (el) => { blockRefs.current[childBlock.id] = el; },
                          contentEditable: !readOnly,
                          suppressContentEditableWarning: true,
                          onInput: (e) => handleInput(childBlock.id, e.target.innerHTML),
                          onKeyDown: (e) => handleKeyDown(e, childBlock.id, childIndex),
                          className: `block-content block-${childBlock.type}`,
                          dangerouslySetInnerHTML: { __html: sanitizeHtml(childBlock.content || '') }
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 'row':
        
        return (
          <div className="block-row-container">
            <div className="row-label">
              <Minus size={14} />
              <span>Row</span>
            </div>
            <div {...props} />
          </div>
        );
      default:
        return <p {...props} />;
    }
  };

  
  const shouldShowControls = (blockId) => {
    if (readOnly) return false;
    
    return hoveredBlockId === blockId || draggedBlockId === blockId || showBlockMenu === blockId;
  };

  const scheduleHideControls = (blockId) => {
    clearTimeout(menuCloseTimeoutRef.current);
    menuCloseTimeoutRef.current = setTimeout(() => {
      if (showBlockMenuRef.current !== blockId) {
        setHoveredBlockId(null);
      }
    }, 180);
  };
  
  
  const handleControlsMouseEnter = (blockId) => {
    clearTimeout(menuCloseTimeoutRef.current);
    setHoveredBlockId(blockId);
  };
  
  const handleControlsMouseLeave = (blockId) => {
    scheduleHideControls(blockId);
  };

  return (
    <>
    <div 
      className={`block-editor ${darkMode ? 'dark-mode' : ''}`}
      onDragOver={handleEditorDragOver}
      onDrop={handleEditorDrop}
    >
      {blocks.filter(block => {
        
        if (!block.parent_block_id) return true;
        const parentBlock = blocks.find(b => b.id === block.parent_block_id);
        return parentBlock?.type !== 'column';
      }).map((block, index) => {
        const isDragging = draggedBlockId === block.id;
        const showAboveIndicator = dropIndicator?.blockId === block.id && dropIndicator?.position === 'above';
        const showBelowIndicator = dropIndicator?.blockId === block.id && dropIndicator?.position === 'below';
        
        
        let indentLevel = 0;
        let currentBlock = block;
        while (currentBlock.parent_block_id && indentLevel < 4) {
          currentBlock = blocks.find(b => b.id === currentBlock.parent_block_id);
          if (currentBlock) indentLevel++;
          else break;
        }
        
        return (
          <div
            key={block.id}
            ref={(el) => { blockWrapperRefs.current[block.id] = el; }}
            data-block-id={block.id}
            data-indent={indentLevel}
            className={`block-wrapper ${isDragging ? 'dragging' : ''} ${darkMode ? 'dark-mode' : ''}`}
            onMouseEnter={() => {
              if (!readOnly && !draggedBlockId) {
                clearTimeout(menuCloseTimeoutRef.current);
                setHoveredBlockId(block.id);
              }
            }}
            onMouseLeave={() => {
              if (!readOnly && !draggedBlockId && showBlockMenu !== block.id) {
                scheduleHideControls(block.id);
              }
            }}
            onDragOver={(e) => handleDragOver(e, block.id)}
            onDragEnter={(e) => handleDragEnter(e, block.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, block.id)}
          >
            {!readOnly && showAboveIndicator && (
              <div className="drop-indicator drop-indicator-above" />
            )}
            
            {!readOnly && (
            <div 
              className={`block-controls ${shouldShowControls(block.id) ? 'visible' : ''}`}
              onMouseEnter={() => handleControlsMouseEnter(block.id)}
              onMouseLeave={() => handleControlsMouseLeave(block.id)}
              style={shouldShowControls(block.id) ? { opacity: '1 !important', pointerEvents: 'auto !important' } : {}}
            >
              <div 
                className="block-control-btn drag-handle" 
                title="Drag to reorder"
                aria-label="Drag to reorder"
                draggable="true"
                onDragStart={(e) => handleDragStart(e, block.id)}
                onDragEnd={handleDragEnd}
              >
                <GripVertical size={16} />
              </div>
              <button
                className="block-control-btn"
                onClick={() => addBlock(index)}
                title="Add block"
                aria-label="Add block"
              >
                <Plus size={16} />
              </button>
              <button
                className="block-control-btn canvas-action"
                onClick={() => handleCanvasAction(block)}
                title={block.type === 'canvas' ? 'Open canvas' : 'Add canvas'}
                aria-label={block.type === 'canvas' ? 'Open canvas' : 'Add canvas'}
              >
                <Pen size={16} />
              </button>
              <button
                className="block-control-btn"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setBlockMenuPosition({ top: rect.bottom + 4, left: rect.left });
                  setShowBlockMenu(showBlockMenu === block.id ? null : block.id);
                }}
                title="More options"
                aria-label="More options"
              >
                <MoreVertical size={16} />
              </button>

              {showBlockMenu === block.id && createPortal(
                <div 
                  className="sbe-dropdown-menu"
                  style={{ 
                    position: 'fixed',
                    top: blockMenuPosition.top,
                    left: blockMenuPosition.left,
                    display: 'block',
                    opacity: 1,
                    pointerEvents: 'auto',
                    visibility: 'visible',
                    background: darkMode ? '#1a1a1a' : '#ffffff',
                    backgroundColor: darkMode ? '#1a1a1a' : '#ffffff',
                    boxShadow: darkMode ? '0 8px 32px rgba(0,0,0,0.7)' : '0 8px 32px rgba(0,0,0,0.2)',
                    border: darkMode ? '1px solid #444' : '1px solid #ddd',
                    borderRadius: '0px',
                    zIndex: 999999,
                    padding: '6px',
                    minWidth: '200px',
                    maxWidth: '280px',
                    maxHeight: '400px',
                    overflowY: 'auto'
                  }}
                  onMouseEnter={() => {
                    clearTimeout(menuCloseTimeoutRef.current);
                    setHoveredBlockId(block.id);
                  }}
                >
                  <div style={{ padding: '6px 10px 4px', fontSize: '11px', fontWeight: 600, color: darkMode ? '#888' : '#666', textTransform: 'uppercase', background: darkMode ? '#1a1a1a' : '#ffffff' }}>Actions</div>
                  <button 
                    onClick={() => { duplicateBlock(block.id); setShowBlockMenu(null); }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', background: darkMode ? '#1a1a1a' : '#ffffff', color: darkMode ? '#fff' : '#333' }}
                    onMouseEnter={(e) => { e.target.style.background = darkMode ? '#333' : '#f0f0f0'; }}
                    onMouseLeave={(e) => { e.target.style.background = darkMode ? '#1a1a1a' : '#ffffff'; }}
                  >
                    <Copy size={14} /> Duplicate
                  </button>
                  <button 
                    onClick={() => { 
                      const content = block.content;
                      navigator.clipboard.writeText(content);
                      setShowBlockMenu(null);
                    }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', background: darkMode ? '#1a1a1a' : '#ffffff', color: darkMode ? '#fff' : '#333' }}
                    onMouseEnter={(e) => { e.target.style.background = darkMode ? '#333' : '#f0f0f0'; }}
                    onMouseLeave={(e) => { e.target.style.background = darkMode ? '#1a1a1a' : '#ffffff'; }}
                  >
                    <Copy size={14} /> Copy text
                  </button>
                  <button 
                    onClick={() => { deleteBlock(block.id); setShowBlockMenu(null); }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', background: darkMode ? '#1a1a1a' : '#ffffff', color: darkMode ? '#fff' : '#333' }}
                    onMouseEnter={(e) => { e.target.style.background = darkMode ? '#333' : '#f0f0f0'; }}
                    onMouseLeave={(e) => { e.target.style.background = darkMode ? '#1a1a1a' : '#ffffff'; }}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                  
                  <div style={{ height: '1px', background: darkMode ? '#444' : '#e0e0e0', margin: '6px 0' }}></div>
                  <div style={{ padding: '6px 10px 4px', fontSize: '11px', fontWeight: 600, color: darkMode ? '#888' : '#666', textTransform: 'uppercase', background: darkMode ? '#1a1a1a' : '#ffffff' }}>Style</div>
                  <button 
                    onClick={() => { 
                      const wrapper = blockWrapperRefs.current[block.id];
                      if (wrapper) {
                        const rect = wrapper.getBoundingClientRect();
                        setStyleMenuPosition({ top: rect.bottom + 5, left: rect.left });
                        setShowStyleMenu(block.id);
                        setShowBlockMenu(null);
                      }
                    }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', background: darkMode ? '#1a1a1a' : '#ffffff', color: darkMode ? '#fff' : '#333' }}
                    onMouseEnter={(e) => { e.target.style.background = darkMode ? '#333' : '#f0f0f0'; }}
                    onMouseLeave={(e) => { e.target.style.background = darkMode ? '#1a1a1a' : '#ffffff'; }}
                  >
                    <Palette size={14} /> Colors & Style
                  </button>
                  
                  <div style={{ height: '1px', background: darkMode ? '#444' : '#e0e0e0', margin: '6px 0' }}></div>
                  <div style={{ padding: '6px 10px 4px', fontSize: '11px', fontWeight: 600, color: darkMode ? '#888' : '#666', textTransform: 'uppercase', background: darkMode ? '#1a1a1a' : '#ffffff' }}>Indent</div>
                  <button 
                    onClick={() => { indentBlock(block.id); setShowBlockMenu(null); }} 
                    disabled={index === 0}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', borderRadius: '4px', cursor: index === 0 ? 'not-allowed' : 'pointer', fontSize: '13px', background: darkMode ? '#1a1a1a' : '#ffffff', color: darkMode ? '#fff' : '#333', opacity: index === 0 ? 0.5 : 1 }}
                    onMouseEnter={(e) => { if (index !== 0) e.target.style.background = darkMode ? '#333' : '#f0f0f0'; }}
                    onMouseLeave={(e) => { e.target.style.background = darkMode ? '#1a1a1a' : '#ffffff'; }}
                  >
                    <Indent size={14} /> Indent
                  </button>
                  <button 
                    onClick={() => { outdentBlock(block.id); setShowBlockMenu(null); }} 
                    disabled={!block.parent_block_id}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', borderRadius: '4px', cursor: !block.parent_block_id ? 'not-allowed' : 'pointer', fontSize: '13px', background: darkMode ? '#1a1a1a' : '#ffffff', color: darkMode ? '#fff' : '#333', opacity: !block.parent_block_id ? 0.5 : 1 }}
                    onMouseEnter={(e) => { if (block.parent_block_id) e.target.style.background = darkMode ? '#333' : '#f0f0f0'; }}
                    onMouseLeave={(e) => { e.target.style.background = darkMode ? '#1a1a1a' : '#ffffff'; }}
                  >
                    <Outdent size={14} /> Outdent
                  </button>
                  
                  <div style={{ height: '1px', background: darkMode ? '#444' : '#e0e0e0', margin: '6px 0' }}></div>
                  <div style={{ padding: '6px 10px 4px', fontSize: '11px', fontWeight: 600, color: darkMode ? '#888' : '#666', textTransform: 'uppercase', background: darkMode ? '#1a1a1a' : '#ffffff' }}>Move</div>
                  <button 
                    onClick={() => { moveBlock(block.id, 'up'); setShowBlockMenu(null); }} 
                    disabled={index === 0}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', borderRadius: '4px', cursor: index === 0 ? 'not-allowed' : 'pointer', fontSize: '13px', background: darkMode ? '#1a1a1a' : '#ffffff', color: darkMode ? '#fff' : '#333', opacity: index === 0 ? 0.5 : 1 }}
                    onMouseEnter={(e) => { if (index !== 0) e.target.style.background = darkMode ? '#333' : '#f0f0f0'; }}
                    onMouseLeave={(e) => { e.target.style.background = darkMode ? '#1a1a1a' : '#ffffff'; }}
                  >
                    <ArrowUp size={14} /> Move up
                  </button>
                  <button 
                    onClick={() => { moveBlock(block.id, 'down'); setShowBlockMenu(null); }} 
                    disabled={index === blocks.length - 1}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', borderRadius: '4px', cursor: index === blocks.length - 1 ? 'not-allowed' : 'pointer', fontSize: '13px', background: darkMode ? '#1a1a1a' : '#ffffff', color: darkMode ? '#fff' : '#333', opacity: index === blocks.length - 1 ? 0.5 : 1 }}
                    onMouseEnter={(e) => { if (index !== blocks.length - 1) e.target.style.background = darkMode ? '#333' : '#f0f0f0'; }}
                    onMouseLeave={(e) => { e.target.style.background = darkMode ? '#1a1a1a' : '#ffffff'; }}
                  >
                    <ArrowDown size={14} /> Move down
                  </button>
                  
                  <div style={{ height: '1px', background: darkMode ? '#444' : '#e0e0e0', margin: '6px 0' }}></div>
                  <div style={{ padding: '6px 10px 4px', fontSize: '11px', fontWeight: 600, color: darkMode ? '#888' : '#666', textTransform: 'uppercase', background: darkMode ? '#1a1a1a' : '#ffffff' }}>Turn into</div>
                  {BLOCK_TYPES.map(bt => (
                    <button
                      key={bt.type}
                      onClick={() => {
                        updateBlock(block.id, { type: bt.type });
                        setShowBlockMenu(null);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 10px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        background: block.type === bt.type ? (darkMode ? '#333' : '#e8e8e8') : (darkMode ? '#1a1a1a' : '#ffffff'),
                        backgroundColor: block.type === bt.type ? (darkMode ? '#333' : '#e8e8e8') : (darkMode ? '#1a1a1a' : '#ffffff'),
                        color: darkMode ? '#fff' : '#333'
                      }}
                      onMouseEnter={(e) => { e.target.style.background = darkMode ? '#333' : '#f0f0f0'; }}
                      onMouseLeave={(e) => { e.target.style.background = block.type === bt.type ? (darkMode ? '#333' : '#e8e8e8') : (darkMode ? '#1a1a1a' : '#ffffff'); }}
                    >
                      <bt.icon size={14} /> {bt.label}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
            )}
            
            <div className="block-content-wrapper">
              {renderBlockContent(block)}
            </div>
            
            {!readOnly && showBelowIndicator && (
              <div className="drop-indicator drop-indicator-below" />
            )}
            
            {showSlashMenu && activeBlockId === block.id && createPortal(
              <div
                ref={slashMenuRef}
                className="sbe-slash-menu"
                style={{
                  position: 'fixed',
                  top: slashMenuPosition.top,
                  left: slashMenuPosition.left,
                  background: darkMode ? '#1a1a1a' : '#ffffff',
                  backgroundColor: darkMode ? '#1a1a1a' : '#ffffff',
                  border: darkMode ? '1px solid #444' : '1px solid #ddd',
                  boxShadow: darkMode ? '0 8px 32px rgba(0,0,0,0.7)' : '0 8px 32px rgba(0,0,0,0.2)',
                  borderRadius: '0px',
                  padding: '8px',
                  minWidth: '320px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  zIndex: 999999
                }}
              >
          {BLOCK_TYPES.map((blockType, index) => {
            const Icon = blockType.icon;
            return (
              <div
                key={blockType.type}
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  alignItems: 'flex-start',
                  background: index === selectedMenuIndex ? (darkMode ? '#333' : '#f0f0f0') : (darkMode ? '#1a1a1a' : '#ffffff'),
                  color: darkMode ? '#fff' : '#333'
                }}
                onClick={() => {
                  const el = blockRefs.current[activeBlockId];
                  if (el) {
                    
                    const content = el.textContent.replace(/\/$/, '').trim();
                    el.textContent = content;
                    
                    
                    updateBlock(activeBlockId, { type: blockType.type, content });
                    
                    
                    setShowSlashMenu(false);
                    
                    
                    setTimeout(() => {
                      el.focus();
                      const range = document.createRange();
                      const sel = window.getSelection();
                      if (el.childNodes.length > 0) {
                        range.selectNodeContents(el);
                        range.collapse(false);
                      } else {
                        range.setStart(el, 0);
                        range.setEnd(el, 0);
                      }
                      sel.removeAllRanges();
                      sel.addRange(range);
                    }, 0);
                  }
                }}
                onMouseEnter={() => setSelectedMenuIndex(index)}
              >
                <Icon size={18} style={{ color: darkMode ? '#888' : '#666', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontWeight: 500, fontSize: '14px', color: darkMode ? '#fff' : '#333' }}>{blockType.label}</div>
                  <div style={{ fontSize: '12px', color: darkMode ? '#888' : '#666', marginTop: '2px' }}>{blockType.description}</div>
                </div>
              </div>
            );
          })}
              </div>,
              document.body
            )}
          </div>
        );
      })}
    </div>
    
    {viewingFile && (
      <FileViewer
        fileUrl={viewingFile.url}
        fileName={viewingFile.name}
        fileType={viewingFile.type}
        onClose={() => setViewingFile(null)}
      />
    )}
    
    {showStyleMenu && (
      <div 
        ref={styleMenuRef}
        className="style-menu"
        style={{
          position: 'fixed',
          top: styleMenuPosition.top,
          left: styleMenuPosition.left,
          zIndex: 10000
        }}
      >
        <div className="style-menu-header">
          <span>Block Style</span>
          <button onClick={() => setShowStyleMenu(null)} className="style-close-btn">
            <X size={16} />
          </button>
        </div>
        
        <div className="style-menu-section">
          <div className="style-label">Background Color</div>
          <div className="color-grid">
            {[
              { name: 'Default', bg: 'transparent' },
              { name: 'Gray', bg: '#f3f4f6' },
              { name: 'Brown', bg: '#fef3c7' },
              { name: 'Orange', bg: '#fed7aa' },
              { name: 'Yellow', bg: '#fef08a' },
              { name: 'Green', bg: '#d1fae5' },
              { name: 'Blue', bg: '#dbeafe' },
              { name: 'Purple', bg: '#e9d5ff' },
              { name: 'Pink', bg: '#fce7f3' },
              { name: 'Red', bg: '#fee2e2' },
            ].map((color) => {
              const block = blocks.find(b => b.id === showStyleMenu);
              const currentBg = block?.properties?.style?.backgroundColor;
              return (
                <button
                  key={color.name}
                  className={`color-btn ${currentBg === color.bg ? 'active' : ''}`}
                  style={{ backgroundColor: color.bg }}
                  onClick={() => {
                    updateBlock(showStyleMenu, {
                      properties: {
                        ...block.properties,
                        style: {
                          ...block.properties?.style,
                          backgroundColor: color.bg
                        }
                      }
                    });
                  }}
                  title={color.name}
                />
              );
            })}
          </div>
        </div>
        
        <div className="style-menu-section">
          <div className="style-label">Text Color</div>
          <div className="color-grid">
            {[
              { name: 'Default', color: 'inherit' },
              { name: 'Gray', color: '#6b7280' },
              { name: 'Brown', color: '#92400e' },
              { name: 'Orange', color: '#ea580c' },
              { name: 'Yellow', color: '#ca8a04' },
              { name: 'Green', color: '#059669' },
              { name: 'Blue', color: '#2563eb' },
              { name: 'Purple', color: '#7c3aed' },
              { name: 'Pink', color: '#db2777' },
              { name: 'Red', color: '#dc2626' },
            ].map((color) => {
              const block = blocks.find(b => b.id === showStyleMenu);
              const currentColor = block?.properties?.style?.color;
              return (
                <button
                  key={color.name}
                  className={`color-btn ${currentColor === color.color ? 'active' : ''}`}
                  style={{ backgroundColor: color.color }}
                  onClick={() => {
                    updateBlock(showStyleMenu, {
                      properties: {
                        ...block.properties,
                        style: {
                          ...block.properties?.style,
                          color: color.color
                        }
                      }
                    });
                  }}
                  title={color.name}
                />
              );
            })}
          </div>
        </div>
        
        <div className="style-menu-section">
          <div className="style-label">Alignment</div>
          <div className="alignment-buttons">
            {[
              { name: 'Left', value: 'left', icon: AlignLeft },
              { name: 'Center', value: 'center', icon: AlignCenter },
              { name: 'Right', value: 'right', icon: AlignRight },
              { name: 'Justify', value: 'justify', icon: AlignJustify },
            ].map((align) => {
              const Icon = align.icon;
              const block = blocks.find(b => b.id === showStyleMenu);
              const currentAlign = block?.properties?.style?.textAlign || 'left';
              return (
                <button
                  key={align.value}
                  className={`align-btn ${currentAlign === align.value ? 'active' : ''}`}
                  onClick={() => {
                    updateBlock(showStyleMenu, {
                      properties: {
                        ...block.properties,
                        style: {
                          ...block.properties?.style,
                          textAlign: align.value
                        }
                      }
                    });
                  }}
                  title={align.name}
                >
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
        </div>
        
        <div className="style-menu-section">
          <div className="style-label">Spacing</div>
          <div className="spacing-buttons">
            {[
              { name: 'Compact', value: 'compact' },
              { name: 'Normal', value: 'normal' },
              { name: 'Relaxed', value: 'relaxed' },
            ].map((space) => {
              const block = blocks.find(b => b.id === showStyleMenu);
              const currentSpacing = block?.properties?.style?.spacing || 'normal';
              return (
                <button
                  key={space.value}
                  className={`spacing-btn ${currentSpacing === space.value ? 'active' : ''}`}
                  onClick={() => {
                    updateBlock(showStyleMenu, {
                      properties: {
                        ...block.properties,
                        style: {
                          ...block.properties?.style,
                          spacing: space.value
                        }
                      }
                    });
                  }}
                >
                  {space.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default SimpleBlockEditor;
