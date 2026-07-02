import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { getFriendActivityFeed } from '../services/api';
import HapticTouchable from '../components/HapticTouchable';

const GOLD_XL = '#EAECEF';
const GOLD_L  = '#E5C9A8';
const GOLD_M  = '#D7B38C';
const GOLD_D  = '#9CA3AF';
const DIM     = '#9CA3AF';
const SURFACE = '#121110';
const BORDER  = 'rgba(215, 179, 140, 0.14)';
const BG      = ['#0a0a0b', '#0a0a0b', '#0f0e0d'] as const;

const FILTERS = ['all', 'chat', 'note', 'flashcard', 'quiz'] as const;
type Filter = typeof FILTERS[number];
type Props = { user: AuthUser; onBack: () => void };

function activityType(item: any): string {
  return String(item?.activity_type || item?.type || item?.event_type || '').toLowerCase();
}
function activityIcon(type: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (type.includes('quiz'))  return 'trophy-outline';
  if (type.includes('flash')) return 'layers-outline';
  if (type.includes('note'))  return 'document-text-outline';
  if (type.includes('chat'))  return 'sparkles-outline';
  return 'pulse-outline';
}
function activityLabel(type: string): string {
  if (type.includes('quiz'))  return 'quiz';
  if (type.includes('flash')) return 'flashcard';
  if (type.includes('note'))  return 'note';
  if (type.includes('chat'))  return 'ai chat';
  return 'activity';
}
function activityColor(type: string): string {
  if (type.includes('quiz'))  return GOLD_XL;
  if (type.includes('flash')) return GOLD_L;
  if (type.includes('note'))  return GOLD_M;
  if (type.includes('chat'))  return GOLD_D;
  return DIM;
}
function formatTime(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ActivityTimelineScreen({ user, onBack }: Props) {
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold });
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    try {
      const data = await getFriendActivityFeed(user.username);
      const list = Array.isArray(data) ? data : data?.activities ?? data?.feed ?? [];
      setActivities(list);
    } catch {} finally { setLoading(false); }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  if (!fontsLoaded) return null;

  const filtered = filter === 'all'
    ? activities
    : activities.filter(item => activityType(item).includes(filter));

  return (
    <SafeAreaView style={s.safe} edges={[]}>
      <LinearGradient colors={BG} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={s.header}>
        <HapticTouchable onPress={onBack} haptic="light" style={{ marginRight: 12 }}>
          <Ionicons name="chevron-back" size={22} color={GOLD_L} />
        </HapticTouchable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>activity</Text>
          <Text style={s.subtitle}>{activities.length} events logged</Text>
        </View>
        <Ionicons name="time-outline" size={22} color={GOLD_D} />
      </View>

      {/* Filter chips */}
      <View style={s.filterRow}>
        {FILTERS.map(f => (
          <HapticTouchable
            key={f}
            style={[s.chip, filter === f && s.chipActive]}
            onPress={() => setFilter(f)}
            haptic="selection"
            activeOpacity={0.8}
          >
            <Text style={[s.chipText, filter === f && s.chipTextActive]}>{f}</Text>
          </HapticTouchable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={GOLD_D} style={{ marginTop: 60 }} />
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="pulse-outline" size={32} color={DIM} />
          <Text style={s.emptyTitle}>nothing here yet</Text>
          <Text style={s.emptyText}>Start studying and your timeline will fill up.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const type = activityType(item);
            const icon = activityIcon(type);
            const label = activityLabel(type);
            const color = activityColor(type);
            const actor = item?.username || item?.user_username || item?.friend_username || user.first_name || user.username;
            const subject = item?.title || item?.subject || item?.content_title || item?.topic || '';
            const time = formatTime(item?.created_at || item?.timestamp || '');
            const isLast = index === filtered.length - 1;
            return (
              <View style={s.row}>
                <View style={s.lineCol}>
                  <View style={[s.dot, { borderColor: color, backgroundColor: color + '22' }]}>
                    <Ionicons name={icon} size={13} color={color} />
                  </View>
                  {!isLast && <View style={s.line} />}
                </View>
                <View style={[s.card, isLast && { marginBottom: 0 }]}>
                  <View style={s.cardTop}>
                    <Text style={[s.typeLabel, { color }]}>{label}</Text>
                    {time ? <Text style={s.timeText}>{time}</Text> : null}
                  </View>
                  {subject ? <Text style={s.subject} numberOfLines={2}>{subject}</Text> : null}
                  <Text style={s.actor}>{actor}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12 },
  title: { fontFamily: 'Inter_900Black', fontSize: 32, color: GOLD_L, letterSpacing: -0.8 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM, letterSpacing: 2.2, marginTop: 4, textTransform: 'uppercase' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE },
  chipActive: { backgroundColor: GOLD_D + '33', borderColor: GOLD_D },
  chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: DIM, textTransform: 'uppercase', letterSpacing: 1 },
  chipTextActive: { color: GOLD_L },
  list: { paddingHorizontal: 16, paddingBottom: 120 },
  row: { flexDirection: 'row', gap: 12 },
  lineCol: { alignItems: 'center', width: 30 },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 1.5, backgroundColor: BORDER, marginVertical: 4 },
  card: { flex: 1, backgroundColor: SURFACE, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14, marginBottom: 10, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  typeLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5 },
  timeText: { fontFamily: 'Inter_400Regular', fontSize: 10, color: DIM },
  subject: { fontFamily: 'Inter_900Black', fontSize: 14, color: GOLD_L, letterSpacing: -0.2 },
  actor: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyTitle: { fontFamily: 'Inter_900Black', fontSize: 18, color: GOLD_M },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: DIM, textAlign: 'center', lineHeight: 19 },
});
