import { Text, StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { MathJaxSvg } from 'react-native-mathjax-html-to-svg';
import { hasMath } from '../utils/mathDetection';

interface Props {
  children?: string | null;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

// Drop-in replacement for <Text> on AI-generated question/answer/option
// strings that may contain LaTeX ($...$, $$...$$). Falls straight through to
// a plain <Text> when there's no math, so screens with mostly-plain content
// pay no rendering cost and look exactly as before.
export default function MathText({ children, style, numberOfLines }: Props) {
  const text = children ?? '';

  if (!hasMath(text)) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const fontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 14;
  const color = typeof flat.color === 'string' ? flat.color : '#000000';

  return (
    <MathJaxSvg
      fontSize={fontSize}
      color={color}
      fontCache
      textStyle={{
        fontFamily: flat.fontFamily,
        textAlign: flat.textAlign,
        lineHeight: flat.lineHeight,
      }}
    >
      {text}
    </MathJaxSvg>
  );
}
