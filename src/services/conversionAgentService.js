

import { API_URL, getAuthToken } from '../config';
import { queuedAIFormFetch } from './aiJobService';

class ConversionAgentService {
  constructor() {
    
    this.baseUrl = `${API_URL}/import_export`;
    this.chatConvertUrl = `${API_URL}/convert_chat_to_note_content/`;
    this.createNoteUrl = `${API_URL}/create_note`;
  }

  cleanChatTitle(title) {
    const cleaned = String(title || '')
      .replace(/\s+/g, ' ')
      .replace(/^(ai generated:|cerbyl:|chats?:|new chat:?)\s*/i, '')
      .trim();

    if (!cleaned) return '';
    if (/^(new chat|untitled|untitled session|chat|chat notes)$/i.test(cleaned)) return '';

    return cleaned;
  }

  buildChatNotesTitle(sessionTitles = [], sessionCount = 1) {
    const titles = [...new Set(
      (Array.isArray(sessionTitles) ? sessionTitles : [])
        .map((title) => this.cleanChatTitle(title))
        .filter(Boolean)
    )];

    if (titles.length === 1) {
      return /\bnotes?\b/i.test(titles[0]) ? titles[0] : `${titles[0]} Notes`;
    }

    if (titles.length > 1) {
      const visibleTitles = titles.slice(0, 2).join(', ');
      const remainingCount = Math.max(sessionCount, titles.length) - 2;
      return remainingCount > 0
        ? `${visibleTitles} + ${remainingCount} More Notes`
        : `${visibleTitles} Notes`;
    }

    return sessionCount > 1 ? `Chat Notes (${sessionCount} Sessions)` : 'Chat Notes';
  }

  
  getHeaders() {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  }

  
  getFileHeaders() {
    const token = getAuthToken();
    return {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      
    };
  }

  normalizeResult(data) {
    const hasSuccessFlag = typeof data?.success === 'boolean';
    const hasStatusFlag = typeof data?.status === 'string';
    const success = hasSuccessFlag
      ? data.success
      : hasStatusFlag
        ? data.status === 'success' || data.status === 'fallback'
        : true;

    const result = data?.result !== undefined ? data.result : data;

    return {
      ...(data || {}),
      success,
      result
    };
  }

  async fetchJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data.error || data.detail || `Request failed: ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  downloadFile(content, filename, mimeType = 'text/plain') {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    }
  }

  
  async convert(params) {
    const {
      sourceType,
      targetType,
      destinationType,
      userId,
      content,
      sourceIds,
      options = {}
    } = params;

    const target = targetType || destinationType || params.target;

    if (!target) {
      throw new Error('targetType or destinationType is required');
    }

    const mergedOptions = {
      ...options,
      cardCount: params.cardCount || options.cardCount,
      questionCount: params.questionCount || options.questionCount,
      difficulty: params.difficulty || options.difficulty,
      noteIds: sourceIds || options.noteIds || [],
      flashcardIds: sourceIds || options.flashcardIds || [],
      questionIds: sourceIds || options.questionIds || [],
      mediaIds: sourceIds || options.mediaIds || [],
      playlistIds: sourceIds || options.playlistIds || [],
      formatStyle: params.formatStyle || options.formatStyle,
      depthLevel: params.depthLevel || options.depthLevel,
      voiceMode: params.voiceMode || options.voiceMode,
      voicePersona: params.voicePersona || options.voicePersona,
      answerLanguage: params.answerLanguage || options.answerLanguage,
      handsFree: typeof params.handsFree === 'boolean' ? params.handsFree : options.handsFree,
      wakePhrase: params.wakePhrase || options.wakePhrase
    };

    if (sourceType === 'notes' && target === 'flashcards') {
      return this.convertNotesToFlashcards({
        userId,
        notesContent: content,
        noteIds: mergedOptions.noteIds,
        cardCount: mergedOptions.cardCount || 10,
        difficulty: mergedOptions.difficulty || 'medium',
        includeDefinitions: mergedOptions.includeDefinitions,
        includeExamples: mergedOptions.includeExamples,
        sessionId: mergedOptions.sessionId
      });
    }

    if (sourceType === 'notes' && target === 'questions') {
      return this.convertNotesToQuestions({
        userId,
        notesContent: content,
        noteIds: mergedOptions.noteIds,
        questionCount: mergedOptions.questionCount || 5,
        questionTypes: mergedOptions.questionTypes || ['multiple_choice'],
        difficulty: mergedOptions.difficulty || 'medium',
        sessionId: mergedOptions.sessionId
      });
    }

    if (sourceType === 'notes' && target === 'podcast') {
      return this.convertNotesToPodcast({
        userId,
        noteIds: mergedOptions.noteIds,
        voiceMode: mergedOptions.voiceMode || 'coach',
        voicePersona: mergedOptions.voicePersona || 'mentor',
        difficulty: mergedOptions.difficulty || 'intermediate',
        answerLanguage: mergedOptions.answerLanguage || 'en',
        sessionOptions: {
          hands_free: typeof mergedOptions.handsFree === 'boolean' ? mergedOptions.handsFree : false,
          wake_phrase: mergedOptions.wakePhrase || 'hey cerbyl',
        },
      });
    }

    if (sourceType === 'flashcards' && target === 'notes') {
      return this.convertFlashcardsToNotes({
        userId,
        setIds: mergedOptions.flashcardIds,
        noteFormat: mergedOptions.noteFormat || mergedOptions.formatStyle || 'structured',
        includeExamples: mergedOptions.includeExamples,
        sessionId: mergedOptions.sessionId
      });
    }

    if (sourceType === 'flashcards' && target === 'questions') {
      return this.convertFlashcardsToQuestions({
        userId,
        setIds: mergedOptions.flashcardIds,
        questionCount: mergedOptions.questionCount || 5,
        questionTypes: mergedOptions.questionTypes || ['multiple_choice'],
        difficulty: mergedOptions.difficulty || 'medium',
        sessionId: mergedOptions.sessionId
      });
    }

    if (sourceType === 'questions' && target === 'flashcards') {
      return this.convertQuestionsToFlashcards({
        userId,
        setIds: mergedOptions.questionIds,
        cardCount: mergedOptions.cardCount || 10,
        includeAnswers: mergedOptions.includeAnswers,
        includeExplanations: mergedOptions.includeExplanations,
        sessionId: mergedOptions.sessionId
      });
    }

    if (sourceType === 'questions' && target === 'notes') {
      return this.convertQuestionsToNotes({
        userId,
        setIds: mergedOptions.questionIds,
        noteFormat: mergedOptions.noteFormat || mergedOptions.formatStyle || 'study_guide',
        includeAnswers: mergedOptions.includeAnswers,
        includeExplanations: mergedOptions.includeExplanations,
        sessionId: mergedOptions.sessionId
      });
    }

    if (sourceType === 'chat' && target === 'notes') {
      return this.convertChatToNotes({
        userId,
        chatHistory: content,
        chatId: mergedOptions.chatId,
        sessionIds: mergedOptions.sessionIds || mergedOptions.chatIds || mergedOptions.noteIds || sourceIds,
        noteFormat: mergedOptions.noteFormat || mergedOptions.formatStyle || 'summary',
        includeQuestions: mergedOptions.includeQuestions,
        sessionId: mergedOptions.sessionId
      });
    }

    if (sourceType === 'media' && target === 'questions') {
      return this.convertMediaToQuestions({
        userId,
        mediaIds: mergedOptions.mediaIds,
        questionCount: mergedOptions.questionCount || 5,
        questionTypes: mergedOptions.questionTypes || ['multiple_choice'],
        difficulty: mergedOptions.difficulty || 'medium',
        sessionId: mergedOptions.sessionId
      });
    }

    if (sourceType === 'playlist' && target === 'notes') {
      const playlistId = Array.isArray(mergedOptions.playlistIds) ? mergedOptions.playlistIds[0] : mergedOptions.playlistIds;
      return this.convertPlaylistToNotes({
        userId,
        playlistId: playlistId || mergedOptions.playlistId,
        playlistUrl: content,
        playlistItems: mergedOptions.playlistItems || [],
        noteFormat: mergedOptions.noteFormat || 'structured',
        includeTimestamps: mergedOptions.includeTimestamps,
        sessionId: mergedOptions.sessionId
      });
    }

    if (sourceType === 'playlist' && target === 'flashcards') {
      const playlistId = Array.isArray(mergedOptions.playlistIds) ? mergedOptions.playlistIds[0] : mergedOptions.playlistIds;
      return this.convertPlaylistToFlashcards({
        userId,
        playlistId: playlistId || mergedOptions.playlistId,
        playlistUrl: content,
        playlistItems: mergedOptions.playlistItems || [],
        cardCount: mergedOptions.cardCount || 10,
        difficulty: mergedOptions.difficulty || 'medium',
        includeDefinitions: mergedOptions.includeDefinitions,
        sessionId: mergedOptions.sessionId
      });
    }

    if (target === 'csv' && sourceType === 'flashcards') {
      return this.exportFlashcardsToCSV({
        userId,
        setIds: mergedOptions.flashcardIds,
        includeMetadata: mergedOptions.includeMetadata,
        delimiter: mergedOptions.delimiter,
        sessionId: mergedOptions.sessionId
      });
    }

    if (target === 'pdf' && sourceType === 'questions') {
      return this.exportQuestionsToPDF({
        userId,
        setIds: mergedOptions.questionIds,
        includeAnswers: mergedOptions.includeAnswers,
        includeExplanations: mergedOptions.includeExplanations,
        title: mergedOptions.title,
        format: mergedOptions.format,
        sessionId: mergedOptions.sessionId
      });
    }

    throw new Error(`Unsupported conversion: ${sourceType} to ${target}`);
  }

  
  async convertNotesToFlashcards(params) {
    try {
      const data = await this.fetchJson(`${this.baseUrl}/notes_to_flashcards`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          note_ids: params.noteIds || params.note_ids || [],
          card_count: params.cardCount || params.card_count || 10,
          difficulty: params.difficulty || 'medium'
        })
      });

      return this.normalizeResult(data);
    } catch (error) {
      console.error('Convert notes to flashcards error:', error);
      throw error;
    }
  }

  
  async convertNotesToQuestions(params) {
    try {
      const data = await this.fetchJson(`${this.baseUrl}/notes_to_questions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          note_ids: params.noteIds || params.note_ids || [],
          question_count: params.questionCount || params.question_count || 5,
          difficulty: params.difficulty || 'medium'
        })
      });

      return this.normalizeResult(data);
    } catch (error) {
      console.error('Convert notes to questions error:', error);
      throw error;
    }
  }

  async convertNotesToPodcast(params) {
    try {
      const data = await this.fetchJson(`${this.baseUrl}/notes_to_podcast`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          note_ids: params.noteIds || params.note_ids || [],
          voice_mode: params.voiceMode || params.voice_mode || 'coach',
          voice_persona: params.voicePersona || params.voice_persona || 'mentor',
          difficulty: params.difficulty || 'intermediate',
          answer_language: params.answerLanguage || params.answer_language || 'en',
          session_options: params.sessionOptions || params.session_options || {},
        })
      });

      return this.normalizeResult(data);
    } catch (error) {
      console.error('Convert notes to podcast error:', error);
      throw error;
    }
  }

  
  async convertFlashcardsToNotes(params) {
    try {
      const data = await this.fetchJson(`${this.baseUrl}/flashcards_to_notes`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          set_ids: params.setIds || params.flashcardIds || params.set_ids || [],
          format_style: params.noteFormat || params.formatStyle || params.format_style || 'structured'
        })
      });

      return this.normalizeResult(data);
    } catch (error) {
      console.error('Convert flashcards to notes error:', error);
      throw error;
    }
  }

  
  async convertFlashcardsToQuestions(params) {
    try {
      const data = await this.fetchJson(`${this.baseUrl}/flashcards_to_questions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          set_ids: params.setIds || params.flashcardIds || params.set_ids || [],
          question_count: params.questionCount || params.question_count
        })
      });

      return this.normalizeResult(data);
    } catch (error) {
      console.error('Convert flashcards to questions error:', error);
      throw error;
    }
  }

  
  async convertQuestionsToFlashcards(params) {
    try {
      const data = await this.fetchJson(`${this.baseUrl}/questions_to_flashcards`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          set_ids: params.setIds || params.questionIds || params.set_ids || [],
          card_count: params.cardCount || params.card_count
        })
      });

      return this.normalizeResult(data);
    } catch (error) {
      console.error('Convert questions to flashcards error:', error);
      throw error;
    }
  }

  
  async convertQuestionsToNotes(params) {
    try {
      const data = await this.fetchJson(`${this.baseUrl}/questions_to_notes`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          set_ids: params.setIds || params.questionIds || params.set_ids || [],
          format_style: params.noteFormat || params.formatStyle || params.format_style
        })
      });

      return this.normalizeResult(data);
    } catch (error) {
      console.error('Convert questions to notes error:', error);
      throw error;
    }
  }

  
  async convertMediaToQuestions(params) {
    try {
      const data = await this.fetchJson(`${this.baseUrl}/media_to_questions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          media_ids: params.mediaIds || params.media_ids || [],
          question_count: params.questionCount || params.question_count || 5
        })
      });

      return this.normalizeResult(data);
    } catch (error) {
      console.error('Convert media to questions error:', error);
      throw error;
    }
  }

  
  async convertPlaylistToNotes(params) {
    try {
      const data = await this.fetchJson(`${this.baseUrl}/playlist_to_notes`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          playlist_id: params.playlistId || params.playlist_id
        })
      });

      return this.normalizeResult(data);
    } catch (error) {
      console.error('Convert playlist to notes error:', error);
      throw error;
    }
  }

  
  async convertPlaylistToFlashcards(params) {
    try {
      const data = await this.fetchJson(`${this.baseUrl}/playlist_to_flashcards`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          playlist_id: params.playlistId || params.playlist_id,
          card_count: params.cardCount || params.card_count || 15
        })
      });

      return this.normalizeResult(data);
    } catch (error) {
      console.error('Convert playlist to flashcards error:', error);
      throw error;
    }
  }

  
  async convertChatToNotes(params) {
    try {
      const sessionIds = params.sessionIds || params.session_ids || (params.chatId ? [params.chatId] : null);
      if (sessionIds && sessionIds.length > 0) {
        return await this.chatToNotes(params.userId, sessionIds, {
          formatStyle: params.noteFormat || params.formatStyle,
          title: params.title,
          sessionTitles: params.sessionTitles || params.session_titles
        });
      }

      if (!params.chatHistory) {
        throw new Error('chatHistory or sessionIds is required');
      }

      const title = params.title || 'Chat Notes';
      const data = await this.fetchJson(this.createNoteUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          user_id: params.userId,
          title,
          content: params.chatHistory
        })
      });

      const resultPayload = {
        note_id: data.id,
        note_title: data.title,
        content: data.content,
        status: data.status || 'success'
      };

      return this.normalizeResult(resultPayload);
    } catch (error) {
      console.error('Convert chat to notes error:', error);
      throw error;
    }
  }

  
  async chatToNotes(userId, sessionIds, options = {}) {
    try {
      const sessions = Array.isArray(sessionIds) ? sessionIds : [sessionIds];

      if (!sessions.length) {
        throw new Error('sessionIds is required');
      }

      const sections = [];
      for (const sessionId of sessions) {
        const formData = new FormData();
        formData.append('chat_id', sessionId);
        formData.append('user_id', userId);
        formData.append('format_style', options.formatStyle || 'structured');

        const response = await queuedAIFormFetch('/convert_chat_to_note_content/', Object.fromEntries(formData.entries()));

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const message = data.error || data.detail || `Failed to convert chat session ${sessionId}`;
          throw new Error(message);
        }

        if (data.success === false || data.status === 'error' || !String(data.content || '').trim()) {
          throw new Error(`No content returned for chat session ${sessionId}; no partial note was created`);
        }
        sections.push({ sessionId, content: data.content, status: data.status });
      }

      if (!sections.length) {
        return this.normalizeResult({
          success: false,
          error: 'No chat content returned'
        });
      }

      const title = options.title || this.buildChatNotesTitle(options.sessionTitles, sessions.length);
      const combinedContent = sections
        .map((section, index) => {
          if (sessions.length === 1) {
            return section.content;
          }
          return `## Chat Session ${index + 1}\n\n${section.content}`;
        })
        .join('\n\n');

      const noteData = await this.fetchJson(this.createNoteUrl, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          user_id: userId,
          title,
          content: combinedContent
        })
      });

      const resultPayload = {
        note_id: noteData.id,
        note_title: noteData.title,
        content: noteData.content,
        session_ids: sessions,
        status: noteData.status || 'success'
      };

      return this.normalizeResult(resultPayload);
    } catch (error) {
      console.error('Chat to notes helper error:', error);
      throw error;
    }
  }

  
  async exportFlashcardsToCSV(params) {
    try {
      const data = await this.fetchJson(`${this.baseUrl}/export_flashcards_csv`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          set_ids: params.setIds || params.flashcardIds || params.set_ids || []
        })
      });

      return this.normalizeResult(data);
    } catch (error) {
      console.error('Export flashcards to CSV error:', error);
      throw error;
    }
  }

  
  async exportQuestionsToPDF(params) {
    try {
      const data = await this.fetchJson(`${this.baseUrl}/export_questions_pdf`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          set_ids: params.setIds || params.questionIds || params.set_ids || []
        })
      });

      return this.normalizeResult(data);
    } catch (error) {
      console.error('Export questions to PDF error:', error);
      throw error;
    }
  }
}

const conversionAgentService = new ConversionAgentService();

export { ConversionAgentService };
export default conversionAgentService;
