import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFonts, Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
  RefreshControl, TextInput, Modal, BackHandler, ViewStyle,
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
import PulsingSquares from '../../components/PulsingSquares';
import SectionSidebar, { SidebarItem } from '../../components/SectionSidebar';
import { cbTileShadow, cbTileBorder, CB_CARD_TOP, cbPlainPressedShadow } from '../../components/NeumorphicTexture';
import BattlePlayScreen from './BattlePlayScreen';
import { useAppTheme } from '../../contexts/ThemeContext';
import { darkenColor, rgbaFromHex } from '../../utils/theme';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';

const SUBJECTS     = ['Mathematics', 'Biology', 'Chemistry', 'Physics', 'History', 'Literature', 'Computer Science', 'Economics'];
// Matches web's actual values (QuizBattle.js) -- backend stores difficulty
// as free text with no validation, but web writes 'beginner'/'intermediate'/
// 'advanced', not 'easy'/'medium'/'hard', so mobile-created battles should
// read the same way as web-created ones in shared lists.
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const GAME_MODES: { key: string; label: string; desc: string; icon: string }[] = [
  { key: 'classic', label: 'Classic', desc: 'Most correct answers wins.', icon: 'trophy' },
  { key: 'speed', label: 'Speed Battle', desc: 'Fastest to finish all questions wins the tie.', icon: 'flash' },
  { key: 'blitz', label: 'Blitz', desc: '15 seconds per question. Think fast.', icon: 'flame' },
  { key: 'sudden_death', label: 'Sudden Death', desc: 'One wrong answer ends your run.', icon: 'shield' },
];
const TIME_LIMIT_OPTIONS = [
  { val: 120, label: '2 min', desc: 'Quick' },
  { val: 300, label: '5 min', desc: 'Standard' },
  { val: 600, label: '10 min', desc: 'Extended' },
  { val: 900, label: '15 min', desc: 'Marathon' },
];
// game_mode isn't a stored backend field -- its only real effect (on both
// clients) is deciding what time_limit_seconds gets sent.
function getTimeLimitForMode(mode: string, count: number, classicLimit: number): number {
  if (mode === 'blitz') return count * 15;
  if (mode === 'sudden_death') return count * 30;
  if (mode === 'classic') return classicLimit;
  return 300; // speed
}
type StatusFilter = 'pending' | 'active' | 'completed' | 'all';

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
  const modal = useMemo(() => createModalStyles(selectedTheme), [selectedTheme]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_400Regular, Inter_600SemiBold, Inter_700Bold });
  const [battles, setBattles]       = useState<any[]>([]);
  const [friends, setFriends]       = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating]     = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const [activeBattleId, setActiveBattleId] = useState<number | null>(null);
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [subject, setSubject]               = useState('Mathematics');
  const [difficulty, setDifficulty]         = useState('intermediate');
  const [customSubject, setCustomSubject]   = useState('');
  const [useCustom, setUseCustom]           = useState(false);
  const [questionCount, setQuestionCount]         = useState(10);
  const [questionCountText, setQuestionCountText] = useState('10');
  const [gameMode, setGameMode]                   = useState('classic');
  const [classicTimeLimit, setClassicTimeLimit]   = useState(300);
  const [createError, setCreateError]             = useState('');
  const GOLD_XL = selectedTheme.accent;
  const GOLD_L = selectedTheme.accentHover;
  const GOLD_M = selectedTheme.accent;
  const GOLD_D = darkenColor(selectedTheme.accent, selectedTheme.isLight ? 12 : 26);
  const DIM = selectedTheme.textSecondary;
  const INK = selectedTheme.isLight ? darkenColor(selectedTheme.accent, 34) : selectedTheme.bgPrimary;

  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  const exitActiveBattle = useCallback(() => {
    setActiveBattleId(null);
    load();
  }, [load]);

  useEffect(() => {
    if (activeBattleId === null) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      exitActiveBattle();
      return true;
    });
    return () => sub.remove();
  }, [activeBattleId, exitActiveBattle]);

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
    const sub = useCustom && customSubject.trim() ? customSubject.trim() : subject;
    if (!selectedFriend || !sub.trim()) {
      setCreateError('Please select a friend and enter a subject');
      return;
    }
    setCreateError('');
    setCreating(true);
    try {
      await createQuizBattle({
        challenger_id: user.username,
        opponent_id: selectedFriend.id,
        subject: sub,
        difficulty,
        question_count: questionCount,
        time_limit_seconds: getTimeLimitForMode(gameMode, questionCount, classicTimeLimit),
        game_mode: gameMode,
      });
      setShowCreate(false);
      setSelectedFriend(null);
      setGameMode('classic');
      setClassicTimeLimit(300);
      setQuestionCount(10);
      setQuestionCountText('10');
      load();
    } catch {
      setCreateError('Failed to create battle. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const isChallenger = (b: any) => !!b.is_challenger;
  const opponent     = (b: any) => b.opponent;
  const opponentName = (b: any) => opponent(b)?.username ?? opponent(b)?.first_name ?? opponent(b)?.name ?? '?';
  const friendName   = (f: any) => f.username || f.friend_username || f.name || '?';

  const query = search.trim().toLowerCase();
  const matchesSearch = (b: any) => !query
    || opponentName(b).toLowerCase().includes(query)
    || String(b.subject ?? '').toLowerCase().includes(query);

  const pending  = battles.filter((b: any) => b.status === 'pending' && !isChallenger(b)).filter(matchesSearch);
  const active   = battles.filter((b: any) => b.status === 'active').filter(matchesSearch);
  const history  = battles.filter((b: any) => ['completed', 'declined'].includes(b.status)).filter(matchesSearch);
  const outgoing = battles.filter((b: any) => b.status === 'pending' && isChallenger(b)).filter(matchesSearch);

  if (!fontsLoaded) return null;

  if (activeBattleId !== null) {
    return (
      <BattlePlayScreen
        user={user}
        battleId={activeBattleId}
        onExit={exitActiveBattle}
      />
    );
  }

  if (loading) return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 }}>
        <PulsingSquares />
        <Text style={s.loadingText}>LOADING BATTLES</Text>
      </View>
    </View>
  );

  const showPending = statusFilter === 'all' || statusFilter === 'pending';
  const showActive = statusFilter === 'all' || statusFilter === 'active';
  const showHistory = statusFilter === 'all' || statusFilter === 'completed';

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />

      {/* Same header construction as Solo Quiz / Flashcards: back chevron,
          large left-aligned title, hamburger. */}
      <View style={s.header}>
        <HapticTouchable onPress={onBack} style={{ marginRight: 12 }} haptic="selection">
          <Ionicons name="chevron-back" size={22} color={GOLD_L} />
        </HapticTouchable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>battles</Text>
        </View>
        <HapticTouchable onPress={() => setSidebarOpen(true)} haptic="selection" accessibilityLabel="Open menu">
          <Ionicons name="menu-outline" size={24} color={GOLD_L} />
        </HapticTouchable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD_D} />}
      >
        {/* Same construction as Flashcards' main page: hero CTA right below
            the header, then search, then a count row -- no repeated title
            text, the header already says "battles". */}
        <HapticTouchable onPress={() => setShowCreate(true)} haptic="medium" style={{ width: '100%' }}>
          <View style={s.heroBtn}>
            <Ionicons name="add" size={16} color={INK} />
            <Text style={s.heroBtnText}>Create Battle</Text>
          </View>
        </HapticTouchable>

        <View style={s.searchRow}>
          <View style={s.searchBar}>
            <Ionicons name="search-outline" size={15} color={GOLD_D} />
            <TextInput
              style={s.searchInput}
              placeholder="search battles..."
              placeholderTextColor={DIM}
              value={search}
              onChangeText={setSearch}
            />
            {!!search && (
              <HapticTouchable onPress={() => setSearch('')} haptic="selection">
                <Ionicons name="close-circle" size={16} color={GOLD_D} />
              </HapticTouchable>
            )}
          </View>
        </View>

        <View style={s.collectionHeader}>
          <Text style={s.collectionCount}>
            {statusFilter === 'all' ? `${active.length} active · ${pending.length} incoming` : `${statusFilter} battles`}
          </Text>
        </View>

        {/* Incoming */}
        {showPending && pending.length > 0 && (
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
        {showActive && active.length > 0 && (
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
                        {b.your_score !== undefined && b.your_score !== null && (
                          <Text style={vs.score}>{b.your_score ?? 0}</Text>
                        )}
                      </View>
                      <Text style={vs.vsText}>VS</Text>
                      <View style={vs.player}>
                        <Avatar name={opponentName(b)} size={44} />
                        <Text style={vs.name} numberOfLines={1}>{opponentName(b)}</Text>
                        {b.opponent_score !== undefined && b.opponent_score !== null && (
                          <Text style={vs.score}>{b.opponent_score ?? 0}</Text>
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
        {showPending && outgoing.length > 0 && (
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
        {showHistory && history.length > 0 && (
          <>
            <Text style={s.section}>history</Text>
            {history.map((b: any, i: number) => {
              const won = (b.your_score ?? 0) > (b.opponent_score ?? 0);
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

        {/* Empty -- same icon + capitalized-label treatment as Solo Quiz's
            "Past Quizzes" empty state, no card/container. */}
        {(showPending ? pending.length + outgoing.length : 0) + (showActive ? active.length : 0) + (showHistory ? history.length : 0) === 0 && (
          <View style={s.emptyWrap}>
            <Ionicons name="game-controller-outline" size={40} color={selectedTheme.textSecondary} />
            <Text style={s.loadingText}>
              {query ? 'NO MATCHING BATTLES' : statusFilter === 'all' ? 'NO BATTLES YET' : `NO ${statusFilter.toUpperCase()} BATTLES`}
            </Text>
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
            <HapticTouchable onPress={() => { setShowCreate(false); setCreateError(''); }} style={modal.closeBtn} haptic="light">
              <Ionicons name="close" size={18} color={GOLD_M} />
            </HapticTouchable>
          </View>

          <ScrollView contentContainerStyle={{ width: '100%', maxWidth: Math.min(layout.contentMaxWidth, 680), alignSelf: 'center', paddingHorizontal: 5, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

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

            <Text style={modal.label}>QUESTIONS (5–20)</Text>
            <TextInput
              style={modal.input}
              value={questionCountText}
              onChangeText={(t) => {
                const digits = t.replace(/[^0-9]/g, '');
                setQuestionCountText(digits);
                const n = parseInt(digits, 10);
                if (!Number.isNaN(n)) setQuestionCount(Math.min(20, Math.max(5, n)));
              }}
              onBlur={() => setQuestionCountText(String(questionCount))}
              placeholder="10"
              placeholderTextColor={DIM}
              keyboardType="number-pad"
              maxLength={2}
            />

            <Text style={modal.label}>GAME MODE</Text>
            <View style={{ gap: 8, marginBottom: 20 }}>
              {GAME_MODES.map(m => {
                const sel = gameMode === m.key;
                return (
                  <HapticTouchable key={m.key} style={[modal.gmCard, sel && modal.gmCardSel]} onPress={() => setGameMode(m.key)} haptic="selection">
                    <View style={[modal.gmIconWrap, sel && modal.gmIconWrapSel]}>
                      <Ionicons name={m.icon as any} size={18} color={sel ? INK : GOLD_L} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[modal.gmName, sel && { color: GOLD_L }]}>{m.label}</Text>
                      <Text style={modal.gmDesc}>{m.desc}</Text>
                    </View>
                  </HapticTouchable>
                );
              })}
            </View>

            {gameMode === 'classic' && (
              <>
                <Text style={modal.label}>TIME LIMIT</Text>
                <View style={modal.chipGrid}>
                  {TIME_LIMIT_OPTIONS.map(t => {
                    const sel = classicTimeLimit === t.val;
                    return (
                      <HapticTouchable key={t.val} onPress={() => setClassicTimeLimit(t.val)} haptic="selection">
                        <View style={[modal.chip, sel && modal.chipSel]}>
                          <Text style={[modal.chipText, sel && modal.chipTextSel]}>{t.label}</Text>
                        </View>
                      </HapticTouchable>
                    );
                  })}
                </View>
              </>
            )}

            {selectedFriend && (
              <View style={modal.summary}>
                <LinearGradient colors={[rgbaFromHex(selectedTheme.accent, 0.14), rgbaFromHex(selectedTheme.panelAlt, 0.04)]} style={[StyleSheet.absoluteFillObject, { borderRadius: 14 }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={user.username} size={40} />
                  <Text style={modal.vsLabel}>VS</Text>
                  <Avatar name={friendName(selectedFriend)} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={modal.sumTitle}>{useCustom && customSubject ? customSubject : subject}</Text>
                    <Text style={modal.sumMeta}>
                      {difficulty} · {questionCount}Q · {Math.round(getTimeLimitForMode(gameMode, questionCount, classicTimeLimit) / 60) || 1} min
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {!!createError && (
              <View style={modal.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color={selectedTheme.danger} />
                <Text style={modal.errorText}>{createError}</Text>
              </View>
            )}

            <HapticTouchable onPress={doCreate} haptic="medium" style={{ opacity: creating ? 0.7 : 1, width: '100%' }}>
              <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={modal.launchBtn}>
                {creating
                  ? <ActivityIndicator color={INK} />
                  : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={modal.launchText}>SEND CHALLENGE</Text>
                      <Ionicons name="chevron-forward" size={14} color={INK} />
                    </View>
                }
              </LinearGradient>
            </HapticTouchable>
          </ScrollView>
        </View>
      </Modal>

      <SectionSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        pageTitle="battles"
        items={BATTLES_SIDEBAR_ITEMS}
        activeKey={statusFilter}
        onSelect={(key) => { if (key === 'create') setShowCreate(true); else setStatusFilter(key as StatusFilter); }}
        footerLabel="Quiz Modes"
        onFooterPress={onBack}
      />
    </View>
  );
}

// ─── Hamburger sidebar — mirrors web QuizBattle.js's own sidebar: a
// "Create battle" lead action, a "Battle Workspace" group of status
// filters (Pending/Active/Completed/All), and a back-to-quiz-modes link.
// Same slide-in gradient panel construction as Solo Quiz's sidebar. ───────
const BATTLES_SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'create', label: 'Create Battle', icon: 'flash', iconOutline: 'flash-outline' },
  { key: 'pending', label: 'Pending battles', icon: 'time', iconOutline: 'time-outline' },
  { key: 'active', label: 'Active battles', icon: 'flame', iconOutline: 'flame-outline' },
  { key: 'completed', label: 'Completed battles', icon: 'trophy', iconOutline: 'trophy-outline' },
  { key: 'all', label: 'All battles', icon: 'albums', iconOutline: 'albums-outline' },
];

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const ACCENT = theme.accent;
  const ACCENT_DARK = darkenColor(theme.accent, theme.isLight ? 12 : 26);
  const DIM = theme.textSecondary;
  const SURFACE = '#0b0c0f';
  const BORDER = 'rgba(216,179,141,0.22)';
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1 },
    // Same header construction as Solo Quiz / Flashcards.
    header: {
      width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center',
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 10, paddingTop: 18, paddingBottom: 12,
    },
    title: { fontFamily: 'Inter_900Black', fontSize: 32, color: '#D8B38D', letterSpacing: -0.8 },
    loadingText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: DIM, letterSpacing: 3, textTransform: 'uppercase' },
    // Same construction as Flashcards' main-page "Generate" hero + search +
    // collection-count row (generateHero/searchRow/collectionHeader).
    heroBtn: {
      width: '100%', minHeight: 54, borderRadius: 18, marginTop: 4, marginBottom: 18,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
      backgroundColor: ACCENT, overflow: 'hidden', boxShadow: cbTileShadow(0.12),
    } as ViewStyle,
    heroBtnText: { fontFamily: 'Inter_900Black', fontSize: 12, color: INK, letterSpacing: 4, textTransform: 'uppercase' },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    searchBar: {
      flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: rgbaFromHex(SURFACE, 0.96), borderRadius: 14, borderWidth: 1, borderColor: BORDER,
      paddingHorizontal: 14,
    } as ViewStyle,
    searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.accentHover },
    collectionHeader: { minHeight: 24, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    collectionCount: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM, letterSpacing: 0.3, textTransform: 'capitalize' },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingLeft: 5, paddingRight: 5, paddingTop: 4, gap: 8 },
    section: { fontFamily: 'Inter_600SemiBold', fontSize: 9, color: DIM, letterSpacing: 2.5, marginTop: 8, marginBottom: 2 },
    emptyWrap: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 40 },
  });
}

function createCardStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme']) {
  const ACCENT = theme.accent;
  const DIM = theme.textSecondary;
  const SURFACE = '#0b0c0f';
  const BORDER = 'rgba(216,179,141,0.22)';
  const INK = theme.isLight ? darkenColor(theme.accent, 34) : theme.bgPrimary;
  return StyleSheet.create({
    wrap: { flexDirection: 'row', backgroundColor: SURFACE, borderRadius: 18, overflow: 'hidden', boxShadow: cbTileShadow(0.06), ...cbTileBorder(0.14) },
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
    // Same "pressed into the surface" neumorphic inset as the login screen.
    input: {
      backgroundColor: CB_CARD_TOP, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 14,
      fontFamily: 'Inter_400Regular', fontSize: 14, color: theme.accentHover, marginBottom: 20,
      boxShadow: cbPlainPressedShadow(),
    } as ViewStyle,
    diffRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
    diffBtn: { alignItems: 'center', paddingVertical: 12, backgroundColor: rgbaFromHex(SURFACE, 0.84), borderRadius: 10, borderWidth: 1, borderColor: BORDER },
    diffBtnSel: { borderColor: rgbaFromHex(ACCENT, 0.34), backgroundColor: rgbaFromHex(ACCENT, 0.14) },
    diffText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: DIM },
    summary: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: rgbaFromHex(ACCENT, 0.22), padding: 16, marginBottom: 20 },
    vsLabel: { fontFamily: 'Inter_900Black', fontSize: 16, color: darkenColor(theme.accent, theme.isLight ? 12 : 26) },
    sumTitle: { fontFamily: 'Inter_700Bold', fontSize: 14, color: theme.accentHover },
    sumMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 2 },
    launchBtn: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
    launchText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: INK, textTransform: 'uppercase', letterSpacing: 2 },

    gmCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: rgbaFromHex(SURFACE, 0.84), borderRadius: 14, borderWidth: 1, borderColor: BORDER, padding: 12 },
    gmCardSel: { borderColor: rgbaFromHex(ACCENT, 0.4), backgroundColor: rgbaFromHex(ACCENT, 0.12) },
    gmIconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: rgbaFromHex(ACCENT, 0.1) },
    gmIconWrapSel: { backgroundColor: theme.accent },
    gmName: { fontFamily: 'Inter_700Bold', fontSize: 13.5, color: theme.textPrimary },
    gmDesc: { fontFamily: 'Inter_400Regular', fontSize: 11, color: DIM, marginTop: 2, lineHeight: 15 },

    errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: rgbaFromHex(theme.danger, 0.3), backgroundColor: rgbaFromHex(theme.danger, 0.1), padding: 12, marginBottom: 16 },
    errorText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, color: theme.danger },
  });
}

