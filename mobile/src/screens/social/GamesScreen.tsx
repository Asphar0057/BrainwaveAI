import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  RefreshControl, TextInput, Modal, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../../services/auth';
import {
  getQuizBattles, createQuizBattle, acceptQuizBattle,
  declineQuizBattle, getFriends,
} from '../../services/api';
import HapticTouchable from '../../components/HapticTouchable';
import GeoBackground from '../../components/GeoBackground';
import SocialTileMaterial from '../../components/SocialTileMaterial';
import BattlePlayScreen from './BattlePlayScreen';
import { useAppTheme } from '../../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

const SUBJECTS     = ['Mathematics', 'Biology', 'Chemistry', 'Physics', 'History', 'Literature', 'Computer Science', 'Economics'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

function DotGrid() {
  const { selectedTheme } = useAppTheme();
  const { width } = useResponsiveLayout();
  const dotColor = rgbaFromHex(selectedTheme.accent, 0.16);
  const dotSpacingX = 24;
  const dotSpacingY = 30;
  const cols = Math.floor((width - 56) / dotSpacingX);
  const rows = 28;
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <View
            key={`${r}-${c}`}
            style={{
              position: 'absolute',
              left: 56 + c * dotSpacingX,
              top: r * dotSpacingY,
              width: 2,
              height: 2,
              borderRadius: 1,
              backgroundColor: dotColor,
            }}
          />
        ))
      )}
    </View>
  );
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const { selectedTheme } = useAppTheme();
  const GOLD_L = selectedTheme.accentHover;
  const CARD = selectedTheme.panelAlt;
  const initials = (name || '?').split(/[\s_]/).map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <LinearGradient
      colors={[rgbaFromHex(selectedTheme.accent, 0.28), rgbaFromHex(CARD, 0.98)]}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={{ width: size + 3, height: size + 3, borderRadius: (size + 3) / 2, padding: 2, alignItems: 'center', justifyContent: 'center' }}
    >
      <LinearGradient
        colors={[rgbaFromHex(CARD, 0.98), rgbaFromHex(selectedTheme.bgPrimary, 0.98)]}
        style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
      >
        <Text style={{ fontFamily: 'Inter_900Black', fontSize: size * 0.33, color: GOLD_L }}>{initials}</Text>
      </LinearGradient>
    </LinearGradient>
  );
}

type Props = { user: AuthUser; onBack: () => void };

export default function GamesScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const card = useMemo(() => createCardStyles(selectedTheme), [selectedTheme]);
  const vs = useMemo(() => createVersusStyles(selectedTheme), [selectedTheme]);
  const empty = useMemo(() => createEmptyStyles(selectedTheme), [selectedTheme]);
  const modal = useMemo(() => createModalStyles(selectedTheme), [selectedTheme]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [battles, setBattles]       = useState<any[]>([]);
  const [friends, setFriends]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating]     = useState(false);

  const [activeBattleId, setActiveBattleId] = useState<number | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [subject, setSubject]               = useState('Mathematics');
  const [difficulty, setDifficulty]         = useState('medium');
  const [customSubject, setCustomSubject]   = useState('');
  const [useCustom, setUseCustom]           = useState(false);
  const GOLD_XL = selectedTheme.accent;
  const GOLD_L = selectedTheme.accentHover;
  const GOLD_M = selectedTheme.accent;
  const GOLD_D = darkenColor(selectedTheme.accent, selectedTheme.isLight ? 12 : 26);
  const DIM = selectedTheme.textSecondary;
  const INK = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 34) : selectedTheme.bgPrimary;

  const load = useCallback(async () => {
    try {
      const [b, f] = await Promise.all([getQuizBattles(user.username), getFriends(user.username)]);
      setBattles(b?.battles ?? (Array.isArray(b) ? b : []));
      setFriends(Array.isArray(f) ? f : f?.friends ?? []);
    } catch {} finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const doAccept  = async (id: number) => {
    try {
      await acceptQuizBattle(id, user.username);
      setBattles(p => p.map((b: any) => b.id === id ? { ...b, status: 'active' } : b));
    } catch {}
  };
  const doDecline = async (id: number) => {
    try {
      await declineQuizBattle(id, user.username);
      setBattles(p => p.map((b: any) => b.id === id ? { ...b, status: 'declined' } : b));
    } catch {}
  };
  const doCreate  = async () => {
    if (!selectedFriend) { Alert.alert('Select a friend first'); return; }
    setCreating(true);
    try {
      const sub = useCustom && customSubject.trim() ? customSubject.trim() : subject;
      await createQuizBattle({ challenger_id: user.username, opponent_id: selectedFriend.id, subject: sub, difficulty, question_count: 10, time_limit_seconds: 300 });
      setShowCreate(false);
      setSelectedFriend(null);
      load();
    } catch { Alert.alert('Failed to create battle'); }
    finally { setCreating(false); }
  };

  const isChallenger = (b: any) => b.challenger?.username === user.username || b.challenger_id === user.username;
  const opponent     = (b: any) => isChallenger(b) ? (b.opponent ?? b.challenged) : (b.challenger ?? b.challengedBy);
  const opponentName = (b: any) => opponent(b)?.username ?? opponent(b)?.name ?? '?';
  const friendName   = (f: any) => f.username || f.friend_username || f.name || '?';

  const pending  = battles.filter((b: any) => b.status === 'pending' && !isChallenger(b));
  const active   = battles.filter((b: any) => b.status === 'active');
  const history  = battles.filter((b: any) => ['completed', 'declined'].includes(b.status));
  const outgoing = battles.filter((b: any) => b.status === 'pending' && isChallenger(b));

  if (!fontsLoaded) return null;

  if (activeBattleId !== null) {
    return (
      <BattlePlayScreen
        user={user}
        battleId={activeBattleId}
        onExit={() => { setActiveBattleId(null); load(); }}
      />
    );
  }

  if (loading) return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={GOLD_M} size="large" />
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />

{/* Top bar */}
      <View style={s.topBar}>
        <HapticTouchable onPress={onBack} style={s.backBtn} haptic="light">
          <Ionicons name="chevron-back" size={18} color={GOLD_M} />
        </HapticTouchable>
        <HapticTouchable onPress={() => setShowCreate(true)} haptic="medium">
          <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={s.cta}>
            <Text style={s.ctaText}>+ challenge</Text>
          </LinearGradient>
        </HapticTouchable>
      </View>

      {/* Hero */}
      <View style={s.hero}>
        <SocialTileMaterial />
        <View style={s.heroGlow}>
          <Ionicons name="flash" size={46} color={GOLD_XL} />
        </View>
        <Text style={s.heroTitle}>battles</Text>
        <Text style={s.heroSub}>{active.length} active · {pending.length} incoming</Text>
      </View>

      <View style={s.divider} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD_D} />}
      >

        {/* Incoming */}
        {pending.length > 0 && (
          <>
            <Text style={s.section}>incoming challenges</Text>
            {pending.map((b: any, i: number) => (
              <View key={b.id ?? i} style={card.wrap}>
                <SocialTileMaterial />
                <View style={card.accent} />
                <View style={card.body}>
                  <View style={card.row}>
                    <Avatar name={opponentName(b)} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={card.name}>{opponentName(b)}</Text>
                      <Text style={card.meta}>{b.subject} · {b.difficulty} · {b.question_count ?? 10}Q</Text>
                    </View>
                    <View style={card.newBadge}><Text style={card.newBadgeText}>new</Text></View>
                  </View>
                  <View style={card.actions}>
                    <HapticTouchable style={{ flex: 1 }} onPress={() => doAccept(b.id)} haptic="success">
                      <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={card.acceptBtn}>
                        <Text style={card.acceptText}>accept battle</Text>
                        <Ionicons name="chevron-forward" size={15} color={selectedTheme.bgPrimary} />
                      </LinearGradient>
                    </HapticTouchable>
                    <HapticTouchable style={card.declineBtn} onPress={() => doDecline(b.id)} haptic="warning">
                      <Text style={card.declineText}>decline</Text>
                    </HapticTouchable>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Active */}
        {active.length > 0 && (
          <>
            <Text style={s.section}>live battles</Text>
            {active.map((b: any, i: number) => (
              <HapticTouchable key={b.id ?? i} onPress={() => setActiveBattleId(b.id)} haptic="medium">
                <View style={card.wrap}>
                  <SocialTileMaterial />
                  <View style={[card.accent, { backgroundColor: GOLD_M }]} />
                  <View style={card.body}>
                    <View style={vs.row}>
                      <View style={vs.player}>
                        <Avatar name={user.username} size={44} />
                        <Text style={vs.name} numberOfLines={1}>{user.username}</Text>
                        {b.challenger_score !== undefined && (
                          <Text style={vs.score}>{isChallenger(b) ? (b.challenger_score ?? 0) : (b.opponent_score ?? 0)}</Text>
                        )}
                      </View>
                      <Text style={vs.vsText}>VS</Text>
                      <View style={vs.player}>
                        <Avatar name={opponentName(b)} size={44} />
                        <Text style={vs.name} numberOfLines={1}>{opponentName(b)}</Text>
                        {b.opponent_score !== undefined && (
                          <Text style={vs.score}>{isChallenger(b) ? (b.opponent_score ?? 0) : (b.challenger_score ?? 0)}</Text>
                        )}
                      </View>
                    </View>
                    <Text style={vs.subject}>{b.subject} · {b.difficulty}</Text>
                    <View style={vs.playRow}>
                      <Text style={vs.playHint}>
                        {b.your_completed ? 'waiting for opponent · tap to check' : 'tap to play'}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={GOLD_M} />
                    </View>
                  </View>
                </View>
              </HapticTouchable>
            ))}
          </>
        )}

        {/* Sent */}
        {outgoing.length > 0 && (
          <>
            <Text style={s.section}>sent challenges</Text>
            {outgoing.map((b: any, i: number) => (
              <View key={b.id ?? i} style={card.wrap}>
                <SocialTileMaterial />
                <View style={[card.accent, { backgroundColor: DIM }]} />
                <View style={[card.body, card.rowOnly]}>
                  <Avatar name={opponentName(b)} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={card.name}>{opponentName(b)}</Text>
                    <Text style={card.meta}>{b.subject} · waiting…</Text>
                  </View>
                  <View style={card.pendingPill}><Text style={card.pendingText}>pending</Text></View>
                </View>
              </View>
            ))}
          </>
        )}

        {/* History */}
        {history.length > 0 && (
          <>
            <Text style={s.section}>history</Text>
            {history.map((b: any, i: number) => {
              const won = isChallenger(b)
                ? (b.challenger_score ?? 0) > (b.opponent_score ?? 0)
                : (b.opponent_score ?? 0) > (b.challenger_score ?? 0);
              const resultLabel = b.status === 'completed' ? (won ? 'won' : 'lost') : b.status;
              const resultColor = b.status === 'completed' ? (won ? GOLD_M : DIM) : DIM;
              return (
                <View key={b.id ?? i} style={[card.wrap, { opacity: 0.7 }]}>
                  <SocialTileMaterial />
                  <View style={[card.accent, { backgroundColor: DIM }]} />
                  <View style={[card.body, card.rowOnly]}>
                    <Avatar name={opponentName(b)} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={card.name}>{opponentName(b)}</Text>
                      <Text style={card.meta}>{b.subject} · {b.difficulty}</Text>
                    </View>
                    <View style={[card.resultPill, { borderColor: resultColor + '60', backgroundColor: resultColor + '18' }]}>
                      <Text style={[card.resultText, { color: resultColor }]}>{resultLabel}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Empty */}
        {battles.length === 0 && (
          <View style={empty.wrap}>
            <SocialTileMaterial />
            <LinearGradient colors={[rgbaFromHex(selectedTheme.accent, 0.14), rgbaFromHex(selectedTheme.panelAlt, 0.04)]} style={empty.icon}>
              <Ionicons name="game-controller-outline" size={44} color={GOLD_D} />
            </LinearGradient>
            <Text style={empty.title}>no battles yet</Text>
            <Text style={empty.hint}>challenge a friend to a quiz battle</Text>
            <HapticTouchable onPress={() => setShowCreate(true)} haptic="medium">
              <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={empty.btn}>
                <Text style={empty.btnText}>start a battle</Text>
              </LinearGradient>
            </HapticTouchable>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* Create Modal */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1 }}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
          <GeoBackground />
          <DotGrid />

          <View style={modal.header}>
            <View>
              <Text style={modal.title}>new challenge</Text>
              <Text style={modal.sub}>pick opponent & settings</Text>
            </View>
            <HapticTouchable onPress={() => setShowCreate(false)} style={modal.closeBtn} haptic="light">
              <Ionicons name="close" size={18} color={GOLD_M} />
            </HapticTouchable>
          </View>

          <ScrollView contentContainerStyle={{ width: '100%', maxWidth: Math.min(layout.contentMaxWidth, 680), alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

            <Text style={modal.label}>OPPONENT</Text>
            {friends.length === 0 ? (
              <Text style={[modal.label, { color: DIM, marginBottom: 24, letterSpacing: 0 }]}>add friends first</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {friends.map((f: any, i: number) => {
                    const sel = selectedFriend?.id === f.id;
                    return (
                      <HapticTouchable key={f.id ?? i} onPress={() => setSelectedFriend(f)} haptic="selection">
                        <View style={[modal.friendChip, sel && modal.friendChipSel]}>
                          <Avatar name={friendName(f)} size={30} />
                          <Text style={[modal.friendName, sel && { color: GOLD_XL }]}>{friendName(f)}</Text>
                        </View>
                      </HapticTouchable>
                    );
                  })}
                </View>
              </ScrollView>
            )}

            <Text style={modal.label}>SUBJECT</Text>
            <View style={modal.chipGrid}>
              {[...SUBJECTS, 'custom'].map(sub => {
                const isCustSel = sub === 'custom' && useCustom;
                const sel = sub === 'custom' ? isCustSel : (!useCustom && subject === sub);
                return (
                  <HapticTouchable
                    key={sub}
                    onPress={() => sub === 'custom' ? setUseCustom(true) : (setSubject(sub), setUseCustom(false))}
                    haptic="selection"
                  >
                    <View style={[modal.chip, sel && modal.chipSel]}>
                      <Text style={[modal.chipText, sel && modal.chipTextSel]}>{sub}</Text>
                    </View>
                  </HapticTouchable>
                );
              })}
            </View>
            {useCustom && (
              <TextInput
                style={modal.input}
                value={customSubject}
                onChangeText={setCustomSubject}
                placeholder="enter subject..."
                placeholderTextColor={DIM}
                autoFocus
              />
            )}

            <Text style={modal.label}>DIFFICULTY</Text>
            <View style={modal.diffRow}>
              {DIFFICULTIES.map(d => {
                const sel = difficulty === d;
                return (
                  <HapticTouchable key={d} style={{ flex: 1 }} onPress={() => setDifficulty(d)} haptic="selection">
                    <View style={[modal.diffBtn, sel && modal.diffBtnSel]}>
                      <Text style={[modal.diffText, sel && { color: GOLD_L }]}>{d}</Text>
                    </View>
                  </HapticTouchable>
                );
              })}
            </View>

            {selectedFriend && (
              <View style={modal.summary}>
                <LinearGradient colors={[rgbaFromHex(selectedTheme.accent, 0.14), rgbaFromHex(selectedTheme.panelAlt, 0.04)]} style={[StyleSheet.absoluteFillObject, { borderRadius: 14 }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={user.username} size={40} />
                  <Text style={modal.vsLabel}>VS</Text>
                  <Avatar name={friendName(selectedFriend)} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={modal.sumTitle}>{useCustom && customSubject ? customSubject : subject}</Text>
                    <Text style={modal.sumMeta}>{difficulty} · 10Q · 5 min</Text>
                  </View>
                </View>
              </View>
            )}

            <HapticTouchable onPress={doCreate} haptic="medium" style={{ opacity: (creating || !selectedFriend) ? 0.45 : 1 }}>
              <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={modal.launchBtn}>
                {creating
                  ? <ActivityIndicator color={INK} />
                  : <Text style={modal.launchText}>SEND CHALLENGE</Text>
                }
              </LinearGradient>
            </HapticTouchable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const ACCENT = theme.accent;
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 12 : 26);
  const DIM = theme.textSecondary;
  const SURFACE = '#0b0c0f';
  const BORDER = 'rgba(216,179,141,0.22)';
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1 },
    topBar: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: rgbaFromHex(SURFACE, 0.92), borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
    cta: { borderRadius: 12, paddingHorizontal: 15, paddingVertical: 10 },
    ctaText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: INK },
    hero: { width: '90%', minHeight: 180, maxWidth: layout.contentMaxWidth - 40, alignSelf: 'center', alignItems: 'flex-start', justifyContent: 'flex-end', padding: 20, gap: 6, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(216,179,141,0.22)' },
    heroGlow: { position: 'absolute', right: 18, top: 18, width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(216,179,141,0.22)', backgroundColor: 'rgba(216,179,141,0.08)' },
    heroTitle: { fontFamily: 'Inter_900Black', fontSize: 38, color: '#D8B38D', letterSpacing: -1.8 },
    heroSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, letterSpacing: 1 },
    divider: { height: 1, width: '100%', maxWidth: layout.contentMaxWidth - 40, alignSelf: 'center', marginLeft: 20, marginRight: 20, backgroundColor: BORDER },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingLeft: 20, paddingRight: 20, paddingTop: 16, gap: 8 },
    section: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: DIM, letterSpacing: 2.5, marginTop: 8, marginBottom: 2 },
  });
}

function createCardStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT = theme.accent;
  const DIM = theme.textSecondary;
  const SURFACE = '#0b0c0f';
  const BORDER = 'rgba(216,179,141,0.22)';
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return StyleSheet.create({
    wrap: { flexDirection: 'row', backgroundColor: SURFACE, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
    accent: { width: 3, backgroundColor: darkenColor(theme.accent, theme.isLight ? 12 : 26) },
    body: { flex: 1, padding: 14, gap: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rowOnly: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingTop: 14 },
    name: { fontFamily: 'Inter_700Bold', fontSize: 14, color: theme.accentHover },
    meta: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 2 },
    newBadge: { backgroundColor: rgbaFromHex(ACCENT, 0.14), borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: rgbaFromHex(ACCENT, 0.22) },
    newBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 9, color: ACCENT },
    actions: { flexDirection: 'row', gap: 8 },
    acceptBtn: { borderRadius: 10, paddingVertical: 10, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
    acceptText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: INK },
    declineBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
    declineText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: DIM },
    pendingPill: { backgroundColor: rgbaFromHex(theme.textSecondary, 0.14), borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: rgbaFromHex(theme.textSecondary, 0.22) },
    pendingText: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: DIM },
    resultPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
    resultText: { fontFamily: 'Inter_700Bold', fontSize: 9 },
  });
}

function createVersusStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
    player: { alignItems: 'center', gap: 4 },
    name: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.accentHover, maxWidth: 80 },
    score: { fontFamily: 'Inter_900Black', fontSize: 28, color: theme.accent },
    vsText: { fontFamily: 'Inter_900Black', fontSize: 18, color: darkenColor(theme.accent, theme.isLight ? 12 : 26) },
    subject: { fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.textSecondary, textAlign: 'center' },
    playRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
    playHint: { fontFamily: 'Inter_600SemiBold', fontSize: 10.5, color: theme.accent, letterSpacing: 0.3 },
  });
}

function createEmptyStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return StyleSheet.create({
    wrap: { minHeight: 230, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14, borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(216,179,141,0.22)', backgroundColor: '#0b0c0f' },
    icon: { width: 88, height: 88, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: rgbaFromHex(theme.accent, 0.22) },
    title: { fontFamily: 'Inter_900Black', fontSize: 18, color: darkenColor(theme.accent, theme.isLight ? 12 : 26) },
    hint: { fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.textSecondary },
    btn: { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
    btnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: INK },
  });
}

function createModalStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT = theme.accent;
  const DIM = theme.textSecondary;
  const SURFACE = theme.panel;
  const BORDER = theme.borderStrong;
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return StyleSheet.create({
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20 },
    title: { fontFamily: 'Inter_900Black', fontSize: 26, color: theme.accentHover, letterSpacing: -0.6 },
    sub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 3 },
    closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: rgbaFromHex(SURFACE, 0.92), borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
    label: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: DIM, letterSpacing: 2.5, marginBottom: 10 },
    friendChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: rgbaFromHex(SURFACE, 0.84), borderRadius: 12, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 12, paddingVertical: 8 },
    friendChipSel: { borderColor: rgbaFromHex(ACCENT, 0.34), backgroundColor: rgbaFromHex(ACCENT, 0.14) },
    friendName: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: rgbaFromHex(SURFACE, 0.84), borderRadius: 8, borderWidth: 1, borderColor: BORDER },
    chipSel: { borderColor: rgbaFromHex(ACCENT, 0.34), backgroundColor: rgbaFromHex(ACCENT, 0.14) },
    chipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM },
    chipTextSel: { color: theme.accentHover },
    input: { backgroundColor: rgbaFromHex(SURFACE, 0.84), borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 11, fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.accentHover, marginBottom: 20 },
    diffRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
    diffBtn: { alignItems: 'center', paddingVertical: 12, backgroundColor: rgbaFromHex(SURFACE, 0.84), borderRadius: 10, borderWidth: 1, borderColor: BORDER },
    diffBtnSel: { borderColor: rgbaFromHex(ACCENT, 0.34), backgroundColor: rgbaFromHex(ACCENT, 0.14) },
    diffText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM },
    summary: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: rgbaFromHex(ACCENT, 0.22), padding: 16, marginBottom: 20 },
    vsLabel: { fontFamily: 'Inter_900Black', fontSize: 16, color: darkenColor(theme.accent, theme.isLight ? 12 : 26) },
    sumTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: theme.accentHover },
    sumMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 2 },
    launchBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
    launchText: { fontFamily: 'Inter_900Black', fontSize: 15, color: INK, letterSpacing: 0.5 },
  });
}
