import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Youtube, FileText, Save, Copy, RefreshCw, Mic, Loader, ArrowLeft, MessageSquare, LayoutDashboard, LogOut, Headphones, FolderOpen, Menu } from 'lucide-react';
import './AudioVideoNotes.css';
import '../components/SocialHubChrome.css';
import { API_URL } from '../config';
import { sanitizeHtml } from '../utils/sanitize';
import { signOutAppSession } from '../utils/authSession';
import { queueLegacyAIFileEndpoint, queuedAIFormFetch } from '../services/aiJobService';

const MEDIA_FILE_ACCEPT = 'audio/*,video/*,.m4a,audio/mp4,audio/x-m4a';

const AudioVideoNotes = () => {
  const navigate = useNavigate();
  const userName = localStorage.getItem('username');

  const [uploadedFile, setUploadedFile] = useState(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [generatedNotes, setGeneratedNotes] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  ));

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setUploadedFile(file);
      setYoutubeUrl('');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setUploadedFile(file);
      setYoutubeUrl('');
    }
  };

  const generateNotesFromMedia = async () => {
    if (!uploadedFile && !youtubeUrl) {
      alert('Please upload a file or provide a YouTube URL');
      return;
    }

    setIsGenerating(true);
    setGenerationProgress(0);
    let progressInterval = null;

    try {
      const formData = new FormData();
      formData.append('user_id', userName);
      
      if (uploadedFile) {
        formData.append('file', uploadedFile);
      } else if (youtubeUrl) {
        formData.append('youtube_url', youtubeUrl);
      }

      progressInterval = setInterval(() => {
        setGenerationProgress(prev => Math.min(prev + 10, 90));
      }, 500);

      const response = uploadedFile
        ? new Response(JSON.stringify(await queueLegacyAIFileEndpoint(
            '/api/generate_notes_from_media',
            { user_id: userName },
            [{ fieldName: 'file', file: uploadedFile }],
            { timeoutMs: 300000 }
          )), { status: 200, headers: { 'Content-Type': 'application/json' } })
        : await queuedAIFormFetch('/generate_notes_from_media', Object.fromEntries(formData.entries()), {
            timeoutMs: 300000,
          });

      clearInterval(progressInterval);
      progressInterval = null;
      setGenerationProgress(100);

      if (response.ok) {
        const data = await response.json();
        setGeneratedNotes(data.notes || '');
      } else {
        throw new Error('Failed to generate notes');
      }
    } catch (error) {
      alert('Failed to generate notes. Please try again.');
    } finally {
      if (progressInterval) clearInterval(progressInterval);
      setIsGenerating(false);
      setTimeout(() => setGenerationProgress(0), 1000);
    }
  };

  const copyNotes = async () => {
    try {
      await navigator.clipboard.writeText(generatedNotes || '');
      alert('Notes copied to clipboard!');
    } catch (error) {
      alert('Failed to copy notes');
    }
  };

  const saveToMyNotes = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/create_note`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: userName,
          title: 'Generated Notes',
          content: generatedNotes
        })
      });

      if (response.ok) {
        const newNote = await response.json();
        alert('Notes saved successfully!');
        navigate(`/notes/editor/${newNote.id}`);
      } else {
        throw new Error(`Failed to save notes: ${response.status}`);
      }
    } catch (error) {
      alert('Failed to save notes');
    }
  };

  const regenerateNotes = () => {
    setGeneratedNotes('');
    generateNotesFromMedia();
  };

  const handleTileMove = useCallback((e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = x / rect.width - 0.5;
    const cy = y / rect.height - 0.5;
    card.style.setProperty('--mx', `${x}px`);
    card.style.setProperty('--my', `${y}px`);
    card.style.setProperty('--rx', `${(-cy * 7).toFixed(2)}deg`);
    card.style.setProperty('--ry', `${(cx * 9).toFixed(2)}deg`);
  }, []);
  const handleTileLeave = useCallback((e) => {
    const card = e.currentTarget;
    card.style.setProperty('--rx', '0deg');
    card.style.setProperty('--ry', '0deg');
  }, []);

  return (
    <div className="audio-video-notes-page">
      <div className="shc-topbar">
        <div className="shc-tagline"><span>LEARNING,</span> UNIFIED</div>
        <div className="shc-topbar-right">
          <button className="shc-top-btn" type="button" onClick={() => navigate('/dashboard-cerbyl')}>Dashboard</button>
        </div>
      </div>
      <div className="avn-qb-body">
        <button
          className="avn-qb-mobile-menu-btn"
          type="button"
          onClick={() => setSidebarCollapsed(false)}
          aria-label="Open audio and video notes sidebar"
        >
          <Menu size={18} />
        </button>
        {!sidebarCollapsed && (
          <button
            className="avn-qb-mobile-sidebar-backdrop"
            type="button"
            onClick={() => setSidebarCollapsed(true)}
            aria-label="Close audio and video notes sidebar"
          />
        )}
        <div className={`avn-qb-shell ${sidebarCollapsed ? 'avn-qb-shell--collapsed' : ''}`}>
          <aside className={`avn-qb-sidebar ${sidebarCollapsed ? 'avn-qb-sidebar--collapsed' : ''}`} aria-label="Audio & Video Notes navigation">
            {sidebarCollapsed ? (
              <div className="avn-qb-collapsed-strip">
                <button className="avn-qb-strip-btn avn-qb-strip-logo" data-tip="Open sidebar" onClick={() => setSidebarCollapsed(false)} type="button">
                  cb
                </button>
                <button className="avn-qb-strip-btn" data-tip="AI Media & Podcast" onClick={() => navigate('/notes/ai-media')} type="button">
                  <Headphones size={18} />
                </button>
                <button className="avn-qb-strip-btn" data-tip="Back to Notes" onClick={() => navigate('/notes')} type="button">
                  <FolderOpen size={18} />
                </button>
                <div className="avn-qb-strip-spacer" />
                <button className="avn-qb-strip-btn" data-tip="AI Chat" onClick={() => navigate('/ai-chat')} type="button">
                  <MessageSquare size={18} />
                </button>
                <button className="avn-qb-strip-btn" data-tip="Dashboard" onClick={() => navigate('/dashboard-cerbyl')} type="button">
                  <LayoutDashboard size={18} />
                </button>
                <button
                  className="avn-qb-strip-btn"
                  data-tip="Logout"
                  onClick={() => {
                    void signOutAppSession();
                    localStorage.removeItem('token');
                    localStorage.removeItem('username');
                    navigate('/');
                  }}
                  type="button"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
            <>
              <div className="avn-qb-side-brand">
                <div className="avn-qb-brand-wrap">
                  <div className="avn-qb-brand">cerbyl</div>
                  <div className="avn-qb-current-title">Audio & Video Notes</div>
                </div>
                <button
                  className="avn-qb-side-close-btn"
                  onClick={() => setSidebarCollapsed(true)}
                  title="Close sidebar"
                  aria-label="Close audio & video notes sidebar"
                  type="button"
                >
                  <ArrowLeft size={14} />
                </button>
              </div>

              <div className="avn-qb-side-block">
                <div className="avn-qb-side-label">Navigation</div>
                <nav className="avn-qb-view-nav" aria-label="Audio & video notes navigation">
                  <button className="avn-qb-view-link avn-qb-view-link--accent" onClick={() => navigate('/notes/ai-media')} type="button">
                    <Headphones size={16} />
                    <span>AI Media + Podcast</span>
                  </button>
                  <button className="avn-qb-view-link" onClick={() => navigate('/notes')} type="button">
                    <FolderOpen size={16} />
                    <span>Back to Notes</span>
                  </button>
                </nav>
              </div>

              <div className="avn-qb-side-block">
                <div className="avn-qb-side-label">About</div>
                <p className="avn-qb-side-note">
                  Generate notes from uploaded audio/video files or a YouTube URL. New podcast mode is available in AI Media Notes.
                </p>
              </div>

              <div className="avn-qb-side-actions">
                <button
                  className="avn-qb-action-btn avn-qb-action-btn--ghost"
                  onClick={() => navigate('/dashboard-cerbyl')}
                  type="button"
                >
                  <LayoutDashboard size={14} />
                  <span>Dashboard</span>
                </button>
                <button
                  className="avn-qb-action-btn avn-qb-action-btn--ghost"
                  onClick={() => navigate('/ai-chat')}
                  type="button"
                >
                  <MessageSquare size={14} />
                  <span>AI Chat</span>
                </button>
                <button
                  className="avn-qb-action-btn avn-qb-action-btn--ghost"
                  onClick={() => {
                    void signOutAppSession();
                    localStorage.removeItem('token');
                    localStorage.removeItem('username');
                    navigate('/');
                  }}
                  type="button"
                >
                  <LogOut size={14} />
                  <span>Logout</span>
                </button>
              </div>
            </>
            )}
          </aside>

          <main className="avn-qb-main">
      <div className="page-header-bar">
        <div className="header-left">
          <h1 className="page-title-main">audio / video notes</h1>
          <p className="page-subtitle-main">generate notes from media files</p>
        </div>
      </div>

      <div className="content-grid">
        <div className="upload-panel" onMouseMove={handleTileMove} onMouseLeave={handleTileLeave}>
          <div className="cb-tile-texture" />
          <h2>Upload Media</h2>
          
          <div
            className={`upload-area ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-upload"
              accept={MEDIA_FILE_ACCEPT}
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <label htmlFor="file-upload" className="upload-label">
              <Upload size={48} />
              <p>Drag & drop or click to upload</p>
              <span>Supports audio & video files</span>
            </label>
            {uploadedFile && (
              <div className="uploaded-file">
                <FileText size={20} />
                <span>{uploadedFile.name}</span>
              </div>
            )}
          </div>

          <div className="divider">
            <span>or</span>
          </div>

          <div className="youtube-input-group">
            <Youtube size={20} />
            <input
              type="text"
              placeholder="Paste YouTube URL here..."
              value={youtubeUrl}
              onChange={(e) => {
                setYoutubeUrl(e.target.value);
                if (e.target.value) setUploadedFile(null);
              }}
            />
          </div>

          <button
            onClick={generateNotesFromMedia}
            disabled={isGenerating || (!uploadedFile && !youtubeUrl)}
            className="generate-btn"
          >
            {isGenerating ? (
              <>
                <Loader size={18} className="spinner" />
                Generating...
              </>
            ) : (
              <>
                <Mic size={18} />
                Generate Notes
              </>
            )}
          </button>

          {isGenerating && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${generationProgress}%` }} />
            </div>
          )}
        </div>

        {generatedNotes && (
          <div className="output-panel">
            <div className="output-header">
              <h2>Generated Notes</h2>
              <div className="output-actions">
                <button onClick={copyNotes} className="action-btn">
                  <Copy size={16} />
                  Copy
                </button>
                <button onClick={saveToMyNotes} className="action-btn primary">
                  <Save size={16} />
                  Save to My Notes
                </button>
                <button onClick={regenerateNotes} className="action-btn">
                  <RefreshCw size={16} />
                  Regenerate
                </button>
              </div>
            </div>
            <div className="notes-output" dangerouslySetInnerHTML={{ __html: sanitizeHtml(generatedNotes) }} />
          </div>
        )}
      </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default AudioVideoNotes;
