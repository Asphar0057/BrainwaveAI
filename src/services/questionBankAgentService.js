

import { API_URL, getAuthToken } from '../config';
import { queuedAIJsonFetch, USE_AI_JOB_QUEUE } from './aiJobService';

const AI_QUEUED_QB_PATHS = [
  '/qb/generate_from_pdf',
  '/qb/generate_from_multiple_pdfs',
  '/qb/generate_related_from_pdf',
  '/qb/smart_generate',
  '/qb/generate_from_sources',
  '/qb/enhance_prompt',
  '/qb/extract_topics',
  '/qb/score_questions',
  '/qb/tag_bloom_taxonomy',
  '/qb/check_duplicates',
  '/qb/analyze_weaknesses',
  '/qb/generate_adaptive',
  '/qb/enhance_explanations',
  '/qb/regenerate_question',
  '/qb/preview_generate',
];

const aiAwareFetch = (url, options = {}) => {
  if (!USE_AI_JOB_QUEUE) return fetch(url, options);
  const path = url.startsWith(API_URL) ? url.slice(API_URL.length) : url;
  if (AI_QUEUED_QB_PATHS.some((queuedPath) => path.startsWith(queuedPath))) {
    return queuedAIJsonFetch(path, options);
  }
  return fetch(url, options);
};

class QuestionBankAgentService {
  constructor() {
    this.baseUrl = `${API_URL}/agents/question-bank`;
  }

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
    const token = getAuthToken();
    
    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
      },
    };

    try {
      const response = await aiAwareFetch(url, {
        ...defaultOptions, 
        ...options,
        headers: {
          ...defaultOptions.headers,
          ...options.headers,
        }
      });
      
      if (response.status === 401) {
        console.warn('🔒 Token expired');
        localStorage.removeItem('token');
        window.location.href = '/login';
        throw new Error('Session expired');
      }
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.error('📋 Full error response:', error);
        
        
        if (error.detail && Array.isArray(error.detail)) {
          const validationErrors = error.detail.map(e => `${e.loc?.join('.')} - ${e.msg}`).join('; ');
          console.error('📋 Validation errors:', validationErrors);
          throw new Error(`Validation error: ${validationErrors}`);
        }
        
        const errorMsg = error.detail || error.message || JSON.stringify(error) || `HTTP ${response.status}`;
        throw new Error(errorMsg);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`❌ Question Bank API Error: ${error.message}`);
      throw error;
    }
  }

  
  async generateFromPDF(params) {
    const { userId, sourceId, questionCount, difficultyMix, questionTypes, topics, title, adaptiveDifficulty } = params;

    const response = await aiAwareFetch(`${API_URL}/qb/generate_from_pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        source_type: 'pdf',
        source_id: sourceId,
        question_count: questionCount,
        difficulty_mix: difficultyMix,
        question_types: questionTypes || ['multiple_choice', 'true_false', 'short_answer'],
        topics: topics || null,
        title: title || null,
        adaptive_difficulty: Boolean(adaptiveDifficulty)
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      const message = Array.isArray(error.detail)
        ? error.detail.map((item) => item.msg || JSON.stringify(item)).join('; ')
        : error.detail || error.message || 'Failed to generate questions';
      throw new Error(message);
    }

    return await response.json();
  }

  
  async generateFromMultiplePDFs(params) {
    const { userId, sourceIds, questionCount, difficultyMix, title, questionTypes, topics, adaptiveDifficulty } = params;

    const response = await aiAwareFetch(`${API_URL}/qb/generate_from_multiple_pdfs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        source_ids: sourceIds,
        question_count: questionCount,
        difficulty_mix: difficultyMix,
        title: title,
        question_types: questionTypes || ['multiple_choice', 'true_false', 'short_answer'],
        topics: topics,
        adaptive_difficulty: Boolean(adaptiveDifficulty)
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      const message = Array.isArray(error.detail)
        ? error.detail.map((item) => item.msg || JSON.stringify(item)).join('; ')
        : error.detail || error.message || 'Failed to generate questions';
      throw new Error(message);
    }

    return await response.json();
  }

  
  async generateRelatedFromPDF(params) {
    const { userId, sourceIds, questionCount, difficultyMix, questionTypes, title } = params;

    const response = await aiAwareFetch(`${API_URL}/qb/generate_related_from_pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        source_ids: sourceIds,
        question_count: questionCount,
        difficulty_mix: difficultyMix,
        question_types: questionTypes || ['multiple_choice', 'true_false', 'short_answer'],
        title: title || null
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to generate related questions');
    }

    return await response.json();
  }

  
  async smartGenerate(params) {
    const { 
      userId, 
      sourceIds, 
      questionCount, 
      difficultyMix, 
      title, 
      questionTypes, 
      topics,
      customPrompt,
      referenceDocumentId,
      contentDocumentIds,
      adaptiveDifficulty
    } = params;

    const response = await aiAwareFetch(`${API_URL}/qb/smart_generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        source_ids: sourceIds,
        question_count: questionCount,
        difficulty_mix: difficultyMix,
        title: title,
        question_types: questionTypes || ['multiple_choice', 'true_false', 'short_answer'],
        topics: topics,
        custom_prompt: customPrompt,
        reference_document_id: referenceDocumentId,
        content_document_ids: contentDocumentIds,
        adaptive_difficulty: Boolean(adaptiveDifficulty)
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      const detail = Array.isArray(error.detail)
        ? error.detail.map((item) => item.msg || JSON.stringify(item)).join(', ')
        : error.detail;
      throw new Error(detail || error.message || error.error || 'Failed to generate questions');
    }

    return await response.json();
  }

  
  async deleteDocument(userId, documentId) {
    const response = await aiAwareFetch(`${API_URL}/qb/delete_document/${documentId}?user_id=${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to delete document');
    }

    return await response.json();
  }

  
  async generateFromSources(params) {
    const {
      userId,
      sources,
      questionCount,
      difficultyMix,
      questionTypes,
      topics,
      customPrompt,
      sessionId,
      adaptiveDifficulty
    } = params;
    const response = await aiAwareFetch(`${API_URL}/qb/generate_from_sources`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        sources: sources || [],
        question_count: questionCount,
        difficulty_mix: difficultyMix,
        question_types: questionTypes || ['multiple_choice', 'true_false', 'short_answer'],
        topics: topics || [],
        custom_prompt: customPrompt || null,
        session_id: sessionId || null,
        adaptive_difficulty: Boolean(adaptiveDifficulty)
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to generate questions');
    }

    return await response.json();
  }

  
  async generateFromCustom(params) {
    const {
      userId,
      content,
      title,
      questionCount,
      difficultyMix,
      questionTypes,
      topics,
      customPrompt,
      sessionId,
      adaptiveDifficulty
    } = params;
    const response = await aiAwareFetch(`${API_URL}/qb/generate_from_pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        source_type: 'custom',
        content: content,
        title: title || 'Custom Question Set',
        question_count: questionCount,
        difficulty_mix: difficultyMix,
        question_types: questionTypes || ['multiple_choice', 'true_false', 'short_answer'],
        topics: topics || [],
        custom_prompt: customPrompt || null,
        session_id: sessionId || null,
        adaptive_difficulty: Boolean(adaptiveDifficulty)
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      const message = Array.isArray(error.detail)
        ? error.detail.map((item) => item.msg || JSON.stringify(item)).join('; ')
        : error.detail || error.message || 'Failed to generate questions';
      throw new Error(message);
    }

    return await response.json();
  }

  
  async searchQuestions(params) {
    const { userId, searchQuery, filters = {}, sessionId } = params;

    return this.request('/search', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        search_query: searchQuery,
        filters,
        session_id: sessionId
      })
    });
  }

  
  async organizeQuestions(params) {
    const { userId, questions, sessionId } = params;

    return this.request('/organize', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        questions,
        session_id: sessionId
      })
    });
  }

  
  async analyzePerformance(params) {
    const { userId, performanceData, sessionId } = params;

    return this.request('/analyze', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        performance_data: performanceData,
        session_id: sessionId
      })
    });
  }

  
  async getRecommendations(params) {
    const { userId, performanceData, sessionId } = params;

    return this.request('/recommend', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        performance_data: performanceData,
        session_id: sessionId
      })
    });
  }

  
  async categorizeQuestions(params) {
    const { userId, questions, sessionId } = params;

    return this.request('/categorize', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        questions,
        session_id: sessionId
      })
    });
  }

  
  async assessDifficulty(params) {
    const { userId, questions, sessionId } = params;

    return this.request('/assess', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        questions,
        session_id: sessionId
      })
    });
  }

  

  
  async enhancePrompt(prompt, contentSummary = '') {
    const response = await aiAwareFetch(`${API_URL}/qb/enhance_prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        prompt,
        content_summary: contentSummary
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to enhance prompt');
    }

    return await response.json();
  }

  
  async extractTopics(userId, documentId = null, content = '') {
    const response = await aiAwareFetch(`${API_URL}/qb/extract_topics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        document_id: documentId,
        content
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to extract topics');
    }

    return await response.json();
  }

  
  async scoreQuestions(questions) {
    const response = await aiAwareFetch(`${API_URL}/qb/score_questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ questions })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to score questions');
    }

    return await response.json();
  }

  
  async tagBloomTaxonomy(questions) {
    const response = await aiAwareFetch(`${API_URL}/qb/tag_bloom_taxonomy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ questions })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to tag questions');
    }

    return await response.json();
  }

  
  async checkDuplicates(userId, question, questionSetId = null) {
    const response = await aiAwareFetch(`${API_URL}/qb/check_duplicates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        question,
        question_set_id: questionSetId
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to check duplicates');
    }

    return await response.json();
  }

  
  async analyzeWeaknesses(userId) {
    const response = await aiAwareFetch(`${API_URL}/qb/analyze_weaknesses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ user_id: userId })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to analyze weaknesses');
    }

    return await response.json();
  }

  
  async generateAdaptive(userId, documentIds, questionCount = 10) {
    
    try {
      return await this.request('/adaptive', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          content: '', 
          source_type: 'custom',
          question_count: questionCount,
        })
      });
    } catch (e) {
      
      const response = await aiAwareFetch(`${API_URL}/qb/generate_adaptive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify({
          user_id: userId,
          document_ids: documentIds,
          question_count: questionCount
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || 'Failed to generate adaptive questions');
      }

      return await response.json();
    }
  }

  
  async generateWithAgent(params) {
    const { 
      userId, 
      content, 
      title, 
      questionCount, 
      questionTypes,
      difficultyMix, 
      topics,
      customPrompt,
      sourceType = 'custom',
      sourceId = null,
      sources = []
    } = params;

    return this.request('/generate', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        action: 'generate',
        source_type: sourceType,
        source_id: sourceId,
        sources: sources,
        content: content || '',
        title: title || 'Generated Questions',
        question_count: questionCount || 10,
        question_types: questionTypes || ['multiple_choice'],
        difficulty_mix: difficultyMix || { easy: 30, medium: 50, hard: 20 },
        topics: topics || [],
        custom_prompt: customPrompt || ''
      })
    });
  }

  
  async enhanceExplanations(questions) {
    const response = await aiAwareFetch(`${API_URL}/qb/enhance_explanations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ questions })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to enhance explanations');
    }

    return await response.json();
  }

  
  async regenerateQuestion(userId, question, feedback, documentId = null) {
    const response = await aiAwareFetch(`${API_URL}/qb/regenerate_question`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        question,
        feedback,
        document_id: documentId
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to regenerate question');
    }

    return await response.json();
  }

  
  async previewGenerate(params) {
    const { 
      userId, sourceIds, questionCount, difficultyMix, 
      questionTypes, topics, customPrompt, referenceDocumentId, contentDocumentIds, sessionId
    } = params;

    const response = await aiAwareFetch(`${API_URL}/qb/preview_generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        source_ids: sourceIds,
        question_count: questionCount,
        difficulty_mix: difficultyMix,
        question_types: questionTypes || ['multiple_choice', 'true_false', 'short_answer'],
        topics,
        custom_prompt: customPrompt,
        reference_document_id: referenceDocumentId || null,
        content_document_ids: contentDocumentIds || null,
        session_id: sessionId || null
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to preview generate');
    }

    return await response.json();
  }

  
  async savePreviewedQuestions(userId, questions, title, description = '', sourceType = 'preview') {
    const response = await aiAwareFetch(`${API_URL}/qb/save_previewed_questions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        questions,
        title,
        description,
        source_type: sourceType
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to save questions');
    }

    return await response.json();
  }

  
  async batchDelete(userId, setIds) {
    const response = await aiAwareFetch(`${API_URL}/qb/batch_delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        set_ids: setIds
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to delete question sets');
    }

    return await response.json();
  }

  
  async mergeSets(userId, setIds, title, deleteOriginals = false) {
    const response = await aiAwareFetch(`${API_URL}/qb/merge_sets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        set_ids: setIds,
        title,
        delete_originals: deleteOriginals
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to merge question sets');
    }

    return await response.json();
  }

  

  
  async getWeakAreas(userId) {
    const response = await aiAwareFetch(`${API_URL}/qb/weak_areas?user_id=${encodeURIComponent(userId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to get weak areas');
    }

    return await response.json();
  }

  
  async getWrongAnswers(userId, topic = null, limit = 50) {
    let url = `${API_URL}/qb/wrong_answers?user_id=${encodeURIComponent(userId)}&limit=${limit}`;
    if (topic) {
      url += `&topic=${encodeURIComponent(topic)}`;
    }

    const response = await aiAwareFetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to get wrong answers');
    }

    return await response.json();
  }

  
  async markWrongAnswerReviewed(wrongAnswerId, understood = true) {
    const response = await aiAwareFetch(`${API_URL}/qb/mark_reviewed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        wrong_answer_id: wrongAnswerId,
        understood
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to mark as reviewed');
    }

    return await response.json();
  }

  
  async generatePractice(userId, topic = null, questionCount = 10, includeReview = true) {
    const response = await aiAwareFetch(`${API_URL}/qb/generate_practice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        user_id: userId,
        topic,
        question_count: questionCount,
        include_review: includeReview
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to generate practice questions');
    }

    return await response.json();
  }

  
  async getPracticeRecommendations(userId) {
    const response = await aiAwareFetch(`${API_URL}/qb/practice_recommendations?user_id=${encodeURIComponent(userId)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to get recommendations');
    }

    return await response.json();
  }

  
  async resetWeakArea(weakAreaId, action = 'mastered') {
    const response = await aiAwareFetch(`${API_URL}/qb/reset_weak_area`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({
        weak_area_id: weakAreaId,
        action
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      throw new Error(error.detail || 'Failed to reset weak area');
    }

    return await response.json();
  }
}

const questionBankAgentService = new QuestionBankAgentService();
export default questionBankAgentService;
export { QuestionBankAgentService };
