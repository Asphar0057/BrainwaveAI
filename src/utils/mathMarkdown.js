import { marked } from 'marked';

// Shared math/markdown pipeline used by every chat-like surface (AIChat, AIChatDock,
// KnowledgeMap, PlaylistDetailPage, and any page that needs to render AI text
// containing LaTeX). Consolidates 4 previously-duplicated implementations.
//
// Markdown mangles \[, \(, and $$ (treats \ as an escape char, $ as formatting),
// so math spans are pulled out into placeholders before `marked` runs and restored
// into KaTeX-ready `$...$`/`$$...$$` delimiters afterward, ready for <MathRenderer>.

export function extractMathPlaceholders(text, { prefix = 'ZMATH' } = {}) {
  const mathStore = [];
  const placeholder = (i) => `${prefix}${i}Z`;
  let src = String(text || '');

  // Display: $$...$$ (may be multiline)
  src = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => {
    mathStore.push({ tex: m.trim(), display: true });
    return placeholder(mathStore.length - 1);
  });
  // Display: \[...\] (may be multiline)
  src = src.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => {
    mathStore.push({ tex: m.trim(), display: true });
    return placeholder(mathStore.length - 1);
  });
  // Inline: $...$ (single-line only)
  src = src.replace(/\$([^\n$]{1,300}?)\$/g, (_, m) => {
    mathStore.push({ tex: m.trim(), display: false });
    return placeholder(mathStore.length - 1);
  });
  // Inline: \(...\)
  src = src.replace(/\\\(([^\n]{1,300}?)\\\)/g, (_, m) => {
    mathStore.push({ tex: m.trim(), display: false });
    return placeholder(mathStore.length - 1);
  });

  return { text: src, mathStore };
}

export function restoreMathPlaceholders(html, mathStore, { prefix = 'ZMATH' } = {}) {
  const re = new RegExp(`${prefix}(\\d+)Z`, 'g');
  return String(html || '').replace(re, (_, i) => {
    const record = mathStore[Number(i)];
    if (!record) return '';
    if (record.display) return `<div class="math-display-wrap">$$${record.tex}$$</div>`;
    return `$${record.tex}$`;
  });
}

function buildRenderer({ tutorStepList = false } = {}) {
  const renderer = new marked.Renderer();
  renderer.heading = ({ text, depth }) => `<h${depth} class="md-h${depth}">${text}</h${depth}>`;
  renderer.strong = ({ text }) => `<strong class="md-bold-inline">${text}</strong>`;
  renderer.codespan = ({ text }) => `<code class="md-inline-code">${text}</code>`;

  if (tutorStepList) {
    const renderListItem = function renderListItem(token) {
      const t = this.parser.parseInline(token.tokens || []);
      const stepMatch = String(t || '').match(/^(?:<p>)?\s*(?:<strong[^>]*>)?\s*(Step\s+\d+\s*[—–-]\s*[^:<]+:?)(?:<\/strong>)?\s*([\s\S]*?)(?:<\/p>)?$/i);
      if (stepMatch) {
        return `<li class="ac-tutor-step-item"><span class="ac-tutor-step-title">${stepMatch[1].trim()}</span>${stepMatch[2] ? ` <span class="ac-tutor-step-body">${stepMatch[2].trim()}</span>` : ''}</li>`;
      }
      return `<li>${t}</li>`;
    };
    renderer.list = function list(token) {
      const body = (token.items || []).map((item) => renderListItem.call(this, item)).join('');
      const isTutorStepList = /class="ac-tutor-step-item"/.test(body);
      const tag = token.ordered ? 'ol' : 'ul';
      const className = isTutorStepList ? 'ac-tutor-step-list' : (token.ordered ? 'md-ol' : 'md-ul');
      return `<${tag} class="${className}">${body}</${tag}>`;
    };
    renderer.listitem = renderListItem;
  } else {
    renderer.list = function list(token) {
      const body = (token.items || []).map((item) => this.listitem(item)).join('');
      const tag = token.ordered ? 'ol' : 'ul';
      const className = token.ordered ? 'md-ol' : 'md-ul';
      return `<${tag} class="${className}">${body}</${tag}>`;
    };
    renderer.listitem = function listitem(token) {
      return `<li class="md-li">${this.parser.parseInline(token.tokens || [])}</li>`;
    };
  }
  return renderer;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightKeywordsInHtml(html, className) {
  return html.replace(/>([^<]+)</g, (full, inner) => {
    // Don't touch content inside math wrappers
    if (/\$/.test(inner)) return full;
    return '>' + inner.replace(/\b([A-Z]{3,})\b/g, `<span class="${className}">$1</span>`) + '<';
  });
}

/**
 * Render AI/markdown text that may contain LaTeX into HTML ready for <MathRenderer>.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {(t: string) => string} [options.preprocess] - page-specific text normalization run before math extraction
 * @param {boolean} [options.tutorStepList] - enables "Step N — ..." list-item detection/styling
 * @param {boolean|string} [options.highlightKeywords] - wrap ALL-CAPS keywords in a span; pass a string to pick the class (default 'kw-highlight')
 */
export function renderMarkdownWithMath(text, options = {}) {
  if (!text) return '';
  const { preprocess, tutorStepList = false, highlightKeywords = false } = options;

  let src = String(text);
  if (typeof preprocess === 'function') {
    src = preprocess(src);
  }

  const { text: withPlaceholders, mathStore } = extractMathPlaceholders(src);
  const renderer = buildRenderer({ tutorStepList });

  let html;
  try {
    html = marked.parse(withPlaceholders, { renderer, breaks: true, gfm: true });
  } catch {
    try {
      html = marked.parse(withPlaceholders, { breaks: true, gfm: true });
    } catch {
      html = `<p>${escapeHtml(withPlaceholders).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br />')}</p>`;
    }
  }

  html = restoreMathPlaceholders(html, mathStore);

  if (highlightKeywords) {
    html = highlightKeywordsInHtml(html, typeof highlightKeywords === 'string' ? highlightKeywords : 'kw-highlight');
  }

  return html;
}
