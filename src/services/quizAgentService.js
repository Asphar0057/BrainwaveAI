

import { API_URL, getAuthToken } from '../config';

class QuizAgentService {
  constructor() {
    
    this.baseUrl = `${API_URL}`;
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
            const response = await fetch(url, { 
        ...defaultOptions, 
        ...options,
        headers: {
          ...defaultOptions.headers,
          ...options.headers,
        }
      });
      
      
      if (response.status === 401) {
                localStorage.removeItem('token');
        window.location.href = '/login';
        throw new Error('Session expired. Please login again.');
      }
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
            throw error;
    }
  }

  
  async generateQuiz(params) {
    const {
      userId,
      topic,
      content,
      questionCount = 10,
      difficultyMix = { easy: 3, medium: 5, hard: 2 },
      questionTypes = ['multiple_choice'],
      topics,
      sessionId,
      use_hs_context
    } = params;

    
    const createResponse = await this.request('/create_solo_quiz', {
      method: 'POST',
      body: JSON.stringify({
        subject: topic,
        difficulty: this._getDifficultyFromMix(difficultyMix),
        question_count: questionCount,
        use_hs_context: use_hs_context !== false
      })
    });

    if (!createResponse.quiz_id) {
      return { success: false, questions: [] };
    }

    
    const quizResponse = await this.request(`/solo_quiz/${createResponse.quiz_id}`, {
      method: 'GET'
    });

    
    return {
      success: true,
      questions: quizResponse.questions || [],
      quiz_id: createResponse.quiz_id,
      quiz: quizResponse.quiz
    };
  }

  _getDifficultyFromMix(mix) {
    
    if (mix.hard >= mix.medium && mix.hard >= mix.easy) return 'hard';
    if (mix.medium >= mix.easy) return 'medium';
    return 'easy';
  }


  async generateAdaptiveQuiz(params) {
    // Was previously just an alias for generateQuiz(), which always computes a
    // concrete difficulty client-side via _getDifficultyFromMix and never sends
    // "auto" -- meaning "USE ADAPTIVE MODE" never actually reached the backend's
    // ContentDifficultyBandit (is_auto_difficulty() only fires on the literal
    // string "auto"/"adaptive", see backend/services/content_bandit.py). This
    // now genuinely requests the bandit-picked difficulty instead of guessing
    // one here, and surfaces which difficulty/selection method it landed on so
    // the UI can show that this was in fact an adaptive pick.
    const { userId, topic, questionCount = 10, use_hs_context } = params;

    const createResponse = await this.request('/create_solo_quiz', {
      method: 'POST',
      body: JSON.stringify({
        subject: topic,
        difficulty: 'auto',
        question_count: questionCount,
        use_hs_context: use_hs_context !== false
      })
    });

    if (!createResponse.quiz_id) {
      return { success: false, questions: [] };
    }

    const quizResponse = await this.request(`/solo_quiz/${createResponse.quiz_id}`, {
      method: 'GET'
    });

    return {
      success: true,
      questions: quizResponse.questions || [],
      quiz_id: createResponse.quiz_id,
      quiz: quizResponse.quiz,
      adaptive_config: {
        difficulty: quizResponse.quiz?.difficulty || null,
      },
    };
  }

  
  async checkAnswer(quizId, questionId, answer) {
    if (!quizId) throw new Error('This quiz has no saved session. Start a new quiz.');
    return this.request(`/solo_quiz/${quizId}/check-answer`, { method: 'POST', body: JSON.stringify({ question_id: questionId, answer }) });
  }

  async gradeQuiz(params) {
    const stored = JSON.parse(sessionStorage.getItem('quizData') || '{}');
    const quizId = params.quizId || stored.quiz_id;
    if (!quizId) throw new Error('This quiz has no saved session. Create a new quiz to record a verified score.');
    return this.request('/complete_solo_quiz', {
      method: 'POST', body: JSON.stringify({ quiz_id: quizId, answers: params.answers })
    });
  }


  async analyzePerformance(params) {
    const {
      userId,
      results,
      timeTakenSeconds,
      sessionId
    } = params;

    return this.request('/analyze', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        results,
        time_taken_seconds: timeTakenSeconds,
        session_id: sessionId
      })
    });
  }

  
  async getRecommendations(userId, sessionId = null) {
    const params = new URLSearchParams({ user_id: userId });
    if (sessionId) params.append('session_id', sessionId);
    
    return this.request(`/recommendations?${params}`, {
      method: 'GET'
    });
  }

  
  async explainQuestion(params) {
    const {
      userId,
      question,
      userAnswer = '',
      sessionId
    } = params;

    return this.request('/explain', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        question,
        user_answer: userAnswer,
        session_id: sessionId
      })
    });
  }

  
  async generateSimilarQuestions(params) {
    const {
      userId,
      question,
      difficulty,
      count = 1,
      sessionId
    } = params;

    return this.request('/similar', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        question,
        difficulty,
        count,
        session_id: sessionId
      })
    });
  }

  
  async reviewWrongAnswers(params) {
    const {
      userId,
      results,
      sessionId
    } = params;

    return this.request('/review', {
      method: 'POST',
      body: JSON.stringify({
        user_id: userId,
        results,
        session_id: sessionId
      })
    });
  }

  
  async getActions() {
    return this.request('/actions', { method: 'GET' });
  }

  
  async getQuestionTypes() {
    return this.request('/question_types', { method: 'GET' });
  }

  
  async getDifficulties() {
    return this.request('/difficulties', { method: 'GET' });
  }

  
  async invoke(params) {
    return this.request('', {
      method: 'POST',
      body: JSON.stringify({
        user_id: params.userId,
        action: params.action,
        topic: params.topic,
        content: params.content,
        question_count: params.questionCount,
        difficulty: params.difficulty,
        difficulty_mix: params.difficultyMix,
        question_types: params.questionTypes,
        topics: params.topics,
        questions: params.questions,
        answers: params.answers,
        results: params.results,
        question: params.question,
        user_answer: params.userAnswer,
        time_taken_seconds: params.timeTakenSeconds,
        session_id: params.sessionId
      })
    });
  }
}

const quizAgentService = new QuizAgentService();
export default quizAgentService;

export { QuizAgentService };
