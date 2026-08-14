import { useMemo } from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Pattern, Line, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';
import { Canvas, Fill, LinearGradient as SkLinearGradient, useCanvasSize, vec } from '@shopify/react-native-skia';
import { GrainNoise } from './SkiaGrain';

// Black + #d8b38d only, everywhere — no bronze/warm family. Literal .cb-tile
// color from the website (Home.css:289, --cb-card #0b0c0f -> #050506).
// cbCardGradient and cbTileCardGradient both point at this same black material
// now; kept as two exported names only so existing call sites don't need to
// change, not because they differ.
export const CB_CARD_TOP = '#0b0c0f';
export const CB_CARD_BOTTOM = '#050506';
// Literal --cb-accent from Home.css:14 (was off by one hex digit: D7 -> D8, 8C -> 8D).
export const CB_ACCENT = '#D8B38D';
// Cast shadow, literal .cb-tile box-shadow tones (Home.css:296-299).
export const CB_SHADOW_LO = 'rgba(0, 0, 0, 0.62)';
export const CB_SHADOW_HI = 'rgba(255, 255, 255, 0.03)';
// Crisp 1px light line along the top edge, like a bevel catching a light source from above.
const CB_BEVEL_EDGE = 'rgba(216, 179, 141, 0.14)';

// Same 155deg direction vector as the CSS (sin155, -cos155 projected onto a unit box).
export const cbCardGradient = {
  colors: [CB_CARD_TOP, CB_CARD_BOTTOM] as [string, string],
  start: { x: 0.2887, y: 0.0468 },
  end: { x: 0.7113, y: 0.9532 },
};

export const CB_TILE_TOP = CB_CARD_TOP;
export const CB_TILE_BOTTOM = CB_CARD_BOTTOM;
export const cbTileCardGradient = cbCardGradient;

// Guaranteed-to-render edge: borderWidth/borderColor don't depend on boxShadow
// support at all, unlike the diffuse blurred shadow below. This is the primary
// thing that makes a card's silhouette actually read against the page.
export function cbTileBorder(opacity: number = 0.22): ViewStyle {
  return { borderWidth: 1, borderColor: `rgba(216, 179, 141, ${opacity})` };
}

// Dual cast shadow (dark lower-right / faint highlight upper-left) plus a crisp inset
// bevel line and a soft gold edge ring — this is the full recipe for a tile that reads
// as pressed from the same material as the page, lit from one consistent direction.
export function cbTileShadow(borderOpacity: number = 0.10): ViewStyle['boxShadow'] {
  return [
    { offsetX: 10, offsetY: 14, blurRadius: 28, color: CB_SHADOW_LO },
    { offsetX: -7, offsetY: -9, blurRadius: 22, color: CB_SHADOW_HI },
    { offsetX: 0, offsetY: 1, blurRadius: 0, spreadDistance: 0, color: CB_BEVEL_EDGE, inset: true },
    { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: `rgba(216, 179, 141, ${borderOpacity})`, inset: true },
  ];
}

// .cb-tile:hover box-shadow (deeper cast + brighter inset ring)
export function cbTileShadowHover(borderOpacity: number = 0.34): ViewStyle['boxShadow'] {
  return [
    { offsetX: 15, offsetY: 20, blurRadius: 40, color: CB_SHADOW_LO },
    { offsetX: -9, offsetY: -11, blurRadius: 28, color: CB_SHADOW_HI },
    { offsetX: 0, offsetY: 1, blurRadius: 0, spreadDistance: 0, color: CB_BEVEL_EDGE, inset: true },
    { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: `rgba(216, 179, 141, ${borderOpacity})`, inset: true },
  ];
}

// .cb-modal box-shadow (scaled up for large panels)
export function cbModalShadow(borderOpacity: number = 0.16): ViewStyle['boxShadow'] {
  return [
    { offsetX: 18, offsetY: 24, blurRadius: 54, color: 'rgba(6, 4, 2, 0.68)' },
    { offsetX: -11, offsetY: -14, blurRadius: 32, color: CB_SHADOW_HI },
    { offsetX: 0, offsetY: 1, blurRadius: 0, spreadDistance: 0, color: CB_BEVEL_EDGE, inset: true },
    { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: `rgba(216, 179, 141, ${borderOpacity})`, inset: true },
  ];
}

// Based on the non-hover .cb-tile box-shadow (Home.css:296-299) — cast shadow
// offsets/blur are literal, but the inset gold ring opacity is bumped 0.055 -> 0.16.
// At 0.055 the ring was essentially invisible on a phone screen (that value reads
// fine on the website against a bright monitor in a lit room; it does not survive
// down to a small OLED panel), which was the other half of "neumorphism isn't
// showing at all" — pair this with cbTileBorder() for a guaranteed-visible edge.
export function cbTileShadowExact(): ViewStyle['boxShadow'] {
  return [
    { offsetX: 12, offsetY: 12, blurRadius: 26, color: 'rgba(0, 0, 0, 0.62)' },
    { offsetX: -8, offsetY: -8, blurRadius: 20, color: 'rgba(255, 255, 255, 0.03)' },
    { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: 'rgba(216, 179, 141, 0.16)', inset: true },
  ];
}

// Recessed/"pressed-in" counterpart to cbTileShadow — for surfaces that sit
// below the panel material (text inputs, the tab-switcher track, nested
// sub-panels) rather than above it (buttons, cards). Dark shadow inset from
// the top-left as if light from the same upper-left source is blocked by the
// surrounding rim, warm gold-tinted highlight inset bottom-right (a plain
// white highlight has ~zero contrast against a near-black brand surface —
// the highlight itself has to carry the brand's gold, not just the edge
// ring), plus the same thin gold edge ring used everywhere else.
export function cbInsetShadow(strength: number = 1): ViewStyle['boxShadow'] {
  return [
    { offsetX: 6, offsetY: 6, blurRadius: 14 * strength, color: 'rgba(0, 0, 0, 0.68)', inset: true },
    { offsetX: -6, offsetY: -6, blurRadius: 14 * strength, color: 'rgba(216, 179, 141, 0.16)', inset: true },
    { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: 'rgba(216, 179, 141, 0.24)', inset: true },
  ];
}

// Plain single dark drop shadow — no light-corner counter-shadow, no
// gold-tinted inset ring (a visible ring reads as a border/outline once
// it's actually rendering on a phone, not as shadow). This is the shared
// depth treatment for every cb-tile-styled surface app-wide — cards, panels,
// buttons, inputs — so they all read as one consistent material.
export function cbPlainCardShadow(): ViewStyle['boxShadow'] {
  return [{ offsetX: 10, offsetY: 10, blurRadius: 24, color: 'rgba(0, 0, 0, 0.55)' }];
}
export function cbPlainRaisedShadow(): ViewStyle['boxShadow'] {
  return [{ offsetX: 6, offsetY: 8, blurRadius: 16, color: 'rgba(0, 0, 0, 0.5)' }];
}
export function cbPlainPressedShadow(strength: number = 1): ViewStyle['boxShadow'] {
  return [{ offsetX: 4, offsetY: 4, blurRadius: 10 * strength, color: 'rgba(0, 0, 0, 0.55)', inset: true }];
}

export function NeumorphicLayer({ grainOpacity = 0.38 }: { grainOpacity?: number }) {
  return (
    <>
      <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
      <NeumorphicTexture grainOpacity={grainOpacity} />
    </>
  );
}

let instanceSeed = 0;

type NeumorphicTextureProps = {
  grainOpacity?: number;
  /**
   * 'dots': the original lightweight scatter — cheap enough to run across every
   * tile on screen at once (quick actions, timeline, totals, etc).
   * 'fine': denser, smaller, light-biased speckle. This is what CSS's
   * mix-blend-mode:overlay actually produces when you run feTurbulence noise
   * over a near-black card: overlay barely darkens already-dark pixels, so only
   * the *light* half of the noise reads as visible grain, dark half is
   * essentially invisible. Tried porting the literal feTurbulence SVG filter
   * first (baseFrequency/numOctaves/stitchTiles) — react-native-svg ships the
   * JS wrapper but filter-primitive support on native (Skia/Android canvas
   * backends) is unverified and a common failure mode for that filter is
   * silently degrading to a flat grey fill, which is exactly the "greyer"
   * symptom reported. This variant doesn't touch mixBlendMode or filters at
   * all — it composites normally, so it renders the same on every platform.
   * 'skia': the real thing. @shopify/react-native-skia (already a project
   * dependency) exposes SkPerlinNoiseShader (MakeFractalNoise), the same
   * primitive family SVG's feTurbulence is built on, plus real blend modes
   * (BlendMode.Overlay) that run inside Skia's own compositor — not the RN
   * `mixBlendMode` style prop, which is what was silently degrading to grey.
   * Requires gradientColors/gradientStart/gradientEnd: the base fill and the
   * grain must be painted in the same <Canvas> so the overlay blend has real
   * destination pixels to react against (a Skia canvas composites into the
   * RN view tree as one flat texture — it can't blend against sibling views
   * outside itself).
   */
  grainVariant?: 'dots' | 'fine' | 'skia';
  baseFrequency?: number;
  gradientColors?: string[];
  gradientStart?: { x: number; y: number };
  gradientEnd?: { x: number; y: number };
};

function SkiaTexture({
  grainOpacity,
  baseFrequency,
  gradientColors,
  gradientStart,
  gradientEnd,
}: Required<Pick<NeumorphicTextureProps, 'grainOpacity' | 'baseFrequency' | 'gradientColors' | 'gradientStart' | 'gradientEnd'>>) {
  const { ref: canvasRef, size: canvasSize } = useCanvasSize();
  return (
    <Canvas ref={canvasRef} style={StyleSheet.absoluteFill}>
      {canvasSize.width > 0 && canvasSize.height > 0 && (
        <>
          <Fill>
            <SkLinearGradient
              start={vec(canvasSize.width * gradientStart.x, canvasSize.height * gradientStart.y)}
              end={vec(canvasSize.width * gradientEnd.x, canvasSize.height * gradientEnd.y)}
              colors={gradientColors}
            />
          </Fill>
          <Fill blendMode="overlay" opacity={grainOpacity}>
            <GrainNoise baseFrequency={baseFrequency} />
          </Fill>
        </>
      )}
    </Canvas>
  );
}

/**
 * Ported from .cb-tile-texture::before (diagonal hatch + corner glow, exact gradients)
 * and .cb-tile-texture::after (feTurbulence grain, mix-blend-mode: overlay) — the
 * texture used by the website's generic bento tiles (Home.css:354-383), e.g. the
 * "01 TEAM" tile, the first tile in reading order on the Home grid.
 * The hatch/glow layer is pixel-exact (SVG pattern + radial gradient, same units as
 * the CSS: 23px/115deg and 27px/25deg repeating stripes, 88%/94% corner glow).
 */
export default function NeumorphicTexture({
  grainOpacity = 0.4,
  grainVariant = 'dots',
  baseFrequency = 0.7,
  gradientColors,
  gradientStart,
  gradientEnd,
}: NeumorphicTextureProps) {
  const id = useMemo(() => `nt-${instanceSeed++}`, []);
  const grainDots = useMemo(
    () => Array.from({ length: 220 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      r: Math.random() < 0.22 ? 1.0 : Math.random() < 0.6 ? 0.6 : 0.35,
      dark: Math.random() < 0.4,
    })),
    []
  );
  const fineGrainDots = useMemo(
    () => Array.from({ length: 900 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      r: 0.35 + Math.random() * 0.6,
      dark: Math.random() < 0.25,
      op: 0.3 + Math.random() * 0.6,
    })),
    []
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {grainVariant === 'skia' && gradientColors && gradientStart && gradientEnd && (
        Platform.OS === 'web'
          ? <LinearGradient colors={gradientColors as [string, string, ...string[]]} start={gradientStart} end={gradientEnd} style={StyleSheet.absoluteFill} />
          : <SkiaTexture grainOpacity={grainOpacity} baseFrequency={baseFrequency} gradientColors={gradientColors} gradientStart={gradientStart} gradientEnd={gradientEnd} />
      )}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`glow-${id}`} cx="88%" cy="94%" r="55%">
            <Stop offset="0" stopColor={CB_ACCENT} stopOpacity={0.18} />
            <Stop offset="1" stopColor={CB_ACCENT} stopOpacity={0} />
          </RadialGradient>
          <Pattern id={`hatch1-${id}`} patternUnits="userSpaceOnUse" width={23} height={23} patternTransform="rotate(115)">
            <Line x1={0} y1={0} x2={0} y2={23} stroke={CB_ACCENT} strokeOpacity={0.055} strokeWidth={1} />
          </Pattern>
          <Pattern id={`hatch2-${id}`} patternUnits="userSpaceOnUse" width={27} height={27} patternTransform="rotate(25)">
            <Line x1={0} y1={0} x2={0} y2={27} stroke={CB_ACCENT} strokeOpacity={0.035} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#glow-${id})`} />
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#hatch1-${id})`} />
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#hatch2-${id})`} />
      </Svg>

      {grainVariant === 'fine' && (
        <View style={[StyleSheet.absoluteFill, { opacity: grainOpacity } as ViewStyle]}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            {fineGrainDots.map((d, i) => (
              <Circle
                key={i}
                cx={`${d.x}%`}
                cy={`${d.y}%`}
                r={d.r}
                fill={d.dark ? '#000000' : '#fff3e4'}
                fillOpacity={d.dark ? d.op * 0.35 : d.op}
              />
            ))}
          </Svg>
        </View>
      )}
      {grainVariant === 'dots' && (
        <View style={[StyleSheet.absoluteFill, { opacity: grainOpacity, mixBlendMode: 'overlay' } as ViewStyle]}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            {grainDots.map((d, i) => (
              <Circle key={i} cx={`${d.x}%`} cy={`${d.y}%`} r={d.r} fill={d.dark ? '#000000' : '#ffffff'} />
            ))}
          </Svg>
        </View>
      )}
    </View>
  );
}
