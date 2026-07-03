import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import HapticTouchable from './HapticTouchable';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex } from '../utils/theme';

type Props = {
  children: React.ReactNode;
  label: string;
};

type State = {
  error: Error | null;
};

class Boundary extends React.Component<Props & { colors: ReturnType<typeof useAppTheme>['selectedTheme'] }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`[${this.props.label}] screen crashed`, error);
  }

  render() {
    const { colors } = this.props;
    if (!this.state.error) return this.props.children;

    const styles = createStyles(colors);
    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Ionicons name="warning-outline" size={34} color={colors.danger} />
          <Text style={styles.title}>{this.props.label} failed to open</Text>
          <Text style={styles.message}>{this.state.error.message || 'A render error occurred.'}</Text>
          <HapticTouchable style={styles.button} onPress={() => this.setState({ error: null })} haptic="selection">
            <Text style={styles.buttonText}>try again</Text>
          </HapticTouchable>
        </View>
      </View>
    );
  }
}

export default function ScreenErrorBoundary({ children, label }: Props) {
  const { selectedTheme } = useAppTheme();
  return <Boundary label={label} colors={selectedTheme}>{children}</Boundary>;
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary, alignItems: 'center', justifyContent: 'center', padding: 20 },
    card: { width: '100%', maxWidth: 420, borderRadius: 18, borderWidth: 1, borderColor: theme.borderStrong, backgroundColor: rgbaFromHex(theme.panel, 0.94), padding: 20, gap: 12, alignItems: 'center' },
    title: { fontFamily: 'Inter_900Black', color: theme.textPrimary, fontSize: 20, textAlign: 'center' },
    message: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
    button: { minWidth: 130, height: 44, borderRadius: 13, backgroundColor: theme.accentHover, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    buttonText: { fontFamily: 'Inter_900Black', color: theme.bgPrimary, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  });
}
