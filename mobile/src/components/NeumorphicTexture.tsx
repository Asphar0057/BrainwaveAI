import { useMemo } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Pattern, Line, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';

// Warm bronze-to-espresso card material — the same family as the page gradient in
// utils/theme.ts, so tiles read as material *extruded from the background* (the
// premise neumorphism depends on) instead of a neutral gray-black slab dropped on top.
export const CB_CARD_TOP = '#241a10';
export const CB_CARD_BOTTOM = '#0c0904';
export const CB_ACCENT = '#D7B38C';
// Cast shadow: warm near-black, not pure rgba(0,0,0) — keeps the whole material family warm.
export const CB_SHADOW_LO = 'rgba(8, 5, 2, 0.66)';
// Highlight: warm cream catching light, not flat white — this is what actually sells
// the bevel. The old 3% white was invisible; this is the fix for "doesn't look neumorphic".
export const CB_SHADOW_HI = 'rgba(255, 227, 189, 0.09)';
// Crisp 1px light line along the top edge, like a bevel catching a light source from above.
const CB_BEVEL_EDGE = 'rgba(255, 232, 199, 0.14)';

export const cbCardGradient = {
  colors: [CB_CARD_TOP, CB_CARD_BOTTOM] as [string, string],
  start: { x: 0.15, y: 0 },
  end: { x: 0.82, y: 1 },
};

// Dual cast shadow (dark lower-right / warm highlight upper-left) plus a crisp inset
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

export function NeumorphicLayer({ grainOpacity = 0.22 }: { grainOpacity?: number }) {
  return (
    <>
      <LinearGradient colors={cbCardGradient.colors} start={cbCardGradient.start} end={cbCardGradient.end} style={StyleSheet.absoluteFillObject} />
      <NeumorphicTexture grainOpacity={grainOpacity} />
    </>
  );
}

let instanceSeed = 0;

/**
 * Ported from .cb-tile-texture::before (diagonal hatch + corner glow, exact gradients)
 * and .cb-tile-texture::after (feTurbulence grain, mix-blend-mode: overlay).
 * The hatch/glow layer is pixel-exact (SVG pattern + radial gradient).
 * The grain layer is a lightweight dot-scatter stand-in for feTurbulence — a live
 * fractal-noise filter per card instance is too heavy to run across every tile on screen.
 */
export default function NeumorphicTexture({ grainOpacity = 0.24 }: { grainOpacity?: number }) {
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

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
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
      <View style={[StyleSheet.absoluteFill, { opacity: grainOpacity, mixBlendMode: 'overlay' } as ViewStyle]}>
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          {grainDots.map((d, i) => (
            <Circle key={i} cx={`${d.x}%`} cy={`${d.y}%`} r={d.r} fill={d.dark ? '#000000' : '#ffffff'} />
          ))}
        </Svg>
      </View>
    </View>
  );
}
