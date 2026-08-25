import { useMemo, useRef, useState } from 'react';
import { X, Copy, Check, Link as LinkIcon, Code, FileText, Share2 } from 'lucide-react';
import './PlaylistShareModal.css';
import useDialogA11y from '../hooks/useDialogA11y';
import { escapeHtml, sanitizeUrl } from '../utils/sanitize';

const buildShareContent = (playlist, format, shareUrl) => {
  const items = playlist.items || [];
  const creatorName = playlist.creator?.first_name || playlist.creator?.username || 'Cerbyl user';
  const visibility = playlist.is_public ? 'Public' : 'Private';
  const category = playlist.category || 'Uncategorized';
  const difficulty = playlist.difficulty_level || 'All levels';
  const tags = Array.isArray(playlist.tags)
    ? (playlist.tags.length ? playlist.tags.join(', ') : '')
    : (playlist.tags || '');

  const itemLines = items.length
    ? items.map((item, index) => {
        const type = item.item_type ? item.item_type.replace('_', ' ') : 'item';
        const duration = item.duration_minutes ? ` • ${item.duration_minutes} min` : '';
        const platform = item.platform ? ` • ${item.platform}` : '';
        const link = item.url ? `\n   ${item.url}` : '';
        return `${index + 1}. ${item.title || 'Untitled'} (${type}${platform}${duration})${link}`;
      }).join('\n')
    : 'No items yet.';

  if (format === 'html') {
    const itemHtml = items.length
      ? items.map((item) => {
          const type = item.item_type ? item.item_type.replace('_', ' ') : 'item';
          const duration = item.duration_minutes ? ` • ${item.duration_minutes} min` : '';
          const platform = item.platform ? ` • ${item.platform}` : '';
          const safeUrl = sanitizeUrl(item.url);
          const link = safeUrl ? ` <a href="${escapeHtml(safeUrl)}" rel="noopener noreferrer">link</a>` : '';
          return `<li><strong>${escapeHtml(item.title || 'Untitled')}</strong> (${escapeHtml(type)}${escapeHtml(platform)}${escapeHtml(duration)})${link}</li>`;
        }).join('')
      : '<li>No items yet.</li>';

    return [
      `<h1>${escapeHtml(playlist.title)}</h1>`,
      playlist.description ? `<p>${escapeHtml(playlist.description)}</p>` : '',
      `<p><strong>Category:</strong> ${escapeHtml(category)} • <strong>Difficulty:</strong> ${escapeHtml(difficulty)} • <strong>Visibility:</strong> ${escapeHtml(visibility)}</p>`,
      tags ? `<p><strong>Tags:</strong> ${escapeHtml(tags)}</p>` : '',
      `<p><strong>Curated by:</strong> ${escapeHtml(creatorName)}</p>`,
      `<p><strong>Playlist Link:</strong> ${escapeHtml(shareUrl)}</p>`,
      `<h2>Items</h2>`,
      `<ul>${itemHtml}</ul>`
    ].filter(Boolean).join('\n');
  }

  if (format === 'text') {
    return [
      `${playlist.title}`,
      playlist.description || '',
      `Category: ${category} | Difficulty: ${difficulty} | Visibility: ${visibility}`,
      tags ? `Tags: ${tags}` : '',
      `Curated by: ${creatorName}`,
      `Playlist Link: ${shareUrl}`,
      '',
      'Items:',
      itemLines
    ].filter(Boolean).join('\n');
  }

  return [
    `# ${playlist.title}`,
    playlist.description || '',
    `**Category:** ${category}  |  **Difficulty:** ${difficulty}  |  **Visibility:** ${visibility}`,
    tags ? `**Tags:** ${tags}` : '',
    `**Curated by:** ${creatorName}`,
    `**Playlist Link:** ${shareUrl}`,
    '',
    '## Items',
    itemLines
  ].filter(Boolean).join('\n');
};

const PlaylistShareModal = ({ playlist, isOpen, onClose }) => {
  const dialogRef = useRef(null);
  useDialogA11y(isOpen, onClose, dialogRef);
  const [format, setFormat] = useState('markdown');
  const [copied, setCopied] = useState('');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const shareUrl = playlist ? `${origin}/playlists/${playlist.uid || playlist.id}` : '';
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;
  const content = useMemo(() => {
    if (!playlist) return '';
    return buildShareContent(playlist, format, shareUrl);
  }, [playlist, format, shareUrl]);

  if (!isOpen || !playlist) return null;

  const handleCopy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch (error) {
      setCopied('');
    }
  };

  const handleShare = async () => {
    if (!canShare) return;
    try {
      await navigator.share({
        title: playlist.title,
        text: `Check out this learning playlist: ${playlist.title}`,
        url: shareUrl
      });
    } catch (error) { /* silenced */ }
  };

  return (
    <div className="playlist-share-overlay" onClick={onClose}>
      <div ref={dialogRef} className="playlist-share-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="playlist-share-title" tabIndex={-1}>
        <div className="playlist-share-header">
          <div>
            <h2 id="playlist-share-title">Share Playlist</h2>
            <p>Copy a link or formatted outline to share.</p>
          </div>
          <button className="share-close-btn" type="button" onClick={onClose} aria-label="Close share playlist dialog">
            <X size={18} />
          </button>
        </div>

        <div className="playlist-share-body">
          <div className="playlist-share-link-row">
            <div className="playlist-share-link">
              <LinkIcon size={14} />
              <span>{shareUrl}</span>
            </div>
            <button type="button" className="playlist-share-copy-btn" onClick={() => handleCopy(shareUrl, 'link')}>
              {copied === 'link' ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied === 'link' ? 'Copied' : 'Copy Link'}</span>
            </button>
            {canShare && (
              <button type="button" className="playlist-share-native-btn" onClick={handleShare}>
                <Share2 size={14} />
                <span>Share</span>
              </button>
            )}
          </div>

          <div className="playlist-share-format-tabs">
            <button
              className={`playlist-share-format-btn ${format === 'markdown' ? 'active' : ''}`}
              type="button"
              aria-pressed={format === 'markdown'}
              onClick={() => setFormat('markdown')}
            >
              <Code size={14} />
              Markdown
            </button>
            <button
              className={`playlist-share-format-btn ${format === 'text' ? 'active' : ''}`}
              type="button"
              aria-pressed={format === 'text'}
              onClick={() => setFormat('text')}
            >
              <FileText size={14} />
              Plain Text
            </button>
            <button
              className={`playlist-share-format-btn ${format === 'html' ? 'active' : ''}`}
              type="button"
              aria-pressed={format === 'html'}
              onClick={() => setFormat('html')}
            >
              <Code size={14} />
              HTML
            </button>
          </div>

          <div className="playlist-share-content">
            <label className="sr-only" htmlFor="playlist-share-content">Formatted playlist content</label>
            <textarea id="playlist-share-content" readOnly value={content} />
            <button type="button" className="playlist-share-copy-btn full" onClick={() => handleCopy(content, 'content')}>
              {copied === 'content' ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied === 'content' ? 'Copied' : 'Copy Format'}</span>
            </button>
          </div>
          <span className="sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
        </div>
      </div>
    </div>
  );
};

export default PlaylistShareModal;
