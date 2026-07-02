import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthUser } from '../services/auth';
import { API_URL } from '../services/api';
import HapticTouchable from '../components/HapticTouchable';

const GOLD_XL = '#EAECEF';
const GOLD_L  = '#E5C9A8';
const GOLD_M  = '#D7B38C';
const GOLD_D  = '#9CA3AF';
const DIM     = '#9CA3AF';
const SURFACE = '#121110';
const BORDER  = 'rgba(215, 179, 140, 0.14)';
const BG      = ['#0a0a0b', '#0a0a0b', '#0f0e0d'] as const;

const LEVEL_COLORS = ['transparent', '#171513', '#211f1d', '#5f4c38', '#D7B38C', '#E5C9A8'];
const DAYS = ['S','M','T','W','T','F','S'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

type HeatDay = { date: string; count: number; level: number };
type Props = { user: AuthUser; onBack: () => void };

export default function CalendarScreen({ user, onBack }: Props) {
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold });
  const [heatmap, setHeatmap] = useState<HeatDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState(new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('token');
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

  if (!fontsLoaded) return null;

  const year  = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const heatByDate: Record<string, HeatDay> = {};
  heatmap.forEach(d => { heatByDate[d.date] = d; });

  const prevMonth = () => setCurrent(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrent(new Date(year, month + 1, 1));

  const today = new Date().toISOString().split('T')[0];
  const selectedDay = heatByDate[selected ?? ''];

  return (
    <SafeAreaView style={s.safe} edges={[]}>
      <LinearGradient colors={BG} style={StyleSheet.absoluteFill} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <HapticTouchable onPress={onBack} haptic="light" style={{ marginRight: 12 }}>
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

        {/* Selected day detail */}
        {selected && (
          <View style={s.dayDetail}>
            <Text style={s.dayDetailTitle}>{new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
            {selectedDay ? (
              <View style={s.dayDetailRow}>
                <Ionicons name="flash" size={14} color={GOLD_M} />
                <Text style={s.dayDetailText}>{selectedDay.count} {selectedDay.count === 1 ? 'activity' : 'activities'} logged</Text>
              </View>
            ) : (
              <Text style={s.dayDetailEmpty}>No activity on this day</Text>
            )}
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0b' },
  scroll: { paddingHorizontal: 16, paddingBottom: 120, gap: 14, paddingTop: 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 },
  title: { fontFamily: 'Inter_900Black', fontSize: 32, color: GOLD_L, letterSpacing: -0.8 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, letterSpacing: 2.2, marginTop: 4, textTransform: 'uppercase' },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  navBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontFamily: 'Inter_900Black', fontSize: 16, color: GOLD_L, letterSpacing: -0.3 },
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
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  legendLabel: { fontFamily: 'Inter_400Regular', fontSize: 9, color: DIM },
  legendBox: { width: 12, height: 12, borderRadius: 3, borderWidth: 1, borderColor: BORDER },
  dayDetail: { backgroundColor: SURFACE, borderRadius: 18, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 8 },
  dayDetailTitle: { fontFamily: 'Inter_900Black', fontSize: 15, color: GOLD_L },
  dayDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayDetailText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: GOLD_M },
  dayDetailEmpty: { fontFamily: 'Inter_400Regular', fontSize: 13, color: DIM },
  infoRow: { flexDirection: 'row', gap: 10 },
  infoCard: { flex: 1, backgroundColor: SURFACE, borderRadius: 16, borderWidth: 1, borderColor: BORDER, paddingVertical: 14, alignItems: 'center' },
  infoVal: { fontFamily: 'Inter_900Black', fontSize: 20, color: GOLD_L },
  infoLbl: { fontFamily: 'Inter_400Regular', fontSize: 9, color: DIM, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 3 },
});
