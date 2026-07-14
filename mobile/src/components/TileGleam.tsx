import { useRef, useState } from 'react';
import { TouchableOpacity, TouchableOpacityProps, View, StyleSheet, Animated, Easing, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { HapticVariant, triggerHaptic } from '../utils/haptics';
import { cbTileShadowExact, cbTileBorder } from './NeumorphicTexture';

const ACCENT = '#D8B38D';
const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// Literal .cb-tile:hover box-shadow (Home.css:338-341) — same three layers as the
// resting state, deeper cast + a visible gold inset ring (0.055 -> 0.32 opacity).
function cbTileShadowHoverExact(): ViewStyle['boxShadow'] {
  return [
    { offsetX: 18, offsetY: 18, blurRadius: 38, color: 'rgba(0, 0, 0, 0.62)' },
    { offsetX: -10, offsetY: -10, blurRadius: 26, color: 'rgba(255, 255, 255, 0.03)' },
    { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: 'rgba(216, 179, 141, 0.32)', inset: true },
  ];
}

type Props = TouchableOpacityProps & {
  borderRadius?: number;
  haptic?: HapticVariant;
};

/**
 * Ported from .cb-tile:not(.cb-tile-mark):hover (Home.css:303-345): the top
 * gradient bar scales in, a gold inset border ring fades in, the card lifts
 * translateY(-8px), and the box-shadow deepens with a visible gold ring.
 * The website triggers this on mouse :hover; touch devices have no hover
 * state, so this fires on press instead (onPressIn/onPressOut) — same gleam,
 * touch-driven. The CSS spotlight also tracks mouse position via --mx/--my;
 * that has no touch equivalent (no persistent pointer position), so this
 * uses a uniform border reveal instead of a position-tracked spotlight.
 */
export default function TileGleam({
  borderRadius = 28,
  haptic = 'selection',
  style,
  onPressIn,
  onPressOut,
  disabled,
  children,
  ...props
}: Props) {
  const [pressed, setPressed] = useState(false);
  const glow = useRef(new Animated.Value(0)).current;

  const animateTo = (toValue: number) => {
    Animated.timing(glow, {
      toValue,
      duration: toValue ? 200 : 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  return (
    <AnimatedTouchable
      {...props}
      disabled={disabled}
      activeOpacity={props.activeOpacity ?? 1}
      accessibilityRole={props.accessibilityRole ?? 'button'}
      onPressIn={(e) => {
        if (!disabled) {
          if (haptic !== 'none') triggerHaptic(haptic);
          setPressed(true);
          animateTo(1);
        }
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        animateTo(0);
        onPressOut?.(e);
      }}
      style={[
        style,
        {
          borderRadius,
          overflow: 'hidden',
          boxShadow: pressed ? cbTileShadowHoverExact() : cbTileShadowExact(),
          transform: [{ translateY: glow.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
          ...cbTileBorder(pressed ? 0.4 : 0.22),
        } as ViewStyle,
      ]}
    >
      {children}

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            transform: [{ scaleX: glow }],
          }}
        >
          <LinearGradient
            colors={['transparent', ACCENT, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius,
              borderWidth: 1.5,
              borderColor: ACCENT,
              opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }),
            },
          ]}
        />
      </View>
    </AnimatedTouchable>
  );
}
