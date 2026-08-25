import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import HapticTouchable from './HapticTouchable';
import { cbTileBorder, cbTileShadow } from './NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

export type SidebarItem = {
  key: string;
  label: string;
  /** No longer rendered (the design leans on Swiss numerals instead of
   * icon glyphs), kept optional so existing call sites don't need to change. */
  icon?: string;
  iconOutline?: string;
  badge?: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  pageTitle: string;
  kicker?: string;
  items: SidebarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
  footerLabel?: string;
  onFooterPress?: () => void;
};

// One shared, premium sidebar for every "hub" page (Quiz Hub, Solo Quiz,
// Battles, Friends, Flashcards) -- previously each screen hand-rolled its
// own near-identical copy, and every one of them layered NeumorphicLayer
// (a *tile* texture with its own hardcoded near-black gradient, meant for
// small cards) directly on top of the panel's own theme-colored gradient.
// Two unrelated gradient systems fighting over the same rectangle is what
// read as "the gradient isn't applying" -- there was never one gradient to
// begin with. This owns a single cohesive background and its own open/close
// animation, so callers just flip a boolean.
export default function SectionSidebar({
  visible, onClose, pageTitle, kicker = 'MENU', items, activeKey, onSelect, footerLabel, onFooterPress,
}: Props) {
  const { selectedTheme: theme } = useAppTheme();
  const layout = useResponsiveLayout();
  const sidebarWidth = Math.min(layout.width * (layout.isLandscape ? 0.42 : 0.8), 340);
  const slideAnim = useRef(new Animated.Value(-sidebarWidth)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 100, friction: 15 }).start();
    } else if (mounted) {
      Animated.timing(slideAnim, { toValue: -sidebarWidth, duration: 220, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]);

  if (!mounted) return null;

  const GOLD = theme.accent;
  const GOLD_L = theme.accentHover;
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  const DIM = theme.textSecondary;
  const s = styles(theme);

  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <View style={s.overlay}>
        <HapticTouchable style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} haptic="none" />

        {/* The transform lives on this outer wrapper only -- the gradient
            and content sit in a plain, untransformed inner view, so there's
            no interaction between the slide animation and how the native
            gradient shader computes its own bounds. */}
        <Animated.View style={[s.panelOuter, { width: sidebarWidth, transform: [{ translateX: slideAnim }] }]}>
          <View style={s.panelInner}>
            <LinearGradient
              colors={[darkenColor(theme.bgTop, theme.isLight ? 6 : 0), theme.panelAlt, theme.bgBottom]}
              start={{ x: 0.1, y: 0 }} end={{ x: 0.95, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Warm radial wash + concentric-ring accent, top-right -- same
                geometric language as CircleBackground, layered for more
                depth than a single flat gradient. */}
            <Svg width={sidebarWidth} height={280} style={StyleSheet.absoluteFill} pointerEvents="none">
              <Defs>
                <RadialGradient id="sb-wash" cx="82%" cy="18%" r="60%">
                  <Stop offset="0" stopColor={GOLD} stopOpacity={0.16} />
                  <Stop offset="1" stopColor={GOLD} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Rect x={0} y={0} width={sidebarWidth} height={280} fill="url(#sb-wash)" />
              <Circle cx={sidebarWidth - 30} cy={70} r={110} stroke={GOLD_L} strokeOpacity={0.1} strokeWidth={0.8} fill="none" />
              <Circle cx={sidebarWidth - 30} cy={70} r={66} stroke={GOLD_L} strokeOpacity={0.14} strokeWidth={0.8} fill="none" />
              <Circle cx={sidebarWidth - 30} cy={70} r={26} stroke={GOLD_L} strokeOpacity={0.18} strokeWidth={1} fill="none" />
              <Line x1={sidebarWidth - 30} y1={70} x2={sidebarWidth + 20} y2={70} stroke={GOLD_L} strokeOpacity={0.16} strokeWidth={0.6} />
            </Svg>
            {/* Top vignette for depth. */}
            <LinearGradient
              colors={['rgba(0,0,0,0.32)', 'rgba(0,0,0,0)']}
              style={[StyleSheet.absoluteFill, { height: 140 }]}
            />

            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
              <View style={s.headerBlock}>
                <Text style={s.kicker}>{kicker}</Text>
                <Text style={s.pageTitle}>{pageTitle}</Text>
              </View>

              <View style={s.menu}>
                {items.map((item, idx) => {
                  const active = item.key === activeKey;
                  const num = String(idx + 1).padStart(2, '0');
                  return active ? (
                    <LinearGradient
                      key={item.key}
                      colors={[GOLD_L, GOLD]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.3 }}
                      style={s.rowActive}
                    >
                      <View style={s.numChipActive}>
                        <Text style={s.numActive}>{num}</Text>
                      </View>
                      <Text style={s.labelActive} numberOfLines={1}>{item.label}</Text>
                      <View style={s.activeDot} />
                    </LinearGradient>
                  ) : (
                    <HapticTouchable
                      key={item.key}
                      style={s.row}
                      onPress={() => { onClose(); onSelect(item.key); }}
                      haptic="selection"
                      activeOpacity={0.7}
                    >
                      <Text style={s.num}>{num}</Text>
                      <Text style={s.label} numberOfLines={1}>{item.label}</Text>
                      {!!item.badge && (
                        <View style={s.badge}><Text style={s.badgeText}>{item.badge}</Text></View>
                      )}
                      <Ionicons name="chevron-forward" size={14} color={DIM} />
                    </HapticTouchable>
                  );
                })}
              </View>

              {!!footerLabel && !!onFooterPress && (
                <View style={s.footerWrap}>
                  <View style={s.footerRule} />
                  <HapticTouchable style={s.footerRow} onPress={() => { onClose(); onFooterPress(); }} haptic="selection" activeOpacity={0.7}>
                    <Text style={s.footerLabel}>{footerLabel}</Text>
                    <Ionicons name="chevron-forward" size={13} color={DIM} />
                  </HapticTouchable>
                </View>
              )}

              <Text style={s.watermark}>cerbyl</Text>
            </SafeAreaView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function styles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const GOLD = theme.accent;
  const GOLD_L = theme.accentHover;
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  const DIM = theme.textSecondary;
  return StyleSheet.create({
    overlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.55)' },
    panelOuter: {
      height: '100%',
      // Cast shadow along the leading edge, so the panel visibly lifts off
      // the dimmed page behind it instead of looking pasted flat on top.
      boxShadow: [{ offsetX: 10, offsetY: 0, blurRadius: 30, color: 'rgba(0,0,0,0.45)' }],
    } as ViewStyle,
    panelInner: { flex: 1, overflow: 'hidden' },

    headerBlock: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 20 },
    kicker: { fontFamily: 'Inter_700Bold', fontSize: 9, color: rgbaFromHex(GOLD_L, 0.6), letterSpacing: 3.5, textTransform: 'uppercase' },
    pageTitle: { fontFamily: 'Inter_900Black', fontSize: 30, color: GOLD_L, letterSpacing: -1, marginTop: 6 },

    menu: { paddingHorizontal: 14, gap: 9 },
    // Each row is its own floating tile -- same cbTileShadow/cbTileBorder
    // material as every other card in the app (dual dark/light cast shadow
    // + a thin gold edge ring) -- instead of an edge-to-edge flat groove.
    // That flat full-bleed strip with no fill contrast is what read as
    // "blocky": no card silhouette, so there was nothing to look raised.
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingHorizontal: 18, paddingVertical: 15,
      borderRadius: 17,
      backgroundColor: rgbaFromHex(theme.panel, theme.isLight ? 0.9 : 0.85),
      boxShadow: cbTileShadow(0.08),
      ...cbTileBorder(0.12),
    } as ViewStyle,
    num: { fontFamily: 'Inter_700Bold', fontSize: 12, color: rgbaFromHex(GOLD_L, 0.32), letterSpacing: 0.5, width: 20 },
    label: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14.5, color: rgbaFromHex(GOLD_L, 0.78) },

    // Active row: same floating-tile footprint as the rest, filled gold and
    // lifted with a real cast shadow + a warm inset top highlight so it
    // reads as raised/embossed rather than a flat pasted-on block.
    rowActive: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingHorizontal: 18, paddingVertical: 15,
      borderRadius: 17,
      boxShadow: [
        { offsetX: 6, offsetY: 8, blurRadius: 18, color: 'rgba(0,0,0,0.4)' },
        { offsetX: -3, offsetY: -3, blurRadius: 10, color: 'rgba(255,255,255,0.05)' },
        { offsetX: 0, offsetY: 1, blurRadius: 0, color: 'rgba(255,255,255,0.24)', inset: true },
      ],
    } as ViewStyle,
    numChipActive: {
      width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
      backgroundColor: rgbaFromHex(INK, 0.16),
    },
    numActive: { fontFamily: 'Inter_900Black', fontSize: 11, color: INK, letterSpacing: 0.5 },
    labelActive: { flex: 1, fontFamily: 'Inter_900Black', fontSize: 14.5, color: INK, letterSpacing: -0.2 },
    activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: INK },

    badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },
    badgeText: { fontFamily: 'Inter_900Black', fontSize: 9, color: INK },

    footerWrap: { marginTop: 'auto', paddingBottom: 4 },
    footerRule: { height: 1, backgroundColor: rgbaFromHex(GOLD_L, 0.12), marginHorizontal: 22, marginBottom: 4 },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingVertical: 14 },
    footerLabel: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: DIM },

    watermark: {
      position: 'absolute', bottom: -14, left: 14,
      fontFamily: 'Inter_900Black', fontSize: 52, letterSpacing: -2,
      color: rgbaFromHex(GOLD_L, 0.05),
    },
  });
}
