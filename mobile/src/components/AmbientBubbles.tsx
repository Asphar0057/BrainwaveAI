import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { MobileTheme, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type BubbleVariant =
  | 'home'
  | 'social'
  | 'explore'
  | 'profile'
  | 'settings'
  | 'chat'
  | 'auth'
  | 'notes'
  | 'flashcards'
  | 'media'
  | 'friends'
  | 'leaderboard'
  | 'games'
  | 'playlists'
  | 'paths'
  | 'quiz';

type Props = {
  theme: MobileTheme;
  variant?: BubbleVariant;
  opacity?: number;
};

const WATERMARKS: Record<BubbleVariant, string> = {
  home: 'CERBYL',
  social: 'SOCIAL',
  explore: 'EXPLORE',
  profile: 'PROFILE',
  settings: 'SETTINGS',
  chat: 'AI',
  auth: 'CERBYL',
  notes: 'NOTES',
  flashcards: 'CARDS',
  media: 'MEDIA',
  friends: 'FRIENDS',
  leaderboard: 'RANK',
  games: 'GAMES',
  playlists: 'LISTS',
  paths: 'PATHS',
  quiz: 'QUIZ',
};

export default function AmbientBubbles({ theme, variant = 'home', opacity = 1 }: Props) {
  const { width, height } = useResponsiveLayout();
  const spacing = 32;
  const cols = Math.ceil(width / spacing) + 2;
  const rows = Math.ceil(height / spacing) + 2;
  const dots = Array.from({ length: cols * rows }, (_, index) => ({
    x: (index % cols) * spacing,
    y: Math.floor(index / cols) * spacing,
  }));
  const accent = theme.accent;
  const fadedAccent = rgbaFromHex(accent, theme.isLight ? 0.08 * opacity : 0.12 * opacity);
  const lineOpacity = theme.isLight ? 0.08 * opacity : 0.10 * opacity;
  const watermarkOpacity = theme.isLight ? 0.035 * opacity : 0.055 * opacity;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height} fill="transparent" />
        <G opacity={1}>
          {dots.map((dot) => (
            <Circle key={`${dot.x}-${dot.y}`} cx={dot.x} cy={dot.y} r={1} fill={fadedAccent} />
          ))}
        </G>
        <G opacity={lineOpacity}>
          <Line x1={width * 0.18} y1={0} x2={width * 0.52} y2={height} stroke={accent} strokeWidth={0.45} strokeDasharray="4 14" />
          <Line x1={width * 0.82} y1={0} x2={width * 0.48} y2={height} stroke={accent} strokeWidth={0.35} strokeDasharray="3 16" />
          <Line x1={0} y1={height * 0.28} x2={width} y2={height * 0.28} stroke={accent} strokeWidth={0.35} strokeDasharray="3 16" />
          <Line x1={0} y1={height * 0.72} x2={width} y2={height * 0.72} stroke={accent} strokeWidth={0.35} strokeDasharray="3 16" />
        </G>
        <G opacity={watermarkOpacity}>
          <SvgText
            x={-width * 0.12}
            y={height * 0.58}
            fill={accent}
            fontSize={Math.max(76, width * 0.25)}
            fontWeight="900"
            fontFamily="Inter"
            transform={`rotate(-90 ${width * 0.05} ${height * 0.5})`}
          >
            {WATERMARKS[variant]}
          </SvgText>
        </G>
      </Svg>
    </View>
  );
}
