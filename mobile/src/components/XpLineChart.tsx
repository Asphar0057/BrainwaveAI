import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

type Point = { label: string; xp: number };

type Props = {
  points: Point[];
  width: number;
  height?: number;
  color?: string;
  labelColor?: string;
  maxLabels?: number;
};

function buildSmoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return '';
  if (coords.length === 1) return `M ${coords[0].x} ${coords[0].y}`;
  let d = `M ${coords[0].x} ${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX} ${p0.y}, ${midX} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

/** Lightweight SVG sparkline/area chart — no charting lib dependency, just react-native-svg. */
export default function XpLineChart({ points, width, height = 120, color = '#D8B38D', labelColor, maxLabels = 7 }: Props) {
  const padding = 10;
  const chartH = height - 22;
  const maxXp = Math.max(1, ...points.map((p) => p.xp));
  const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: padding + stepX * i,
    y: 4 + (chartH - 8) * (1 - p.xp / maxXp),
  }));

  const linePath = buildSmoothPath(coords);
  const areaPath = coords.length > 0
    ? `${linePath} L ${coords[coords.length - 1].x} ${chartH} L ${coords[0].x} ${chartH} Z`
    : '';

  const labelStep = Math.max(1, Math.ceil(points.length / maxLabels));

  return (
    <View style={{ width }}>
      <Svg width={width} height={height - 16}>
        <Defs>
          <LinearGradient id="xpFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.32} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {areaPath ? <Path d={areaPath} fill="url(#xpFill)" /> : null}
        {linePath ? (
          <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {coords.length > 0 ? <Circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r={4} fill={color} /> : null}
      </Svg>
      <View style={styles.labelRow}>
        {points.map((p, i) => {
          const show = points.length <= maxLabels || i % labelStep === 0 || i === points.length - 1;
          return (
            <Text key={i} numberOfLines={1} style={[styles.label, { color: labelColor ?? color, opacity: show ? 0.6 : 0 }]}>
              {p.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row' },
  label: { flex: 1, textAlign: 'center', fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 },
});
