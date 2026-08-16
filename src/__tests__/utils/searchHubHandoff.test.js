import {
  buildSearchHubChatHandoff,
  buildSearchHubContext,
} from '../../utils/searchHubHandoff';

const searchState = {
  query: 'Compare TCP and UDP in exactly four rows',
  aiSuggestion: {
    description: '| Protocol | Reliability |\n|---|---|\n| TCP | Reliable |',
    suggestions: ['Show a networking example'],
    action_buttons: [{ label: 'Make flashcards', action: 'flashcards' }],
    nlp_metadata: { action: 'search', confidence: 0.91 },
  },
  searchResults: {
    total_results: 1,
    results: [{ id: 7, type: 'note', title: 'Transport protocols', content: 'Full saved note content' }],
  },
  filters: { content_types: 'notes', sort_by: 'relevance' },
  relatedSearches: ['TCP handshake'],
  didYouMean: 'TCP versus UDP',
  hsMode: true,
};

test('includes the complete SearchHub interaction in conversation context', () => {
  const context = buildSearchHubContext(searchState);

  expect(context).toContain('ORIGINAL STUDENT REQUEST');
  expect(context).toContain(searchState.query);
  expect(context).toContain('SEARCHHUB AI OVERVIEW (VERBATIM)');
  expect(context).toContain('| TCP | Reliable |');
  expect(context).toContain('Full saved note content');
  expect(context).toContain('Make flashcards');
  expect(context).toContain('TCP handshake');
  expect(context).toContain('TCP versus UDP');
  expect(context).toContain('HS CONTEXT MODE: enabled');
});

test('builds visible and model messages without hiding the original request', () => {
  const handoff = buildSearchHubChatHandoff(searchState);

  expect(handoff.displayMessage).toBe(`Continue helping me with: ${searchState.query}`);
  expect(handoff.conversationContext).toContain('Full saved note content');
  expect(handoff.modelMessage).toContain(handoff.conversationContext);
  expect(handoff.modelMessage).toContain('Do not restart');
  expect(handoff.modelMessage).toContain('exactly four rows');
});

test('caps oversized context without dropping the handoff marker', () => {
  const context = buildSearchHubContext({
    query: 'Explain the uploaded source',
    aiSuggestion: { description: 'x'.repeat(80000) },
  });

  expect(context.length).toBe(72000);
  expect(context).toContain('[[SEARCHHUB_HANDOFF_CONTEXT]]');
});
