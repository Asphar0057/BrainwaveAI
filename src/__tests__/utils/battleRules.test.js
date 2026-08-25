import {
  BATTLE_MODES,
  formatBattleMode,
  getBattleTimeLimit,
  getQuestionTimeLimit,
  shouldEndRun,
} from '../../utils/battleRules';

describe('battle mode rules', () => {
  it('defines every mode exposed by the battle creator', () => {
    expect(Object.keys(BATTLE_MODES)).toEqual(['classic', 'speed', 'blitz', 'sudden_death']);
  });

  it.each([
    ['classic', 10, 600, 600],
    ['speed', 10, 900, 300],
    ['blitz', 5, 900, 75],
    ['sudden_death', 20, 900, 600],
  ])('calculates the %s time limit', (mode, count, classicLimit, expected) => {
    expect(getBattleTimeLimit(mode, count, classicLimit)).toBe(expected);
  });

  it('only gives Blitz a per-question limit', () => {
    expect(getQuestionTimeLimit('blitz')).toBe(15);
    expect(getQuestionTimeLimit('classic')).toBeNull();
  });

  it('ends Sudden Death only after an incorrect answer', () => {
    expect(shouldEndRun('sudden_death', false)).toBe(true);
    expect(shouldEndRun('sudden_death', true)).toBe(false);
    expect(shouldEndRun('classic', false)).toBe(false);
  });

  it('formats stored mode names for the UI', () => {
    expect(formatBattleMode('speed')).toBe('Speed Battle');
    expect(formatBattleMode('sudden_death')).toBe('Sudden Death');
  });
});
