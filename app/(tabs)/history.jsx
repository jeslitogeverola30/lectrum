import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../styles/auth/auth_styles.js';
import styles from '../../styles/tabs/history_styles.js';

const MATCHES = [
  {
    id: 'match-1',
    result: 'Win',
    opponent: 'Nova',
    topic: 'Photosynthesis Basics',
    eloChange: 32,
    createdAt: '2026-04-19T18:25:00Z',
    questions: [
      {
        prompt: 'Which pigment captures light energy in plants?',
        correctAnswer: 'Chlorophyll',
        userAnswer: 'Chlorophyll',
        explanation: 'Chlorophyll is the primary pigment that absorbs light for photosynthesis.',
        correct: true,
      },
      {
        prompt: 'Where does the Calvin cycle take place?',
        correctAnswer: 'Stroma',
        userAnswer: 'Thylakoid membrane',
        explanation: 'The Calvin cycle occurs in the stroma, while the light reactions happen in the thylakoid membranes.',
        correct: false,
      },
      {
        prompt: 'What gas is released as a byproduct of photosynthesis?',
        correctAnswer: 'Oxygen',
        userAnswer: 'Oxygen',
        explanation: 'Water splitting during the light reactions releases oxygen.',
        correct: true,
      },
    ],
  },
  {
    id: 'match-2',
    result: 'Loss',
    opponent: 'Pulse',
    topic: 'World Capitals',
    eloChange: -15,
    createdAt: '2026-04-18T20:10:00Z',
    questions: [
      {
        prompt: 'What is the capital of Australia?',
        correctAnswer: 'Canberra',
        userAnswer: 'Sydney',
        explanation: 'Canberra is the capital city of Australia; Sydney is the largest city.',
        correct: false,
      },
      {
        prompt: 'What is the capital of Canada?',
        correctAnswer: 'Ottawa',
        userAnswer: 'Ottawa',
        explanation: 'Ottawa is the federal capital of Canada.',
        correct: true,
      },
      {
        prompt: 'What is the capital of Japan?',
        correctAnswer: 'Tokyo',
        userAnswer: 'Tokyo',
        explanation: 'Tokyo is the capital and the most populous metropolitan area in Japan.',
        correct: true,
      },
    ],
  },
  {
    id: 'match-3',
    result: 'Win',
    opponent: 'Cipher',
    topic: 'Human Anatomy',
    eloChange: 24,
    createdAt: '2026-04-17T16:45:00Z',
    questions: [
      {
        prompt: 'Which organ pumps blood through the body?',
        correctAnswer: 'Heart',
        userAnswer: 'Heart',
        explanation: 'The heart is the muscular organ responsible for circulating blood.',
        correct: true,
      },
      {
        prompt: 'Which bone is the longest in the human body?',
        correctAnswer: 'Femur',
        userAnswer: 'Femur',
        explanation: 'The femur is the longest and strongest bone in the body.',
        correct: true,
      },
      {
        prompt: 'What is the main function of red blood cells?',
        correctAnswer: 'Transport oxygen',
        userAnswer: 'Transport oxygen',
        explanation: 'Red blood cells carry oxygen from the lungs to the tissues.',
        correct: true,
      },
    ],
  },
  {
    id: 'match-4',
    result: 'Loss',
    opponent: 'Atlas',
    topic: 'Ancient Rome',
    eloChange: -9,
    createdAt: '2026-04-16T14:05:00Z',
    questions: [
      {
        prompt: 'Which structure hosted gladiator games in Rome?',
        correctAnswer: 'Colosseum',
        userAnswer: 'Pantheon',
        explanation: 'The Colosseum was the amphitheater used for gladiatorial contests and public spectacles.',
        correct: false,
      },
      {
        prompt: 'What language was used by the Roman Empire?',
        correctAnswer: 'Latin',
        userAnswer: 'Latin',
        explanation: 'Latin was the principal language of administration and law in ancient Rome.',
        correct: true,
      },
    ],
  },
];

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

const getStats = (matches) => {
  const totalMatches = matches.length;
  const wins = matches.filter((match) => match.result === 'Win').length;
  const winRate = totalMatches === 0 ? 0 : Math.round((wins / totalMatches) * 100);
  let currentElo = 1200;
  let highestElo = currentElo;

  for (const match of matches) {
    currentElo += match.eloChange;
    highestElo = Math.max(highestElo, currentElo);
  }

  return {
    totalMatches,
    winRate,
    highestElo,
  };
};

export default function HistoryTabScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [showMatchReview, setShowMatchReview] = useState(false);
  const stats = useMemo(() => getStats(MATCHES), []);
  const selectedMatch = MATCHES.find((match) => match.id === selectedMatchId);

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/auth/sign_in" />;
  }

  const handleMatchPress = (matchId) => {
    setSelectedMatchId(matchId);
    setShowMatchReview(true);
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
      </View>

      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Ionicons name="game-controller-outline" size={16} color={Colors.accent} />
          <Text style={styles.statValue}>{stats.totalMatches}</Text>
          <Text style={styles.statLabel}>Matches</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="trending-up-outline" size={16} color={Colors.primary} />
          <Text style={styles.statValue}>{stats.winRate}%</Text>
          <Text style={styles.statLabel}>Win Rate</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="pulse-outline" size={16} color={Colors.gold} />
          <Text style={styles.statValue}>{stats.highestElo}</Text>
          <Text style={styles.statLabel}>Peak ELO</Text>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Matches</Text>
        </View>

        <View style={styles.feedList}>
          {MATCHES.map((match) => {
            const resultColor = match.result === 'Win' ? '#1F9D55' : '#D64545';

            return (
              <Pressable
                key={match.id}
                onPress={() => handleMatchPress(match.id)}
                style={({ pressed }) => [styles.feedRow, pressed && styles.feedRowPressed]}
              >
                <View style={[styles.resultBadge, { backgroundColor: `${resultColor}18` }]}>
                  <Text style={[styles.resultBadgeText, { color: resultColor }]}>{match.result}</Text>
                </View>

                <View style={styles.feedMeta}>
                  <Text style={styles.opponentText}>{match.opponent}</Text>
                  <Text style={styles.topicText}>{match.topic}</Text>
                  <Text style={styles.dateText}>{formatDate(match.createdAt)}</Text>
                </View>

                <Text style={[styles.eloChange, { color: match.eloChange >= 0 ? '#1F9D55' : '#D64545' }]}>
                  {match.eloChange > 0 ? '+' : ''}{match.eloChange}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      </ScrollView>

      {/* Match Review Modal */}
      <Modal
        visible={showMatchReview}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMatchReview(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowMatchReview(false)}>
          <ScrollView style={styles.modalContent} scrollEnabled={true}>
            <Pressable style={styles.reviewPanel} onPress={(e) => e.stopPropagation()}>
              {selectedMatch ? (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Match Review</Text>
                    <Pressable onPress={() => setShowMatchReview(false)}>
                      <Ionicons name="close" size={24} color={Colors.textDark} />
                    </Pressable>
                  </View>

                  <View style={styles.detailHeaderRow}>
                    <View>
                      <Text style={styles.detailOpponent}>{selectedMatch.opponent}</Text>
                      <Text style={styles.detailTopic}>{selectedMatch.topic}</Text>
                      <Text style={styles.detailDate}>{formatDate(selectedMatch.createdAt)}</Text>
                    </View>
                    <View style={[styles.resultChip, selectedMatch.result === 'Win' ? styles.winChip : styles.lossChip]}>
                      <Text style={styles.resultChipText}>{selectedMatch.result}</Text>
                    </View>
                  </View>

                  <View style={styles.questionList}>
                    {selectedMatch.questions.map((question, index) => (
                      <View key={`${selectedMatch.id}-${index}`} style={styles.questionCard}>
                        <View style={styles.questionTopRow}>
                          <View style={[styles.questionStatus, question.correct ? styles.correctStatus : styles.wrongStatus]}>
                            <Ionicons name={question.correct ? 'checkmark' : 'close'} size={14} color={Colors.white} />
                          </View>
                          <Text style={styles.questionIndex}>Question {index + 1}</Text>
                        </View>

                        <Text style={styles.questionPrompt}>{question.prompt}</Text>

                        <View style={styles.answerRow}>
                          <Text style={styles.answerLabel}>Your answer</Text>
                          <Text style={styles.answerValue}>{question.userAnswer}</Text>
                        </View>

                        <View style={styles.answerRow}>
                          <Text style={styles.answerLabel}>Correct answer</Text>
                          <Text style={styles.answerValue}>{question.correctAnswer}</Text>
                        </View>

                        {!question.correct ? (
                          <View style={styles.explanationBox}>
                            <Text style={styles.explanationTitle}>Why this was wrong</Text>
                            <Text style={styles.explanationText}>{question.explanation}</Text>
                          </View>
                        ) : (
                          <View style={[styles.explanationBox, styles.correctBox]}>
                            <Text style={styles.explanationTitle}>Correct</Text>
                            <Text style={styles.explanationText}>{question.explanation}</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
            </Pressable>
          </ScrollView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

