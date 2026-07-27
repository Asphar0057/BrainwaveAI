// Matches the delimiters backend/services/math_processor.py normalizes AI
// responses to ($...$ inline, $$...$$ block) plus the LaTeX-native \(...\)
// and \[...\] forms MathJaxSvg also understands natively, as a fallback for
// any content that reaches the client without having gone through that
// normalizer (e.g. a raw AI provider response).
//
// The inline $...$ branch requires the content to not start/end with
// whitespace -- the same guard math_processor.py's own protection regex
// uses (`\$(?!\s)[^\n$]+?(?<!\s)\$`) -- otherwise plain prose mentioning two
// dollar amounts ("Price is $5 today, $10 tomorrow") gets misread as one
// inline-math span running from the first $ to the second.
const MATH_PATTERN = /\$\$[\s\S]+?\$\$|\$(?!\s)[^$\n]+?(?<!\s)\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]/;

export function hasMath(text: string | null | undefined): boolean {
  if (!text) return false;
  return MATH_PATTERN.test(text);
}
