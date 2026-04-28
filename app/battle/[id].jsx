import { useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/expo';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../services/supabase.js';
import { GAME_PHASES, useGameStore } from '../../store/gameStore.js';
import { Colors } from '../../styles/auth/auth_styles.js';

const FALLBACK_QUESTION_BANK = [
  {
    prompt: 'What is the powerhouse of the cell?',
    options: ['Ribosome', 'Mitochondrion', 'Nucleus', 'Golgi apparatus'],
  },
  {
    prompt: 'Which planet is known as the Red Planet?',
    options: ['Mars', 'Venus', 'Jupiter', 'Mercury'],
  },
  {
    prompt: 'What is the capital city of Japan?',
    options: ['Kyoto', 'Seoul', 'Tokyo', 'Osaka'],
  },
  {
    prompt: 'Who developed the theory of relativity?',
    options: ['Newton', 'Tesla', 'Einstein', 'Curie'],
  },
  {
    prompt: 'How many continents are there?',
    options: ['5', '6', '7', '8'],
  },
];

const clampPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const mapQuizToRounds = (rawQuizItems, roundsCount) => {
  if (!Array.isArray(rawQuizItems)) {
    return [];
  }

  const maxRounds = Math.max(1, Math.min(10, roundsCount));

  return rawQuizItems
    .slice(0, maxRounds)
    .map((item, index) => {
      const options = Array.isArray(item?.options)
        ? item.options.map((option) => String(option)).filter(Boolean).slice(0, 4)
        : [];

      const prompt = String(item?.question ?? '').trim();
      if (!prompt || options.length < 2) {
        return null;
      }

      return {
        id: `round-${index + 1}`,
        prompt,
        options,
      };
    })
    .filter(Boolean);
};

const buildFallbackRounds = (roundsCount) => {
  const normalizedCount = Math.max(1, Math.min(10, roundsCount));
  return Array.from({ length: normalizedCount }, (_, index) => ({
    id: `fallback-${index + 1}`,
    ...FALLBACK_QUESTION_BANK[index % FALLBACK_QUESTION_BANK.length],
  }));
};

export default function BattleArenaScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const params = useLocalSearchParams();

  const roomId = Array.isArray(params.id) ? params.id[0] : params.id;
  const roomName = Array.isArray(params.roomName) ? params.roomName[0] : params.roomName;
  const roomTopic = Array.isArray(params.roomTopic) ? params.roomTopic[0] : params.roomTopic;
  const battleId = Array.isArray(params.battleId) ? params.battleId[0] : params.battleId;
  const creatorId = Array.isArray(params.creatorId) ? params.creatorId[0] : params.creatorId;
  const quizId = Array.isArray(params.quizId) ? params.quizId[0] : params.quizId;
  const requestedRounds = clampPositiveInt(Array.isArray(params.rounds) ? params.rounds[0] : params.rounds, 5);
  const requestedTimePerItem = clampPositiveInt(
    Array.isArray(params.timePerItem) ? params.timePerItem[0] : params.timePerItem,
    20
  );

  const [rounds, setRounds] = useState(() => buildFallbackRounds(requestedRounds));
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(Boolean(quizId));
  const [quizError, setQuizError] = useState('');
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(requestedTimePerItem);

  const phase = useGameStore((state) => state.phase);
  const roundIndex = useGameStore((state) => state.roundIndex);
  const localIsCreator = useGameStore((state) => state.isCreatorClient);
  const localHasSubmittedCurrentRound = useGameStore((state) => state.hasLocalSubmittedCurrentRound());
  const hydrateBattleSession = useGameStore((state) => state.hydrateBattleSession);
  const submitAnswer = useGameStore((state) => state.submitAnswer);
  const getRemainingSeconds = useGameStore((state) => state.getRemainingSeconds);
  const getSubmittedCountForCurrentRound = useGameStore((state) => state.getSubmittedCountForCurrentRound);
  const getAllActivePlayers = useGameStore((state) => state.getAllActivePlayers);
  const markBattleCompletedInDb = useGameStore((state) => state.markBattleCompletedInDb);
  const teardownSession = useGameStore((state) => state.teardownSession);

  const hasMarkedCompleted = useRef(false);

  const submittedCount = getSubmittedCountForCurrentRound();
  const activePlayerCount = getAllActivePlayers().length;

  const currentRound = useMemo(() => {
    if (!rounds.length) {
      return null;
    }

    const safeIndex = Math.max(0, Math.min(roundIndex, rounds.length - 1));
    return rounds[safeIndex];
  }, [roundIndex, rounds]);

  useEffect(() => {
    let isActive = true;

    const loadQuiz = async () => {
      if (!quizId) {
        if (isActive) {
          setRounds(buildFallbackRounds(requestedRounds));
          setIsLoadingQuiz(false);
          setQuizError('');
        }
        return;
      }

      setIsLoadingQuiz(true);
      setQuizError('');

      const { data, error } = await supabase
        .from('quizzes')
        .select('raw_json_content')
        .eq('id', quizId)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      if (error || !data) {
        setRounds(buildFallbackRounds(requestedRounds));
        setQuizError(error?.message || 'Could not load quiz. Using fallback questions.');
        setIsLoadingQuiz(false);
        return;
      }

      const mappedRounds = mapQuizToRounds(data.raw_json_content, requestedRounds);
      if (!mappedRounds.length) {
        setRounds(buildFallbackRounds(requestedRounds));
        setQuizError('Quiz content is invalid. Using fallback questions.');
      } else {
        setRounds(mappedRounds);
      }

      setIsLoadingQuiz(false);
    };

    loadQuiz();

    return () => {
      isActive = false;
    };
  }, [quizId, requestedRounds]);

  useEffect(() => {
    if (!roomId || !battleId || !user?.id) {
      return;
    }

    hydrateBattleSession({
      roomId,
      battleId,
      creatorId: creatorId || null,
      currentUserId: user.id,
      currentUserName: user?.username || user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Member',
      isCreatorClient: Boolean(creatorId && user.id === creatorId),
      questionCount: rounds.length || requestedRounds,
      roundDurationSec: requestedTimePerItem,
    });
  }, [
    battleId,
    creatorId,
    hydrateBattleSession,
    requestedRounds,
    requestedTimePerItem,
    roomId,
    rounds.length,
    user?.fullName,
    user?.id,
    user?.primaryEmailAddress?.emailAddress,
    user?.username,
  ]);

  useEffect(() => {
    const timerId = setInterval(() => {
      setRemainingSeconds(getRemainingSeconds());
    }, 300);

    return () => clearInterval(timerId);
  }, [getRemainingSeconds]);

  useEffect(() => {
    setSelectedOptionIndex(null);
  }, [roundIndex]);

  useEffect(() => {
    if (phase !== GAME_PHASES.ROUND || localHasSubmittedCurrentRound || remainingSeconds > 0) {
      return;
    }

    submitAnswer({ selectedOptionIndex: null, isTimeout: true });
  }, [localHasSubmittedCurrentRound, phase, remainingSeconds, submitAnswer]);

  useEffect(() => {
    if (phase !== GAME_PHASES.GAME_OVER || hasMarkedCompleted.current || !localIsCreator) {
      return;
    }

    hasMarkedCompleted.current = true;
    markBattleCompletedInDb();
  }, [localIsCreator, markBattleCompletedInDb, phase]);

  useEffect(() => {
    return () => {
      teardownSession();
    };
  }, [teardownSession]);

  const handleAnswer = async (optionIndex) => {
    if (phase !== GAME_PHASES.ROUND || localHasSubmittedCurrentRound) {
      return;
    }

    setSelectedOptionIndex(optionIndex);
    await submitAnswer({ selectedOptionIndex: optionIndex, isTimeout: false });
  };

  const handleBackToRoom = async () => {
    await teardownSession();
    router.back();
  };

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/auth/sign_in" />;
  }

  if (isLoadingQuiz || !currentRound) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Preparing synchronized battle arena...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === GAME_PHASES.GAME_OVER) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Battle Finished</Text>
          <Text style={styles.summarySubtitle}>
            All players received GAME_OVER at the same time. The room battle state has been reset.
          </Text>
          <Text style={styles.summaryMeta}>Room: {roomName || 'Study Room'}</Text>
          <Text style={styles.summaryMeta}>Topic: {roomTopic || 'General Knowledge'}</Text>

          <Pressable onPress={handleBackToRoom} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
            <Text style={styles.primaryButtonText}>Back To Room</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={handleBackToRoom} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
          <Ionicons name="chevron-back" size={20} color={Colors.textDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Game Arena</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <View style={styles.metricsRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Round</Text>
          <Text style={styles.metricValue}>{Math.min(roundIndex + 1, rounds.length)}/{rounds.length}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Timer</Text>
          <Text style={[styles.metricValue, remainingSeconds <= 5 && styles.metricValueDanger]}>{remainingSeconds}s</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Submitted</Text>
          <Text style={styles.metricValue}>{submittedCount}/{activePlayerCount}</Text>
        </View>
      </View>

      <View style={styles.questionCard}>
        <Text style={styles.questionTopic}>{roomTopic || 'General Knowledge'}</Text>
        <Text style={styles.questionText}>{currentRound.prompt}</Text>

        <View style={styles.optionsWrap}>
          {currentRound.options.map((option, index) => (
            <Pressable
              key={`${currentRound.id}-${option}`}
              onPress={() => handleAnswer(index)}
              disabled={localHasSubmittedCurrentRound || phase !== GAME_PHASES.ROUND}
              style={({ pressed }) => [
                styles.optionButton,
                selectedOptionIndex === index && styles.optionButtonSelected,
                localHasSubmittedCurrentRound && styles.optionButtonLocked,
                pressed && !localHasSubmittedCurrentRound && styles.optionButtonPressed,
              ]}
            >
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.footerNotice}>
        <Ionicons name="sync-outline" size={16} color={Colors.darkGray} />
        <Text style={styles.footerNoticeText}>
          Next round advances when all players submit or when timer reaches zero.
        </Text>
      </View>

      {quizError ? <Text style={styles.quizErrorText}>{quizError}</Text> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: Colors.darkGray,
    fontSize: 13,
    fontWeight: '600',
  },
  header: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(26,26,26,0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.06)',
  },
  backButtonPressed: {
    opacity: 0.8,
  },
  headerTitle: {
    color: Colors.textDark,
    fontSize: 18,
    fontWeight: '800',
  },
  headerPlaceholder: {
    width: 34,
    height: 34,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  metricCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.06)',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  metricLabel: {
    color: Colors.darkGray,
    fontSize: 11,
    fontWeight: '600',
  },
  metricValue: {
    color: Colors.textDark,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  metricValueDanger: {
    color: '#C24747',
  },
  questionCard: {
    margin: 12,
    marginTop: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.06)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  questionTopic: {
    color: Colors.darkGray,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  questionText: {
    color: Colors.textDark,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  optionsWrap: {
    gap: 8,
  },
  optionButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.08)',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  optionButtonPressed: {
    opacity: 0.88,
  },
  optionButtonSelected: {
    borderColor: `${Colors.primary}70`,
    backgroundColor: '#EEF6FF',
  },
  optionButtonLocked: {
    opacity: 0.75,
  },
  optionText: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '600',
  },
  footerNotice: {
    marginHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.08)',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerNoticeText: {
    color: Colors.darkGray,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  quizErrorText: {
    marginTop: 10,
    marginHorizontal: 12,
    color: '#B94040',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryCard: {
    margin: 14,
    marginTop: 26,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.06)',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 8,
  },
  summaryTitle: {
    color: Colors.textDark,
    fontSize: 22,
    fontWeight: '800',
  },
  summarySubtitle: {
    color: Colors.darkGray,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryMeta: {
    color: Colors.textDark,
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: 12,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.textDark,
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
