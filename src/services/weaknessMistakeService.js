import { API_URL, getAuthToken } from '../config';
import { queuedAIJsonFetch } from './aiJobService';

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getAuthToken()}`,
  };
}

export async function getRecentMistakes(userId, { limit = 20, source = 'all' } = {}) {
  const params = new URLSearchParams({ user_id: userId, limit: String(limit), source });
  const response = await fetch(`${API_URL}/weaknesses/recent_mistakes?${params.toString()}`, {
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error('Could not load recent mistakes.');
  return response.json();
}

export async function explainMistake(userId, mistakeId, source) {
  const response = await queuedAIJsonFetch('/weaknesses/explain_mistake', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ user_id: userId, mistake_id: mistakeId, source }),
  });
  if (!response.ok) throw new Error('Could not generate an explanation for this mistake.');
  return response.json();
}
