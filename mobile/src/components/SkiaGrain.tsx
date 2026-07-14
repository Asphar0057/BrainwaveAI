import { FractalNoise, ColorMatrix } from '@shopify/react-native-skia';

// Exact port of the W3C Filter Effects spec's feColorMatrix type="saturate"
// matrix at values="0" (used by every .cb-bg-grain / .cb-tile-texture::after
// noise on the website): reduces every pixel to Rec.601 luma, alpha untouched.
export const GRAIN_GRAYSCALE_MATRIX = [
  0.213, 0.715, 0.072, 0, 0,
  0.213, 0.715, 0.072, 0, 0,
  0.213, 0.715, 0.072, 0, 0,
  0, 0, 0, 1, 0,
];

/**
 * Real Perlin fractal noise, the same primitive family as SVG's
 * feTurbulence type="fractalNoise" — Skia's SkPerlinNoiseShader was built to
 * mirror that filter 1:1 (MakeFractalNoise vs MakeTurbulence corresponds
 * exactly to fractalNoise vs turbulence in the SVG spec). This is genuine
 * per-pixel procedural noise, not a dot-scatter approximation.
 * Must be used as a child of a Skia <Fill>/<Rect> alongside a base gradient
 * fill painted earlier in the SAME <Canvas> — blendMode="overlay" blends
 * against whatever this canvas has already painted, not against RN views
 * outside the canvas, so there must be real destination pixels underneath.
 */
export function GrainNoise({ baseFrequency, seed = 2 }: { baseFrequency: number; seed?: number }) {
  return (
    <>
      <FractalNoise freqX={baseFrequency} freqY={baseFrequency} octaves={3} seed={seed} />
      <ColorMatrix matrix={GRAIN_GRAYSCALE_MATRIX} />
    </>
  );
}
