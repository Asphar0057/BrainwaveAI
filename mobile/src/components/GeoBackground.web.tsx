import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex } from '../utils/theme';

export default function GeoBackground() {
  const { selectedTheme } = useAppTheme();
  const lines = useMemo(() => Array.from({ length: 20 }, (_, index) => index * 80), []);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      <Svg width="100%" height="100%" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="web-wash" cx="50%" cy="28%" r="70%">
            <Stop offset="0" stopColor={selectedTheme.accent} stopOpacity={selectedTheme.isLight ? 0.09 : 0.14} />
            <Stop offset="1" stopColor={selectedTheme.accent} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="web-orb" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={selectedTheme.accent} stopOpacity={0.28} />
            <Stop offset="1" stopColor={selectedTheme.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="1600" height="1000" fill="url(#web-wash)" />
        <G opacity={selectedTheme.isLight ? 0.06 : 0.1}>
          {lines.map((value) => <Line key={`v${value}`} x1={value} y1="0" x2={value} y2="1000" stroke={selectedTheme.accentHover} strokeWidth="0.6" />)}
          {lines.slice(0, 13).map((value) => <Line key={`h${value}`} x1="0" y1={value} x2="1600" y2={value} stroke={selectedTheme.accentHover} strokeWidth="0.6" />)}
        </G>
        <Circle cx="120" cy="80" r="390" fill="url(#web-orb)" />
        <Circle cx="1480" cy="910" r="330" fill="url(#web-orb)" opacity="0.7" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: rgbaFromHex(selectedTheme.bgPrimary, selectedTheme.isLight ? 0.02 : 0.08) }]} />
    </View>
  );
}
