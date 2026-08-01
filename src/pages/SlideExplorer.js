import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader, FileText, Trash2, ChevronLeft, ChevronRight, BookOpen, Tag, Lightbulb, UploadCloud, MessageSquare, Brain, Zap, Maximize2, Minimize2, ArrowUpRight, Layers3 } from 'lucide-react';
import './SlideExplorer.css';
import { API_URL } from '../config';
import slideExplorerAgentService from '../services/slideExplorerAgentService';
import { sanitizeHtml } from '../utils/sanitize';
import SocialHubChrome from '../components/SocialHubChrome';

const getDeckTitle = (filename = 'Untitled presentation') => filename.replace(/\.(pdf|pptx|ppt)$/i, '');

const formatDeckDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently added';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const renderMarkdown = (text) => {
  if (!text) return '';

  const lines = text.split('\n');
  const processedLines = [];
  let inBulletList = false;
  let inNumberedList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (/^#### (.+)$/.test(line)) {
      if (inBulletList) { processedLines.push('</ul>'); inBulletList = false; }
      if (inNumberedList) { processedLines.push('</ol>'); inNumberedList = false; }
      processedLines.push(`<h4 class="md-h4">${line.replace(/^#### (.+)$/, '$1')}</h4>`);
      continue;
    }
    if (/^### (.+)$/.test(line)) {
      if (inBulletList) { processedLines.push('</ul>'); inBulletList = false; }
      if (inNumberedList) { processedLines.push('</ol>'); inNumberedList = false; }
      processedLines.push(`<h3 class="md-h3">${line.replace(/^### (.+)$/, '$1')}</h3>`);
      continue;
    }
    if (/^## (.+)$/.test(line)) {
      if (inBulletList) { processedLines.push('</ul>'); inBulletList = false; }
      if (inNumberedList) { processedLines.push('</ol>'); inNumberedList = false; }
      processedLines.push(`<h2 class="md-h2">${line.replace(/^## (.+)$/, '$1')}</h2>`);
      continue;
    }
    if (/^# (.+)$/.test(line)) {
      if (inBulletList) { processedLines.push('</ul>'); inBulletList = false; }
      if (inNumberedList) { processedLines.push('</ol>'); inNumberedList = false; }
      processedLines.push(`<h1 class="md-h1">${line.replace(/^# (.+)$/, '$1')}</h1>`);
      continue;
    }

    line = line.replace(/\*\*(.+?)\*\*/g, '<strong class="md-bold-inline">$1</strong>');
    line = line.replace(/__(.+?)__/g, '<strong class="md-bold-inline">$1</strong>');
    line = line.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, '<em>$1</em>');
    line = line.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

    const isBullet = /^[\*\-•] (.+)$/.test(line);
    const isNumbered = /^\d+\. (.+)$/.test(line);

    if (isBullet) {
      if (!inBulletList) { processedLines.push('<ul class="md-ul">'); inBulletList = true; }
      processedLines.push(`<li class="md-li">${line.replace(/^[\*\-•] (.+)$/, '$1')}</li>`);
    } else if (isNumbered) {
      if (!inNumberedList) { processedLines.push('<ol class="md-ol">'); inNumberedList = true; }
      processedLines.push(`<li class="md-li-num">${line.replace(/^\d+\. (.+)$/, '$1')}</li>`);
    } else {
      if (inBulletList) { processedLines.push('</ul>'); inBulletList = false; }
      if (inNumberedList) { processedLines.push('</ol>'); inNumberedList = false; }
      processedLines.push(line);
    }
  }
  if (inBulletList) processedLines.push('</ul>');
  if (inNumberedList) processedLines.push('</ol>');

  const finalContent = [];
  let currentParagraph = [];

  for (let i = 0; i < processedLines.length; i++) {
    const line = processedLines[i];
    const trimmedLine = line.trim();
    const isBlockElement = line.startsWith('<h') || line.startsWith('<ul') || line.startsWith('<ol') ||
      line.startsWith('</ul>') || line.startsWith('</ol>');
    const isEmptyLine = trimmedLine === '';

    if (isBlockElement) {
      if (currentParagraph.length > 0) { finalContent.push(`<p>${currentParagraph.join(' ')}</p>`); currentParagraph = []; }
      finalContent.push(line);
    } else if (isEmptyLine) {
      if (currentParagraph.length > 0) { finalContent.push(`<p>${currentParagraph.join(' ')}</p>`); currentParagraph = []; }
    } else {
      if (trimmedLine) currentParagraph.push(trimmedLine);
    }
  }
  if (currentParagraph.length > 0) finalContent.push(`<p>${currentParagraph.join(' ')}</p>`);

  return finalContent.join('\n');
};

const SlideExplorer = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const userId = localStorage.getItem('user_id') || localStorage.getItem('username');

  const [uploadedSlides, setUploadedSlides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState(null);
  const [analyzedSlides, setAnalyzedSlides] = useState([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeView, setActiveView] = useState('grid'); // 'grid' | 'upload'
  const [focusMode, setFocusMode] = useState(false);
  const [showInsights, setShowInsights] = useState({});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const fetchUploadedSlides = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/get_uploaded_slides?user_id=${userId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUploadedSlides(data.slides || []);
      }
    } catch (error) {
      // silenced
    } finally {
      setLoading(false);
    }
  }, [userId, token]);

  useEffect(() => {
    fetchUploadedSlides();
  }, [fetchUploadedSlides]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const narrowViewport = window.matchMedia('(max-width: 1100px)');
    const syncSidebar = (event) => {
      if (event.matches) setSidebarCollapsed(true);
    };
    syncSidebar(narrowViewport);
    narrowViewport.addEventListener?.('change', syncSidebar);
    return () => narrowViewport.removeEventListener?.('change', syncSidebar);
  }, []);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files);
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files.length > 0) handleUpload(e.target.files);
  };

  const handleUpload = async (files) => {
    const validFiles = Array.from(files).filter(file => file.name.match(/\.(pdf|pptx|ppt)$/i));
    if (validFiles.length === 0) { alert('Please upload PDF or PowerPoint files only'); return; }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('user_id', userId);
      validFiles.forEach(file => formData.append('files', file));

      const response = await fetch(`${API_URL}/upload_slides`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (response.ok) {
        await response.json();
        setActiveView('grid');
        await fetchUploadedSlides();
      } else {
        const errorData = await response.json();
        alert(`Failed to upload: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      alert('Error uploading slides');
    } finally {
      setUploading(false);
    }
  };

  const analyzeSlide = async (slideId) => {
    try {
      setAnalyzing(true);

      const slide = uploadedSlides.find(s => s.id === slideId);
      if (!slide) { setAnalyzing(false); return; }

      setSelectedSlide(slide);
      setCurrentSlideIndex(0);
      setFocusMode(false);

      try {
        await slideExplorerAgentService.analyzeSlide({
          userId,
          slideContent: slide.extracted_text || slide.title,
          analysisDepth: 'standard',
          sessionId: crypto.randomUUID()
        });
      } catch (agentError) {
        // silenced
      }

      const response = await fetch(`${API_URL}/analyze_slide/${slideId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.slides && data.slides.length > 0) {
          setAnalyzedSlides(data.slides);
        } else {
          alert('No slides found in the presentation');
          setSelectedSlide(null);
        }
      } else {
        const errorData = await response.json();
        alert(`Failed to analyze: ${errorData.detail || 'Unknown error'}`);
        setSelectedSlide(null);
      }
    } catch (error) {
      alert('Error analyzing slides. Please try again.');
      setSelectedSlide(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const deleteSlide = async (slideId, e) => {
    e && e.stopPropagation();
    if (!window.confirm('Delete this presentation?')) return;

    try {
      const response = await fetch(`${API_URL}/delete_slide/${slideId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        await fetchUploadedSlides();
        if (selectedSlide && selectedSlide.id === slideId) {
          setSelectedSlide(null);
          setAnalyzedSlides([]);
        }
      } else {
        alert('Failed to delete');
      }
    } catch (error) {
      alert('Error deleting');
    }
  };

  const goToSlide = (index) => {
    if (index >= 0 && index < analyzedSlides.length) setCurrentSlideIndex(index);
  };

  const currentSlide = analyzedSlides[currentSlideIndex];

  useEffect(() => {
    if (!selectedSlide || analyzedSlides.length === 0) return undefined;
    const handleSlideKeys = (event) => {
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable;
      if (isTyping) return;
      if (event.key === 'ArrowLeft' && currentSlideIndex > 0) {
        event.preventDefault();
        setCurrentSlideIndex(currentSlideIndex - 1);
      }
      if (event.key === 'ArrowRight' && currentSlideIndex < analyzedSlides.length - 1) {
        event.preventDefault();
        setCurrentSlideIndex(currentSlideIndex + 1);
      }
      if (event.key === 'Escape' && focusMode) {
        event.preventDefault();
        setFocusMode(false);
      }
    };
    window.addEventListener('keydown', handleSlideKeys);
    return () => window.removeEventListener('keydown', handleSlideKeys);
  }, [selectedSlide, analyzedSlides.length, currentSlideIndex, focusMode]);

  const leaveAnalysis = () => {
    setSelectedSlide(null);
    setAnalyzedSlides([]);
    setFocusMode(false);
  };

  const sidebarLead = (
    <button className="se-side-primary" type="button" onClick={() => setActiveView('upload')} disabled={uploading}>
      {uploading ? <Loader className="se-spinner" size={15} /> : <Upload size={15} />}
      <span>{uploading ? 'Uploading…' : 'Upload new'}</span>
    </button>
  );

  const librarySections = [
    {
      label: 'Slide library',
      items: [
        {
          icon: Layers3,
          label: 'My Slides',
          count: uploadedSlides.length,
          active: activeView === 'grid',
          onClick: () => setActiveView('grid'),
        },
        {
          icon: UploadCloud,
          label: 'Upload Slides',
          active: activeView === 'upload',
          disabled: uploading,
          onClick: () => setActiveView('upload'),
        },
      ],
    },
    ...(uploadedSlides.length > 0 ? [{
      label: 'Recent decks',
      items: uploadedSlides.slice(0, 5).map(slide => ({
        icon: FileText,
        label: getDeckTitle(slide.filename),
        count: slide.page_count,
        onClick: () => analyzeSlide(slide.id),
      })),
    }] : []),
  ];

  // ─── ANALYSIS VIEW ────────────────────────────────────────────────
  if (selectedSlide && analyzedSlides.length > 0) {
    const analysisSections = [{
      label: 'Presentation',
      items: analyzedSlides.map((slide, idx) => ({
        icon: FileText,
        label: slide.title || `Slide ${slide.slide_number}`,
        count: idx + 1,
        active: idx === currentSlideIndex,
        onClick: () => goToSlide(idx),
      })),
    }];

    return (
      <div className={`se-page with-social-chrome se-analysis-page ${focusMode ? 'se-focus-mode' : ''}`}>
        <SocialHubChrome
          brandKicker="Slides"
          noSidebar={focusMode}
          collapsed={sidebarCollapsed}
          onCollapsedChange={(nextCollapsed) => setSidebarCollapsed(nextCollapsed)}
          sidebarLead={(
            <button className="se-side-primary se-side-primary--quiet" type="button" onClick={leaveAnalysis}>
              <ChevronLeft size={15} />
              <span>Back to library</span>
            </button>
          )}
          sideSections={analysisSections}
        >
          <main className="se-workspace se-analysis-workspace">
            <header className="se-hero se-analysis-hero">
              <div>
                <span className="se-kicker">Presentation study desk</span>
                <h1>{getDeckTitle(selectedSlide.filename)}</h1>
                <p>Review the source slide beside its explanation, then reveal concepts and practice prompts when you need them.</p>
              </div>
              <div className="se-hero-actions">
                <button className="se-compact-btn" type="button" onClick={() => setFocusMode(value => !value)}>
                  {focusMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  <span>{focusMode ? 'Exit focus' : 'Focus mode'}</span>
                </button>
                <button className="se-compact-btn" type="button" onClick={leaveAnalysis}>
                  <ChevronLeft size={15} />
                  <span>Library</span>
                </button>
              </div>
            </header>

            <nav className="se-slide-stepper" aria-label="Slide navigation">
              <button type="button" onClick={() => goToSlide(currentSlideIndex - 1)} disabled={currentSlideIndex === 0}>
                <ChevronLeft size={16} />
                <span>Previous</span>
              </button>
              <div className="se-slide-position" aria-current="step">
                <span>Slide {currentSlideIndex + 1}</span>
                <strong>{currentSlide?.title || `Slide ${currentSlide?.slide_number}`}</strong>
                <small>{currentSlideIndex + 1} of {analyzedSlides.length}</small>
              </div>
              <button type="button" onClick={() => goToSlide(currentSlideIndex + 1)} disabled={currentSlideIndex === analyzedSlides.length - 1}>
                <span>Next</span>
                <ChevronRight size={16} />
              </button>
            </nav>

            {currentSlide && (
              <section className="se-analysis-grid" key={`${selectedSlide.id}-${currentSlide.slide_number}`}>
                <article className="se-slide-frame">
                  <div className="se-card-heading">
                    <div><span>Source frame</span><strong>Original slide</strong></div>
                    <small>{String(currentSlideIndex + 1).padStart(2, '0')}</small>
                  </div>
                  <div className="se-slide-canvas">
                    <span className="se-scan-line" aria-hidden="true" />
                    <img
                      src={`${API_URL}/slide_image/${selectedSlide.id}/${currentSlide.slide_number}?token=${encodeURIComponent(token)}`}
                      alt={`Slide ${currentSlide.slide_number}: ${currentSlide.title || 'Untitled'}`}
                      className="se-slide-img"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                        event.currentTarget.nextElementSibling.style.display = 'flex';
                      }}
                    />
                    <div className="se-slide-img-fallback" style={{ display: 'none' }}>
                      <FileText size={42} />
                      <span>Slide preview unavailable</span>
                    </div>
                  </div>
                  <div className="se-card-support">Source preserved at presentation quality</div>
                </article>

                <article className="se-explanation-panel">
                  <div className="se-card-heading">
                    <div><span>Study explanation</span><strong>{currentSlide.title || `Slide ${currentSlide.slide_number}`}</strong></div>
                    <Zap size={17} />
                  </div>

                  {currentSlide.detailed_explanation ? (
                    <div className="se-explanation-body">
                      <div
                        className="se-markdown-content"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(renderMarkdown(currentSlide.detailed_explanation)) }}
                      />

                      <div className="se-slide-actions">
                        <button
                          className={`se-action-btn se-action-insights ${showInsights[currentSlide.slide_number] ? 'active' : ''}`}
                          type="button"
                          aria-expanded={Boolean(showInsights[currentSlide.slide_number])}
                          onClick={() => setShowInsights(prev => ({ ...prev, [currentSlide.slide_number]: !prev[currentSlide.slide_number] }))}
                        >
                          <Lightbulb size={15} />
                          {showInsights[currentSlide.slide_number] ? 'Hide insights' : 'Show insights'}
                        </button>
                        <button
                          className="se-action-btn se-action-discuss"
                          type="button"
                          onClick={() => navigate(`/ai-chat?slideRef=${encodeURIComponent(`${selectedSlide.filename} — Slide ${currentSlide.slide_number}: ${currentSlide.title || ''}`)}`)}
                        >
                          <MessageSquare size={15} />
                          Discuss with AI
                        </button>
                      </div>

                      {showInsights[currentSlide.slide_number] && (
                        <div className="se-insights-panel">
                          {currentSlide.key_concepts && currentSlide.key_concepts.length > 0 && (
                            <section className="se-insight-section">
                              <div className="se-insight-header"><Lightbulb size={15} /><span>Key concepts</span></div>
                              <div className="se-concept-tags">
                                {currentSlide.key_concepts.map((concept, index) => <span key={index} className="se-concept-tag">{concept}</span>)}
                              </div>
                            </section>
                          )}
                          {currentSlide.definitions && Object.keys(currentSlide.definitions).length > 0 && (
                            <section className="se-insight-section">
                              <div className="se-insight-header"><Tag size={15} /><span>Definitions</span></div>
                              <div className="se-definitions-grid">
                                {Object.entries(currentSlide.definitions).map(([term, definition], index) => (
                                  <div key={index} className="se-definition-card">
                                    <h4 className="se-definition-term">{term}</h4>
                                    <p className="se-definition-text">{definition}</p>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}
                          {currentSlide.exam_questions && currentSlide.exam_questions.length > 0 && (
                            <section className="se-insight-section">
                              <div className="se-insight-header"><Brain size={15} /><span>Practice questions</span></div>
                              <div className="se-exam-questions">
                                {currentSlide.exam_questions.map((question, index) => (
                                  <div key={index} className="se-exam-question-card">
                                    <div className="se-question-header">
                                      <span className="se-question-number">Q{index + 1}</span>
                                      <span className={`se-question-difficulty ${question.difficulty}`}>{question.difficulty}</span>
                                    </div>
                                    <p className="se-question-text">{question.question}</p>
                                    {question.answer_hint && <div className="se-answer-hint"><strong>Hint:</strong> {question.answer_hint}</div>}
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}
                          {currentSlide.study_tips && currentSlide.study_tips.length > 0 && (
                            <section className="se-insight-section">
                              <div className="se-insight-header"><BookOpen size={15} /><span>Study tips</span></div>
                              <ul className="se-study-tips-list">
                                {currentSlide.study_tips.map((tip, index) => <li key={index}>{tip}</li>)}
                              </ul>
                            </section>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="se-no-explanation">
                      <Loader size={30} className="se-spinner" />
                      <p>Loading slide analysis…</p>
                    </div>
                  )}
                </article>
              </section>
            )}
          </main>
        </SocialHubChrome>

        {analyzing && (
          <div className="se-analyzing-overlay" role="status" aria-live="polite">
            <div className="se-analyzing-content">
              <div className="se-pulse-squares">
                <div className="se-pulse-sq" /><div className="se-pulse-sq" /><div className="se-pulse-sq" />
              </div>
              <h3 className="se-analyzing-title">Analyzing Presentation</h3>
              <p className="se-analyzing-sub">Extracting content and generating AI insights...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── MAIN CARD GRID ────────────────────────────────────────────────
  const totalSlideCount = uploadedSlides.reduce((total, slide) => total + (slide.page_count || 0), 0);
  const viewCopy = activeView === 'upload'
    ? {
      kicker: 'New presentation',
      title: 'Bring a deck into focus.',
      description: 'Upload a PDF or PowerPoint and Cerbyl will preserve every slide before building its study layer.',
    }
    : {
      kicker: 'Your slide library',
      title: 'Presentations worth revisiting.',
      description: 'Open a deck to study each source frame beside explanations, concepts and practice prompts.',
    };

  return (
    <div className="se-page with-social-chrome">
      <SocialHubChrome
        brandKicker="Slides"
        collapsed={sidebarCollapsed}
        onCollapsedChange={(nextCollapsed) => setSidebarCollapsed(nextCollapsed)}
        sidebarLead={sidebarLead}
        sideSections={librarySections}
      >
        <main className="se-workspace">
          <header className="se-hero">
            <div>
              <span className="se-kicker">{viewCopy.kicker}</span>
              <h1>{viewCopy.title}</h1>
              <p>{viewCopy.description}</p>
            </div>
          </header>

          <div className="se-content-toolbar">
            <div>
              <span>Library inventory</span>
              <strong>{uploadedSlides.length} presentation{uploadedSlides.length !== 1 ? 's' : ''} · {totalSlideCount} slides</strong>
            </div>
            <button type="button" onClick={() => setActiveView(activeView === 'upload' ? 'grid' : 'upload')} disabled={uploading}>
              {activeView === 'upload' ? <ChevronLeft size={14} /> : <Upload size={14} />}
              {activeView === 'upload' ? 'Back to library' : 'Upload presentation'}
            </button>
          </div>

          <section className="se-view" aria-live="polite">
          {activeView === 'upload' ? (
            <div className="se-upload-view">
              <div
                className={`se-upload-stage ${dragActive ? 'is-dragging' : ''} ${uploading ? 'is-disabled' : ''}`}
                role="button"
                tabIndex={uploading ? -1 : 0}
                aria-disabled={uploading}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => !uploading && document.getElementById('se-file-input').click()}
                onKeyDown={(event) => {
                  if (!uploading && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    document.getElementById('se-file-input').click();
                  }
                }}
              >
                <div className="se-upload-orbit" aria-hidden="true"><span /><span /><span /></div>
                <div className="se-upload-icon">
                  {uploading ? <Loader size={30} className="se-spinner" /> : <UploadCloud size={30} />}
                </div>
                <span className="se-upload-kicker">Source intake</span>
                <h2>{uploading ? 'Uploading presentation…' : 'Drop a deck into the workspace'}</h2>
                <p>PDF, PPTX or PPT · multiple files supported</p>
                <span className="se-upload-cta">{uploading ? 'Keeping the source intact' : 'Choose files'} <ArrowUpRight size={14} /></span>
                <input type="file" id="se-file-input" accept=".pdf,.pptx,.ppt" onChange={handleFileSelect} disabled={uploading} className="se-file-input" multiple />
              </div>
              <div className="se-upload-support">
                <div><span>01</span><strong>Original frames preserved</strong><small>Every slide remains traceable to the uploaded source.</small></div>
                <div><span>02</span><strong>Study layer generated</strong><small>Explanations, concepts and prompts stay beside the deck.</small></div>
              </div>
            </div>
          ) : (
            loading ? (
              <div className="se-loading" role="status"><div className="se-pulse-loader"><div className="se-pulse-sq" /><div className="se-pulse-sq" /><div className="se-pulse-sq" /></div><span>Arranging your slide library…</span></div>
            ) : uploadedSlides.length === 0 ? (
              <div className="se-empty-state">
                <div className="se-empty-icon-wrap"><Layers3 size={26} /></div>
                <span>Library ready</span>
                <h2>Your presentations will live here.</h2>
                <p>Upload a PDF or PowerPoint to create a source-aware study deck.</p>
                <button type="button" onClick={() => setActiveView('upload')}><UploadCloud size={16} />Upload presentation</button>
              </div>
            ) : (
              <div className="se-card-grid">
                {uploadedSlides.map((slide, index) => (
                  <article key={slide.id} className="se-deck-card" style={{ '--se-deck-index': index }}>
                    <div className="se-deck-preview">
                      <span className="se-preview-index">{String(index + 1).padStart(2, '0')}</span>
                      <img
                        src={`${API_URL}/slide_image/${slide.id}/1?token=${encodeURIComponent(token)}`}
                        alt={`First slide of ${getDeckTitle(slide.filename)}`}
                        className="se-deck-image"
                        onError={(event) => { event.currentTarget.style.display = 'none'; }}
                      />
                      <div className="se-deck-fallback"><FileText size={30} /><span>Presentation preview</span></div>
                      <button
                        className="se-delete-deck"
                        type="button"
                        aria-label={`Delete ${getDeckTitle(slide.filename)}`}
                        onClick={(event) => deleteSlide(slide.id, event)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="se-deck-copy">
                      <span>Presentation · {slide.page_count || 0} slides</span>
                      <h2>{getDeckTitle(slide.filename)}</h2>
                      <p>Added {formatDeckDate(slide.uploaded_at)}</p>
                    </div>
                    <div className="se-deck-footer">
                      <div><span>Study state</span><strong>Ready to explore</strong></div>
                      <button type="button" onClick={() => analyzeSlide(slide.id)} disabled={analyzing}>
                        Open deck <ArrowUpRight size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )
          )}
          </section>
        </main>
      </SocialHubChrome>

      {analyzing && (
        <div className="se-analyzing-overlay" role="status" aria-live="polite">
          <div className="se-analyzing-content">
            <div className="se-pulse-squares">
              <div className="se-pulse-sq" /><div className="se-pulse-sq" /><div className="se-pulse-sq" />
            </div>
            <h3 className="se-analyzing-title">Analyzing Presentation</h3>
            <p className="se-analyzing-sub">Extracting content and generating AI insights...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlideExplorer;
