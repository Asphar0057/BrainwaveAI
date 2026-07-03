import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './api';

const HS_MODE_KEY = 'hs_mode_enabled';
const SELECTED_DOC_IDS_KEY = 'ctx_selected_doc_ids';

export type ContextDocument = {
  doc_id: string;
  filename: string;
  subject: string;
  grade_level: string;
  scope: string;
  chunk_count: number;
  status: string;
  created_at?: string;
};

export type HsSummary = {
  total_subjects: number;
  subjects: { subject: string; grade_level?: string; doc_count: number }[];
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = await AsyncStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getDocuments(): Promise<{
  user_docs: ContextDocument[];
  hs_summary: HsSummary;
  hs_mode_available: boolean;
}> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/context/documents`, { headers });
  if (!res.ok) throw new Error('Failed to load context documents');
  return res.json();
}

export async function deleteDocument(docId: string): Promise<{ success: boolean; doc_id: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/context/documents/${encodeURIComponent(docId)}`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) throw new Error('Failed to delete document');
  return res.json();
}

export async function getHsSubjects(): Promise<{ subjects: any[]; total: number }> {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/context/hs/subjects`, { headers });
  if (!res.ok) throw new Error('Failed to load HS subjects');
  return res.json();
}

export async function getHsModeEnabled(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(HS_MODE_KEY);
  return stored === 'true';
}

export async function setHsModeEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(HS_MODE_KEY, enabled ? 'true' : 'false');
}

export async function getSelectedDocIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(SELECTED_DOC_IDS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function setSelectedDocIds(ids: string[]): Promise<void> {
  await AsyncStorage.setItem(SELECTED_DOC_IDS_KEY, JSON.stringify(ids));
}
