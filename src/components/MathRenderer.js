import { useEffect, useRef, memo } from 'react';
import renderMathInElement from 'katex/contrib/auto-render';
import 'katex/dist/katex.min.css';
import './MathRenderer.css';
import { sanitizeHtml } from '../utils/sanitize';

const KATEX_OPTS = {
  delimiters: [
    { left: '$$', right: '$$', display: true },
    { left: '$',  right: '$',  display: false },
  ],
  throwOnError: false,
  errorColor: '#f59e0b',
  strict: false,
  trust: false,
  macros: {
    '\\R': '\\mathbb{R}',
    '\\N': '\\mathbb{N}',
    '\\Z': '\\mathbb{Z}',
    '\\Q': '\\mathbb{Q}',
    '\\C': '\\mathbb{C}',
  },
};

const MathRenderer = memo(({ content, className = '' }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !content) return;

    containerRef.current.innerHTML = sanitizeHtml(content);

    try {
      renderMathInElement(containerRef.current, KATEX_OPTS);
    } catch {
      
    }
  }, [content]);

  return <div ref={containerRef} className={`math-content ${className}`} />;
});

MathRenderer.displayName = 'MathRenderer';

export default MathRenderer;
