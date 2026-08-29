

import { API_URL } from '../config/api';
import { queuedAIJsonFetch } from './aiJobService';

const _memoryStore = new Map();

class ContextService {
  _currentUserKey() {
    return localStorage.getItem('username') || localStorage.getItem('email') || 'anonymous';
  }

  _localFoldersKey() {
    return `ctx_local_folders_${this._currentUserKey()}`;
  }

  _localDocFolderMapKey() {
    return `ctx_local_doc_folders_${this._currentUserKey()}`;
  }

  _readLocalFolders() {
    try {
      const raw = JSON.parse(localStorage.getItem(this._localFoldersKey()) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return _memoryStore.get(this._localFoldersKey()) || [];
    }
  }

  _writeLocalFolders(folders) {
    const normalized = Array.isArray(folders) ? folders : [];
    _memoryStore.set(this._localFoldersKey(), normalized);
    try {
      localStorage.setItem(this._localFoldersKey(), JSON.stringify(normalized));
    } catch {
      
    }
  }

  _readLocalDocFolderMap() {
    try {
      const raw = JSON.parse(localStorage.getItem(this._localDocFolderMapKey()) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return _memoryStore.get(this._localDocFolderMapKey()) || {};
    }
  }

  _writeLocalDocFolderMap(map) {
    const normalized = map && typeof map === 'object' ? map : {};
    _memoryStore.set(this._localDocFolderMapKey(), normalized);
    try {
      localStorage.setItem(this._localDocFolderMapKey(), JSON.stringify(normalized));
    } catch {
      
    }
  }

  _normalizeFolderArray(folders = []) {
    return folders.map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color || '#D7B38C',
      parent_id: f.parent_id ?? null,
      doc_count: f.doc_count || 0,
      created_at: f.created_at || '',
      updated_at: f.updated_at || '',
    }));
  }

  _shouldUseLocalFolderFallback(err) {
    const msg = String(err?.message || '');
    return (
      msg.includes('(404)') ||
      msg.includes('(405)') ||
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('Load failed')
    );
  }

  _nextLocalFolderId() {
    return -Math.floor(Date.now() + Math.random() * 1000);
  }

  _mergeRemoteFolders(remoteFolders = [], { replace = false } = {}) {
    const local = this._readLocalFolders();
    const map = new Map();
    // A complete server list replaces cached remote entries; partial mutation
    // responses merge into them. Negative ids are unsynced offline folders.
    local.filter((f) => !replace || !(Number(f.id) > 0)).forEach((f) => map.set(String(f.id), { ...f }));
    remoteFolders.forEach((f) => {
      const key = String(f.id);
      const existing = map.get(key) || {};
      map.set(key, { ...existing, ...f, id: f.id });
    });
    const merged = Array.from(map.values());
    this._writeLocalFolders(this._normalizeFolderArray(merged));
    return this._normalizeFolderArray(merged);
  }

  _replaceFolderIdEverywhere(fromId, toId) {
    const folders = this._readLocalFolders().map((f) => ({
      ...f,
      id: String(f.id) === String(fromId) ? toId : f.id,
      parent_id: String(f.parent_id || '') === String(fromId) ? toId : f.parent_id,
    }));
    this._writeLocalFolders(folders);

    const docMap = this._readLocalDocFolderMap();
    Object.keys(docMap).forEach((docId) => {
      if (String(docMap[docId]) === String(fromId)) {
        docMap[docId] = toId;
      }
    });
    this._writeLocalDocFolderMap(docMap);
  }

  _headers(isFormData = false) {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };
    if (!isFormData) headers['Content-Type'] = 'application/json';
    return headers;
  }

  _docNamesKey() {
    return `ctx_doc_names_${this._currentUserKey()}`;
  }

  _readDocNames() {
    try {
      const raw = JSON.parse(localStorage.getItem(this._docNamesKey()) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch { return {}; }
  }

  _writeDocNames(map) {
    try {
      localStorage.setItem(this._docNamesKey(), JSON.stringify(map || {}));
    } catch {}
  }

  setDocName(docId, filename) {
    const map = this._readDocNames();
    map[String(docId)] = filename;
    this._writeDocNames(map);
  }

  getSelectedDocNames() {
    const ids = this._getSelectedDocIds();
    if (!ids || ids.length === 0) return [];
    const map = this._readDocNames();
    return ids.map(id => ({ id, name: map[String(id)] || null })).filter(d => d.name);
  }

  autoSelectDoc(docId, filename) {
    try {
      const raw = localStorage.getItem('ctx_selected_doc_ids');
      const parsed = JSON.parse(raw || '[]');
      const arr = Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
      if (!arr.includes(String(docId)) && arr.length < 8) arr.push(String(docId));
      localStorage.setItem('ctx_selected_doc_ids', JSON.stringify(Array.from(new Set(arr)).slice(0, 8)));
    } catch {}
    this.setDocName(docId, filename);
  }

  
  async uploadDocument(file, subject = '', gradeLevel = '', scope = 'private', options = {}) {
    const {
      sourceUrl = '',
      sourceName = '',
      license = '',
      folderId = null,
    } = options || {};
    const formData = new FormData();
    formData.append('file', file);
    formData.append('subject', subject);
    formData.append('grade_level', gradeLevel);
    formData.append('scope', scope);
    if (folderId !== null && folderId !== undefined && folderId !== '') {
      formData.append('folder_id', String(folderId));
    }
    formData.append('source_url', sourceUrl);
    formData.append('source_name', sourceName);
    formData.append('license', license);

    const response = await fetch(`${API_URL}/context/upload`, {
      method: 'POST',
      headers: this._headers(true),
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Upload failed (${response.status})`);
    }
    return response.json();
  }

  
  async listDocuments() {
    const response = await fetch(`${API_URL}/context/documents`, {
      headers: this._headers(),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`List failed (${response.status})`);
    const data = await response.json();
    const payload = Array.isArray(data) ? { user_docs: data } : (data || {});
    const map = this._readLocalDocFolderMap();
    if (Array.isArray(payload.user_docs)) {
      payload.user_docs = payload.user_docs.map((doc) => {
        const id = doc.doc_id || doc.id;
        const fallbackFolderId = id ? map[String(id)] : null;
        if ((doc.folder_id === undefined || doc.folder_id === null) && fallbackFolderId !== undefined) {
          return { ...doc, folder_id: fallbackFolderId };
        }
        return doc;
      });
    }
    return payload;
  }

  async getProgress() {
    const response = await fetch(`${API_URL}/context/progress`, {
      headers: this._headers(),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Progress load failed (${response.status})`);
    return response.json();
  }

  
  async deleteDocument(docId) {
    const response = await fetch(`${API_URL}/context/documents/${docId}`, {
      method: 'DELETE',
      headers: this._headers(),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Delete failed (${response.status})`);
    }
    const result = await response.json();
    const id = String(docId);
    const folderMap = this._readLocalDocFolderMap();
    delete folderMap[id];
    this._writeLocalDocFolderMap(folderMap);
    const names = this._readDocNames();
    delete names[id];
    this._writeDocNames(names);
    try {
      const selected = JSON.parse(localStorage.getItem('ctx_selected_doc_ids') || '[]');
      if (Array.isArray(selected)) {
        localStorage.setItem('ctx_selected_doc_ids', JSON.stringify(selected.filter((item) => String(item) !== id)));
      }
    } catch {}
    return result;
  }

  _getSelectedDocIds() {
    try {
      const raw = localStorage.getItem('ctx_selected_doc_ids');
      const arr = JSON.parse(raw || '[]');
      const normalized = Array.isArray(arr)
        ? Array.from(new Set(arr.map(String).filter(Boolean))).slice(0, 8)
        : [];
      return normalized.length > 0 ? normalized : null;
    } catch { return null; }
  }

  async searchContext(query, useHs = true, topK = 5) {
    const params = new URLSearchParams({
      query,
      use_hs: useHs,
      top_k: topK,
    });
    const docIds = this._getSelectedDocIds();
    if (docIds) params.set('doc_ids', docIds.join(','));
    const response = await fetch(`${API_URL}/context/search?${params}`, {
      headers: this._headers(),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Search failed (${response.status})`);
    return response.json();
  }

  getSelectedDocIds() {
    return this._getSelectedDocIds();
  }

  
  async getHsSubjects() {
    const response = await fetch(`${API_URL}/context/hs/subjects`, {
      headers: this._headers(),
    });
    if (!response.ok) throw new Error(`HS subjects failed (${response.status})`);
    return response.json();
  }

  
  async importFromUrl(payload) {
    const response = await fetch(`${API_URL}/context/import_url`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `URL import failed (${response.status})`);
    }
    return response.json();
  }

  async listFolders() {
    try {
      const response = await fetch(`${API_URL}/context/folders`, {
        headers: this._headers(),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Folder list failed (${response.status})`);
      const data = await response.json();
      const remoteFolders = this._normalizeFolderArray(data?.folders || []);
      const folders = this._mergeRemoteFolders(remoteFolders, { replace: true });
      return { folders };
    } catch (e) {
      if (!this._shouldUseLocalFolderFallback(e)) throw e;
      return { folders: this._readLocalFolders() };
    }
  }

  async createFolder({ name, color = '#D7B38C', parentId = null }) {
    const previousFolders = this._readLocalFolders();
    const localId = this._nextLocalFolderId();
    const now = new Date().toISOString();
    const localFolder = {
      id: localId,
      name,
      color,
      parent_id: parentId,
      doc_count: 0,
      created_at: now,
      updated_at: now,
    };
    this._writeLocalFolders([...this._readLocalFolders(), localFolder]);

    try {
      const response = await fetch(`${API_URL}/context/folders`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({
          name,
          color,
          parent_id: (parentId && Number(parentId) > 0) ? Number(parentId) : null,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Create folder failed (${response.status})`);
      }
      const created = await response.json();
      this._replaceFolderIdEverywhere(localId, created.id);
      this._mergeRemoteFolders([created]);
      return created;
    } catch (e) {
      if (!this._shouldUseLocalFolderFallback(e)) {
        this._writeLocalFolders(previousFolders);
        throw e;
      }
      return localFolder;
    }
  }

  async updateFolder(folderId, updates = {}) {
    const previousFolders = this._readLocalFolders();
    const localFolders = this._readLocalFolders().map((f) => (
      String(f.id) === String(folderId)
        ? {
            ...f,
            ...(Object.prototype.hasOwnProperty.call(updates, 'name') ? { name: updates.name } : {}),
            ...(Object.prototype.hasOwnProperty.call(updates, 'color') ? { color: updates.color } : {}),
            ...(Object.prototype.hasOwnProperty.call(updates, 'parentId') ? { parent_id: updates.parentId } : {}),
            updated_at: new Date().toISOString(),
          }
        : f
    ));
    this._writeLocalFolders(localFolders);

    const payload = {};
    if (Object.prototype.hasOwnProperty.call(updates, 'name')) payload.name = updates.name;
    if (Object.prototype.hasOwnProperty.call(updates, 'color')) payload.color = updates.color;
    if (Object.prototype.hasOwnProperty.call(updates, 'parentId')) payload.parent_id = updates.parentId;
    if (Object.prototype.hasOwnProperty.call(payload, 'parent_id') && !(payload.parent_id && Number(payload.parent_id) > 0)) {
      payload.parent_id = null;
    }

    if (!(Number(folderId) > 0)) {
      return localFolders.find((f) => String(f.id) === String(folderId)) || { status: 'success' };
    }

    try {
      const response = await fetch(`${API_URL}/context/folders/${folderId}`, {
        method: 'PUT',
        headers: this._headers(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Update folder failed (${response.status})`);
      }
      const updated = await response.json();
      this._mergeRemoteFolders([updated]);
      return updated;
    } catch (e) {
      if (!this._shouldUseLocalFolderFallback(e)) {
        this._writeLocalFolders(previousFolders);
        throw e;
      }
      return localFolders.find((f) => String(f.id) === String(folderId)) || { status: 'success' };
    }
  }

  async deleteFolder(folderId, { moveToFolderId = null } = {}) {
    const localFolders = this._readLocalFolders();
    const previousDocMap = this._readLocalDocFolderMap();
    const remapped = localFolders
      .filter((f) => String(f.id) !== String(folderId))
      .map((f) => (String(f.parent_id || '') === String(folderId) ? { ...f, parent_id: moveToFolderId } : f));
    this._writeLocalFolders(remapped);

    const docMap = this._readLocalDocFolderMap();
    Object.keys(docMap).forEach((docId) => {
      if (String(docMap[docId]) === String(folderId)) {
        if (moveToFolderId === null || moveToFolderId === undefined || moveToFolderId === '') {
          delete docMap[docId];
        } else {
          docMap[docId] = moveToFolderId;
        }
      }
    });
    this._writeLocalDocFolderMap(docMap);

    const params = new URLSearchParams();
    if (moveToFolderId !== null && moveToFolderId !== undefined && moveToFolderId !== '' && Number(moveToFolderId) > 0) {
      params.set('move_to_folder_id', String(moveToFolderId));
    }
    const suffix = params.toString() ? `?${params.toString()}` : '';

    if (!(Number(folderId) > 0)) {
      return { status: 'success', deleted_folder_id: folderId, moved_to_folder_id: moveToFolderId };
    }

    try {
      const response = await fetch(`${API_URL}/context/folders/${folderId}${suffix}`, {
        method: 'DELETE',
        headers: this._headers(),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Delete folder failed (${response.status})`);
      }
      const deleted = await response.json();
      return deleted;
    } catch (e) {
      if (!this._shouldUseLocalFolderFallback(e)) {
        this._writeLocalFolders(localFolders);
        this._writeLocalDocFolderMap(previousDocMap);
        throw e;
      }
      return { status: 'success', deleted_folder_id: folderId, moved_to_folder_id: moveToFolderId };
    }
  }

  async moveDocumentToFolder(docId, folderId = null) {
    const map = this._readLocalDocFolderMap();
    const previousMap = { ...map };
    if (folderId === null || folderId === undefined || folderId === '') {
      delete map[String(docId)];
    } else {
      map[String(docId)] = folderId;
    }
    this._writeLocalDocFolderMap(map);

    if (folderId !== null && folderId !== undefined && folderId !== '' && !(Number(folderId) > 0)) {
      return { status: 'success', doc_id: docId, folder_id: folderId };
    }

    try {
      const response = await fetch(`${API_URL}/context/documents/${docId}/folder`, {
        method: 'PUT',
        headers: this._headers(),
        body: JSON.stringify({ folder_id: folderId }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Move document failed (${response.status})`);
      }
      return response.json();
    } catch (e) {
      if (!this._shouldUseLocalFolderFallback(e)) {
        this._writeLocalDocFolderMap(previousMap);
        throw e;
      }
      return { status: 'success', doc_id: docId, folder_id: folderId };
    }
  }

  async askKnowledgeBase(question, { useHs = true, topK = 6 } = {}) {
    const docIds = this._getSelectedDocIds();
    const payload = { question, use_hs: useHs, top_k: topK };
    if (docIds) payload.doc_ids = docIds;

    const response = await queuedAIJsonFetch('/context/ask', {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Ask failed (${response.status})`);
    }
    return response.json();
  }

  async listCommunityDocuments({ curriculum = '', grade = '', subject = '' } = {}) {
    const params = new URLSearchParams();
    if (curriculum) params.set('curriculum', curriculum);
    if (grade) params.set('grade', String(grade));
    if (subject) params.set('subject', subject);
    const response = await fetch(`${API_URL}/context/community?${params}`, {
      headers: this._headers(),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Community list failed (${response.status})`);
    return response.json();
  }
}

const contextService = new ContextService();
export default contextService;
