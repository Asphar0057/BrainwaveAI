import { useMemo, type ReactElement } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { MathJaxSvg } from 'react-native-mathjax-html-to-svg';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { hasMath } from '../utils/mathDetection';

interface Props { children: string; }

// A line containing math renders as one MathJaxSvg block instead of going
// through parseInline -- it loses **bold**/*italic* segment-splitting within
// that one line (math and inline-markdown emphasis essentially never
// overlap in AI-generated content), but actually typesets the LaTeX instead
// of the previous fallback of stuffing "$$...$$" into a monospace code block.
function renderTextOrMath(
  text: string,
  baseStyle: { color: string | number; fontSize?: number },
  plainElement: ReactElement,
): ReactElement {
  if (!hasMath(text)) {
    return plainElement;
  }
  return (
    <MathJaxSvg fontSize={baseStyle.fontSize ?? 14} color={String(baseStyle.color)} fontCache>
      {text}
    </MathJaxSvg>
  );
}

// Split text into inline segments: bold, italic, inline code, plain
function parseInline(text: string, styles: ReturnType<typeof createStyles>): ReactElement[] {
  const parts: ReactElement[] = [];
  // Pattern: **bold**, *italic*, `code`
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<Text key={key++} style={styles.plain}>{text.slice(last, m.index)}</Text>);
    }
    if (m[2] !== undefined) {
      parts.push(<Text key={key++} style={styles.bold}>{m[2]}</Text>);
    } else if (m[3] !== undefined) {
      parts.push(<Text key={key++} style={styles.italic}>{m[3]}</Text>);
    } else if (m[4] !== undefined) {
      parts.push(<Text key={key++} style={styles.inlineCode}>{m[4]}</Text>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(<Text key={key++} style={styles.plain}>{text.slice(last)}</Text>);
  }
  return parts.length > 0 ? parts : [<Text key={0} style={styles.plain}>{text}</Text>];
}

export default function MarkdownText({ children }: Props) {
  const { selectedTheme } = useAppTheme();
  const s = useMemo(() => createStyles(selectedTheme), [selectedTheme]);
  const text = children ?? '';

  const lines = text.split('\n');
  const elements: ReactElement[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block fence
    if (line.trim() === '```' || line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '```') {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <View key={key++} style={s.codeBlock}>
          <Text style={s.codeText}>{codeLines.join('\n')}</Text>
        </View>
      );
      i++;
      continue;
    }

    // H1
    if (line.startsWith('# ')) {
      elements.push(<Text key={key++} style={s.h1}>{line.slice(2)}</Text>);
      i++; continue;
    }
    // H2
    if (line.startsWith('## ')) {
      elements.push(<Text key={key++} style={s.h2}>{line.slice(3)}</Text>);
      i++; continue;
    }
    // H3
    if (line.startsWith('### ')) {
      elements.push(<Text key={key++} style={s.h3}>{line.slice(4)}</Text>);
      i++; continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<View key={key++} style={s.hr} />);
      i++; continue;
    }

    // Bullet list
    if (line.match(/^[-*] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*] /)) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <View key={key++} style={s.list}>
          {items.map((item, idx) => (
            <View key={idx} style={s.listRow}>
              <Text style={s.bullet}>•</Text>
              {renderTextOrMath(item, s.listText, <Text style={s.listText}>{parseInline(item, s)}</Text>)}
            </View>
          ))}
        </View>
      );
      continue;
    }

    // Numbered list
    if (line.match(/^\d+\. /)) {
      const items: { n: string; t: string }[] = [];
      while (i < lines.length && lines[i].match(/^\d+\. /)) {
        const m = lines[i].match(/^(\d+)\. (.+)/);
        if (m) items.push({ n: m[1], t: m[2] });
        i++;
      }
      elements.push(
        <View key={key++} style={s.list}>
          {items.map((item, idx) => (
            <View key={idx} style={s.listRow}>
              <Text style={s.bullet}>{item.n}.</Text>
              {renderTextOrMath(item.t, s.listText, <Text style={s.listText}>{parseInline(item.t, s)}</Text>)}
            </View>
          ))}
        </View>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      const quoted = line.slice(2);
      elements.push(
        <View key={key++} style={s.blockquote}>
          {renderTextOrMath(quoted, s.blockquoteText, <Text style={s.blockquoteText}>{parseInline(quoted, s)}</Text>)}
        </View>
      );
      i++; continue;
    }

    // Empty line → spacer
    if (line.trim() === '') {
      elements.push(<View key={key++} style={{ height: 6 }} />);
      i++; continue;
    }

    // Normal paragraph
    elements.push(
      <View key={key++}>
        {renderTextOrMath(line, s.para, <Text style={s.para}>{parseInline(line, s)}</Text>)}
      </View>
    );
    i++;
  }

  return <View>{elements}</View>;
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const accentDeep = darkenColor(theme.accent, theme.isLight ? 16 : 34);
  return StyleSheet.create({
    plain: { color: theme.accentHover, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 22 },
    bold: { color: theme.accentHover, fontFamily: 'Inter_700Bold', fontSize: 14, lineHeight: 22 },
    italic: { color: theme.accent, fontFamily: 'Inter_400Regular', fontStyle: 'italic', fontSize: 14, lineHeight: 22 },
    inlineCode: {
      color: theme.accentHover,
      backgroundColor: rgbaFromHex(theme.panelAlt, 0.92),
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
    },
    para: { color: theme.accentHover, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 22, marginBottom: 2 },
    h1: { color: theme.accentHover, fontFamily: 'Inter_900Black', fontSize: 19, lineHeight: 26, marginTop: 10, marginBottom: 4 },
    h2: { color: theme.accentHover, fontFamily: 'Inter_900Black', fontSize: 16, lineHeight: 24, marginTop: 8, marginBottom: 2 },
    h3: { color: theme.accent, fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 22, marginTop: 6, marginBottom: 2 },
    codeBlock: {
      backgroundColor: rgbaFromHex(theme.panelAlt, 0.94),
      borderRadius: 10,
      padding: 12,
      marginVertical: 6,
      borderWidth: 1,
      borderColor: theme.border,
    },
    codeText: { color: theme.accentHover, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
    hr: { height: 1, backgroundColor: theme.border, marginVertical: 8 },
    list: { marginVertical: 4, gap: 4 },
    listRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
    bullet: { color: accentDeep, fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 22, minWidth: 14 },
    listText: { flex: 1, color: theme.accentHover, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 22 },
    blockquote: { borderLeftWidth: 3, borderLeftColor: accentDeep, paddingLeft: 10, marginVertical: 4 },
    blockquoteText: { color: theme.accent, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
  });
}
