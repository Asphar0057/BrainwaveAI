import { useEffect, useRef } from 'react';
import { Animated, Easing, View, ViewStyle } from 'react-native';
import { useAppTheme } from '../contexts/ThemeContext';

// Mobile port of the web app's LoadingSpinner.js: three squares scaling
// and fading in a staggered loop (pulseGrow keyframes: scale 1 -> 1.5,
// opacity 0.6 -> 1, back down), 1.4s per cycle, 0.2s stagger between them.
function useCubePulse(delayMs: number) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delayMs),
        Animated.timing(v, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [v, delayMs]);
  return v;
}

function Cube({ delayMs, color, cubeSize }: { delayMs: number; color: string; cubeSize: number }) {
  const v = useCubePulse(delayMs);
  const style: ViewStyle = {
    width: cubeSize, height: cubeSize, borderRadius: cubeSize * 0.25, backgroundColor: color,
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
  };
  return <Animated.View style={style} />;
}

// Base cube was 24px/16px gap; knocked down ~30% per request (17/11).
export default function PulsingSquares({ size = 'default' }: { size?: 'default' | 'small' }) {
  const { selectedTheme } = useAppTheme();
  const color = selectedTheme.accent;
  const cubeSize = size === 'small' ? 12 : 17;
  const gap = size === 'small' ? 8 : 11;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap }}>
      <Cube delayMs={0} color={color} cubeSize={cubeSize} />
      <Cube delayMs={200} color={color} cubeSize={cubeSize} />
      <Cube delayMs={400} color={color} cubeSize={cubeSize} />
    </View>
  );
}
