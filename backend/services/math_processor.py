
import re

_LATEX_MATH_CMDS = re.compile(
    r'\\(?:'
    r'frac|sqrt|sum|int|oint|prod|lim|sup|inf|max|min|log|ln|exp|'
    r'sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|'
    r'partial|nabla|infty|pm|mp|times|cdot|div|'
    r'alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|'
    r'iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|'
    r'tau|upsilon|phi|varphi|chi|psi|omega|'
    r'Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega|'
    r'mathbb|mathbf|mathrm|mathit|mathcal|text|vec|hat|bar|dot|ddot|'
    r'left|right|big|Big|bigg|Bigg|'
    r'leq|geq|neq|approx|equiv|subset|supset|subseteq|supseteq|in|notin|'
    r'rightarrow|leftarrow|Rightarrow|Leftarrow|leftrightarrow|'
    r'to|gets|iff|forall|exists|nexists|'
    r'matrix|pmatrix|bmatrix|vmatrix|cases|aligned|align|'
    r'overline|underline|overbrace|underbrace|'
    r'ldots|cdots|vdots|ddots'
    r')(?![a-zA-Z])'
)

_SUPERSCRIPT = re.compile(r'[a-zA-Z0-9]\^[\da-zA-Z{(\\-]')

_SUBSCRIPT = re.compile(r'[a-zA-Z]\d*_[\da-zA-Z{]')

def _has_math_signal(token: str) -> bool:
    if _LATEX_MATH_CMDS.search(token):
        return True
    if _SUPERSCRIPT.search(token):
        return True
    if _SUBSCRIPT.search(token):
        return True
    return False

def _protect(text: str):
    saved = []

    def save(m):
        idx = len(saved)
        saved.append(m.group(0))
        return f'\x00SAVE{idx}\x00'

    text = re.sub(r'```[\s\S]*?```', save, text)
    text = re.sub(r'`[^`\n]+`', save, text)

    text = re.sub(r'\$\$[\s\S]+?\$\$', save, text)
    text = re.sub(r'\$(?!\s)[^\n$]+?(?<!\s)\$', save, text)
    text = re.sub(r'\\\[[\s\S]+?\\\]', save, text)
    # Inline LaTeX may be wrapped across lines by the model. Protect the whole
    # expression so a leading + or - on a continuation line is not later
    # interpreted as a Markdown list item by the client.
    text = re.sub(r'\\\([\s\S]+?\\\)', save, text)

    def restore(t: str) -> str:
        for i, content in enumerate(saved):
            t = t.replace(f'\x00SAVE{i}\x00', content)
        return t

    return text, restore

def _convert_latex_delimiters(text: str) -> str:
    text = re.sub(r'\\\[([\s\S]+?)\\\]', r'$$\1$$', text)
    text = re.sub(r'\\\((.+?)\\\)', r'$\1$', text)
    return text

def _auto_wrap_inline(text: str) -> str:

    def wrap_display_line(m):
        expr = m.group(1).strip()
        if _has_math_signal(expr) or (re.search(r'[a-zA-Z]\s*[=+\-]\s*[a-zA-Z0-9\\]', expr) and '^' in expr):
            return f'\n$$\n{expr}\n$$\n'
        return m.group(0)

    text = re.sub(
        r'\n[ \t]*([A-Za-z0-9\\(][^<\n]*?(?:\^|_\d|\\frac|\\sqrt|\\int|\\sum)[^<\n]*?[= a-zA-Z0-9)}\]\.!?])\n',
        lambda m: f'\n$$\n{m.group(1).strip()}\n$$\n' if len(m.group(1).strip()) > 4 else m.group(0),
        text
    )

    def wrap_text_node(segment: str) -> str:
        tokens = re.split(r'(\s+)', segment)
        result = []
        math_buf = []

        def flush_math():
            if not math_buf:
                return
            expr = ''.join(math_buf).strip()
            prefix = re.match(r'^([,.:;!?\(\)]*)(.+?)([,.:;!?\(\)]*)$', expr, re.S)
            if prefix:
                result.append(prefix.group(1) + '$' + prefix.group(2).strip() + '$' + prefix.group(3))
            else:
                result.append(f'${expr}$')
            math_buf.clear()

        for tok in tokens:
            if re.match(r'\s+', tok):
                if math_buf:
                    math_buf.append(tok)
                else:
                    result.append(tok)
            elif _has_math_signal(tok):
                math_buf.append(tok)
            else:
                if math_buf:
                    if re.match(r'^[=+\-*/,.)}\]0-9]+$', tok.strip()):
                        math_buf.append(tok)
                    else:
                        flush_math()
                        result.append(tok)
                else:
                    result.append(tok)

        flush_math()
        return ''.join(result)

    if '<' in text and '>' in text:
        text = re.sub(r'>([^<]+)<', lambda m: '>' + wrap_text_node(m.group(1)) + '<', text)
    else:
        lines = text.split('\n')
        text = '\n'.join(wrap_text_node(l) for l in lines)

    return text

def _fix_display_math_spacing(text: str) -> str:
    text = re.sub(r'([^\n])\$\$', r'\1\n$$', text)
    text = re.sub(r'\$\$([^\n])', r'$$\n\1', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text

def process_math_in_response(text: str) -> str:
    if not text or not isinstance(text, str):
        return text

    text, restore = _protect(text)
    text = _convert_latex_delimiters(text)
    text = _auto_wrap_inline(text)
    text = restore(text)
    text = _fix_display_math_spacing(text)
    return text

def enhance_display_math(text: str) -> str:
    return _fix_display_math_spacing(text)

def format_math_response(text: str) -> str:
    return process_math_in_response(text)

def process_math_in_json(obj):
    """Recursively normalize LaTeX delimiters in every string value of a
    parsed JSON structure (dict/list), leaving keys and non-string values untouched.
    Useful for AI responses that return structured JSON (quiz arrays, outlines, etc)
    rather than a single free-text blob."""
    if isinstance(obj, str):
        return process_math_in_response(obj)
    if isinstance(obj, dict):
        return {k: process_math_in_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [process_math_in_json(v) for v in obj]
    return obj
