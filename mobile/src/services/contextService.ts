import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from './api';
import { getToken } from './tokenStorage';

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
  ai_summary?: string;
  key_concepts?: string;
  topic_tags?: string;
};

export type UploadableFile = {
  uri: string;
  name: string;
  mimeType?: string | null;
};

export type HsSummary = {
  total_subjects: number;
  subjects: { subject: string; grade_level?: string; doc_count: number }[];
};

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
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

export async function uploadContextDocument(
  file: UploadableFile,
  metadata: {
    subject?: string;
    gradeLevel?: string;
    scope?: 'private' | 'hs_shared' | string;
    folderId?: number;
    sourceUrl?: string;
    sourceName?: string;
    license?: string;
  } = {}
) {
  const headers = await authHeaders();
  const body = new FormData();
  body.append('file', {
    uri: file.uri,
    name: file.name,
    type: file.mimeType || 'application/octet-stream',
  } as any);
  body.append('subject', metadata.subject || '');
  body.append('grade_level', metadata.gradeLevel || '');
  body.append('scope', metadata.scope || 'private');
  if (metadata.folderId) body.append('folder_id', String(metadata.folderId));
  body.append('source_url', metadata.sourceUrl || '');
  body.append('source_name', metadata.sourceName || 'Mobile upload');
  body.append('license', metadata.license || 'Unspecified');

  const res = await fetch(`${API_URL}/context/upload`, {
    method: 'POST',
    headers,
    body,
  });
  if (!res.ok) {
    let detail = 'Failed to upload document';
    try {
      const data = await res.json();
      detail = data?.detail || data?.message || detail;
    } catch {
      // keep fallback
    }
    throw new Error(detail);
  }
  return res.json() as Promise<ContextDocument & { success: boolean; message?: string }>;
}

export async function importContextUrl(payload: {
  url: string;
  subject?: string;
  gradeLevel?: string;
  scope?: 'private' | 'hs_shared' | string;
  folderId?: number;
  sourceName?: string;
  license?: string;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/context/import_url`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: payload.url,
      subject: payload.subject || '',
      grade_level: payload.gradeLevel || '',
      scope: payload.scope || 'private',
      folder_id: payload.folderId,
      source_name: payload.sourceName || 'Mobile URL import',
      license: payload.license || 'Unspecified',
    }),
  });
  if (!res.ok) {
    let detail = 'Failed to import URL';
    try {
      const data = await res.json();
      detail = data?.detail || data?.message || detail;
    } catch {
      // keep fallback
    }
    throw new Error(detail);
  }
  return res.json() as Promise<ContextDocument & { success: boolean; message?: string }>;
}

export async function searchContext(payload: {
  query: string;
  useHs?: boolean;
  topK?: number;
  docIds?: string[];
  subject?: string;
  gradeLevel?: string;
}) {
  const headers = await authHeaders();
  const params = new URLSearchParams({
    query: payload.query,
    use_hs: String(payload.useHs ?? true),
    top_k: String(payload.topK ?? 6),
  });
  if (payload.subject) params.set('subject', payload.subject);
  if (payload.gradeLevel) params.set('grade_level', payload.gradeLevel);
  if (payload.docIds?.length) params.set('doc_ids', payload.docIds.join(','));
  const res = await fetch(`${API_URL}/context/search?${params.toString()}`, { headers });
  if (!res.ok) throw new Error('Failed to search knowledge base');
  return res.json() as Promise<{
    query: string;
    chunk_count: number;
    results: Array<{ text: string; metadata?: Record<string, any>; source?: string }>;
  }>;
}

export async function askKnowledgeBase(payload: {
  question: string;
  useHs?: boolean;
  topK?: number;
  docIds?: string[];
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/context/ask`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: payload.question,
      use_hs: payload.useHs ?? true,
      top_k: payload.topK ?? 6,
      doc_ids: payload.docIds ?? [],
    }),
  });
  if (!res.ok) throw new Error('Failed to ask knowledge base');
  return res.json() as Promise<{
    answer: string;
    chunk_count: number;
    sources: Array<{ filename?: string; page?: string | number; subject?: string; source?: string; doc_id?: string; snippet?: string }>;
  }>;
}

export async function getRelatedTopics(payload: {
  topics: string[];
  useHs?: boolean;
  topK?: number;
  maxRelated?: number;
}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_URL}/context/related-topics`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topics: payload.topics,
      use_hs: payload.useHs ?? true,
      top_k: payload.topK ?? 5,
      max_related: payload.maxRelated ?? 8,
    }),
  });
  if (!res.ok) throw new Error('Failed to load related topics');
  return res.json() as Promise<{ topics: string[]; seed_topics: string[]; source_counts: Record<string, number> }>;
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
