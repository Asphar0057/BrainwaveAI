import { useEffect, useRef, useState } from 'react';
import { getConversationPrompts } from '../utils/conversationMap';

const ConversationMap = ({ messages, activePromptId, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const mapRef = useRef(null);
  const prompts = getConversationPrompts(messages);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        mapRef.current?.querySelector('.ac-thread-map-toggle')?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (prompts.length < 2) return null;

  const activePrompt = prompts.find((prompt) => prompt.id === String(activePromptId)) || prompts[0];
  const navigateToPrompt = (promptId) => {
    onNavigate?.(promptId);
    setIsOpen(false);
  };

  return (
    <nav
      ref={mapRef}
      className={`ac-thread-map ${isOpen ? 'is-open' : ''}`}
      aria-label={`Conversation map, ${prompts.length} prompts`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocusCapture={() => setIsOpen(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <button
        type="button"
        className="ac-thread-map-toggle"
        aria-expanded={isOpen}
        aria-controls="ac-thread-map-panel"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="ac-thread-map-toggle-label">Q</span>
        <span>{activePrompt.questionNumber}/{prompts.length}</span>
      </button>

      <div className="ac-thread-map-rail" aria-label="Prompt markers">
        <span className="ac-thread-map-track" aria-hidden="true" />
        {prompts.map((prompt) => {
          const isActive = prompt.id === activePrompt.id;
          return (
            <button
              key={prompt.id}
              type="button"
              className={`ac-thread-map-marker ${isActive ? 'is-active' : ''}`}
              aria-label={`Question ${prompt.questionNumber}: ${prompt.preview}`}
              aria-current={isActive ? 'location' : undefined}
              title={`Q${prompt.questionNumber}: ${prompt.preview}`}
              onClick={() => navigateToPrompt(prompt.id)}
            >
              <span aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <section id="ac-thread-map-panel" className="ac-thread-map-panel" aria-label="Prompts in this conversation">
        <header className="ac-thread-map-header">
          <div>
            <strong>Thread map</strong>
            <span>{prompts.length} prompts</span>
          </div>
          <span className="ac-thread-map-position">Q{activePrompt.questionNumber}</span>
        </header>

        <ol className="ac-thread-map-list">
          {prompts.map((prompt) => {
            const isActive = prompt.id === activePrompt.id;
            return (
              <li key={prompt.id}>
                <button
                  type="button"
                  className={isActive ? 'is-active' : ''}
                  aria-current={isActive ? 'location' : undefined}
                  onClick={() => navigateToPrompt(prompt.id)}
                >
                  <span className="ac-thread-map-number">Q{prompt.questionNumber}</span>
                  <span className="ac-thread-map-copy">{prompt.preview}</span>
                  {isActive && <span className="ac-thread-map-reading">Reading</span>}
                </button>
              </li>
            );
          })}
        </ol>

        <p className="ac-thread-map-hint">Choose a prompt to jump back into the thread.</p>
      </section>
    </nav>
  );
};

export default ConversationMap;
