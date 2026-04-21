import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../styles/auth/auth_styles.js';

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

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/auth/sign_in" />;
  }

  const stats = useMemo(() => getStats(MATCHES), []);
  const selectedMatch = MATCHES.find((match) => match.id === selectedMatchId);

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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  screen: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(26,26,26,0.04)',
  },
  headerTitle: {
    color: Colors.textDark,
    fontSize: 28,
    fontWeight: '900',
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 4,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.04)',
    alignItems: 'center',
    gap: 5,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  statValue: {
    color: Colors.textDark,
    fontSize: 20,
    fontWeight: '800',
  },
  statLabel: {
    color: Colors.darkGray,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 14,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.04)',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    gap: 12,
  },
  sectionHeader: {
    gap: 8,
  },
  sectionTitle: {
    color: Colors.textDark,
    fontSize: 17,
    fontWeight: '800',
  },
  feedList: {
    gap: 8,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.04)',
    backgroundColor: '#FAFBFD',
  },
  feedRowPressed: {
    opacity: 0.9,
  },
  resultBadge: {
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  resultBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  feedMeta: {
    flex: 1,
    gap: 2,
  },
  opponentText: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '700',
  },
  topicText: {
    color: Colors.darkGray,
    fontSize: 12,
    fontWeight: '500',
  },
  dateText: {
    color: '#999',
    fontSize: 11,
  },
  eloChange: {
    fontSize: 14,
    fontWeight: '800',
  },
  detailPanel: {
    borderRadius: 16,
    backgroundColor: '#FAFBFD',
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.04)',
    padding: 12,
    gap: 12,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  detailOpponent: {
    color: Colors.textDark,
    fontSize: 16,
    fontWeight: '800',
  },
  detailTopic: {
    color: Colors.darkGray,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  detailDate: {
    color: '#999',
    fontSize: 11,
    marginTop: 2,
  },
  resultChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  winChip: {
    backgroundColor: '#E6F8EE',
  },
  lossChip: {
    backgroundColor: '#FDEBEC',
  },
  resultChipText: {
    color: Colors.textDark,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  questionList: {
    gap: 10,
  },
  questionCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.04)',
    gap: 9,
  },
  questionTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  questionStatus: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  correctStatus: {
    backgroundColor: '#1F9D55',
  },
  wrongStatus: {
    backgroundColor: '#D64545',
  },
  questionIndex: {
    color: Colors.darkGray,
    fontSize: 11,
    fontWeight: '600',
  },
  questionPrompt: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  answerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  answerLabel: {
    color: Colors.darkGray,
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  answerValue: {
    color: Colors.textDark,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
  },
  explanationBox: {
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  correctBox: {
    backgroundColor: '#F3FBF6',
  },
  explanationTitle: {
    color: Colors.textDark,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  explanationText: {
    color: Colors.darkGray,
    fontSize: 12,
    lineHeight: 17,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '90%',
  },
  reviewPanel: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    color: Colors.textDark,
    fontSize: 18,
    fontWeight: '800',
  },
});
