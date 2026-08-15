import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, ViewStyle, TextInput, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { API_URL, getReminders, createReminder, updateReminder, deleteReminder, Reminder } from '../services/api';
import { getToken } from '../services/tokenStorage';
import HapticTouchable from '../components/HapticTouchable';
import GeoBackground from '../components/GeoBackground';
import { NeumorphicLayer, cbTileShadow, cbModalShadow } from '../components/NeumorphicTexture';
import { triggerHaptic } from '../utils/haptics';
import { useAppTheme } from '../contexts/ThemeContext';
import { mixHex, rgbaFromHex, darkenColor } from '../utils/theme';

const DAYS = ['S','M','T','W','T','F','S'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

type HeatDay = { date: string; count: number; level: number };
type Props = { user: AuthUser; onBack: () => void };

export default function CalendarScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const GOLD_XL = selectedTheme.textPrimary;
  const GOLD_L  = selectedTheme.accentHover;
  const GOLD_M  = selectedTheme.accent;
  const GOLD_D  = selectedTheme.textSecondary;
  const DIM     = selectedTheme.textSecondary;
  const BG = useMemo(() => [selectedTheme.bgTop, selectedTheme.bgTop, selectedTheme.bgBottom] as const, [selectedTheme]);
  const LEVEL_COLORS = useMemo(() => [
    'transparent',
    mixHex(selectedTheme.bgPrimary, selectedTheme.accent, 0.10),
    mixHex(selectedTheme.bgPrimary, selectedTheme.accent, 0.22),
    mixHex(selectedTheme.bgPrimary, selectedTheme.accent, 0.55),
    selectedTheme.accent,
    selectedTheme.accentHover,
  ], [selectedTheme]);
  const s = useMemo(() => createStyles(selectedTheme), [selectedTheme]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold });
  const [heatmap, setHeatmap] = useState<HeatDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_URL}/get_activity_heatmap?user_id=${encodeURIComponent(user.username)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setHeatmap(data.heatmap_data ?? []);
        setTotalCount(data.total_count ?? 0);
      }
    } catch {} finally { setLoading(false); }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  const loadReminders = useCallback(async () => {
    const year = current.getFullYear();
    const month = current.getMonth();
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59`;
    try {
      const data = await getReminders(user.username, { startDate, endDate });
      setReminders(Array.isArray(data) ? data : []);
    } catch {
      setReminders([]);
    }
  }, [user.username, current]);

  useEffect(() => { loadReminders(); }, [loadReminders]);

  const remindersByDate = useMemo(() => {
    const map: Record<string, Reminder[]> = {};
    reminders.forEach((r) => {
      if (!r.reminder_date) return;
      const dateKey = r.reminder_date.slice(0, 10);
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(r);
    });
    return map;
  }, [reminders]);

  const toggleReminderComplete = async (reminder: Reminder) => {
    triggerHaptic('light');
    setReminders((cur) => cur.map((r) => (r.id === reminder.id ? { ...r, is_completed: !r.is_completed } : r)));
    try {
      await updateReminder(reminder.id, { isCompleted: !reminder.is_completed });
    } catch {
      // silenced -- optimistic update stays
    }
  };

  const removeReminder = (reminder: Reminder) => {
    Alert.alert('Delete reminder?', reminder.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setReminders((cur) => cur.filter((r) => r.id !== reminder.id));
          try {
            await deleteReminder(reminder.id);
          } catch {
            // silenced
          }
        },
      },
    ]);
  };

  const submitCreateReminder = async () => {
    if (!newTitle.trim() || !selected) return;
    setCreating(true);
    try {
      await createReminder({
        userId: user.username,
        title: newTitle.trim(),
        reminderDate: `${selected}T09:00:00`,
      });
      setNewTitle('');
      setShowCreate(false);
      await loadReminders();
    } catch (error) {
      Alert.alert('Could not add reminder', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setCreating(false);
    }
  };

  if (!fontsLoaded) return null;

  const year  = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const heatByDate: Record<string, HeatDay> = {};
  heatmap.forEach(d => { heatByDate[d.date] = d; });

  const prevMonth = () => { setCurrent(new Date(year, month - 1, 1)); setSelected(null); };
  const nextMonth = () => { setCurrent(new Date(year, month + 1, 1)); setSelected(null); };

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const selectedDay = heatByDate[selected ?? ''];

  return (
    <SafeAreaView style={s.safe} edges={[]}>
      <LinearGradient colors={BG} style={StyleSheet.absoluteFill} />
      <GeoBackground />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <HapticTouchable onPress={onBack} haptic="light" style={s.headerBack}>
            <Ionicons name="chevron-back" size={22} color={GOLD_L} />
          </HapticTouchable>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>calendar</Text>
            <Text style={s.subtitle}>{totalCount} total activities</Text>
          </View>
          <Ionicons name="calendar-outline" size={22} color={GOLD_D} />
        </View>

        {/* Month nav */}
        <View style={s.monthNav}>
          <HapticTouchable onPress={prevMonth} haptic="light" style={s.navBtn}>
            <Ionicons name="chevron-back" size={18} color={GOLD_D} />
          </HapticTouchable>
          <Text style={s.monthLabel}>{MONTHS[month]} {year}</Text>
          <HapticTouchable onPress={nextMonth} haptic="light" style={s.navBtn}>
            <Ionicons name="chevron-forward" size={18} color={GOLD_D} />
          </HapticTouchable>
        </View>

        <View style={s.calendarPanel}>
          <NeumorphicLayer grainOpacity={0.24} />
          <Text style={s.panelGhost}>01</Text>

          {/* Day headers */}
          <View style={s.dayHeaders}>
            {DAYS.map((d, i) => <Text key={i} style={s.dayHeader}>{d}</Text>)}
          </View>

          {/* Calendar grid */}
          {loading ? (
            <ActivityIndicator color={GOLD_D} style={{ marginTop: 40 }} />
          ) : (
            <View style={s.grid}>
              {Array.from({ length: firstDay }).map((_, i) => <View key={`e-${i}`} style={s.cell} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const heat = heatByDate[dateStr];
                const isToday = dateStr === today;
                const isSel = dateStr === selected;
                return (
                  <HapticTouchable
                    key={dateStr}
                    style={[s.cell, { backgroundColor: heat ? LEVEL_COLORS[heat.level] : 'transparent' }, isToday && s.cellToday, isSel && s.cellSelected]}
                    onPress={() => setSelected(isSel ? null : dateStr)}
                    haptic="selection"
                    activeOpacity={0.75}
                  >
                    <Text style={[s.cellNum, isToday && s.cellNumToday, isSel && s.cellNumSel]}>{day}</Text>
                    {heat && heat.count > 0 ? <View style={[s.dot, { backgroundColor: LEVEL_COLORS[Math.min(heat.level + 1, 5)] }]} /> : null}
                    {remindersByDate[dateStr]?.length ? <View style={s.reminderDot} /> : null}
                  </HapticTouchable>
                );
              })}
            </View>
          )}

          {/* Legend */}
          <View style={s.legend}>
            <Text style={s.legendLabel}>less</Text>
            {LEVEL_COLORS.slice(1).map((c, i) => <View key={i} style={[s.legendBox, { backgroundColor: c }]} />)}
            <Text style={s.legendLabel}>more</Text>
          </View>
        </View>

        {/* Selected day detail */}
        {selected && (
          <View style={s.dayDetail}>
            <View style={s.dayDetailHeadRow}>
              <Text style={s.dayDetailTitle}>{new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
              <HapticTouchable onPress={() => setShowCreate(true)} haptic="selection" style={s.addReminderBtn}>
                <Ionicons name="add" size={16} color={GOLD_L} />
              </HapticTouchable>
            </View>
            {selectedDay ? (
              <View style={s.dayDetailRow}>
                <Ionicons name="flash" size={14} color={GOLD_M} />
                <Text style={s.dayDetailText}>{selectedDay.count} {selectedDay.count === 1 ? 'activity' : 'activities'} logged</Text>
              </View>
            ) : (
              <Text style={s.dayDetailEmpty}>No activity on this day</Text>
            )}

            {(remindersByDate[selected] ?? []).length > 0 ? (
              <View style={{ gap: 4, marginTop: 4 }}>
                {(remindersByDate[selected] ?? []).map((reminder) => (
                  <HapticTouchable
                    key={reminder.id}
                    style={s.reminderRow}
                    onPress={() => toggleReminderComplete(reminder)}
                    onLongPress={() => removeReminder(reminder)}
                    haptic="none"
                  >
                    <Ionicons
                      name={reminder.is_completed ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={reminder.is_completed ? GOLD_M : DIM}
                    />
                    <Text style={[s.reminderText, reminder.is_completed && s.reminderTextDone]} numberOfLines={1}>{reminder.title}</Text>
                  </HapticTouchable>
                ))}
                <Text style={s.reminderHint}>long-press a reminder to delete it</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Streak info */}
        <View style={s.infoRow}>
          <View style={s.infoCard}>
            <Text style={s.infoVal}>{totalCount}</Text>
            <Text style={s.infoLbl}>total events</Text>
          </View>
          <View style={s.infoCard}>
            <Text style={s.infoVal}>{heatmap.filter(d => d.count > 0).length}</Text>
            <Text style={s.infoLbl}>active days</Text>
          </View>
          <View style={s.infoCard}>
            <Text style={s.infoVal}>{heatmap.filter(d => d.level >= 3).length}</Text>
            <Text style={s.infoLbl}>strong days</Text>
          </View>
        </View>
      </ScrollView>

      <Modal transparent visible={showCreate} animationType="fade" onRequestClose={() => setShowCreate(false)}>
        <View style={s.modalOverlay}>
          <HapticTouchable style={StyleSheet.absoluteFill} onPress={() => setShowCreate(false)} activeOpacity={1} haptic="none" />
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>new reminder</Text>
            <Text style={s.modalSub}>{selected ? new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''}</Text>
            <TextInput
              style={s.modalInput}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="reminder title"
              placeholderTextColor={DIM}
              autoFocus
            />
            <View style={s.modalActions}>
              <HapticTouchable style={s.modalCancel} onPress={() => { setShowCreate(false); setNewTitle(''); }} haptic="light">
                <Text style={s.modalCancelText}>cancel</Text>
              </HapticTouchable>
              <HapticTouchable style={s.modalSave} onPress={submitCreateReminder} haptic="medium" disabled={creating || !newTitle.trim()}>
                {creating ? <ActivityIndicator size="small" color={selectedTheme.isLight ? darkenColor(selectedTheme.accent, 34) : selectedTheme.bgPrimary} /> : <Text style={s.modalSaveText}>add</Text>}
              </HapticTouchable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const GOLD_XL = theme.textPrimary;
  const GOLD_L  = theme.accentHover;
  const GOLD_M  = theme.accent;
  const GOLD_D  = theme.textSecondary;
  const DIM     = theme.textSecondary;
  const SURFACE = theme.panel;
  const BORDER  = theme.border;
  const INK     = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bgTop },
    scroll: { paddingHorizontal: 4, paddingBottom: 120, gap: 4, paddingTop: 0 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 },
    headerBack: { width: 42, height: 42, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', marginRight: 12, boxShadow: cbTileShadow(0.055) },
    title: { fontFamily: 'Inter_900Black', fontSize: 32, color: GOLD_L, letterSpacing: -0.8 },
    subtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, letterSpacing: 2.2, marginTop: 4, textTransform: 'uppercase' },
    monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    navBtn: { width: 38, height: 38, borderRadius: 16, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center', boxShadow: cbTileShadow(0.055) },
    monthLabel: { fontFamily: 'Inter_900Black', fontSize: 16, color: GOLD_L, letterSpacing: -0.3 },
    calendarPanel: { borderRadius: 30, padding: 14, overflow: 'hidden', boxShadow: cbModalShadow(0.14) } as ViewStyle,
    panelGhost: { position: 'absolute', right: 15, top: -2, fontFamily: 'Inter_900Black', fontSize: 76, lineHeight: 82, color: rgbaFromHex(GOLD_XL, 0.055), letterSpacing: -4 },
    dayHeaders: { flexDirection: 'row' },
    dayHeader: { flex: 1, textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 10, color: DIM, letterSpacing: 1.2, paddingVertical: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, padding: 2 },
    cellToday: { borderWidth: 1, borderColor: GOLD_D },
    cellSelected: { borderWidth: 1.5, borderColor: GOLD_L },
    cellNum: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: GOLD_D },
    cellNumToday: { color: GOLD_L },
    cellNumSel: { color: GOLD_XL },
    dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
    reminderDot: { position: 'absolute', top: 4, right: 6, width: 4, height: 4, borderRadius: 2, backgroundColor: '#7fb8e0' },
    legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 },
    legendLabel: { fontFamily: 'Inter_400Regular', fontSize: 9, color: DIM },
    legendBox: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: BORDER },
    dayDetail: { backgroundColor: SURFACE, borderRadius: 24, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 4, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    dayDetailHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dayDetailTitle: { fontFamily: 'Inter_900Black', fontSize: 15, color: GOLD_L },
    addReminderBtn: { width: 28, height: 28, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
    dayDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dayDetailText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_M },
    dayDetailEmpty: { fontFamily: 'Inter_400Regular', fontSize: 13, color: DIM },
    reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    reminderText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_XL },
    reminderTextDone: { color: DIM, textDecorationLine: 'line-through' },
    reminderHint: { fontFamily: 'Inter_400Regular', fontSize: 9.5, color: DIM, marginTop: 2 },
    infoRow: { flexDirection: 'row', gap: 4 },
    infoCard: { flex: 1, backgroundColor: SURFACE, borderRadius: 20, borderWidth: 1, borderColor: BORDER, paddingVertical: 14, alignItems: 'center', boxShadow: cbTileShadow(0.055) } as ViewStyle,
    infoVal: { fontFamily: 'Inter_900Black', fontSize: 20, color: GOLD_L },
    infoLbl: { fontFamily: 'Inter_400Regular', fontSize: 9, color: DIM, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 3 },

    modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 24 },
    modalCard: { width: '100%', maxWidth: 380, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, padding: 20, gap: 4, boxShadow: cbModalShadow(0.2) } as ViewStyle,
    modalTitle: { fontFamily: 'Inter_900Black', fontSize: 16, color: GOLD_L },
    modalSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: -8 },
    modalInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Inter_400Regular', fontSize: 13.5, color: GOLD_XL, backgroundColor: theme.bgTop },
    modalActions: { flexDirection: 'row', gap: 4, justifyContent: 'flex-end' },
    modalCancel: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12 },
    modalCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: DIM },
    modalSave: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, backgroundColor: GOLD_M, minWidth: 64, alignItems: 'center' },
    modalSaveText: { fontFamily: 'Inter_700Bold', fontSize: 12.5, color: INK },
  });
}
