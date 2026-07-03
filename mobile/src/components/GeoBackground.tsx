import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Rect, G, Text as SvgText, Defs, RadialGradient, Stop, Polyline } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useAppTheme } from '../contexts/ThemeContext';

export default function GeoBackground() {
  const { width: W, height: H } = useWindowDimensions();
  const { selectedTheme } = useAppTheme();
  const ac = selectedTheme.accent;

  const cols = [W / 3, (2 * W) / 3];
  const rows = [H / 4, H / 2, (3 * H) / 4];
  const crosses: [number, number][] = [];
  for (const x of cols) for (const y of rows) crosses.push([x, y]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={W} height={H} style={[StyleSheet.absoluteFill, { opacity: 0.6 }]}>
        <Defs>
          <RadialGradient id="gOrbTL" cx="20%" cy="10%" r="60%">
            <Stop offset="0%" stopColor={ac} stopOpacity={0.18} />
            <Stop offset="100%" stopColor={ac} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="gOrbBR" cx="80%" cy="90%" r="55%">
            <Stop offset="0%" stopColor={ac} stopOpacity={0.14} />
            <Stop offset="100%" stopColor={ac} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="gOrbC" cx="50%" cy="50%" r="40%">
            <Stop offset="0%" stopColor={ac} stopOpacity={0.06} />
            <Stop offset="100%" stopColor={ac} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Orb glows */}
        <Rect x={0} y={0} width={W} height={H} fill="url(#gOrbTL)" />
        <Rect x={0} y={0} width={W} height={H} fill="url(#gOrbBR)" />
        <Rect x={0} y={0} width={W} height={H} fill="url(#gOrbC)" />

        {/* Large edge circles */}
        <Circle cx={-W * 0.18} cy={H * 0.48} r={W * 0.72} fill="none" stroke={ac} strokeWidth={0.5} strokeOpacity={0.1} />
        <Circle cx={W * 1.18} cy={H * 0.52} r={W * 0.68} fill="none" stroke={ac} strokeWidth={0.45} strokeOpacity={0.09} />

        {/* Top center small circle */}
        <Circle cx={W * 0.5} cy={-18} r={W * 0.22} fill="none" stroke={ac} strokeWidth={0.35} strokeOpacity={0.13} />

        {/* Dashed horizontal grid lines */}
        <Line x1={0} y1={H / 4}    x2={W} y2={H / 4}    stroke={ac} strokeWidth={0.3} strokeOpacity={0.12} strokeDasharray="4 12" />
        <Line x1={0} y1={H / 2}    x2={W} y2={H / 2}    stroke={ac} strokeWidth={0.3} strokeOpacity={0.12} strokeDasharray="4 12" />
        <Line x1={0} y1={H * 0.75} x2={W} y2={H * 0.75} stroke={ac} strokeWidth={0.3} strokeOpacity={0.12} strokeDasharray="4 12" />

        {/* Dashed vertical grid lines */}
        <Line x1={W / 3}     y1={0} x2={W / 3}     y2={H} stroke={ac} strokeWidth={0.3} strokeOpacity={0.12} strokeDasharray="4 12" />
        <Line x1={W * 2 / 3} y1={0} x2={W * 2 / 3} y2={H} stroke={ac} strokeWidth={0.3} strokeOpacity={0.12} strokeDasharray="4 12" />

        {/* Diagonal lines */}
        <Line x1={W * 0.11} y1={0}   x2={W * 0.37} y2={H * 0.5} stroke={ac} strokeWidth={0.35} strokeOpacity={0.1} />
        <Line x1={W * 0.89} y1={H}   x2={W * 0.63} y2={H * 0.5} stroke={ac} strokeWidth={0.35} strokeOpacity={0.09} />

        {/* Crosshair markers at grid intersections */}
        {crosses.map(([x, y], i) => (
          <G key={i} opacity={0.26}>
            <Line x1={x - 6} y1={y} x2={x + 6} y2={y} stroke={ac} strokeWidth={0.55} />
            <Line x1={x} y1={y - 6} x2={x} y2={y + 6} stroke={ac} strokeWidth={0.55} />
          </G>
        ))}

        {/* Dot markers at selected intersections */}
        {([crosses[0], crosses[2], crosses[3], crosses[5]] as [number, number][]).map(([x, y], i) => (
          <Circle key={i} cx={x} cy={y} r={1.8} fill={ac} opacity={0.28} />
        ))}

        {/* Dashed connectors */}
        <Line x1={W / 3}     y1={H / 4}    x2={W * 2 / 3} y2={H / 2}    stroke={ac} strokeWidth={0.35} strokeOpacity={0.1}  strokeDasharray="2 9" />
        <Line x1={W * 2 / 3} y1={H / 2}    x2={W / 3}     y2={H * 0.75} stroke={ac} strokeWidth={0.35} strokeOpacity={0.09} strokeDasharray="2 9" />

        {/* Rotated square (diamond) */}
        <Rect
          x={W * 0.66} y={H * 0.13}
          width={56} height={56}
          fill="none" stroke={ac} strokeWidth={0.5} strokeOpacity={0.2}
          transform={`rotate(45 ${W * 0.66 + 28} ${H * 0.13 + 28})`}
        />
        <Rect
          x={W * 0.652} y={H * 0.122}
          width={68} height={68}
          fill="none" stroke={ac} strokeWidth={0.25} strokeOpacity={0.1}
          transform={`rotate(45 ${W * 0.652 + 34} ${H * 0.122 + 34})`}
        />

        {/* Corner brackets */}
        <G opacity={0.22}>
          <Polyline points={`18,38 18,18 38,18`}                               fill="none" stroke={ac} strokeWidth={0.85} />
          <Polyline points={`${W-18},38 ${W-18},18 ${W-38},18`}               fill="none" stroke={ac} strokeWidth={0.85} />
          <Polyline points={`18,${H-38} 18,${H-18} 38,${H-18}`}               fill="none" stroke={ac} strokeWidth={0.85} />
          <Polyline points={`${W-18},${H-38} ${W-18},${H-18} ${W-38},${H-18}`} fill="none" stroke={ac} strokeWidth={0.85} />
        </G>

        {/* Axis coordinate labels */}
        <G opacity={0.17}>
          <SvgText x={W / 3 - 12}     y={H - 8}          fill={ac} fontSize={7} fontFamily="monospace">0.33</SvgText>
          <SvgText x={W * 2 / 3 - 12} y={H - 8}          fill={ac} fontSize={7} fontFamily="monospace">0.67</SvgText>
          <SvgText x={W - 30}          y={H / 4 + 4}      fill={ac} fontSize={7} fontFamily="monospace">0.25</SvgText>
          <SvgText x={W - 30}          y={H / 2 + 4}      fill={ac} fontSize={7} fontFamily="monospace">0.50</SvgText>
          <SvgText x={W - 30}          y={H * 0.75 + 4}   fill={ac} fontSize={7} fontFamily="monospace">0.75</SvgText>
        </G>

        {/* Floating mathematical values */}
        <G opacity={0.13} fontSize={9} fontFamily="monospace">
          <SvgText x={W * 0.06} y={H * 0.15} fill={ac}>0.482</SvgText>
          <SvgText x={W * 0.5}  y={H * 0.35} fill={ac}>−1.337</SvgText>
          <SvgText x={W * 0.6}  y={H * 0.12} fill={ac}>2.094</SvgText>
          <SvgText x={W * 0.06} y={H * 0.73} fill={ac}>3.1416</SvgText>
          <SvgText x={W * 0.68} y={H * 0.65} fill={ac}>−0.892</SvgText>
          <SvgText x={W * 0.36} y={H * 0.89} fill={ac}>1.618</SvgText>
          <SvgText x={W * 0.16} y={H * 0.45} fill={ac}>0.071</SvgText>
          <SvgText x={W * 0.5}  y={H * 0.62} fill={ac}>−2.190</SvgText>
        </G>

        {/* Ghost large numbers */}
        <G opacity={0.055}>
          <SvgText
            x={14} y={H * 0.28}
            fill={ac} fontSize={68} fontWeight="800" fontFamily="Inter"
            transform={`rotate(-90 38 ${H * 0.22})`}
          >01</SvgText>
          <SvgText x={W * 0.7} y={H * 0.68} fill={ac} fontSize={68} fontWeight="800" fontFamily="Inter">02</SvgText>
        </G>
      </Svg>
      <BlurView
        intensity={26}
        tint={selectedTheme.isLight ? 'light' : 'dark'}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
