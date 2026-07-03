import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import HapticTouchable from './HapticTouchable';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex } from '../utils/theme';

type Props = {
  hsMode: boolean;
  selectedCount: number;
  onPress: () => void;
};

export default function ContextSelector({ hsMode, selectedCount, onPress }: Props) {
  const { selectedTheme } = useAppTheme();
  const active = hsMode || selectedCount > 0;
  const s = createStyles(selectedTheme, active);

  const label = selectedCount > 0 ? `${selectedCount} doc${selectedCount > 1 ? 's' : ''}` : hsMode ? 'HS mode' : 'context';

  return (
    <HapticTouchable onPress={onPress} style={s.btn} activeOpacity={0.8} haptic="selection">
      <Ionicons name={active ? 'sparkles' : 'book-outline'} size={14} color={active ? selectedTheme.bgPrimary : selectedTheme.textPrimary} />
      <Text style={s.label}>{label}</Text>
    </HapticTouchable>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], active: boolean) {
  return StyleSheet.create({
    btn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      height: 40, borderRadius: 10, borderWidth: 1,
      paddingHorizontal: 12,
      borderColor: active ? theme.accent : theme.border,
      backgroundColor: active ? theme.accentHover : rgbaFromHex(theme.panelAlt, 0.88),
    },
    label: {
      fontFamily: 'Inter_600SemiBold', fontSize: 11,
      color: active ? theme.bgPrimary : theme.textPrimary,
      textTransform: 'lowercase',
    },
  });
}
