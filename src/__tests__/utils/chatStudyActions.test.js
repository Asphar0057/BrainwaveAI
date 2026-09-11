import { isTopicExplanationRequest } from '../../utils/chatStudyActions';

test.each(['Explain photosynthesis', 'Can you teach me integration?', 'Help me understand recursion', 'Tell me about neural networks', 'How does DNS work?', 'I want to learn probability'])('shows study actions for teaching request: %s', prompt => {
  expect(isTopicExplanationRequest(prompt)).toBe(true);
});
test.each(['Identify the top and bottom colors in this image', 'What color is this?', '7 x 8 = ?', 'Solve this equation', 'Thanks', 'Yes', 'Make it shorter', 'Check my answer', 'Do not explain this', 'Please stop explaining', ''])('hides study actions for ordinary reply: %s', prompt => {
  expect(isTopicExplanationRequest(prompt)).toBe(false);
});
