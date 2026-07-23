import NeumorphicTexture, { cbTileCardGradient } from './NeumorphicTexture';

export const SOCIAL_CARD_TOP = '#0b0c0f';
export const SOCIAL_CARD_BOTTOM = '#050506';
export const SOCIAL_CARD_ACCENT = '#D8B38D';
export const SOCIAL_CARD_EDGE = 'rgba(216,179,141,0.22)';

export default function SocialTileMaterial() {
  return (
    <NeumorphicTexture
      grainVariant="skia"
      grainOpacity={0.44}
      baseFrequency={0.7}
      gradientColors={cbTileCardGradient.colors}
      gradientStart={cbTileCardGradient.start}
      gradientEnd={cbTileCardGradient.end}
    />
  );
}
