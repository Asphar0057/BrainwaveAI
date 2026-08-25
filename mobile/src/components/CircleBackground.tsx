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

// fx/fy/fr are fractions of the *live* screen width/height/height, not
// pixels in some fixed canvas -- see FractionalRing below for why.
type FractionalRing = {
  fx: number; fy: number; fr: number;
  strokeOpacity: number; strokeWidth: number; dashed?: boolean;
  label?: string; labelAngleDeg?: number;
};

// A scattered "orbit constellation" instead of a straight-line grid — thin
// circle outlines at varied radii, a couple with a radius tick + small
// numeral label like a blueprint annotation, matching the app's existing
// Swiss-numbered design language (Home.css "01 TEAM" tiles etc.) but in a
// circular idiom instead of a rectilinear one.
//
// Positions are fractions of the screen (0..1), not a fixed 1600x1000
// landscape canvas -- an earlier version used a hardcoded landscape canvas
// with preserveAspectRatio="slice", which on a real portrait phone
// (~0.45 width/height) only shows the narrow vertical strip roughly
// x in [575,1025] of that 1600-wide canvas. Half the rings (the four
// labeled "hero" ones, positioned near the canvas corners) sat entirely
// outside that visible strip and never rendered. Building the layout from
// the actual window dimensions instead removes that whole class of bug.
const FRACTIONAL_RINGS: FractionalRing[] = [
  { fx: 0.16, fy: 0.14, fr: 0.1,   strokeOpacity: 0.16, strokeWidth: 0.7, label: '01', labelAngleDeg: -35 },
  { fx: 0.84, fy: 0.11, fr: 0.065, strokeOpacity: 0.14, strokeWidth: 0.6, label: '02', labelAngleDeg: 40 },
  { fx: 0.5,  fy: 0.5,  fr: 0.19,  strokeOpacity: 0.1,  strokeWidth: 0.6, dashed: true },
  { fx: 0.14, fy: 0.82, fr: 0.08,  strokeOpacity: 0.15, strokeWidth: 0.7, label: '03', labelAngleDeg: -60 },
  { fx: 0.85, fy: 0.84, fr: 0.12,  strokeOpacity: 0.13, strokeWidth: 0.6, label: '04', labelAngleDeg: 20 },
  { fx: 0.62, fy: 0.22, fr: 0.04,  strokeOpacity: 0.18, strokeWidth: 0.8 },
  { fx: 0.28, fy: 0.32, fr: 0.023, strokeOpacity: 0.22, strokeWidth: 1 },
  { fx: 0.7,  fy: 0.62, fr: 0.015, strokeOpacity: 0.24, strokeWidth: 1 },
  // Center-weighted cluster -- the mask peaks around the middle of the
  // screen, which previously had the fewest rings in it.
  { fx: 0.48, fy: 0.44, fr: 0.032, strokeOpacity: 0.18, strokeWidth: 0.7, label: '05', labelAngleDeg: 200 },
  { fx: 0.56, fy: 0.48, fr: 0.095, strokeOpacity: 0.08, strokeWidth: 0.6, dashed: true },
  { fx: 0.52, fy: 0.34, fr: 0.011, strokeOpacity: 0.24, strokeWidth: 1 },
  { fx: 0.42, fy: 0.47, fr: 0.006, strokeOpacity: 0.3,  strokeWidth: 1.2 },
  { fx: 0.6,  fy: 0.34, fr: 0.019, strokeOpacity: 0.2,  strokeWidth: 0.8 },
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

  const GW = W;
  const GH = H;
  const RINGS: RingSpec[] = useMemo(() => FRACTIONAL_RINGS.map((fr) => ({
    cx: fr.fx * GW, cy: fr.fy * GH, r: fr.fr * GH,
    strokeOpacity: fr.strokeOpacity, strokeWidth: fr.strokeWidth,
    dashed: fr.dashed, label: fr.label, labelAngleDeg: fr.labelAngleDeg,
  })), [GW, GH]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* base surface + grain — drawn first since this Canvas repaints an
          opaque copy of the page gradient internally (Skia can't blend
          against sibling views beneath it) and would otherwise paint over
          every layer below it if placed later in the stack. */}
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
