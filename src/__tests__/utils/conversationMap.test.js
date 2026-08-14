import { getConversationPrompts, getPromptPreview } from '../../utils/conversationMap';

describe('conversationMap', () => {
  test('numbers only user prompts while preserving message indexes', () => {
    const prompts = getConversationPrompts([
      { id: 'u1', type: 'user', content: 'Explain DNS.' },
      { id: 'a1', type: 'ai', content: 'DNS resolves names.' },
      { id: 'u2', type: 'user', content: 'Give me an example.' },
    ]);

    expect(prompts).toEqual([
      { id: 'u1', messageIndex: 0, questionNumber: 1, preview: 'Explain DNS.' },
      { id: 'u2', messageIndex: 2, questionNumber: 2, preview: 'Give me an example.' },
    ]);
  });

  test('supports role-based history records', () => {
    expect(getConversationPrompts([{ id: 9, role: 'human', content: 'Why?' }])[0]).toMatchObject({
      id: '9',
      questionNumber: 1,
      preview: 'Why?',
    });
  });

  test('collapses whitespace and truncates previews on word boundaries', () => {
    const preview = getPromptPreview({ content: `  ${'quantum '.repeat(30)}measurement  ` }, 48);
    expect(preview.length).toBeLessThanOrEqual(48);
    expect(preview).not.toContain('  ');
    expect(preview.endsWith('…')).toBe(true);
  });

  test('uses an uploaded file as the label for attachment-only prompts', () => {
    expect(getPromptPreview({ content: '', files: [{ name: 'lecture.pdf' }] })).toBe('Uploaded lecture.pdf');
  });
});
