import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Rect, G, RadialGradient, Stop, Defs } from 'react-native-svg';
import { useAppTheme } from '../contexts/ThemeContext';

/**
 * Ambient page backdrop: two soft gold glow fields, a faint structural grid,
 * one rotated diamond accent, and heavy film grain. Kept deliberately restrained —
 * no HUD brackets, coordinate readouts, or floating decimals; those read as
 * generic "AI dashboard" filler rather than considered design.
 */
export default function GeoBackground() {
  const { width: W, height: H } = useWindowDimensions();
  const { selectedTheme } = useAppTheme();
  const ac = selectedTheme.accent;
  const fg = selectedTheme.textPrimary;
  const gridStep = Math.max(48, Math.min(84, W / 5));
  const verticals = Array.from({ length: Math.ceil(W / gridStep) + 1 }, (_, i) => i * gridStep);
  const horizontals = Array.from({ length: Math.ceil(H / gridStep) + 1 }, (_, i) => i * gridStep);

  const grainCount = Math.round((W * H) / 2600);
  const grain = Array.from({ length: grainCount }, (_, i) => {
    const seedX = Math.sin(i * 12.9898) * 43758.5453;
    const seedY = Math.sin(i * 78.233) * 12543.789;
    return {
      x: (seedX - Math.floor(seedX)) * W,
      y: (seedY - Math.floor(seedY)) * H,
      r: i % 5 === 0 ? 1.1 : i % 2 === 0 ? 0.7 : 0.4,
      dark: i % 3 === 0,
    };
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="glow-a" cx="8%" cy="4%" r="60%">
            <Stop offset="0" stopColor={ac} stopOpacity={selectedTheme.isLight ? 0.14 : 0.20} />
            <Stop offset="1" stopColor={ac} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="glow-b" cx="96%" cy="86%" r="58%">
            <Stop offset="0" stopColor={ac} stopOpacity={selectedTheme.isLight ? 0.10 : 0.16} />
            <Stop offset="1" stopColor={ac} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Rect x={0} y={0} width={W} height={H} fill="url(#glow-a)" />
        <Rect x={0} y={0} width={W} height={H} fill="url(#glow-b)" />

        <G opacity={selectedTheme.isLight ? 0.05 : 0.07}>
          {verticals.map((x) => (
            <Line key={`v-${x}`} x1={x} y1={0} x2={x} y2={H} stroke={ac} strokeWidth={0.4} />
          ))}
          {horizontals.map((y) => (
            <Line key={`h-${y}`} x1={0} y1={y} x2={W} y2={y} stroke={ac} strokeWidth={0.4} />
          ))}
        </G>

        <Rect
          x={W * 0.7} y={H * 0.11}
          width={64} height={64}
          fill="none" stroke={ac} strokeWidth={0.6} strokeOpacity={0.14}
          transform={`rotate(45 ${W * 0.7 + 32} ${H * 0.11 + 32})`}
        />

        <G opacity={selectedTheme.isLight ? 0.10 : 0.16}>
          {grain.map((dot, i) => (
            <Circle key={i} cx={dot.x} cy={dot.y} r={dot.r} fill={dot.dark ? '#000000' : fg} />
          ))}
        </G>
      </Svg>
    </View>
  );
}
