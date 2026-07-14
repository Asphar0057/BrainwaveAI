import { useEffect, useMemo, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, useWindowDimensions, ViewStyle } from 'react-native';
import Svg, { Circle, Line, Text as SvgText, Rect, G, Mask, RadialGradient, LinearGradient as SvgLinearGradient, Stop, Defs } from 'react-native-svg';
import { Canvas, Fill, LinearGradient as SkLinearGradient, useCanvasSize, vec } from '@shopify/react-native-skia';
import { GrainNoise } from './SkiaGrain';
import { useAppTheme } from '../contexts/ThemeContext';

const ACCENT = '#D8B38D';
const AnimatedView = Animated.createAnimatedComponent(View);

// .cb-root's --cb-bg is dark-only; the CSS has no light-mode variant. Dim the
// literal opacities on light theme rather than inventing a second palette.
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

/**
 * Literal port of the website's page background, .cb-bg-fx / .cb-root (Home.css:42-119):
 * wash -> orb-1 -> orb-2 -> geometric grid -> grain -> vignette, same stacking order,
 * same positions/opacities/animation timings (22s / 26s alternate drift) as the CSS.
 * Grain uses the same dense light-biased dot technique as NeumorphicTexture's 'fine'
 * variant, not a literal feTurbulence filter — see that file for why.
 */
export default function GeoBackground() {
  const { width: W, height: H } = useWindowDimensions();
  const { selectedTheme } = useAppTheme();
  const dim = selectedTheme.isLight ? 0.55 : 1;
  const { ref: canvasRef, size: canvasSize } = useCanvasSize();

  const drift1 = useOrbDrift(22000, false);
  const drift2 = useOrbDrift(26000, true);

  const orb1Style: ViewStyle = {
    position: 'absolute',
    top: -200,
    left: -180,
    width: 640,
    height: 640,
    opacity: 0.65 * dim,
    transform: [
      { translateX: drift1.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
      { translateY: drift1.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
      { scale: drift1.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
    ] as any,
  };
  const orb2Style: ViewStyle = {
    position: 'absolute',
    bottom: -170,
    right: -150,
    width: 520,
    height: 520,
    opacity: 0.5 * dim,
    transform: [
      { translateX: drift2.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) },
      { translateY: drift2.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) },
      { scale: drift2.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
    ] as any,
  };

  const GW = 1600;
  const GH = 1000;
  const STEP = 80;
  const gridLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (let x = 0; x <= GW; x += STEP) lines.push({ x1: x, y1: 0, x2: x, y2: GH });
    for (let y = 0; y <= GH; y += STEP) lines.push({ x1: 0, y1: y, x2: GW, y2: y });
    return lines;
  }, []);
  const gridNums = useMemo(() => {
    const nums: { x: number; y: number; label: string }[] = [];
    let n = 1;
    for (let r = 0; r <= GH; r += STEP * 3) {
      for (let c = 0; c <= GW; c += STEP * 3) {
        nums.push({ x: c + 3, y: r + 11, label: String((n++ % 99) + 1).padStart(2, '0') });
      }
    }
    return nums;
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* .cb-bg-wash */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="cb-wash" cx="50%" cy="30%" r="62%">
            <Stop offset="0" stopColor={ACCENT} stopOpacity={0.14 * dim} />
            <Stop offset="1" stopColor={ACCENT} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#cb-wash)" />
      </Svg>

      {/* .cb-bg-orb-1 */}
      <AnimatedView style={orb1Style}>
        <Svg width={640} height={640}>
          <Defs>
            <RadialGradient id="cb-orb1" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={ACCENT} stopOpacity={0.46} />
              <Stop offset="0.7" stopColor={ACCENT} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={320} cy={320} r={320} fill="url(#cb-orb1)" />
        </Svg>
      </AnimatedView>

      {/* .cb-bg-orb-2 */}
      <AnimatedView style={orb2Style}>
        <Svg width={520} height={520}>
          <Defs>
            <RadialGradient id="cb-orb2" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={ACCENT} stopOpacity={0.46} />
              <Stop offset="0.7" stopColor={ACCENT} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={260} cy={260} r={260} fill="url(#cb-orb2)" />
        </Svg>
      </AnimatedView>

      {/* .cb-bg-geo (GeometricGrid) — line + number grid, masked to a soft center ellipse */}
      <Svg width="100%" height="100%" viewBox={`0 0 ${GW} ${GH}`} preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="cb-gridmask" cx="50%" cy="42%" r="65%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.9} />
            <Stop offset="0.5" stopColor="#ffffff" stopOpacity={0.5} />
            <Stop offset="0.85" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
          <Mask id="cb-gm">
            <Rect x={0} y={0} width={GW} height={GH} fill="url(#cb-gridmask)" />
          </Mask>
        </Defs>
        <G mask="url(#cb-gm)" opacity={0.11 * dim}>
          {gridLines.map((l, i) => (
            <Line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#e4cfb9" strokeWidth={0.5} />
          ))}
          {gridNums.map((n, i) => (
            <SvgText key={`n${i}`} x={n.x} y={n.y} fontSize={8} fontWeight="600" fill="#dfc3a5">{n.label}</SvgText>
          ))}
        </G>
      </Svg>

      {/* .cb-bg-grain — real Perlin fractal noise (Skia SkPerlinNoiseShader, the
          same primitive family as feTurbulence) blended with BlendMode.Overlay,
          which runs inside Skia's own compositor rather than the RN
          mixBlendMode style prop. The canvas repaints the page's own base
          gradient first so the overlay blend has real destination pixels to
          react against — a Skia canvas composites into the view tree as one
          flat texture, it can't blend against the sibling views beneath it.
          Opacity boosted above the literal 0.13 per explicit "more grain" ask. */}
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

      {/* .cb-bg-vignette */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="cb-vig-top" cx="50%" cy="0%" r="60%">
            <Stop offset="0" stopColor={ACCENT} stopOpacity={0.1 * dim} />
            <Stop offset="1" stopColor={ACCENT} stopOpacity={0} />
          </RadialGradient>
          <SvgLinearGradient id="cb-vig-edge" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity={0.3 * dim} />
            <Stop offset="0.25" stopColor="#000000" stopOpacity={0} />
            <Stop offset="0.75" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.5 * dim} />
          </SvgLinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#cb-vig-edge)" />
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#cb-vig-top)" />
      </Svg>
    </View>
  );
}
