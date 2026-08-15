import { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_700Bold } from '@expo-google-fonts/inter';
import { LinearGradient } from 'expo-linear-gradient';
import GeoBackground from '../components/GeoBackground';
import CerbylMark from '../components/CerbylMark';
import { useAppTheme } from '../contexts/ThemeContext';

type Props = { onFinish: () => void };

const WORD = 'cerbyl'.split('');

/**
 * Ported from the website's .cb-intro sequence (Home.js/Home.css): the mark
 * blooms in (scale + rotate settle) and fades, the "cerbyl" wordmark reveals
 * letter by letter, the tagline follows, then the whole overlay fades out.
 * RN has no clip-path, so the per-letter reveal uses staggered
 * opacity+translateY instead of the CSS clip-path inset animation — same
 * beat, different technique.
 */
export default function SplashScreen({ onFinish }: Props) {
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_700Bold });
  const { selectedTheme } = useAppTheme();
  const s = useMemo(() => createStyles(selectedTheme), [selectedTheme]);

  const markOpacity = useRef(new Animated.Value(0)).current;
  const markScale = useRef(new Animated.Value(0.4)).current;
  const markRotate = useRef(new Animated.Value(-8)).current;
  const wordAnims = useRef(WORD.map(() => new Animated.Value(0))).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!fontsLoaded) return;

    Animated.sequence([
      Animated.parallel([
        Animated.timing(markOpacity, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(markScale, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(markRotate, { toValue: 0, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.delay(180),
      Animated.parallel([
        Animated.timing(markOpacity, { toValue: 0, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(markScale, { toValue: 0.7, duration: 380, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.stagger(45, wordAnims.map((v) =>
          Animated.timing(v, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true })
        )),
      ]),
      Animated.timing(tagOpacity, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.delay(500),
      Animated.timing(overlayOpacity, { toValue: 0, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => onFinish());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <Animated.View style={[s.container, { opacity: overlayOpacity }]}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />

      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          opacity: markOpacity,
          transform: [
            { scale: markScale },
            { rotate: markRotate.interpolate({ inputRange: [-8, 0], outputRange: ['-8deg', '0deg'] }) },
          ],
        }}
      >
        <CerbylMark size={140} color={selectedTheme.accentHover} />
      </Animated.View>

      <View style={s.wordRow}>
        {WORD.map((ch, i) => (
          <Animated.Text
            key={`${ch}-${i}`}
            style={[
              s.wordChar,
              {
                opacity: wordAnims[i],
                transform: [{ translateY: wordAnims[i].interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              },
            ]}
          >
            {ch}
          </Animated.Text>
        ))}
      </View>

      <Animated.View style={[s.tagRow, { opacity: tagOpacity }]}>
        <View style={s.tagDot} />
        <Text style={s.tagText}>learning unified</Text>
      </Animated.View>
    </Animated.View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  return StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: theme.bgPrimary,
    },
    wordRow: {
      flexDirection: 'row',
    },
    wordChar: {
      fontFamily: 'Inter_900Black',
      fontSize: 46,
      lineHeight: 54,
      letterSpacing: 0.5,
      color: theme.accentHover,
    },
    tagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 14,
    },
    tagDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.accent,
    },
    tagText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 11,
      letterSpacing: 3,
      textTransform: 'uppercase',
      color: theme.accent,
    },
  });
}
