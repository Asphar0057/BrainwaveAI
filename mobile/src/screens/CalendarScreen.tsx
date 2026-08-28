import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, ViewStyle, TextInput, Modal, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { API_URL, getReminders, createReminder, updateReminder, deleteReminder, Reminder, getNotes, getFlashcardHistory, getChatSessions } from '../services/api';
import { getToken } from '../services/tokenStorage';
import HapticTouchable from '../components/HapticTouchable';
import GeoBackground from '../components/GeoBackground';
import { NeumorphicLayer, cbTileShadow, cbModalShadow } from '../components/NeumorphicTexture';
import SectionSidebar, { SidebarItem } from '../components/SectionSidebar';
import { triggerHaptic } from '../utils/haptics';
import { useAppTheme } from '../contexts/ThemeContext';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import { mixHex, rgbaFromHex, darkenColor } from '../utils/theme';

const DAYS = ['S','M','T','W','T','F','S'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

type HeatDay = { date: string; count: number; level: number };
type ActivityType = 'note' | 'flashcard' | 'quiz' | 'chat';
type ActivityItem = { id: string; type: ActivityType; title: string; date: string };
type Props = { user: AuthUser; onBack: () => void; onNavigate?: (screen: 'activityTimeline') => void };

const TYPE_COLORS: Record<ActivityType, string> = {
  note: '#34d399',
  flashcard: '#fbbf24',
  quiz: '#f472b6',
  chat: '#D7B38C',
};
const TYPE_LABELS: Record<ActivityType, string> = {
  note: 'Notes',
  flashcard: 'Flashcards',
  quiz: 'Quizzes',
  chat: 'AI Chats',
};

const CALENDAR_SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'reminder', label: 'New Reminder' },
];

export default function CalendarScreen({ user, onBack, onNavigate }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
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
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold });
  const [heatmap, setHeatmap] = useState<HeatDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const loadActivities = useCallback(async () => {
    const items: ActivityItem[] = [];

    try {
      const notes = await getNotes(user.username);
      (Array.isArray(notes) ? notes : []).forEach((note: any) => {
        if (note?.is_deleted) return;
        const ts = note.updated_at || note.created_at;
        if (!ts) return;
        items.push({ id: `note-${note.id}`, type: 'note', title: note.title || 'Untitled Note', date: String(ts).slice(0, 10) });
      });
    } catch {}

    try {
      const payload = await getFlashcardHistory(user.username, 200);
      const sets = Array.isArray(payload?.flashcard_history) ? payload.flashcard_history : [];
      sets.forEach((setInfo: any) => {
        const ts = setInfo.updated_at || setInfo.created_at;
        if (!ts) return;
        items.push({ id: `flashcard-${setInfo.id}`, type: 'flashcard', title: setInfo.title || 'Flashcard Set', date: String(ts).slice(0, 10) });
      });
    } catch {}

    try {
      const payload = await getChatSessions(user.username);
      const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
      sessions.forEach((session: any) => {
        const ts = session.updated_at || session.created_at;
        if (!ts) return;
        items.push({ id: `chat-${session.id}`, type: 'chat', title: session.title || 'AI Chat Session', date: String(ts).slice(0, 10) });
      });
    } catch {}

    try {
      const token = await getToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_URL}/get_quiz_history?user_id=${encodeURIComponent(user.username)}`, { headers });
      if (res.ok) {
        const payload = await res.json();
        const quizzes = Array.isArray(payload) ? payload : (payload?.sessions ?? []);
        quizzes.forEach((quiz: any) => {
          const ts = quiz.completed_at || quiz.created_at;
          if (!ts) return;
          items.push({ id: `quiz-${quiz.id}`, type: 'quiz', title: quiz.title || 'Quiz Session', date: String(ts).slice(0, 10) });
        });
      }
    } catch {}

    setActivities(items);
  }, [user.username]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  const activitiesByDate = useMemo(() => {
    const map: Record<string, ActivityItem[]> = {};
    activities.forEach((item) => {
      if (!map[item.date]) map[item.date] = [];
      map[item.date].push(item);
    });
    return map;
  }, [activities]);

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

  const goToMonth = (nextYear: number, nextMonth: number) => {
    setCurrent(new Date(nextYear, nextMonth, 1));
    setSelected(null);
  };
  const prevMonth = () => goToMonth(year, month - 1);
  const nextMonth = () => goToMonth(year, month + 1);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const selectedDay = heatByDate[selected ?? ''];
  const selectedActivities = activitiesByDate[selected ?? ''] ?? [];
  const selectedReminders = remindersByDate[selected ?? ''] ?? [];

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <LinearGradient colors={BG} style={StyleSheet.absoluteFill} />
      <GeoBackground />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <HapticTouchable onPress={onBack} haptic="selection">
            <Ionicons name="chevron-back" size={22} color={GOLD_L} />
          </HapticTouchable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.title}>calendar</Text>
            <Text style={s.subtitle}>{totalCount} total activities</Text>
          </View>
          <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
            <Ionicons name="menu-outline" size={24} color={GOLD_L} />
          </HapticTouchable>
        </View>

        {/* Month nav */}
        <View style={s.monthNav}>
          <HapticTouchable onPress={prevMonth} haptic="light" style={s.navBtn} accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={20} color={GOLD_D} />
          </HapticTouchable>
          <HapticTouchable onPress={() => setShowMonthPicker(true)} haptic="selection" style={s.monthLabelBtn}>
            <Text style={s.monthLabel}>{MONTHS[month]} {year}</Text>
            <Ionicons name="chevron-down" size={14} color={GOLD_D} />
          </HapticTouchable>
          <HapticTouchable onPress={nextMonth} haptic="light" style={s.navBtn} accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={20} color={GOLD_D} />
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
                const dayActivityTypes = Array.from(new Set((activitiesByDate[dateStr] ?? []).map((a) => a.type)));
                return (
                  <HapticTouchable
                    key={dateStr}
                    style={[s.cell, { backgroundColor: heat ? LEVEL_COLORS[heat.level] : 'transparent' }, isToday && s.cellToday, isSel && s.cellSelected]}
                    onPress={() => setSelected(isSel ? null : dateStr)}
                    haptic="selection"
                    activeOpacity={0.75}
                  >
                    <Text style={[s.cellNum, isToday && s.cellNumToday, isSel && s.cellNumSel]}>{day}</Text>
                    {dayActivityTypes.length > 0 ? (
                      <View style={s.signalRow}>
                        {dayActivityTypes.map((t) => (
                          <View key={t} style={[s.signalDot, { backgroundColor: TYPE_COLORS[t] }]} />
                        ))}
                      </View>
                    ) : (
                      heat && heat.count > 0 ? <View style={[s.dot, { backgroundColor: LEVEL_COLORS[Math.min(heat.level + 1, 5)] }]} /> : null
                    )}
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

            {selectedReminders.length > 0 ? (
              <View style={{ gap: 8, marginTop: 4 }}>
                <Text style={s.dayDetailSectionLabel}>Reminders</Text>
                {selectedReminders.map((reminder) => (
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

            {selectedActivities.length > 0 ? (
              <View style={{ gap: 8, marginTop: 4 }}>
                <Text style={s.dayDetailSectionLabel}>Activities</Text>
                {selectedActivities.map((activity) => (
                  <View key={activity.id} style={s.activityRow}>
                    <View style={[s.activityDot, { backgroundColor: TYPE_COLORS[activity.type] }]} />
                    <Text style={s.activityText} numberOfLines={1}>{activity.title}</Text>
                    <Text style={s.activityType}>{TYPE_LABELS[activity.type]}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
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

      <Modal transparent visible={showMonthPicker} animationType="fade" onRequestClose={() => setShowMonthPicker(false)}>
        <View style={s.modalOverlay}>
          <HapticTouchable style={StyleSheet.absoluteFill} onPress={() => setShowMonthPicker(false)} activeOpacity={1} haptic="none" />
          <View style={s.modalCard}>
            <View style={s.yearStepper}>
              <HapticTouchable onPress={() => goToMonth(year - 1, month)} haptic="light" style={s.yearStepBtn} accessibilityLabel="Previous year">
                <Ionicons name="chevron-back" size={18} color={GOLD_D} />
              </HapticTouchable>
              <Text style={s.modalTitle}>{year}</Text>
              <HapticTouchable onPress={() => goToMonth(year + 1, month)} haptic="light" style={s.yearStepBtn} accessibilityLabel="Next year">
                <Ionicons name="chevron-forward" size={18} color={GOLD_D} />
              </HapticTouchable>
            </View>
            <View style={s.monthGrid}>
              {MONTHS.map((m, idx) => (
                <HapticTouchable
                  key={m}
                  style={[s.monthGridItem, idx === month && s.monthGridItemActive]}
                  onPress={() => { goToMonth(year, idx); setShowMonthPicker(false); }}
                  haptic="selection"
                >
                  <Text style={[s.monthGridText, idx === month && s.monthGridTextActive]}>{m.slice(0, 3)}</Text>
                </HapticTouchable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="calendar"
        items={CALENDAR_SIDEBAR_ITEMS}
        activeKey="calendar"
        onSelect={(key) => {
          if (key === 'timeline') onNavigate?.('activityTimeline');
          else if (key === 'reminder') { setSelected((current) => current ?? today); setShowCreate(true); }
        }}
      />
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
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
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 10, paddingBottom: 120, gap: 14, paddingTop: 0 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, paddingTop: 18, paddingBottom: 12 },
    title: { fontFamily: 'Inter_900Black', fontSize: 32, color: GOLD_L, letterSpacing: -0.8 },
    subtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, letterSpacing: 2.2, marginTop: 4, textTransform: 'uppercase' },
    monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
    navBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    monthLabelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    monthLabel: { fontFamily: 'Inter_900Black', fontSize: 16, color: GOLD_L, letterSpacing: -0.3 },
    calendarPanel: { borderRadius: 30, padding: 14, overflow: 'hidden', boxShadow: cbModalShadow(0.14) } as ViewStyle,
    panelGhost: { position: 'absolute', right: 15, top: -2, fontFamily: 'Inter_900Black', fontSize: 76, lineHeight: 82, color: rgbaFromHex(GOLD_XL, 0.055), letterSpacing: -4 },
    dayHeaders: { flexDirection: 'row' },
    dayHeader: { flex: 1, textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 10, color: DIM, letterSpacing: 1.2, paddingVertical: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, padding: 2 },
    cellToday: { borderWidth: 1, borderColor: GOLD_D },
    cellSelected: { borderWidth: 1.5, borderColor: GOLD_L },
    cellNum: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: GOLD_D },
    cellNumToday: { color: GOLD_L },
    cellNumSel: { color: GOLD_XL },
    dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
    signalRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
    signalDot: { width: 4, height: 4, borderRadius: 2 },
    reminderDot: { position: 'absolute', top: 4, right: 6, width: 4, height: 4, borderRadius: 2, backgroundColor: '#7fb8e0' },
    legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
    legendLabel: { fontFamily: 'Inter_400Regular', fontSize: 9, color: DIM },
    legendBox: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: BORDER },
    dayDetail: { backgroundColor: SURFACE, borderRadius: 24, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 8, boxShadow: cbTileShadow(0.08) } as ViewStyle,
    dayDetailHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dayDetailTitle: { fontFamily: 'Inter_900Black', fontSize: 15, color: GOLD_L },
    dayDetailSectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 9.5, color: DIM, textTransform: 'uppercase', letterSpacing: 1.1 },
    addReminderBtn: { width: 28, height: 28, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
    dayDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dayDetailText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_M },
    dayDetailEmpty: { fontFamily: 'Inter_400Regular', fontSize: 13, color: DIM },
    reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    reminderText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_XL },
    reminderTextDone: { color: DIM, textDecorationLine: 'line-through' },
    reminderHint: { fontFamily: 'Inter_400Regular', fontSize: 9.5, color: DIM, marginTop: 2 },
    activityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    activityDot: { width: 7, height: 7, borderRadius: 3.5 },
    activityText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_XL },
    activityType: { fontFamily: 'Inter_400Regular', fontSize: 9.5, color: DIM, textTransform: 'uppercase', letterSpacing: 0.6 },

    modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 24 },
    modalCard: { width: '100%', maxWidth: 380, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, padding: 20, gap: 12, boxShadow: cbModalShadow(0.2) } as ViewStyle,
    modalTitle: { fontFamily: 'Inter_900Black', fontSize: 16, color: GOLD_L },
    modalSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: -8 },
    modalInput: { borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'Inter_400Regular', fontSize: 13.5, color: GOLD_XL, backgroundColor: theme.bgTop },
    modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
    modalCancel: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12 },
    modalCancelText: { fontFamily: 'Inter_600SemiBold', fontSize: 12.5, color: DIM },
    modalSave: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 12, backgroundColor: GOLD_M, minWidth: 64, alignItems: 'center' },
    modalSaveText: { fontFamily: 'Inter_700Bold', fontSize: 12.5, color: INK },
    yearStepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
    yearStepBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
    monthGridItem: { width: '30%', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: BORDER, alignItems: 'center' },
    monthGridItemActive: { backgroundColor: GOLD_M, borderColor: GOLD_M },
    monthGridText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: GOLD_D },
    monthGridTextActive: { color: INK },
  });
}
