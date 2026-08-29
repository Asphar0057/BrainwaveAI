import contextService from '../../services/contextService';

const jsonResponse = (status, body) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(body),
});

describe('contextService persistence safety', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('username', 'audit-user');
    localStorage.setItem('token', 'token');
    global.fetch = jest.fn();
  });

  afterEach(() => { jest.restoreAllMocks(); });

  it('drops stale remote folders after a successful server refresh but keeps unsynced local folders', async () => {
    localStorage.setItem('ctx_local_folders_audit-user', JSON.stringify([
      { id: 10, name: 'Deleted remotely' },
      { id: -20, name: 'Offline draft' },
    ]));
    fetch.mockReturnValue(jsonResponse(200, { folders: [{ id: 11, name: 'Current' }] }));
    const result = await contextService.listFolders();
    expect(result.folders.map((folder) => folder.name)).toEqual(['Offline draft', 'Current']);
  });

  it('rolls back a rejected folder creation instead of leaving a ghost folder', async () => {
    fetch.mockReturnValue(jsonResponse(400, { detail: 'Folder name is too long' }));
    await expect(contextService.createFolder({ name: 'Rejected' })).rejects.toThrow('Folder name is too long');
    expect(JSON.parse(localStorage.getItem('ctx_local_folders_audit-user'))).toEqual([]);
  });

  it('rolls back a rejected document move', async () => {
    localStorage.setItem('ctx_local_doc_folders_audit-user', JSON.stringify({ 'doc-1': 2 }));
    fetch.mockReturnValue(jsonResponse(500, { detail: 'Move failed' }));
    await expect(contextService.moveDocumentToFolder('doc-1', 3)).rejects.toThrow('Move failed');
    expect(JSON.parse(localStorage.getItem('ctx_local_doc_folders_audit-user'))).toEqual({ 'doc-1': 2 });
  });

  it('cleans all local references after document deletion', async () => {
    localStorage.setItem('ctx_local_doc_folders_audit-user', JSON.stringify({ 'doc-1': 2 }));
    localStorage.setItem('ctx_doc_names_audit-user', JSON.stringify({ 'doc-1': 'Notes.pdf' }));
    localStorage.setItem('ctx_selected_doc_ids', JSON.stringify(['doc-1', 'doc-2']));
    fetch.mockReturnValue(jsonResponse(200, { success: true }));
    await contextService.deleteDocument('doc-1');
    expect(JSON.parse(localStorage.getItem('ctx_local_doc_folders_audit-user'))).toEqual({});
    expect(JSON.parse(localStorage.getItem('ctx_doc_names_audit-user'))).toEqual({});
    expect(JSON.parse(localStorage.getItem('ctx_selected_doc_ids'))).toEqual(['doc-2']);
  });
});
