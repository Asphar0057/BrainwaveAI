

import { API_URL, getAuthToken } from '../config/api';
import { queuedAIJsonFetch } from './aiJobService';

class NoteAgentService {
  constructor() {
    this.baseUrl = `${API_URL}/agents/notes`;
  }

  
  getHeaders() {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  
  async invoke(action, params) {
    try {
      const response = await queuedAIJsonFetch('/agents/notes', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          user_id: params.userId,
          action: action,
          content: params.content || null,
          topic: params.topic || null,
          tone: params.tone || 'professional',
          depth: params.depth || 'standard',
          context: params.context || null,
          session_id: params.sessionId || null,
          use_hs_context: params.useHsContext === true,
          context_doc_ids: params.contextDocIds || null
        })
      });

      if (!response.ok) {
        throw new Error(`Note agent request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Note agent invoke error:', error);
      throw error;
    }
  }

  
  async generate(userId, topic, options = {}) {
    return this.invoke('generate', {
      userId,
      topic,
      tone: options.tone || 'professional',
      depth: options.depth || 'standard',
      context: options.context,
      sessionId: options.sessionId
    });
  }

  
  async improve(userId, content, options = {}) {
    return this.invoke('improve', {
      userId,
      content,
      tone: options.tone || 'professional',
      sessionId: options.sessionId
    });
  }

  
  async expand(userId, content, options = {}) {
    return this.invoke('expand', {
      userId,
      content,
      depth: options.depth || 'detailed',
      context: options.context,
      sessionId: options.sessionId
    });
  }

  
  async simplify(userId, content, options = {}) {
    return this.invoke('simplify', {
      userId,
      content,
      depth: options.depth || 'basic',
      sessionId: options.sessionId
    });
  }

  
  async summarize(userId, content, options = {}) {
    return this.invoke('summarize', {
      userId,
      content,
      sessionId: options.sessionId
    });
  }

  
  async continue(userId, content, options = {}) {
    return this.invoke('continue', {
      userId,
      content,
      tone: options.tone || 'professional',
      sessionId: options.sessionId
    });
  }

  
  async explain(userId, content, options = {}) {
    return this.invoke('explain', {
      userId,
      content,
      depth: options.depth || 'standard',
      sessionId: options.sessionId
    });
  }

  
  async keyPoints(userId, content, options = {}) {
    return this.invoke('key_points', {
      userId,
      content,
      sessionId: options.sessionId
    });
  }

  
  async grammar(userId, content, options = {}) {
    return this.invoke('grammar', {
      userId,
      content,
      sessionId: options.sessionId
    });
  }

  
  async changeTone(userId, content, tone, options = {}) {
    return this.invoke('tone_change', {
      userId,
      content,
      tone,
      sessionId: options.sessionId
    });
  }

  
  async outline(userId, topicOrContent, options = {}) {
    return this.invoke('outline', {
      userId,
      topic: options.isTopic ? topicOrContent : null,
      content: options.isTopic ? null : topicOrContent,
      sessionId: options.sessionId
    });
  }

  
  async organize(userId, content, options = {}) {
    return this.invoke('organize', {
      userId,
      content,
      sessionId: options.sessionId
    });
  }

  
  async analyze(userId, content, options = {}) {
    return this.invoke('analyze', {
      userId,
      content,
      sessionId: options.sessionId
    });
  }

  
  async suggest(userId, content, options = {}) {
    return this.invoke('suggest', {
      userId,
      content,
      sessionId: options.sessionId
    });
  }

  
  async explainCode(userId, content, options = {}) {
    return this.invoke('code_explain', {
      userId,
      content,
      sessionId: options.sessionId
    });
  }

  
  async getTones() {
    try {
      const response = await fetch(`${this.baseUrl}/tones`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`Failed to get tones: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Get tones error:', error);
      
      return {
        tones: [
          { name: 'professional', description: 'Formal and business-like' },
          { name: 'casual', description: 'Relaxed and conversational' },
          { name: 'academic', description: 'Scholarly and precise' },
          { name: 'creative', description: 'Imaginative and expressive' },
          { name: 'technical', description: 'Detailed and specific' }
        ]
      };
    }
  }

  
  async getDepthLevels() {
    try {
      const response = await fetch(`${this.baseUrl}/depths`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`Failed to get depth levels: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Get depth levels error:', error);
      
      return {
        depths: [
          { name: 'basic', description: 'Simple overview' },
          { name: 'standard', description: 'Balanced detail' },
          { name: 'detailed', description: 'Comprehensive coverage' },
          { name: 'expert', description: 'Advanced and thorough' }
        ]
      };
    }
  }
}

const noteAgentService = new NoteAgentService();
export default noteAgentService;
export { NoteAgentService };
