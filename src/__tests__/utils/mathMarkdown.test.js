jest.mock('marked', () => ({
  marked: {
    Renderer: class Renderer {},
    parse: (value) => `<p>${value}</p>`,
  },
}));

import { extractMathPlaceholders, renderMarkdownWithMath } from '../../utils/mathMarkdown';

describe('mathMarkdown', () => {
  it('keeps multiline inline LaTeX together instead of turning continuation signs into bullets', () => {
    const source = String.raw`The integral of \(2x^2
+ 3\) is \(\frac{2}{3}x^3
+ 3x
+ C\).`;

    const { text, mathStore } = extractMathPlaceholders(source);

    expect(text).toBe('The integral of ZMATH0Z is ZMATH1Z.');
    expect(mathStore).toEqual([
      { tex: '2x^2 + 3', display: false },
      { tex: '\\frac{2}{3}x^3 + 3x + C', display: false },
    ]);
  });

  it('still treats multiline display math as display math', () => {
    const { mathStore } = extractMathPlaceholders(String.raw`\[
      x^2 + 3x
    \]`);

    expect(mathStore).toEqual([{ tex: 'x^2 + 3x', display: true }]);
  });

  it('protects LaTeX from Markdown cleanup that interprets plus signs as bullets', () => {
    const html = renderMarkdownWithMath(String.raw`Use \(3x^2 + 4\) and \(x + C\).`, {
      preprocess: (value) => value.replace(/([^\n])\s+[+-]\s+(?=[A-Z0-9])/g, '$1\n- '),
    });

    expect(html).toContain('$3x^2 + 4$');
    expect(html).toContain('$x + C$');
    expect(html).not.toContain('$3x^2\n- 4$');
  });
});
