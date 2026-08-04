import { useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert, ActivityIndicator, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFonts, Inter_900Black, Inter_700Bold, Inter_600SemiBold, Inter_400Regular } from '@expo-google-fonts/inter';

import { AuthUser } from '../services/auth';
import { saveCompleteProfile, setWeeklyGoals } from '../services/api';
import HapticTouchable from '../components/HapticTouchable';
import GeoBackground from '../components/GeoBackground';
import NeumorphicTexture, { cbTileCardGradient, cbTileShadowExact, cbTileBorder, cbTileShadow } from '../components/NeumorphicTexture';
import { useAppTheme } from '../contexts/ThemeContext';
import { rgbaFromHex } from '../utils/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';

const COMMON_SUBJECTS = [
  'Computer Science', 'Mathematics', 'Physics', 'Chemistry', 'Biology',
  'Engineering', 'Business Administration', 'Economics', 'Psychology', 'Sociology',
  'English Literature', 'History', 'Political Science', 'Philosophy', 'Art History',
  'Music', 'Theater', 'Communications', 'Journalism', 'Marketing',
  'Accounting', 'Finance', 'Statistics', 'Data Science', 'Information Technology',
  'Mechanical Engineering', 'Electrical Engineering', 'Civil Engineering', 'Chemical Engineering',
  'Biochemistry', 'Molecular Biology', 'Genetics', 'Neuroscience', 'Medicine',
  'Nursing', 'Public Health', 'Environmental Science', 'Geography', 'Anthropology',
  'Architecture', 'Graphic Design', 'Film Studies', 'Creative Writing', 'Linguistics',
  'Foreign Languages', 'Spanish', 'French', 'German', 'Chinese', 'Japanese',
  'Calculus', 'Algebra', 'Geometry', 'Trigonometry', 'Linear Algebra',
  'Organic Chemistry', 'Physical Chemistry', 'Analytical Chemistry', 'Inorganic Chemistry',
  'Quantum Physics', 'Thermodynamics', 'Electromagnetism', 'Optics', 'Mechanics',
  'Cell Biology', 'Ecology', 'Microbiology', 'Zoology', 'Botany',
  'Software Engineering', 'Web Development', 'Mobile Development', 'Artificial Intelligence',
  'Machine Learning', 'Cybersecurity', 'Database Management', 'Network Administration',
  'Game Development', 'UI/UX Design', 'Digital Marketing', 'Social Media Marketing',
  'Human Resources', 'Operations Management', 'Supply Chain Management', 'Project Management',
  'Law', 'Criminal Justice', 'International Relations', 'Education', 'Special Education',
];

const LEARNING_STAGES = [
  'High School Student',
  'Undergraduate Student',
  'Graduate Student',
  'Professional / Working',
  'Self-Learner / Hobbyist',
  'Career Changer',
  'Lifelong Learner',
];

const BRAINWAVE_GOALS: { value: string; label: string }[] = [
  { value: 'exam_prep', label: 'Ace my exams' },
  { value: 'homework_help', label: 'Get homework help' },
  { value: 'concept_mastery', label: 'Master difficult concepts' },
  { value: 'skill_building', label: 'Build new skills' },
  { value: 'career_prep', label: 'Prepare for my career' },
  { value: 'curiosity', label: 'Learn out of curiosity' },
];

type WeeklyPresetKey = 'light' | 'regular' | 'intensive';
const WEEKLY_PRESETS: Record<WeeklyPresetKey, { chat: number; note: number; flashcard: number; quiz: number; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  light:     { chat: 5,  note: 3,  flashcard: 10, quiz: 2,  label: 'Light',     icon: 'leaf-outline' },
  regular:   { chat: 10, note: 5,  flashcard: 20, quiz: 5,  label: 'Regular',   icon: 'flame-outline' },
  intensive: { chat: 20, note: 10, flashcard: 40, quiz: 10, label: 'Intensive', icon: 'rocket-outline' },
};

type PreferenceQuestion = {
  id: 'q1' | 'q2' | 'q3' | 'q4' | 'q5';
  question: string;
  options: { value: string; text: string }[];
};

const PREFERENCE_QUESTIONS: PreferenceQuestion[] = [
  {
    id: 'q1',
    question: "When you're learning something new, which approach helps you understand fastest?",
    options: [
      { value: 'A', text: 'Step-by-step explanation with clear logic and definitions' },
      { value: 'B', text: 'Worked examples first, then I infer the rule/pattern' },
      { value: 'C', text: 'Visuals (diagrams/mind maps) showing relationships' },
      { value: 'D', text: 'Real-world applications/case studies that show "why it matters"' },
    ],
  },
  {
    id: 'q2',
    question: 'Which study method improves your retention the most over a week?',
    options: [
      { value: 'A', text: 'Active recall (self-quizzing without notes)' },
      { value: 'B', text: 'Spaced repetition (reviewing over multiple days)' },
      { value: 'C', text: 'Rewriting/organizing notes into a clean structure' },
      { value: 'D', text: 'Teaching/explaining the concept to someone (or to myself)' },
    ],
  },
  {
    id: 'q3',
    question: 'What type of practice gives you the biggest score jump in exams?',
    options: [
      { value: 'A', text: 'Topic-wise practice sets (one concept at a time)' },
      { value: 'B', text: 'Mixed practice (questions from different topics in one set)' },
      { value: 'C', text: 'Timed mocks under exam conditions' },
      { value: 'D', text: 'Error-focused drills (repeat only what I get wrong)' },
    ],
  },
  {
    id: 'q4',
    question: 'When you make mistakes, what feedback style helps you improve quickest?',
    options: [
      { value: 'A', text: 'Exact step where I went wrong + corrected steps' },
      { value: 'B', text: 'Hints that guide me to the answer without revealing it' },
      { value: 'C', text: 'A "why this works" explanation + a similar follow-up question' },
      { value: 'D', text: 'A summary of my common mistake patterns + a targeted plan' },
    ],
  },
  {
    id: 'q5',
    question: 'How should your learning path be structured to keep you progressing?',
    options: [
      { value: 'A', text: 'Strict linear path: must master basics before moving on' },
      { value: 'B', text: 'Adaptive path: difficulty adjusts based on my quiz performance' },
      { value: 'C', text: 'Goal-based path: jump to what I need for an exam/career goal' },
      { value: 'D', text: 'Concept-map path: I choose nodes, but prerequisites are recommended' },
    ],
  },
];

type Step = 'welcome' | 'form' | 'preferences' | 'complete';
type Answers = {
  learningStage: string;
  subjects: string[];
  mainSubject: string;
  brainwaveGoal: string;
  learningPreferences: Record<string, string[]>;
};

type Props = { user: AuthUser; onDone: () => void };

export default function OnboardingQuizScreen({ user, onDone }: Props) {
  const { selectedTheme } = useAppTheme();
  const layout = useResponsiveLayout();
  const s = useMemo(() => createStyles(selectedTheme, layout), [selectedTheme, layout]);
  const [fontsLoaded] = useFonts({ Inter_900Black, Inter_700Bold, Inter_600SemiBold, Inter_400Regular });

  const [step, setStep] = useState<Step>('welcome');
  const [answers, setAnswers] = useState<Answers>({
    learningStage: '',
    subjects: [],
    mainSubject: '',
    brainwaveGoal: '',
    learningPreferences: { q1: [], q2: [], q3: [], q4: [], q5: [] },
  });
  const [weeklyPreset, setWeeklyPreset] = useState<WeeklyPresetKey>('regular');
  const [subjectInput, setSubjectInput] = useState('');
  const [saving, setSaving] = useState(false);

  if (!fontsLoaded) return null;

  const userId = user.username;

  const mainSubjectSuggestions = answers.mainSubject.length >= 2
    ? COMMON_SUBJECTS.filter(sub => sub.toLowerCase().includes(answers.mainSubject.toLowerCase())).slice(0, 6)
    : [];
  const otherSubjectSuggestions = subjectInput.length >= 2
    ? COMMON_SUBJECTS.filter(sub =>
        sub.toLowerCase().includes(subjectInput.toLowerCase()) &&
        !answers.subjects.includes(sub) &&
        sub !== answers.mainSubject
      ).slice(0, 6)
    : [];

  const addSubject = (subject: string) => {
    setAnswers(prev => (prev.subjects.includes(subject) ? prev : { ...prev, subjects: [...prev.subjects, subject] }));
    setSubjectInput('');
  };
  const removeSubject = (subject: string) => {
    setAnswers(prev => ({ ...prev, subjects: prev.subjects.filter(s => s !== subject) }));
  };

  const isProfileValid = Boolean(answers.learningStage && answers.subjects.length > 0 && answers.mainSubject && answers.brainwaveGoal);
  const isPreferencesValid = PREFERENCE_QUESTIONS.every(q => answers.learningPreferences[q.id]?.length > 0);

  const togglePreference = (questionId: string, value: string) => {
    setAnswers(prev => {
      const current = prev.learningPreferences[questionId] || [];
      const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, learningPreferences: { ...prev.learningPreferences, [questionId]: next } };
    });
  };

  const confirmSkip = () => {
    Alert.alert(
      'Skip the quiz?',
      'Taking this quiz helps us understand your learning style and personalize your experience. You can always take it later from your profile.',
      [
        { text: 'Take Quiz', style: 'cancel' },
        {
          text: 'Skip Anyway',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await saveCompleteProfile({
                user_id: userId,
                learning_stage: answers.learningStage,
                preferred_subjects: answers.subjects,
                main_subject: answers.mainSubject,
                brainwave_goal: answers.brainwaveGoal,
                quiz_completed: false,
                quiz_skipped: true,
              });
            } catch {
              // silenced -- still let the user in even if the save failed
            } finally {
              setSaving(false);
              onDone();
            }
          },
        },
      ],
    );
  };

  const handleSubmit = async () => {
    if (!isPreferencesValid) return;
    setSaving(true);
    try {
      const preset = WEEKLY_PRESETS[weeklyPreset];
      await saveCompleteProfile({
        user_id: userId,
        learning_stage: answers.learningStage,
        preferred_subjects: answers.subjects,
        main_subject: answers.mainSubject,
        brainwave_goal: answers.brainwaveGoal,
        learning_preferences: answers.learningPreferences,
        quiz_completed: true,
        quiz_skipped: false,
      });
      try {
        await setWeeklyGoals(userId, preset);
      } catch {
        // silenced -- weekly goals are a nice-to-have, don't block onboarding on it
      }
      setStep('complete');
      setTimeout(onDone, 1800);
    } catch (error) {
      Alert.alert('Could not save profile', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const Panel = ({ children }: { children: React.ReactNode }) => (
    <View style={s.panel}>
      <NeumorphicTexture
        grainOpacity={0.42}
        grainVariant="skia"
        baseFrequency={0.7}
        gradientColors={cbTileCardGradient.colors}
        gradientStart={cbTileCardGradient.start}
        gradientEnd={cbTileCardGradient.end}
      />
      {children}
    </View>
  );

  if (step === 'welcome') {
    return (
      <SafeAreaView style={s.safe}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
          <GeoBackground />
        </View>
        <View style={s.welcomeWrap}>
          <Panel>
            <Text style={s.heroWord}>cerbyl</Text>
            <Text style={s.heroTagline}>learning unified</Text>
            <Text style={s.welcomeBody}>
              Cerbyl adapts to your unique learning style, helping you master any subject with personalized guidance and support.
            </Text>

            <HapticTouchable style={s.btnWrap} onPress={() => setStep('form')} activeOpacity={0.88} haptic="medium">
              <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={s.btn}>
                <Ionicons name="play" size={16} color={selectedTheme.bgPrimary} />
                <Text style={s.btnText}>take the quiz</Text>
              </LinearGradient>
            </HapticTouchable>
            <Text style={s.btnSub}>2 minutes · personalizes everything</Text>

            <HapticTouchable style={s.skipBtn} onPress={confirmSkip} activeOpacity={0.8} disabled={saving} haptic="selection">
              <Ionicons name="play-skip-forward-outline" size={14} color={selectedTheme.textSecondary} />
              <Text style={s.skipText}>skip for now</Text>
            </HapticTouchable>
          </Panel>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'complete') {
    return (
      <SafeAreaView style={s.safe}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
          <GeoBackground />
        </View>
        <View style={s.welcomeWrap}>
          <Panel>
            <Ionicons name="checkmark-circle" size={40} color={selectedTheme.accentHover} style={{ alignSelf: 'center', marginBottom: 10 }} />
            <Text style={s.heroWord}>all set!</Text>
            <Text style={s.welcomeBody}>Your AI tutor is now personalized to match your unique learning preferences.</Text>
            <View style={s.redirectRow}>
              <ActivityIndicator size="small" color={selectedTheme.accentHover} />
              <Text style={s.btnSub}>taking you in…</Text>
            </View>
          </Panel>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <LinearGradient colors={[selectedTheme.bgTop, selectedTheme.bgPrimary, selectedTheme.bgBottom]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
        <GeoBackground />
      </View>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={s.content}>
          <View style={s.steps}>
            <Text style={[s.stepChip, step === 'form' && s.stepChipOn]}>01 PROFILE</Text>
            <View style={s.stepRule} />
            <Text style={[s.stepChip, step === 'preferences' && s.stepChipOn]}>02 PREFERENCES</Text>
          </View>

          {step === 'form' ? (
            <>
              <HapticTouchable onPress={() => setStep('welcome')} activeOpacity={0.7} haptic="light" style={s.backLink}>
                <Ionicons name="chevron-back" size={14} color={selectedTheme.textSecondary} />
                <Text style={s.backLinkText}>back</Text>
              </HapticTouchable>
              <Text style={s.pageTitle}>profile</Text>
              <Text style={s.pageSub}>customize your ai learning experience</Text>

              <Panel>
                <Text style={s.sectionLabel}>01 · what best describes your learning journey?</Text>
                <View style={s.choiceList}>
                  {LEARNING_STAGES.map(stage => {
                    const selected = answers.learningStage === stage;
                    return (
                      <HapticTouchable
                        key={stage}
                        style={[s.choice, selected && s.choiceSelected]}
                        onPress={() => setAnswers(prev => ({ ...prev, learningStage: stage }))}
                        activeOpacity={0.85}
                        haptic="selection"
                      >
                        <Text style={[s.choiceText, selected && s.choiceTextSelected]}>{stage}</Text>
                        {selected ? <Ionicons name="checkmark" size={14} color={selectedTheme.accentHover} /> : null}
                      </HapticTouchable>
                    );
                  })}
                </View>
              </Panel>

              <Panel>
                <Text style={s.sectionLabel}>02 · what's your main subject or field of study?</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g., Computer Science, Biology, Mathematics..."
                  placeholderTextColor={selectedTheme.textSecondary}
                  value={answers.mainSubject}
                  onChangeText={text => setAnswers(prev => ({ ...prev, mainSubject: text }))}
                  autoCapitalize="words"
                  autoCorrect={false}
                />
                {mainSubjectSuggestions.length > 0 ? (
                  <View style={s.suggestions}>
                    {mainSubjectSuggestions.map(subject => (
                      <HapticTouchable
                        key={subject}
                        style={s.suggestion}
                        onPress={() => setAnswers(prev => ({ ...prev, mainSubject: subject }))}
                        activeOpacity={0.8}
                        haptic="selection"
                      >
                        <Text style={s.suggestionText}>{subject}</Text>
                      </HapticTouchable>
                    ))}
                  </View>
                ) : null}
              </Panel>

              <Panel>
                <Text style={s.sectionLabel}>03 · what other subjects are you interested in?</Text>
                {answers.subjects.length > 0 ? (
                  <View style={s.tags}>
                    {answers.subjects.map(subject => (
                      <View key={subject} style={s.tag}>
                        <Text style={s.tagText}>{subject}</Text>
                        <HapticTouchable onPress={() => removeSubject(subject)} haptic="light">
                          <Ionicons name="close" size={12} color={selectedTheme.textSecondary} />
                        </HapticTouchable>
                      </View>
                    ))}
                  </View>
                ) : null}
                <TextInput
                  style={s.input}
                  placeholder="e.g., Calculus, Organic Chemistry, Data Structures..."
                  placeholderTextColor={selectedTheme.textSecondary}
                  value={subjectInput}
                  onChangeText={setSubjectInput}
                  autoCapitalize="words"
                  autoCorrect={false}
                  onSubmitEditing={() => {
                    const trimmed = subjectInput.trim();
                    if (trimmed && trimmed !== answers.mainSubject) addSubject(trimmed);
                  }}
                />
                {otherSubjectSuggestions.length > 0 ? (
                  <View style={s.suggestions}>
                    {otherSubjectSuggestions.map(subject => (
                      <HapticTouchable key={subject} style={s.suggestion} onPress={() => addSubject(subject)} activeOpacity={0.8} haptic="selection">
                        <Text style={s.suggestionText}>{subject}</Text>
                      </HapticTouchable>
                    ))}
                  </View>
                ) : null}
              </Panel>

              <Panel>
                <Text style={s.sectionLabel}>04 · what's your main goal?</Text>
                <View style={s.choiceList}>
                  {BRAINWAVE_GOALS.map(goal => {
                    const selected = answers.brainwaveGoal === goal.value;
                    return (
                      <HapticTouchable
                        key={goal.value}
                        style={[s.choice, selected && s.choiceSelected]}
                        onPress={() => setAnswers(prev => ({ ...prev, brainwaveGoal: goal.value }))}
                        activeOpacity={0.85}
                        haptic="selection"
                      >
                        <Text style={[s.choiceText, selected && s.choiceTextSelected]}>{goal.label}</Text>
                        {selected ? <Ionicons name="checkmark" size={14} color={selectedTheme.accentHover} /> : null}
                      </HapticTouchable>
                    );
                  })}
                </View>
              </Panel>

              <Panel>
                <Text style={s.sectionLabel}>05 · weekly activity goals</Text>
                <Text style={s.hint}>how much do you plan to study each week?</Text>
                <View style={s.presetRow}>
                  {(Object.keys(WEEKLY_PRESETS) as WeeklyPresetKey[]).map(key => {
                    const preset = WEEKLY_PRESETS[key];
                    const selected = weeklyPreset === key;
                    return (
                      <HapticTouchable
                        key={key}
                        style={[s.presetCard, selected && s.presetCardSelected]}
                        onPress={() => setWeeklyPreset(key)}
                        activeOpacity={0.85}
                        haptic="selection"
                      >
                        <Ionicons name={preset.icon} size={18} color={selected ? selectedTheme.accentHover : selectedTheme.textSecondary} />
                        <Text style={[s.presetLabel, selected && s.choiceTextSelected]}>{preset.label}</Text>
                        <Text style={s.presetStats}>{preset.chat} chats · {preset.note} notes · {preset.flashcard} cards · {preset.quiz} quizzes</Text>
                      </HapticTouchable>
                    );
                  })}
                </View>
              </Panel>

              <HapticTouchable
                style={[s.btnWrap, !isProfileValid && s.btnDisabled]}
                onPress={() => isProfileValid && setStep('preferences')}
                activeOpacity={0.88}
                disabled={!isProfileValid}
                haptic="medium"
              >
                <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={s.btn}>
                  <Text style={s.btnText}>continue to learning preferences</Text>
                  <Ionicons name="chevron-forward" size={16} color={selectedTheme.bgPrimary} />
                </LinearGradient>
              </HapticTouchable>
            </>
          ) : (
            <>
              <HapticTouchable onPress={() => setStep('form')} activeOpacity={0.7} haptic="light" style={s.backLink}>
                <Ionicons name="chevron-back" size={14} color={selectedTheme.textSecondary} />
                <Text style={s.backLinkText}>back to profile</Text>
              </HapticTouchable>
              <Text style={s.pageTitle}>learning preferences</Text>
              <Text style={s.pageSub}>help us personalize your learning experience</Text>

              {PREFERENCE_QUESTIONS.map((q, qIdx) => (
                <Panel key={q.id}>
                  <Text style={s.sectionLabel}>{String(qIdx + 1).padStart(2, '0')} · {q.question}</Text>
                  <Text style={s.hint}>select all that apply</Text>
                  <View style={s.choiceList}>
                    {q.options.map(option => {
                      const selected = answers.learningPreferences[q.id]?.includes(option.value) || false;
                      return (
                        <HapticTouchable
                          key={option.value}
                          style={[s.choice, selected && s.choiceSelected]}
                          onPress={() => togglePreference(q.id, option.value)}
                          activeOpacity={0.85}
                          haptic="selection"
                        >
                          <View style={s.optionLetter}><Text style={s.optionLetterText}>{option.value}</Text></View>
                          <Text style={[s.choiceText, s.optionText, selected && s.choiceTextSelected]}>{option.text}</Text>
                          {selected ? <Ionicons name="checkmark" size={14} color={selectedTheme.accentHover} /> : null}
                        </HapticTouchable>
                      );
                    })}
                  </View>
                </Panel>
              ))}

              <View style={s.actionsRow}>
                <HapticTouchable style={s.ghostBtn} onPress={confirmSkip} activeOpacity={0.85} disabled={saving} haptic="selection">
                  <Text style={s.ghostBtnText}>skip for now</Text>
                </HapticTouchable>
                <HapticTouchable
                  style={[s.btnWrap, s.submitWrap, (!isPreferencesValid || saving) && s.btnDisabled]}
                  onPress={handleSubmit}
                  activeOpacity={0.88}
                  disabled={!isPreferencesValid || saving}
                  haptic="medium"
                >
                  <LinearGradient colors={[selectedTheme.accentHover, selectedTheme.accent]} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={s.btn}>
                    {saving ? (
                      <ActivityIndicator color={selectedTheme.bgPrimary} />
                    ) : (
                      <>
                        <Text style={s.btnText}>complete setup</Text>
                        <Ionicons name="chevron-forward" size={16} color={selectedTheme.bgPrimary} />
                      </>
                    )}
                  </LinearGradient>
                </HapticTouchable>
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['selectedTheme'], layout: ReturnType<typeof useResponsiveLayout>) {
  const contentMaxWidth = Math.min(layout.contentMaxWidth, 640);
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.bgPrimary },
    welcomeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
    scrollContent: { flexGrow: 1, paddingTop: 14, paddingBottom: 48 },
    content: { width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: layout.isTablet ? 18 : 14 },

    steps: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    stepChip: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.4, color: theme.textSecondary },
    stepChipOn: { color: theme.accentHover },
    stepRule: { width: 18, height: 1, backgroundColor: rgbaFromHex(theme.accentHover, 0.3) },

    backLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginBottom: 10, paddingVertical: 4 },
    backLinkText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.textSecondary },
    pageTitle: { fontFamily: 'Inter_900Black', fontSize: 28, color: theme.accentHover, letterSpacing: -0.6, marginBottom: 4 },
    pageSub: { fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.textSecondary, marginBottom: 18 },

    panel: {
      width: '100%',
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingVertical: 18,
      overflow: 'hidden',
      marginBottom: 16,
      boxShadow: cbTileShadowExact(),
      ...cbTileBorder(0.2),
    } as ViewStyle,

    heroWord: { fontFamily: 'Inter_900Black', fontSize: 38, color: theme.accentHover, letterSpacing: -1.2, textAlign: 'center' },
    heroTagline: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 2, color: theme.textSecondary, textAlign: 'center', marginTop: 6, textTransform: 'uppercase' },
    welcomeBody: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, color: theme.textSecondary, textAlign: 'center', marginTop: 16, marginBottom: 22 },

    sectionLabel: { fontFamily: 'Inter_700Bold', fontSize: 13, color: theme.textPrimary, marginBottom: 4, lineHeight: 19 },
    hint: { fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.textSecondary, marginBottom: 12 },

    choiceList: { gap: 8, marginTop: 8 },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.14 : 0.18),
      backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.4 : 0.55),
    } as ViewStyle,
    choiceSelected: {
      borderColor: rgbaFromHex(theme.accentHover, 0.5),
      backgroundColor: rgbaFromHex(theme.accent, theme.isLight ? 0.14 : 0.18),
    },
    choiceText: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: theme.textPrimary },
    choiceTextSelected: { color: theme.accentHover, fontFamily: 'Inter_600SemiBold' },
    optionText: { lineHeight: 18 },
    optionLetter: {
      width: 22, height: 22, borderRadius: 11,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: rgbaFromHex(theme.accentHover, 0.16),
    },
    optionLetterText: { fontFamily: 'Inter_700Bold', fontSize: 11, color: theme.accentHover },

    input: {
      backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.55 : 0.7),
      borderWidth: 1,
      borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.14 : 0.18),
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      color: theme.textPrimary,
      marginTop: 4,
    },
    suggestions: { marginTop: 8, gap: 6 },
    suggestion: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: rgbaFromHex(theme.panelAlt, theme.isLight ? 0.7 : 0.5),
    },
    suggestionText: { fontFamily: 'Inter_400Regular', fontSize: 12.5, color: theme.textPrimary },

    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    tag: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12,
      borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, 0.24),
      backgroundColor: rgbaFromHex(theme.accent, theme.isLight ? 0.12 : 0.16),
    },
    tagText: { fontFamily: 'Inter_600SemiBold', fontSize: 11.5, color: theme.accentHover },

    presetRow: { gap: 8, marginTop: 4 },
    presetCard: {
      paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
      borderWidth: 1, borderColor: rgbaFromHex(theme.accentHover, theme.isLight ? 0.14 : 0.18),
      backgroundColor: rgbaFromHex(theme.bgPrimary, theme.isLight ? 0.4 : 0.55),
      gap: 3,
    } as ViewStyle,
    presetCardSelected: {
      borderColor: rgbaFromHex(theme.accentHover, 0.5),
      backgroundColor: rgbaFromHex(theme.accent, theme.isLight ? 0.14 : 0.18),
    },
    presetLabel: { fontFamily: 'Inter_700Bold', fontSize: 13, color: theme.textPrimary },
    presetStats: { fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.textSecondary },

    btnWrap: { marginTop: 6, borderRadius: 16, overflow: 'hidden' },
    btnDisabled: { opacity: 0.5 },
    btn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      paddingVertical: 15,
    },
    btnText: { fontFamily: 'Inter_900Black', fontSize: 13, color: theme.bgPrimary, letterSpacing: 0.4, textTransform: 'uppercase' },
    btnSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: theme.textSecondary, letterSpacing: 0.2, textAlign: 'center', marginTop: 10 },

    skipBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 8 },
    skipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.textSecondary },

    redirectRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },

    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 6, alignItems: 'center' },
    ghostBtn: { paddingHorizontal: 16, paddingVertical: 15, borderRadius: 16 },
    ghostBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.textSecondary },
    submitWrap: { flex: 1, marginTop: 0 },
  });
}
