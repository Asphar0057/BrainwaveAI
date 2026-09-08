// Cards show an excerpt, so document layout and math-renderer styles cannot leak into them.
export function notePreviewText(content) {
  const document = new DOMParser().parseFromString(String(content || ''), 'text/html');
  document.querySelectorAll('script, style, svg, img').forEach(node => node.remove());
  document.querySelectorAll('p, div, h1, h2, h3, h4, li, br').forEach(node => node.append(' '));
  return (document.body.textContent || '')
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 360) || 'Empty note';
}
