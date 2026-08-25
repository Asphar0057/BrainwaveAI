export const BATTLE_MODES = Object.freeze({
  classic: {
    label: 'Classic',
    description: 'Highest score wins.',
  },
  speed: {
    label: 'Speed Battle',
    description: 'Highest score wins; completion time breaks a tie.',
  },
  blitz: {
    label: 'Blitz',
    description: 'You have 15 seconds for each question.',
    questionTimeLimit: 15,
  },
  sudden_death: {
    label: 'Sudden Death',
    description: 'Your run ends after the first incorrect answer.',
  },
});

export const getBattleTimeLimit = (mode, questionCount, classicTimeLimit = 300) => {
  if (mode === 'blitz') return questionCount * BATTLE_MODES.blitz.questionTimeLimit;
  if (mode === 'sudden_death') return questionCount * 30;
  if (mode === 'speed') return 300;
  return classicTimeLimit;
};

export const getQuestionTimeLimit = (mode) => BATTLE_MODES[mode]?.questionTimeLimit || null;

export const shouldEndRun = (mode, isCorrect) => mode === 'sudden_death' && !isCorrect;

export const formatBattleMode = (mode) => BATTLE_MODES[mode]?.label || BATTLE_MODES.classic.label;
