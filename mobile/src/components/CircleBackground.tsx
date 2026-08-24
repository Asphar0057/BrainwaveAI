import { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions, ViewStyle } from 'react-native';
import Svg, { Circle, Text as SvgText, Line, Rect, G, Mask, RadialGradient, LinearGradient as SvgLinearGradient, Stop, Defs } from 'react-native-svg';
import { Canvas, Fill, LinearGradient as SkLinearGradient, useCanvasSize, vec } from '@shopify/react-native-skia';
import { GrainNoise } from './SkiaGrain';
import { useAppTheme } from '../contexts/ThemeContext';

const ACCENT = '#D8B38D';
const AnimatedView = Animated.createAnimatedComponent(View);

// Same soft drift used by the ambient orbs elsewhere — kept here so this
// background still breathes instead of sitting static.
function useOrbDrift(durationMs: number, reverse: boolean) {
  const v = useRef(new Animated.Value(reverse ? 1 : 0)).current;
  useEffect(() => {
    const legA = Animated.timing(v, { toValue: reverse ? 0 : 1, duration: durationMs, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
    const legB = Animated.timing(v, { toValue: reverse ? 1 : 0, duration: durationMs, easing: Easing.inOut(Easing.ease), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([legA, legB]));
    loop.start();
    return () => loop.stop();
  }, [v, durationMs, reverse]);
  return v;
}

type RingSpec = {
  cx: number; cy: number; r: number;
  strokeOpacity: number; strokeWidth: number; dashed?: boolean;
  label?: string; labelAngleDeg?: number;
};

// A scattered "orbit constellation" instead of a straight-line grid — thin
// circle outlines at varied radii, a couple with a radius tick + small
// numeral label like a blueprint annotation, matching the app's existing
// Swiss-numbered design language (Home.css "01 TEAM" tiles etc.) but in a
// circular idiom instead of a rectilinear one.
const RINGS: RingSpec[] = [
  { cx: 230,  cy: 190, r: 150, strokeOpacity: 0.16, strokeWidth: 0.7, label: '01', labelAngleDeg: -35 },
  { cx: 1390, cy: 230, r: 96,  strokeOpacity: 0.14, strokeWidth: 0.6, label: '02', labelAngleDeg: 40 },
  { cx: 800,  cy: 520, r: 280, strokeOpacity: 0.1,  strokeWidth: 0.6, dashed: true },
  { cx: 270,  cy: 800, r: 118, strokeOpacity: 0.15, strokeWidth: 0.7, label: '03', labelAngleDeg: -60 },
  { cx: 1320, cy: 810, r: 178, strokeOpacity: 0.13, strokeWidth: 0.6, label: '04', labelAngleDeg: 20 },
  { cx: 960,  cy: 130, r: 58,  strokeOpacity: 0.18, strokeWidth: 0.8 },
  { cx: 620,  cy: 340, r: 34,  strokeOpacity: 0.22, strokeWidth: 1 },
  { cx: 1120, cy: 600, r: 22,  strokeOpacity: 0.24, strokeWidth: 1 },
];

function ringLabelPos(ring: RingSpec) {
  const angle = ((ring.labelAngleDeg ?? 0) * Math.PI) / 180;
  return {
    x: ring.cx + Math.cos(angle) * ring.r,
    y: ring.cy + Math.sin(angle) * ring.r,
  };
}

/**
 * Circle-and-thin-text variant of GeoBackground: same wash/orb-glow/grain/
 * vignette stack (so it still reads as the same app), but the straight-line
 * grid + bold grid numbers are replaced with a scattered constellation of
 * thin circle outlines and light-weight numeral tags. Drop-in replacement
 * for <GeoBackground /> on pages that want the circular treatment.
 */
export default function CircleBackground() {
  const { width: W, height: H } = useWindowDimensions();
  const { selectedTheme } = useAppTheme();
  const dim = selectedTheme.isLight ? 0.55 : 1;
  const { ref: canvasRef, size: canvasSize } = useCanvasSize();

  const drift1 = useOrbDrift(22000, false);
  const drift2 = useOrbDrift(26000, true);

  const orb1Style: ViewStyle = {
    position: 'absolute', top: -200, left: -180, width: 640, height: 640,
    opacity: 0.65 * dim,
    transform: [
      { translateX: drift1.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
      { translateY: drift1.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
      { scale: drift1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
    ] as any,
  };
  const orb2Style: ViewStyle = {
    position: 'absolute', bottom: -170, right: -150, width: 520, height: 520,
    opacity: 0.5 * dim,
    transform: [
      { translateX: drift2.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
      { translateY: drift2.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
      { scale: drift2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
    ] as any,
  };

  const GW = 1600;
  const GH = 1000;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* wash */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="cbc-wash" cx="50%" cy="30%" r="62%">
            <Stop offset="0" stopColor={ACCENT} stopOpacity={0.14 * dim} />
            <Stop offset="1" stopColor={ACCENT} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#cbc-wash)" />
      </Svg>

      {/* ambient orb glows */}
      <AnimatedView style={orb1Style}>
        <Svg width={640} height={640}>
          <Defs>
            <RadialGradient id="cbc-orb1" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={ACCENT} stopOpacity={0.46} />
              <Stop offset="0.7" stopColor={ACCENT} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={320} cy={320} r={320} fill="url(#cbc-orb1)" />
        </Svg>
      </AnimatedView>
      <AnimatedView style={orb2Style}>
        <Svg width={520} height={520}>
          <Defs>
            <RadialGradient id="cbc-orb2" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={ACCENT} stopOpacity={0.46} />
              <Stop offset="0.7" stopColor={ACCENT} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={260} cy={260} r={260} fill="url(#cbc-orb2)" />
        </Svg>
      </AnimatedView>

      {/* geometric circle constellation — thin outlined rings, radius ticks,
          light-weight numeral tags. Masked to a soft center ellipse so it
          fades out toward the edges instead of hard-cutting off. */}
      <Svg width="100%" height="100%" viewBox={`0 0 ${GW} ${GH}`} preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="cbc-ringmask" cx="50%" cy="42%" r="68%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.95} />
            <Stop offset="0.55" stopColor="#ffffff" stopOpacity={0.55} />
            <Stop offset="0.9" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
          <Mask id="cbc-rm">
            <Rect x={0} y={0} width={GW} height={GH} fill="url(#cbc-ringmask)" />
          </Mask>
        </Defs>
        <G mask="url(#cbc-rm)" opacity={dim}>
          {RINGS.map((ring, i) => {
            const labelPos = ring.label ? ringLabelPos(ring) : null;
            return (
              <G key={`ring${i}`}>
                <Circle
                  cx={ring.cx} cy={ring.cy} r={ring.r}
                  fill="none"
                  stroke="#e4cfb9"
                  strokeOpacity={ring.strokeOpacity}
                  strokeWidth={ring.strokeWidth}
                  strokeDasharray={ring.dashed ? '3 7' : undefined}
                />
                {labelPos && (
                  <>
                    <Line
                      x1={ring.cx} y1={ring.cy} x2={labelPos.x} y2={labelPos.y}
                      stroke="#e4cfb9" strokeOpacity={ring.strokeOpacity * 0.9} strokeWidth={0.5}
                    />
                    <SvgText
                      x={labelPos.x + (labelPos.x >= ring.cx ? 6 : -6)}
                      y={labelPos.y + 3}
                      fontSize={13}
                      fontWeight="300"
                      textAnchor={labelPos.x >= ring.cx ? 'start' : 'end'}
                      fill="#dfc3a5"
                      opacity={0.6}
                    >
                      {ring.label}
                    </SvgText>
                  </>
                )}
              </G>
            );
          })}
          {/* faint thin wordmark, echoing the app's own name at low opacity */}
          <SvgText x={GW / 2} y={GH * 0.86} fontSize={120} fontWeight="200" fill="#e4cfb9" opacity={0.035} textAnchor="middle">
            cerbyl
          </SvgText>
        </G>
      </Svg>

      {/* grain */}
      <Canvas ref={canvasRef} style={StyleSheet.absoluteFill}>
        {canvasSize.width > 0 && canvasSize.height > 0 && (
          <>
            <Fill>
              <SkLinearGradient
                start={vec(canvasSize.width * 0.5, 0)}
                end={vec(canvasSize.width * 0.5, canvasSize.height)}
                colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]}
                positions={[0, 0.55, 1]}
              />
            </Fill>
            <Fill blendMode="overlay" opacity={0.4 * dim}>
              <GrainNoise baseFrequency={0.68} seed={5} />
            </Fill>
          </>
        )}
      </Canvas>

      {/* vignette */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="cbc-vig-top" cx="50%" cy="0%" r="60%">
            <Stop offset="0" stopColor={ACCENT} stopOpacity={0.1 * dim} />
            <Stop offset="1" stopColor={ACCENT} stopOpacity={0} />
          </RadialGradient>
          <SvgLinearGradient id="cbc-vig-edge" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity={0.3 * dim} />
            <Stop offset="0.25" stopColor="#000000" stopOpacity={0} />
            <Stop offset="0.75" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.5 * dim} />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#cbc-vig-edge)" />
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#cbc-vig-top)" />
      </Svg>
    </View>
  );
}
