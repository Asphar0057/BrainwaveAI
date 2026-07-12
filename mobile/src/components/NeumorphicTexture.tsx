import { useMemo } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Pattern, Line, RadialGradient, Stop, Rect, Circle } from 'react-native-svg';

// Ported verbatim from src/pages/Home.css (.cb-tile / .cb-tile-texture / .cb-modal) —
// the website landing page's neumorphic bento-tile recipe.
export const CB_CARD_TOP = '#0b0c0f';
export const CB_CARD_BOTTOM = '#050506';
export const CB_ACCENT = '#d8b38d';
export const CB_SHADOW_LO = 'rgba(0, 0, 0, 0.62)';
export const CB_SHADOW_HI = 'rgba(255, 255, 255, 0.03)';

export const cbCardGradient = {
  colors: [CB_CARD_TOP, CB_CARD_BOTTOM] as [string, string],
  start: { x: 0.15, y: 0 },
  end: { x: 0.82, y: 1 },
};

// .cb-tile box-shadow: 12px 12px 26px var(--cb-shadow-lo), -8px -8px 20px var(--cb-shadow-hi), inset 0 0 0 1px rgba(216,179,141, borderOpacity)
export function cbTileShadow(borderOpacity: number = 0.055): ViewStyle['boxShadow'] {
  return [
    { offsetX: 12, offsetY: 12, blurRadius: 26, color: CB_SHADOW_LO },
    { offsetX: -8, offsetY: -8, blurRadius: 20, color: CB_SHADOW_HI },
    { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: `rgba(216, 179, 141, ${borderOpacity})`, inset: true },
  ];
}

// .cb-tile:hover box-shadow (deeper cast + brighter inset ring)
export function cbTileShadowHover(borderOpacity: number = 0.32): ViewStyle['boxShadow'] {
  return [
    { offsetX: 18, offsetY: 18, blurRadius: 38, color: CB_SHADOW_LO },
    { offsetX: -10, offsetY: -10, blurRadius: 26, color: CB_SHADOW_HI },
    { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: `rgba(216, 179, 141, ${borderOpacity})`, inset: true },
  ];
}

// .cb-modal box-shadow (scaled up for large panels)
export function cbModalShadow(borderOpacity: number = 0.14): ViewStyle['boxShadow'] {
  return [
    { offsetX: 20, offsetY: 20, blurRadius: 50, color: 'rgba(0, 0, 0, 0.65)' },
    { offsetX: -12, offsetY: -12, blurRadius: 30, color: CB_SHADOW_HI },
    { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: `rgba(216, 179, 141, ${borderOpacity})`, inset: true },
  ];
}

export function NeumorphicLayer({ grainOpacity = 0.12 }: { grainOpacity?: number }) {
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
export default function NeumorphicTexture({ grainOpacity = 0.16 }: { grainOpacity?: number }) {
  const id = useMemo(() => `nt-${instanceSeed++}`, []);
  const grainDots = useMemo(
    () => Array.from({ length: 70 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      r: Math.random() < 0.35 ? 0.9 : 0.5,
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
            <Circle key={i} cx={`${d.x}%`} cy={`${d.y}%`} r={d.r} fill="#ffffff" />
          ))}
        </Svg>
      </View>
    </View>
  );
}
