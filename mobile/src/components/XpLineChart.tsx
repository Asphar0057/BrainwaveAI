import { Fragment } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Line, Text as SvgText } from 'react-native-svg';

type Point = { label: string; xp: number };

type Props = {
  points: Point[];
  width: number;
  height?: number;
  color?: string;
  labelColor?: string;
  maxLabels?: number;
  gridLines?: number;
};

/** Rounds to a "nice" 1/2/5-times-a-power-of-ten step, the way chart axes conventionally do. */
function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const fraction = rawStep / 10 ** exponent;
  const niceFraction = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  return niceFraction * 10 ** exponent;
}

/** Builds evenly-spaced round-number ticks from 0 up to (at least) maxValue. */
function niceAxisTicks(maxValue: number, targetTickCount: number): number[] {
  const step = niceStep(maxValue / Math.max(1, targetTickCount - 1));
  const ticks: number[] = [];
  for (let v = 0; v <= maxValue + step - 1e-9; v += step) ticks.push(Math.round(v));
  return ticks;
}

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
export default function XpLineChart({ points, width, height = 120, color = '#D8B38D', labelColor, maxLabels = 7, gridLines = 4 }: Props) {
  const gutter = 26;
  const chartWidth = Math.max(0, width - gutter);
  const padding = 10;
  const chartH = height - 22;
  const maxXpRaw = Math.max(1, ...points.map((p) => p.xp));
  const ticks = niceAxisTicks(maxXpRaw, gridLines);
  const niceMax = ticks[ticks.length - 1];
  const stepX = points.length > 1 ? (chartWidth - padding * 2) / (points.length - 1) : 0;

  const coords = points.map((p, i) => ({
    x: gutter + padding + stepX * i,
    y: 4 + (chartH - 8) * (1 - p.xp / niceMax),
  }));

  const linePath = buildSmoothPath(coords);
  const areaPath = coords.length > 0
    ? `${linePath} L ${coords[coords.length - 1].x} ${chartH} L ${coords[0].x} ${chartH} Z`
    : '';

  const labelStep = Math.max(1, Math.ceil(points.length / maxLabels));

  const gridColor = labelColor ?? color;
  const levelLines = ticks.map((value) => ({
    y: 4 + (chartH - 8) * (1 - value / niceMax),
    value,
  }));

  return (
    <View style={{ width }}>
      <Svg width={width} height={height - 16}>
        <Defs>
          <LinearGradient id="xpFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.32} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {levelLines.map((line, i) => (
          <Fragment key={i}>
            <Line x1={gutter} y1={line.y} x2={width} y2={line.y} stroke={gridColor} strokeWidth={1} strokeDasharray="2,4" opacity={0.16} />
            <SvgText x={gutter - 6} y={line.y + 3} fontSize={8} fontWeight="600" fill={gridColor} opacity={0.5} textAnchor="end">
              {line.value}
            </SvgText>
          </Fragment>
        ))}
        {areaPath ? <Path d={areaPath} fill="url(#xpFill)" /> : null}
        {linePath ? (
          <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {coords.length > 0 ? <Circle cx={coords[coords.length - 1].x} cy={coords[coords.length - 1].y} r={4} fill={color} /> : null}
      </Svg>
      <View style={[styles.labelRow, { paddingLeft: gutter }]}>
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
