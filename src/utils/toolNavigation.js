const TOOLS = {
  'ai-chat': 'AI Chat', notes: 'Notes', flashcards: 'Flashcards',
  'quiz-hub': 'Quiz Hub', 'solo-quiz': 'Solo Quiz', 'quiz-battles': 'Quiz Battles',
  'quiz-battle': 'Quiz Battle', challenges: 'Challenges', challenge: 'Challenge',
  analytics: 'Analytics', 'knowledge-map': 'Knowledge Map', 'knowledge-roadmap': 'Knowledge Map',
  'concept-web': 'Concept Web', 'learning-paths': 'Learning Paths', 'question-bank': 'Questions',
  'slide-explorer': 'Slides', contexthub: 'ContextHub', canvas: 'Canvas',
  playlists: 'Playlists', social: 'Social Hub', friends: 'Friends', shared: 'Shared with me',
  'activity-feed': 'Activity Feed', 'activity-timeline': 'Activity Timeline', leaderboards: 'Leaderboards',
  'xp-roadmap': 'XP Roadmap', 'study-insights': 'Study Insights', weaknesses: 'Weak Areas',
  'weakness-practice': 'Practice', practice: 'Practice', 'weakness-tips': 'Study Tips',
  profile: 'Profile', 'profile-quiz': 'Learning Assessment', 'learning-review': 'Learning Review',
  games: 'Games', statistics: 'Statistics', atlas: 'Atlas', 'search-hub': 'Search Hub',
  'customize-dashboard': 'Customize Dashboard',
};
export function getToolNavigation(pathname = '/', workspace = null) {
  const parts = pathname.split('/').filter(Boolean);
  const root = parts[0];
  let label = TOOLS[root];
  let parentPath = workspace === 'student' || workspace === 'educator' ? `/${workspace}` : '/dashboard-cerbyl';
  let parentLabel = 'Dashboard';
  if (root === 'student' || root === 'educator') {
    parentPath = `/${root}`;
    label = ({classes:'Classes',assignments:'Assignments',gradebook:'Gradebook',messages:'Messages',notifications:'Notifications'})[parts[1]] || 'Classroom';
  } else if (root === 'notes' && parts.length > 1) {
    parentPath = '/notes'; parentLabel = 'Notes';
    label = ({dashboard:'Note library',editor:'Note editor','ai-media':'Media notes','audio-video':'Media workspace',podcast:'Podcast','my-notes':'Note library'})[parts[1]] || 'Notes';
    if (parts[1] === 'editor') { parentPath = '/notes/dashboard'; parentLabel = 'Note library'; }
    if (parts[1] === 'ai-media' && parts[2] && parts[2] !== 'my-notes') { parentPath = '/notes/ai-media/my-notes'; parentLabel = 'Media library'; }
  } else if (root === 'quiz-battle') { parentPath = '/quiz-battles'; parentLabel = 'Quiz Battles'; }
  else if (root === 'challenge') { parentPath = '/challenges'; parentLabel = 'Challenges'; }
  else if (['weakness-practice', 'weakness-tips', 'practice'].includes(root)) { parentPath = '/weaknesses'; parentLabel = 'Weak Areas'; }
  else if (parts.length > 1 && TOOLS[root]) {
    parentPath = `/${root}`; parentLabel = TOOLS[root];
    label = ({ 'ai-chat':'Conversation', playlists:'Playlist', contexthub:'Source details', 'learning-paths':'Learning path', shared:'Shared item', profile:'Usage' })[root] || label;
    if (root === 'solo-quiz') label = parts[1] === 'review' ? 'Quiz results' : 'Quiz session';
  }
  if (root === 'admin') {
    label = ({analytics:'Admin analytics','api-usage':'API usage','rate-limits':'Rate limits'})[parts[1]] || 'Admin';
    if (parts[1] !== 'analytics') { parentPath = '/admin/analytics'; parentLabel = 'Admin analytics'; }
  }
  return { label, parentPath, parentLabel };
}
export const isActiveToolPath = (pathname, path) => Boolean(path && (pathname === path || pathname.startsWith(`${path}/`)));
