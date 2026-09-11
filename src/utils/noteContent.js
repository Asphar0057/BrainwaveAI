import { marked } from 'marked';
import { extractMathPlaceholders, restoreMathPlaceholders } from './mathMarkdown';
import { sanitizeHtml, escapeHtml } from './sanitize';

export const markdownToNoteHtml = (content) => {
  const code = [];
  const protectedText = String(content || '').replace(/(^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]{0,3}\2[ \t]*$|<pre\b[^>]*>[\s\S]*?<\/pre>|`[^`\n]+`)/gm, (value) => {
    code.push(value);
    return `ZNOTECODE${code.length - 1}Z`;
  });
  const { text, mathStore } = extractMathPlaceholders(protectedText);
  const restoredCode = text.replace(/ZNOTECODE(\d+)Z/g, (_, index) => code[Number(index)]);
  const html = marked.parse(restoredCode, { breaks: true, gfm: true });
  return sanitizeHtml(restoreMathPlaceholders(html, mathStore));
};

const encodeBlockPayload = (value) => {
  if (!value) return '';
  try {
    return btoa(unescape(encodeURIComponent(value)));
  } catch (e) {
    return '';
  }
};

const decodeBlockPayload = (value) => {
  if (!value) return '';
  try {
    return decodeURIComponent(escape(atob(value)));
  } catch (e) {
    return '';
  }
};

export const htmlToBlocks = (html) => {
  if (!html || html.trim() === '') {
    return [{
      id: Date.now(),
      type: 'paragraph',
      content: '',
      properties: {}
    }];
  }
  
  const blocks = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  
  const processNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      if (text) {
        blocks.push({
          id: Date.now() + Math.random(),
          type: 'paragraph',
          content: text,
          properties: {}
        });
      }
      return;
    }
    
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tagName = node.tagName.toLowerCase();
      const dataBlockType = node.getAttribute('data-block-type');
      if (dataBlockType === 'canvas') {
        const canvasData = decodeBlockPayload(node.getAttribute('data-canvas') || '');
        const canvasPreview = decodeBlockPayload(node.getAttribute('data-thumb') || '');
        blocks.push({
          id: Date.now() + Math.random(),
          type: 'canvas',
          content: '',
          properties: {
            canvasData,
            canvasPreview
          }
        });
        return;
      }
      const content = node.innerHTML || node.textContent || '';
      const textContent = node.textContent.trim();
      
      if (tagName === 'img') {
        blocks.push({ id: Date.now() + Math.random(), type: 'paragraph', content: sanitizeHtml(node.outerHTML), properties: {} });
        return;
      }
      if (!textContent && !node.querySelector('img') && tagName !== 'hr') return;
      
      switch (tagName) {
        case 'h1':
          blocks.push({
            id: Date.now() + Math.random(),
            type: 'heading1',
            content: textContent,
            properties: {}
          });
          break;
        case 'h2':
          blocks.push({
            id: Date.now() + Math.random(),
            type: 'heading2',
            content: textContent,
            properties: {}
          });
          break;
        case 'h3':
          blocks.push({
            id: Date.now() + Math.random(),
            type: 'heading3',
            content: textContent,
            properties: {}
          });
          break;
        case 'ul':
          
          Array.from(node.children).filter(li => li.tagName === 'LI').forEach(li => {
            blocks.push({
              id: Date.now() + Math.random(),
              type: 'bulletList',
              content: li.innerHTML,
              properties: {}
            });
          });
          break;
        case 'ol':
          
          Array.from(node.children).filter(li => li.tagName === 'LI').forEach(li => {
            blocks.push({
              id: Date.now() + Math.random(),
              type: 'numberedList',
              content: li.innerHTML,
              properties: {}
            });
          });
          break;
        case 'blockquote':
          blocks.push({
            id: Date.now() + Math.random(),
            type: 'quote',
            content: textContent,
            properties: {}
          });
          break;
        case 'table':
          blocks.push({ id: Date.now() + Math.random(), type: 'table', content: '', properties: {
            tableData: { rows: Array.from(node.rows).map(row => Array.from(row.cells).map(cell => cell.textContent)) }
          } });
          break;
        case 'pre':
        case 'code':
          blocks.push({
            id: Date.now() + Math.random(),
            type: 'code',
            content: node.textContent.replace(/\n$/, ''),
            properties: { language: (node.querySelector('code') || node).className.replace('language-', '') }
          });
          break;
        case 'hr':
          blocks.push({
            id: Date.now() + Math.random(),
            type: 'divider',
            content: '',
            properties: {}
          });
          break;
        case 'p':
          if (textContent || node.querySelector('img')) {
            blocks.push({
              id: Date.now() + Math.random(),
              type: 'paragraph',
              content: content,
              properties: {}
            });
          }
          break;
        case 'div':
        case 'section':
        case 'article':
          
          Array.from(node.childNodes).forEach(processNode);
          break;
        default:
          
          if (textContent && !['ul', 'ol', 'li'].includes(tagName)) {
            blocks.push({
              id: Date.now() + Math.random(),
              type: 'paragraph',
              content: content,
              properties: {}
            });
          }
      }
    }
  };
  
  
  Array.from(doc.body.childNodes).forEach(processNode);
  
  
  if (blocks.length === 0) {
    blocks.push({
      id: Date.now(),
      type: 'paragraph',
      content: html.replace(/<[^>]*>/g, ''),
      properties: {}
    });
  }
  
  return blocks;
};

export const blocksToHtml = (blocks) => {
  if (!blocks || blocks.length === 0) return '';
  
  return blocks.map(block => {
    const content = block.content || '';
    
    switch (block.type) {
      case 'heading1':
        return `<h1>${content}</h1>`;
      case 'heading2':
        return `<h2>${content}</h2>`;
      case 'heading3':
        return `<h3>${content}</h3>`;
      case 'bulletList':
        return `<ul><li>${content}</li></ul>`;
      case 'numberedList':
        return `<ol><li>${content}</li></ol>`;
      case 'quote':
        return `<blockquote>${content}</blockquote>`;
      case 'code':
        return `<pre><code class="language-${escapeHtml(block.properties?.language || '')}">${escapeHtml(content)}</code></pre>`;
      case 'mermaid':
        return `<pre><code class="language-mermaid">${escapeHtml(content)}</code></pre>`;
      case 'table':
        return `<table>${(block.properties?.tableData?.rows || []).map((row, index) => `<tr>${row.map(cell => `<${index === 0 ? 'th' : 'td'}>${escapeHtml(cell)}</${index === 0 ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`;
      case 'divider':
        return '<hr/>';
      case 'todo':
        return `<div><input type="checkbox" ${block.properties?.checked ? 'checked' : ''}/> ${content}</div>`;
      case 'callout':
      case 'info':
      case 'warning':
      case 'success':
      case 'tip':
        return `<div class="callout ${block.type}">${content}</div>`;
      case 'canvas':
        return `<div class="canvas-block" data-block-type="canvas" data-canvas="${encodeBlockPayload(block.properties?.canvasData || '')}" data-thumb="${encodeBlockPayload(block.properties?.canvasPreview || '')}"></div>`;
      default:
        return `<p>${content}</p>`;
    }
  }).join('\n');
};

