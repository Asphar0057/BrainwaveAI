import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle } from 'react-native';

type Props = { color: string; size?: number; style?: ViewStyle };

export default function PulseCubes({ color, size = 11, style }: Props) {
  const cubes = useRef([0, 1, 2].map(() => new Animated.Value(0.35))).current;

  useEffect(() => {
    const loops = cubes.map((cube, i) => Animated.loop(
      Animated.sequence([
        Animated.delay(i * 140),
        Animated.timing(cube, { toValue: 1, duration: 360, useNativeDriver: true }),
        Animated.timing(cube, { toValue: 0.35, duration: 360, useNativeDriver: true }),
        Animated.delay((cubes.length - 1 - i) * 140),
      ]),
    ));
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [cubes]);

  return (
    <View style={[styles.row, style]}>
      {cubes.map((cube, i) => (
        <Animated.View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size * 0.28,
            backgroundColor: color,
            opacity: cube,
            transform: [{ scale: cube }],
          }}
        />
      ))}
    </View>
  );
}

// Fills the available space (its parent must give it real height, e.g. flex: 1
// or minHeight) and centers the pulse on both axes -- the standard full-area
// loading state used in place of a spinner.
export function PulseCubesLoader({ color, size = 12 }: Props) {
  return (
    <View style={styles.loaderFill}>
      <PulseCubes color={color} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loaderFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
