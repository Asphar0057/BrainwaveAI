

import { API_URL, getAuthToken } from '../config';
import { queuedAIJsonFetch } from './aiJobService';

class LearningPathService {
  constructor() {
    this.baseUrl = `${API_URL}/learning-paths`;
  }

  
  getHeaders() {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  
  async generatePath(topicPrompt, options = {}) {
    try {
      const response = await queuedAIJsonFetch('/learning-paths/generate', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          topicPrompt,
          difficulty: options.difficulty || 'intermediate',
          length: options.length || 'medium',
          goals: options.goals || []
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to generate learning path');
      }

      return await response.json();
    } catch (error) {
      console.error('Generate path error:', error);
      throw error;
    }
  }

  
  async getPaths() {
    try {
      const response = await fetch(this.baseUrl, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch learning paths');
      }

      return await response.json();
    } catch (error) {
      console.error('Get paths error:', error);
      throw error;
    }
  }

  
  async getPath(pathId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch learning path');
      }

      return await response.json();
    } catch (error) {
      console.error('Get path error:', error);
      throw error;
    }
  }

  
  async getPathNodes(pathId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch path nodes');
      }

      return await response.json();
    } catch (error) {
      console.error('Get path nodes error:', error);
      throw error;
    }
  }

  
  async startNode(pathId, nodeId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/start`, {
        method: 'POST',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to start node');
      }

      return await response.json();
    } catch (error) {
      console.error('Start node error:', error);
      throw error;
    }
  }

  
  async getCompletionQuiz(pathId, nodeId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/completion-quiz`, {
        method: 'POST',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to get completion quiz');
      }

      return await response.json();
    } catch (error) {
      console.error('Get completion quiz error:', error);
      throw error;
    }
  }

  
  async completeNode(pathId, nodeId, evidence = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/complete`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ evidence })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to complete node');
      }

      return await response.json();
    } catch (error) {
      console.error('Complete node error:', error);
      throw error;
    }
  }

  
  async evaluateNode(pathId, nodeId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/evaluate`, {
        method: 'POST',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to evaluate node');
      }

      return await response.json();
    } catch (error) {
      console.error('Evaluate node error:', error);
      throw error;
    }
  }

  
  async updateNodeProgress(pathId, nodeId, activityType, completed, metadata = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/progress`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          activity_type: activityType,
          completed,
          metadata
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update progress');
      }

      return await response.json();
    } catch (error) {
      console.error('Update progress error:', error);
      throw error;
    }
  }

  
  async getPathProgress(pathId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/progress`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch path progress');
      }

      return await response.json();
    } catch (error) {
      console.error('Get path progress error:', error);
      throw error;
    }
  }

  
  async deletePath(pathId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to delete learning path');
      }

      return await response.json();
    } catch (error) {
      console.error('Delete path error:', error);
      throw error;
    }
  }

  
  async generateNodeContent(pathId, nodeId, activityType, count = null) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/generate-content`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          activity_type: activityType,
          count
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to generate content');
      }

      return await response.json();
    } catch (error) {
      console.error('Generate content error:', error);
      throw error;
    }
  }

  
  async getNodeNote(pathId, nodeId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/note`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to fetch node note');
      }

      return await response.json();
    } catch (error) {
      console.error('Get node note error:', error);
      throw error;
    }
  }

  
  async saveNodeNote(pathId, nodeId, content) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/note`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ content })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to save note');
      }

      return await response.json();
    } catch (error) {
      console.error('Save node note error:', error);
      throw error;
    }
  }

  
  async updateDifficultyView(pathId, nodeId, difficultyView) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/difficulty-view`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ difficulty_view: difficultyView })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Could not prepare this difficulty level. Please retry.');
      }

      return await response.json();
    } catch (error) {
      console.error('Update difficulty view error:', error);
      throw error;
    }
  }

  
  async rateResource(pathId, nodeId, resourceId, rating) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/resources/${encodeURIComponent(resourceId)}/rate`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ resource_id: resourceId, rating })
      });

      if (!response.ok) {
        throw new Error('Failed to rate resource');
      }

      return await response.json();
    } catch (error) {
      console.error('Rate resource error:', error);
      throw error;
    }
  }

  
  async addResource(pathId, nodeId, resource) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/resources/add`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(resource)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to add resource');
      }

      return await response.json();
    } catch (error) {
      console.error('Add resource error:', error);
      throw error;
    }
  }

  
  async searchResources(pathId, nodeId, query, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/resources/search`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          query,
          provider: options.provider || 'auto',
          include_youtube: options.includeYoutube !== false,
          max_results: options.maxResults || 8
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to search resources');
      }

      return await response.json();
    } catch (error) {
      console.error('Search resources error:', error);
      throw error;
    }
  }

  
  async markResourceCompleted(pathId, nodeId, resourceId, timeSpentMinutes) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/resources/${encodeURIComponent(resourceId)}/complete`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ resource_id: resourceId, time_spent_minutes: timeSpentMinutes })
      });

      if (!response.ok) {
        throw new Error('Failed to mark resource completed');
      }

      return await response.json();
    } catch (error) {
      console.error('Mark resource completed error:', error);
      throw error;
    }
  }

  
  async updateTimeSpent(pathId, nodeId, minutes) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/time-spent`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ minutes })
      });

      if (!response.ok) {
        throw new Error('Failed to update time spent');
      }

      return await response.json();
    } catch (error) {
      console.error('Update time spent error:', error);
      throw error;
    }
  }

  
  async exportToNotes(pathId, nodeId, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/export-to-notes`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          node_id: nodeId,
          include_resources: options.include_resources !== false,
          include_summary: options.include_summary !== false
        })
      });

      if (!response.ok) {
        throw new Error('Failed to export to notes');
      }

      return await response.json();
    } catch (error) {
      console.error('Export to notes error:', error);
      throw error;
    }
  }

  
  async exportToFlashcards(pathId, nodeId, conceptFocus = null) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/export-to-flashcards`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          node_id: nodeId,
          concept_focus: conceptFocus
        })
      });

      if (!response.ok) {
        throw new Error('Failed to export to flashcards');
      }

      return await response.json();
    } catch (error) {
      console.error('Export to flashcards error:', error);
      throw error;
    }
  }

  
  async exportToCalendar(pathId, nodeId, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/export-to-calendar`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          node_id: nodeId,
          scheduled_date: options.scheduled_date,
          duration_minutes: options.duration_minutes || 30
        })
      });

      if (!response.ok) {
        throw new Error('Failed to export to calendar');
      }

      return await response.json();
    } catch (error) {
      console.error('Export to calendar error:', error);
      throw error;
    }
  }

  
  async checkPrerequisites(pathId, nodeId) {
    try {
      const response = await fetch(`${this.baseUrl}/${pathId}/nodes/${nodeId}/prerequisite-check`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to check prerequisites');
      }

      return await response.json();
    } catch (error) {
      console.error('Check prerequisites error:', error);
      throw error;
    }
  }
}

export default new LearningPathService();
