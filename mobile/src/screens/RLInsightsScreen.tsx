import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthUser } from '../services/auth';
import { getRlStrategyPerformance, RLStrategyPerformance, RLStrategyStat } from '../services/api';
import GeoBackground from '../components/GeoBackground';
import HapticTouchable from '../components/HapticTouchable';
import { cbTileShadow, cbTileBorder } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

type Props = { user: AuthUser; onBack: () => void };
type Tab = 'overview' | 'strategies' | 'policy' | 'curve';

const STRATEGY_LABELS: Record<string, string> = {
  GUIDED_DISCOVERY: 'Guided Discovery',
  DIRECT_EXPLANATION: 'Direct Explanation',
  WORKED_EXAMPLE: 'Worked Example',
  ANALOGICAL: 'Analogical',
  SCAFFOLDED: 'Scaffolded',
  REASSURANCE_FIRST: 'Reassurance First',
  CHALLENGE_PUSH: 'Challenge Push',
  REANCHOR: 'Reanchor',
  METACOGNITIVE: 'Metacognitive',
};

const STRATEGY_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  GUIDED_DISCOVERY: 'search-outline',
  DIRECT_EXPLANATION: 'book-outline',
  WORKED_EXAMPLE: 'create-outline',
  ANALOGICAL: 'git-network-outline',
  SCAFFOLDED: 'layers-outline',
  REASSURANCE_FIRST: 'heart-outline',
  CHALLENGE_PUSH: 'rocket-outline',
  REANCHOR: 'compass-outline',
  METACOGNITIVE: 'glasses-outline',
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'strategies', label: 'Strategies' },
  { id: 'policy', label: 'Policy' },
  { id: 'curve', label: 'Curve' },
];

export default function RLInsightsScreen({ user, onBack }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => createStyles(selectedTheme, layout, insets.top), [selectedTheme, layout, insets.top]);
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_900Black });

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<RLStrategyPerformance | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getRlStrategyPerformance(user.username));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.username]);

  useEffect(() => { load(); }, [load]);

  if (!fontsLoaded) return null;

  const totalInteractions = data?.overall_stats?.total_interactions_with_rl ?? 0;
  const hasEnoughData = totalInteractions >= 10;
  const bestStrategy = data?.overall_stats?.most_effective_strategy;
  const improvementPct = Math.round((data?.overall_stats?.improvement_vs_rules ?? 0) * 1000) / 10;
  const avgReward = Math.round((data?.overall_stats?.avg_reward_all_time ?? 0) * 100);
  const strategiesUsed = (data?.strategy_stats ?? []).filter((item) => item.total_pulls > 0).sort((a, b) => b.avg_reward - a.avg_reward);
  const topPolicy = data?.top_policy ?? [];
  const notableInsights = topPolicy.filter((p) => p.pulls >= 5).slice(0, 5);
  const weeklyRewards = data?.learning_curve?.avg_reward_by_week ?? [];

  return (
    <View style={s.root}>
      <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} style={StyleSheet.absoluteFillObject} />
      <GeoBackground />
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={selectedTheme.accent} />}
      >
        <View style={s.header}>
          <HapticTouchable style={s.iconBtn} onPress={onBack} haptic="light" accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={20} color={selectedTheme.accentHover} />
          </HapticTouchable>
          <View style={s.headerCopy}>
            <Text style={s.kicker}>REINFORCEMENT LEARNING</Text>
            <Text style={s.title}>how you learn best</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={selectedTheme.accent} size="large" style={{ marginTop: 80 }} />
        ) : !data || totalInteractions === 0 ? (
          <View style={s.empty}>
            <Ionicons name="hardware-chip-outline" size={32} color={selectedTheme.accent} />
            <Text style={s.emptyTitle}>your AI tutor is still learning about you</Text>
            <Text style={s.emptyText}>keep chatting to unlock your personalized learning profile</Text>
          </View>
        ) : (
          <>
            <View style={s.badgeRow}>
              <View style={s.badge}><Text style={s.badgeText}>{totalInteractions} interactions tracked</Text></View>
            </View>

            {!hasEnoughData ? (
              <View style={s.warmup}>
                <Ionicons name="flash-outline" size={14} color={selectedTheme.accentHover} />
                <Text style={s.warmupText}>your AI tutor needs ~10 conversations to learn your patterns. keep going!</Text>
              </View>
            ) : null}

            <View style={s.tabRow}>
              {TABS.map((t) => (
                <HapticTouchable key={t.id} style={[s.tabBtn, tab === t.id && s.tabBtnActive]} onPress={() => setTab(t.id)} haptic="selection">
                  <Text style={[s.tabText, tab === t.id && s.tabTextActive]}>{t.label}</Text>
                </HapticTouchable>
              ))}
            </View>

            {tab === 'overview' && (
              <>
                <View style={s.summaryRow}>
                  <Summary icon="locate-outline" label="most effective style" value={bestStrategy ? (STRATEGY_LABELS[bestStrategy] || bestStrategy) : '—'} styles={s} />
                  <Summary
                    icon="trending-up-outline"
                    label="vs rule-based"
                    value={`${improvementPct >= 0 ? '+' : ''}${improvementPct}%`}
                    valueColor={improvementPct >= 0 ? selectedTheme.success : selectedTheme.danger}
                    styles={s}
                  />
                  <Summary icon="bar-chart-outline" label="avg reward score" value={String(avgReward)} styles={s} />
                </View>

                {notableInsights.length > 0 ? (
                  <View style={s.card}>
                    <Text style={s.cardTitle}>what your tutor has figured out</Text>
                    {notableInsights.map((p, i) => (
                      <View key={i} style={s.insightRow}>
                        <Ionicons name={STRATEGY_ICONS[p.best_strategy] || 'book-outline'} size={16} color={selectedTheme.accent} />
                        <View style={{ flex: 1 }}>
                          <Text style={s.insightState} numberOfLines={1}>{p.state_description}</Text>
                          <Text style={s.insightStrategy}>→ {STRATEGY_LABELS[p.best_strategy] || p.best_strategy}</Text>
                        </View>
                        <ConfidenceBar value={p.confidence} theme={selectedTheme} />
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            )}

            {tab === 'strategies' && (
              <View style={{ gap: 8 }}>
                {strategiesUsed.length === 0 ? (
                  <Text style={s.emptyInline}>no strategy data yet.</Text>
                ) : strategiesUsed.map((strat) => (
                  <StrategyCard
                    key={strat.strategy_id}
                    strat={strat}
                    expanded={expandedStrategy === strat.strategy_id}
                    onToggle={() => setExpandedStrategy((cur) => (cur === strat.strategy_id ? null : strat.strategy_id))}
                    styles={s}
                    theme={selectedTheme}
                  />
                ))}
              </View>
            )}

            {tab === 'policy' && (
              <View style={s.card}>
                {topPolicy.length === 0 ? (
                  <Text style={s.emptyInline}>not enough data yet. the AI learns after ~20 interactions.</Text>
                ) : topPolicy.map((p, i) => (
                  <View key={i} style={[s.policyRow, i < topPolicy.length - 1 && s.policyRowDivider]}>
                    <Text style={s.policyState} numberOfLines={1}>{p.state_description}</Text>
                    <View style={s.policyStratWrap}>
                      <Ionicons name={STRATEGY_ICONS[p.best_strategy] || 'book-outline'} size={13} color={selectedTheme.accent} />
                      <Text style={s.policyStrat}>{STRATEGY_LABELS[p.best_strategy] || p.best_strategy}</Text>
                    </View>
                    <Text style={s.policyPulls}>{p.pulls}×</Text>
                  </View>
                ))}
              </View>
            )}

            {tab === 'curve' && (
              <View style={s.card}>
                {weeklyRewards.length === 0 ? (
                  <Text style={s.emptyInline}>no weekly data yet — keep learning!</Text>
                ) : (
                  <>
                    <View style={s.chartRow}>
                      {weeklyRewards.map((wk, i) => {
                        const pct = Math.max(6, Math.min(100, ((wk.avg_reward + 1) / 2) * 100));
                        const color = wk.avg_reward > 0.1 ? selectedTheme.accentHover : selectedTheme.danger;
                        const weekLabel = wk.week.split('-W')[1] ? `W${wk.week.split('-W')[1]}` : wk.week;
                        return (
                          <View key={i} style={s.chartBarWrap}>
                            <View style={s.chartBarTrack}>
                              <View style={[s.chartBar, { height: `${pct}%`, backgroundColor: color }]} />
                            </View>
                            <Text style={s.chartBarLbl}>{weekLabel}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <Text style={s.curveFoot}>
                      exploration rate: {Math.round((data?.learning_curve.exploration_rate ?? 0) * 1000) / 10}% (decreases as the AI learns you)
                    </Text>
                  </>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Summary({ icon, label, value, valueColor, styles }: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  valueColor?: string;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.summaryCard}>
      <Ionicons name={icon} size={15} color={styles.iconColor.color} />
      <Text style={[styles.summaryValue, valueColor ? { color: valueColor } : null]} numberOfLines={1}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function ConfidenceBar({ value, theme }: { value: number; theme: ReturnType<typeof useAppTheme>['selectedTheme'] }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View style={{ width: 54, gap: 3, alignItems: 'flex-end' }}>
      <View style={{ width: 54, height: 4, borderRadius: 2, backgroundColor: rgbaFromHex(theme.accent, 0.14), overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: theme.accentHover, borderRadius: 2 }} />
      </View>
      <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 9, color: theme.accentHover }}>{pct}%</Text>
    </View>
  );
}

function StrategyCard({ strat, expanded, onToggle, styles, theme }: {
  strat: RLStrategyStat;
  expanded: boolean;
  onToggle: () => void;
  styles: ReturnType<typeof createStyles>;
  theme: ReturnType<typeof useAppTheme>['selectedTheme'];
}) {
  const rewardPct = Math.round(strat.avg_reward * 100);
  const rewardColor = strat.avg_reward > 0.2 ? theme.success : strat.avg_reward > -0.1 ? theme.accentHover : theme.danger;
  return (
    <View style={styles.strategyCard}>
      <HapticTouchable style={styles.strategyBtn} onPress={onToggle} haptic="selection">
        <Ionicons name={STRATEGY_ICONS[strat.strategy_id] || 'book-outline'} size={16} color={theme.accent} />
        <Text style={styles.strategyName} numberOfLines={1}>{STRATEGY_LABELS[strat.strategy_id] || strat.strategy_id}</Text>
        <Text style={styles.strategyPulls}>{strat.total_pulls} uses</Text>
        <Text style={[styles.strategyReward, { color: rewardColor }]}>{rewardPct >= 0 ? '+' : ''}{rewardPct}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textSecondary} />
      </HapticTouchable>
      {expanded ? (
        <View style={styles.strategyDetail}>
          <View style={styles.strategyStatsRow}>
            <View style={styles.strategyStat}><Text style={styles.strategyStatLbl}>win rate</Text><Text style={styles.strategyStatVal}>{Math.round(strat.win_rate * 100)}%</Text></View>
            <View style={styles.strategyStat}><Text style={styles.strategyStatLbl}>avg reward</Text><Text style={styles.strategyStatVal}>{rewardPct >= 0 ? '+' : ''}{rewardPct}</Text></View>
          </View>
          {strat.best_states.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={styles.statesLbl}>works best when</Text>
              <View style={styles.chipRow}>
                {strat.best_states.map((state, i) => <View key={i} style={styles.chipGood}><Text style={styles.chipGoodText}>{state}</Text></View>)}
              </View>
            </View>
          ) : null}
          {strat.worst_states.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={styles.statesLbl}>less effective when</Text>
              <View style={styles.chipRow}>
                {strat.worst_states.map((state, i) => <View key={i} style={styles.chipBad}><Text style={styles.chipBadText}>{state}</Text></View>)}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>, topInset: number) {
  const surface = theme.panel;
  const border = rgbaFromHex(theme.accentHover, theme.isLight ? 0.18 : 0.2);
  const accentInk = theme.isLight ? theme.accent : theme.bgPrimary;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: theme.bgPrimary },
    scroll: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: 4, paddingTop: Math.max(topInset + 10, 50), paddingBottom: 110, gap: 12 },
    header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconBtn: { width: 42, height: 42, borderRadius: 15, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.82), alignItems: 'center', justifyContent: 'center' },
    headerCopy: { flex: 1 },
    kicker: { fontFamily: 'Inter_700Bold', color: theme.accent, fontSize: 10, letterSpacing: 1.7 },
    title: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 26, lineHeight: 30, letterSpacing: -0.6 },

    empty: { alignItems: 'center', gap: 8, paddingVertical: 60, paddingHorizontal: 20 },
    emptyTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 15, textAlign: 'center', marginTop: 6 },
    emptyText: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, textAlign: 'center' },
    emptyInline: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 12, textAlign: 'center', paddingVertical: 20 },

    badgeRow: { flexDirection: 'row' },
    badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: rgbaFromHex(theme.accent, theme.isLight ? 0.12 : 0.16) },
    badgeText: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 10.5 },

    warmup: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, backgroundColor: rgbaFromHex(surface, 0.9), paddingHorizontal: 12, paddingVertical: 10, overflow: 'hidden', boxShadow: cbTileShadow(0.04), ...cbTileBorder(0.12) },
    warmupText: { flex: 1, fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, lineHeight: 16 },

    tabRow: { flexDirection: 'row', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.7), padding: 4 },
    tabBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
    tabBtnActive: { backgroundColor: theme.accent },
    tabText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: theme.textSecondary },
    tabTextActive: { color: accentInk },

    summaryRow: { flexDirection: 'row', gap: 8 },
    summaryCard: { flex: 1, borderRadius: 16, backgroundColor: rgbaFromHex(surface, 0.9), paddingVertical: 14, paddingHorizontal: 8, alignItems: 'center', gap: 4, overflow: 'hidden', boxShadow: cbTileShadow(0.05), ...cbTileBorder(0.13) },
    summaryValue: { fontFamily: 'Inter_900Black', color: theme.accentHover, fontSize: 14, textAlign: 'center' },
    summaryLabel: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'center' },
    iconColor: { color: theme.accent },

    card: { borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: rgbaFromHex(surface, 0.9), padding: 16, gap: 12, boxShadow: cbTileShadow(0.06) } as ViewStyle,
    cardTitle: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 12.5 },
    insightRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    insightState: { fontFamily: 'Inter_600SemiBold', color: theme.textPrimary, fontSize: 12 },
    insightStrategy: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 11, marginTop: 1 },

    strategyCard: { borderRadius: 18, backgroundColor: rgbaFromHex(surface, 0.9), overflow: 'hidden', boxShadow: cbTileShadow(0.06), ...cbTileBorder(0.14) } as ViewStyle,
    strategyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 13 },
    strategyName: { flex: 1, fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 12.5 },
    strategyPulls: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10 },
    strategyReward: { fontFamily: 'Inter_900Black', fontSize: 12, width: 34, textAlign: 'right' },
    strategyDetail: { paddingHorizontal: 14, paddingBottom: 14, gap: 10, borderTopWidth: 1, borderTopColor: border, paddingTop: 10 },
    strategyStatsRow: { flexDirection: 'row', gap: 16 },
    strategyStat: { gap: 2 },
    strategyStatLbl: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10 },
    strategyStatVal: { fontFamily: 'Inter_700Bold', color: theme.textPrimary, fontSize: 13 },
    statesLbl: { fontFamily: 'Inter_600SemiBold', color: theme.textSecondary, fontSize: 9.5, letterSpacing: 0.4, textTransform: 'uppercase' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chipGood: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: rgbaFromHex(theme.success, 0.14) },
    chipGoodText: { fontFamily: 'Inter_600SemiBold', color: theme.success, fontSize: 10 },
    chipBad: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: rgbaFromHex(theme.danger, 0.12) },
    chipBadText: { fontFamily: 'Inter_600SemiBold', color: theme.danger, fontSize: 10 },

    policyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
    policyRowDivider: { borderBottomWidth: 1, borderBottomColor: border },
    policyState: { flex: 1, fontFamily: 'Inter_600SemiBold', color: theme.textPrimary, fontSize: 11.5 },
    policyStratWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    policyStrat: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10.5 },
    policyPulls: { fontFamily: 'Inter_700Bold', color: theme.accentHover, fontSize: 10.5, width: 30, textAlign: 'right' },

    chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 100 },
    chartBarWrap: { flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
    chartBarTrack: { width: '100%', flex: 1, justifyContent: 'flex-end' },
    chartBar: { width: '100%', borderRadius: 4, minHeight: 4 },
    chartBarLbl: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10.5 },
    curveFoot: { fontFamily: 'Inter_400Regular', color: theme.textSecondary, fontSize: 10.5, textAlign: 'center', marginTop: 4 },
  });
}
