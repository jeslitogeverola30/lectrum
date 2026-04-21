import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/expo';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Animated, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../services/supabase.js';
import { Colors } from '../../styles/auth/auth_styles.js';

const FALLBACK_QUESTION_BANK = [
  {
    prompt: 'What is the powerhouse of the cell?',
    options: ['Ribosome', 'Mitochondrion', 'Nucleus', 'Golgi apparatus'],
    answer: 'Mitochondrion',
  },
  {
    prompt: 'Which planet is known as the Red Planet?',
    options: ['Mars', 'Venus', 'Jupiter', 'Mercury'],
    answer: 'Mars',
  },
  {
    prompt: 'What is the capital city of Japan?',
    options: ['Kyoto', 'Seoul', 'Tokyo', 'Osaka'],
    answer: 'Tokyo',
  },
  {
    prompt: 'Which structure carries blood away from the heart?',
    options: ['Vein', 'Artery', 'Capillary', 'Valve'],
    answer: 'Artery',
  },
  {
    prompt: 'Who developed the theory of relativity?',
    options: ['Newton', 'Tesla', 'Einstein', 'Curie'],
    answer: 'Einstein',
  },
  {
    prompt: 'Which gas do plants absorb from the atmosphere?',
    options: ['Nitrogen', 'Carbon Dioxide', 'Oxygen', 'Hydrogen'],
    answer: 'Carbon Dioxide',
  },
  {
    prompt: 'What is the largest ocean on Earth?',
    options: ['Indian', 'Arctic', 'Atlantic', 'Pacific'],
    answer: 'Pacific',
  },
  {
    prompt: 'In computing, what does CPU stand for?',
    options: ['Central Processing Unit', 'Core Program Utility', 'Computer Power Unit', 'Central Program Upload'],
    answer: 'Central Processing Unit',
  },
  {
    prompt: 'Which ancient civilization built Machu Picchu?',
    options: ['Mayan', 'Roman', 'Incan', 'Egyptian'],
    answer: 'Incan',
  },
  {
    prompt: 'How many continents are there?',
    options: ['5', '6', '7', '8'],
    answer: '7',
  },
];

const DEFAULT_ROUND_SECONDS = 20;
const MIN_ROUND_SECONDS = 5;
const MAX_ROUND_SECONDS = 30;

function buildFallbackRounds(roundsCount) {
  const normalizedCount = Math.max(1, Math.min(10, roundsCount));
  return Array.from({ length: normalizedCount }, (_, index) => {
    const question = FALLBACK_QUESTION_BANK[index % FALLBACK_QUESTION_BANK.length];
    return { ...question, id: `round-${index + 1}` };
  });
}

function mapQuizToRounds(rawQuizItems, roundsCount) {
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

      const answerIndex = Number.isInteger(item?.answerIndex)
        ? item.answerIndex
        : Number.parseInt(String(item?.answerIndex ?? 0), 10);

      const prompt = String(item?.question ?? '').trim();
      if (!prompt || options.length < 2) {
        return null;
      }

      const safeAnswerIndex = Number.isInteger(answerIndex) && answerIndex >= 0 && answerIndex < options.length ? answerIndex : 0;

      return {
        id: `round-${index + 1}`,
        prompt,
        options,
        answer: options[safeAnswerIndex],
      };
    })
    .filter(Boolean);
}

export default function BattleArenaScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const params = useLocalSearchParams();

  const requestedRounds = Number(Array.isArray(params.rounds) ? params.rounds[0] : params.rounds || 5);
  const requestedTimePerItem = Number(
    Array.isArray(params.timePerItem) ? params.timePerItem[0] : params.timePerItem || DEFAULT_ROUND_SECONDS
  );
  const roundSeconds = Math.max(MIN_ROUND_SECONDS, Math.min(MAX_ROUND_SECONDS, requestedTimePerItem));
  const roomName = Array.isArray(params.roomName) ? params.roomName[0] : params.roomName;
  const roomTopic = Array.isArray(params.roomTopic) ? params.roomTopic[0] : params.roomTopic;
  const quizId = Array.isArray(params.quizId) ? params.quizId[0] : params.quizId;

  const [rounds, setRounds] = useState(() => buildFallbackRounds(requestedRounds));
  const [resolvedTopic, setResolvedTopic] = useState(roomTopic || 'General Knowledge');
  const [isLoadingQuiz, setIsLoadingQuiz] = useState(Boolean(quizId));
  const [quizError, setQuizError] = useState('');
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0);
  const [roundTimer, setRoundTimer] = useState(roundSeconds);
  const [selectedOption, setSelectedOption] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [eloDelta, setEloDelta] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const pulseOpacity = useRef(new Animated.Value(0)).current;

  const baseElo = Number(user?.unsafeMetadata?.eloRating ?? 1240);
  const liveElo = baseElo + eloDelta;
  const currentRound = rounds[currentRoundIndex];
  const isUrgent = roundTimer <= 5 && !showSummary;

  useEffect(() => {
    let isActive = true;

    const loadQuiz = async () => {
      if (!quizId) {
        if (isActive) {
          setRounds(buildFallbackRounds(requestedRounds));
          setResolvedTopic(roomTopic || 'General Knowledge');
          setIsLoadingQuiz(false);
          setQuizError('');
        }
        return;
      }

      setIsLoadingQuiz(true);
      setQuizError('');

      const { data, error } = await supabase
        .from('quizzes')
        .select('topic, raw_json_content')
        .eq('id', quizId)
        .maybeSingle();

      if (!isActive) {
        return;
      }

      if (error || !data) {
        setQuizError(error?.message || 'Quiz data not found. Using fallback questions.');
        setRounds(buildFallbackRounds(requestedRounds));
        setResolvedTopic(roomTopic || 'General Knowledge');
        setIsLoadingQuiz(false);
        return;
      }

      const mappedRounds = mapQuizToRounds(data.raw_json_content, requestedRounds);
      if (!mappedRounds.length) {
        setQuizError('Quiz content is invalid. Using fallback questions.');
        setRounds(buildFallbackRounds(requestedRounds));
      } else {
        setRounds(mappedRounds);
      }

      setResolvedTopic(data.topic || roomTopic || 'General Knowledge');
      setIsLoadingQuiz(false);
    };

    loadQuiz();

    return () => {
      isActive = false;
    };
  }, [quizId, requestedRounds, roomTopic]);

  useEffect(() => {
    setCurrentRoundIndex(0);
    setRoundTimer(roundSeconds);
    setSelectedOption(null);
    setScore(0);
    setStreak(0);
    setCorrectCount(0);
    setEloDelta(0);
    setShowSummary(false);
  }, [rounds, roundSeconds]);

  useEffect(() => {
    if (!isUrgent) {
      pulseOpacity.stopAnimation();
      pulseOpacity.setValue(0);
      return undefined;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOpacity, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulseOpacity, {
          toValue: 0,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();

    return () => {
      pulseLoop.stop();
      pulseOpacity.stopAnimation();
      pulseOpacity.setValue(0);
    };
  }, [isUrgent, pulseOpacity]);

  useEffect(() => {
    if (showSummary) {
      return undefined;
    }

    if (roundTimer <= 0) {
      handleAnswer(null, true);
      return undefined;
    }

    const tick = setTimeout(() => {
      setRoundTimer((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(tick);
  }, [roundTimer, showSummary]);

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/auth/sign_in" />;
  }

  if (isLoadingQuiz) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Preparing battle quiz from your uploaded source...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const goToNextRound = () => {
    if (currentRoundIndex + 1 >= rounds.length) {
      setShowSummary(true);
      return;
    }

    setCurrentRoundIndex((prev) => prev + 1);
    setRoundTimer(roundSeconds);
    setSelectedOption(null);
  };

  const handleAnswer = (option, timeout = false) => {
    if (selectedOption !== null || showSummary) {
      return;
    }

    const chosenOption = timeout ? '__timeout__' : option;
    setSelectedOption(chosenOption);

    const isCorrect = !timeout && option === currentRound.answer;

    if (isCorrect) {
      const nextStreak = streak + 1;
      const streakBonus = nextStreak >= 2 ? (nextStreak - 1) * 2 : 0;
      const roundPoints = 10 + streakBonus;
      const roundElo = 8 + streakBonus;

      setStreak(nextStreak);
      setCorrectCount((prev) => prev + 1);
      setScore((prev) => prev + roundPoints);
      setEloDelta((prev) => prev + roundElo);
    } else {
      setStreak(0);
      setEloDelta((prev) => prev - 3);
    }

    setTimeout(goToNextRound, 900);
  };

  const getOptionStateStyle = (option) => {
    if (selectedOption === null) {
      return styles.optionIdle;
    }

    if (option === currentRound.answer) {
      return styles.optionCorrect;
    }

    if (option === selectedOption && option !== currentRound.answer) {
      return styles.optionWrong;
    }

    return styles.optionDisabled;
  };

  if (showSummary) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Battle Summary</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryRoom}>{roomName || 'Battle Arena'}</Text>
          <Text style={styles.summaryTopic}>{resolvedTopic || 'General Knowledge'}</Text>

          <View style={styles.summaryGrid}>
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryValue}>{score}</Text>
              <Text style={styles.summaryLabel}>Score</Text>
            </View>
            <View style={styles.summaryMetric}>
              <Text style={styles.summaryValue}>{correctCount}/{rounds.length}</Text>
              <Text style={styles.summaryLabel}>Correct</Text>
            </View>
            <View style={styles.summaryMetric}>
              <Text style={[styles.summaryValue, eloDelta >= 0 ? styles.eloUp : styles.eloDown]}>
                {eloDelta >= 0 ? '+' : ''}{eloDelta}
              </Text>
              <Text style={styles.summaryLabel}>ELO Change</Text>
            </View>
          </View>

          <View style={styles.summaryEloRow}>
            <Text style={styles.summaryEloText}>ELO: {baseElo} → {liveElo}</Text>
          </View>

          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
            <Text style={styles.primaryButtonText}>Back To Room</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {isUrgent ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.urgentOverlay,
            {
              opacity: pulseOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [0.15, 0.85],
              }),
            },
          ]}
        />
      ) : null}

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
          <Ionicons name="chevron-back" size={20} color={Colors.textDark} />
        </Pressable>
        <Text style={styles.headerTitle}>Battle Arena</Text>
        <View style={styles.headerPlaceholder} />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statPill}>
          <Text style={styles.statLabel}>Round</Text>
          <Text style={styles.statValue}>{currentRoundIndex + 1}/{rounds.length}</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={styles.statLabel}>Timer</Text>
          <Text style={[styles.statValue, roundTimer <= 5 && styles.timerWarning]}>{roundTimer}s</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={styles.statLabel}>Streak</Text>
          <Text style={styles.statValue}>x{streak}</Text>
        </View>
        <View style={styles.statPill}>
          <Text style={styles.statLabel}>ELO</Text>
          <Text style={styles.statValue}>{liveElo}</Text>
        </View>
      </View>

      <View style={styles.questionCard}>
        <Text style={styles.questionTopic}>{resolvedTopic || 'General Knowledge'}</Text>
        <Text style={styles.questionText}>{currentRound.prompt}</Text>

        <View style={styles.optionsList}>
          {currentRound.options.map((option) => (
            <Pressable
              key={option}
              onPress={() => handleAnswer(option)}
              disabled={selectedOption !== null}
              style={({ pressed }) => [styles.optionButton, getOptionStateStyle(option), pressed && selectedOption === null && styles.optionPressed]}
            >
              <Text style={styles.optionText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerScore}>{quizError ? 'Fallback Mode · ' : ''}Score: {score}</Text>
        <Text style={styles.footerBonus}>Streak bonus: +{streak >= 2 ? (streak - 1) * 2 : 0}</Text>
      </View>
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
    gap: 12,
    paddingHorizontal: 20,
  },
  loadingText: {
    color: Colors.darkGray,
    fontSize: 13,
    textAlign: 'center',
  },
  urgentOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 5,
    borderColor: 'rgba(208, 52, 52, 0.95)',
    shadowColor: '#D03434',
    shadowOpacity: 0.75,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
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
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  statPill: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.05)',
    paddingVertical: 9,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  statLabel: {
    color: Colors.darkGray,
    fontSize: 11,
    fontWeight: '600',
  },
  statValue: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 1,
  },
  timerWarning: {
    color: '#B94040',
  },
  questionCard: {
    marginTop: 12,
    marginHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.05)',
    padding: 14,
    gap: 12,
    flex: 1,
  },
  questionTopic: {
    color: Colors.darkGray,
    fontSize: 12,
    fontWeight: '600',
  },
  questionText: {
    color: Colors.textDark,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  optionsList: {
    gap: 9,
  },
  optionButton: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  optionIdle: {
    backgroundColor: '#FAFBFD',
    borderColor: 'rgba(26,26,26,0.08)',
  },
  optionCorrect: {
    backgroundColor: '#EAF9EF',
    borderColor: '#9CD6AE',
  },
  optionWrong: {
    backgroundColor: '#FFF1F1',
    borderColor: '#E9B4B4',
  },
  optionDisabled: {
    backgroundColor: '#F5F7FA',
    borderColor: 'rgba(26,26,26,0.06)',
    opacity: 0.8,
  },
  optionPressed: {
    opacity: 0.85,
  },
  optionText: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '700',
  },
  footerRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(26,26,26,0.04)',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerScore: {
    color: Colors.textDark,
    fontSize: 13,
    fontWeight: '700',
  },
  footerBonus: {
    color: Colors.darkGray,
    fontSize: 12,
    fontWeight: '600',
  },
  summaryCard: {
    margin: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.05)',
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 12,
  },
  summaryRoom: {
    color: Colors.textDark,
    fontSize: 18,
    fontWeight: '800',
  },
  summaryTopic: {
    color: Colors.darkGray,
    fontSize: 13,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryMetric: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.06)',
    backgroundColor: '#FAFBFD',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 2,
  },
  summaryValue: {
    color: Colors.textDark,
    fontSize: 18,
    fontWeight: '800',
  },
  summaryLabel: {
    color: Colors.darkGray,
    fontSize: 11,
    fontWeight: '600',
  },
  eloUp: {
    color: '#1F9D55',
  },
  eloDown: {
    color: '#B94040',
  },
  summaryEloRow: {
    borderRadius: 12,
    backgroundColor: '#EEF6FF',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  summaryEloText: {
    color: Colors.textDark,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 2,
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.textDark,
    alignItems: 'center',
    justifyContent: 'center',
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
