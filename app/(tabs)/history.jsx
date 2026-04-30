import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase.js';
import { Colors } from '../../styles/auth/auth_styles.js';
import styles from '../../styles/tabs/history_styles.js';

const formatDate = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

/**
 * Calculates stats from match history.
 * In a real scenario, these stats would come from the profiles table,
 * but we calculate them here for demonstration purposes.
 */
const getStats = (matches) => {
  const totalMatches = matches.length;
  const wins = matches.filter((match) => match.isWin).length;
  const winRate = totalMatches === 0 ? 0 : Math.round((wins / totalMatches) * 100);

  return {
    totalMatches,
    wins,
    winRate,
  };
};

export default function HistoryTabScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [matches, setMatches] = useState([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(true);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [showMatchReview, setShowMatchReview] = useState(false);
  const [userProfile, setUserProfile] = useState(null);

  // ===== FETCH USER PROFILE & MATCH HISTORY =====
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) {
      return;
    }

    const fetchMatchHistory = async () => {
      try {
        setIsLoadingMatches(true);

        // 1. Fetch user profile (for current stats)
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, elo_rating, total_matches, wins, losses')
          .eq('id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
        } else {
          setUserProfile(profileData);
        }

        // 2. Fetch match history from database
        // Get all matches where the current user participated (as player_1 or player_2)
        const { data: matchData, error: matchError } = await supabase
          .from('match_history')
          .select(
            `
            id,
            battle_id,
            player_1_id,
            player_2_id,
            winner_id,
            player_1_score,
            player_2_score,
            elo_change_p1,
            elo_change_p2,
            created_at
          `
          )
          .or(`player_1_id.eq.${user.id},player_2_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(50);

        if (matchError) {
          console.error('Error fetching match history:', matchError);
          setMatches([]);
          return;
        }

        if (!matchData || matchData.length === 0) {
          setMatches([]);
          return;
        }

        // 3. Enrich match data with opponent profiles
        const enrichedMatches = await Promise.all(
          matchData.map(async (match) => {
            // Determine if current user was player_1 or player_2
            const isPlayer1 = match.player_1_id === user.id;
            const opponentId = isPlayer1 ? match.player_2_id : match.player_1_id;

            // Fetch opponent profile
            const { data: opponentData } = await supabase
              .from('profiles')
              .select('id, username, avatar_emoji')
              .eq('id', opponentId)
              .maybeSingle();

            const opponentName = opponentData?.username || 'Unknown';
            const isWin = match.winner_id === user.id;
            const eloChange = isPlayer1 ? match.elo_change_p1 : match.elo_change_p2;

            return {
              id: match.id,
              battleId: match.battle_id,
              result: isWin ? 'Win' : match.winner_id === null ? 'Draw' : 'Loss',
              isWin,
              opponent: opponentName,
              eloChange,
              createdAt: match.created_at,
              playerScore: isPlayer1 ? match.player_1_score : match.player_2_score,
              opponentScore: isPlayer1 ? match.player_2_score : match.player_1_score,
            };
          })
        );

        setMatches(enrichedMatches);
      } catch (err) {
        console.error('Unexpected error in fetchMatchHistory:', err);
        setMatches([]);
      } finally {
        setIsLoadingMatches(false);
      }
    };

    fetchMatchHistory();
  }, [isLoaded, isSignedIn, user?.id]);

  const stats = useMemo(() => getStats(matches), [matches]);
  const selectedMatch = matches.find((match) => match.id === selectedMatchId);

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
        {/* USER STATS SECTION */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Ionicons name="game-controller-outline" size={16} color={Colors.accent} />
            <Text style={styles.statValue}>{userProfile?.total_matches || 0}</Text>
            <Text style={styles.statLabel}>Matches</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="trending-up-outline" size={16} color={Colors.primary} />
            <Text style={styles.statValue}>{stats.winRate}%</Text>
            <Text style={styles.statLabel}>Win Rate</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="pulse-outline" size={16} color={Colors.gold} />
            <Text style={styles.statValue}>{userProfile?.elo_rating || 1200}</Text>
            <Text style={styles.statLabel}>Current ELO</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Matches</Text>
          </View>

          {isLoadingMatches ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={{ marginTop: 12, color: Colors.darkGray, fontSize: 13 }}>Loading match history...</Text>
            </View>
          ) : matches.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
              <Ionicons name="game-controller-outline" size={40} color={Colors.darkGray} />
              <Text style={{ marginTop: 12, color: Colors.darkGray, fontSize: 14, fontWeight: '600' }}>No matches yet</Text>
              <Text style={{ marginTop: 4, color: Colors.darkGray, fontSize: 12 }}>Start playing to see your history here</Text>
            </View>
          ) : (
            <View style={styles.feedList}>
              {matches.map((match) => {
                const resultColor = match.isWin ? '#1F9D55' : '#D64545';

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
                      <Text style={styles.topicText}>
                        {match.playerScore} - {match.opponentScore}
                      </Text>
                      <Text style={styles.dateText}>{formatDate(match.createdAt)}</Text>
                    </View>

                    <Text style={[styles.eloChange, { color: match.eloChange >= 0 ? '#1F9D55' : '#D64545' }]}>
                      {match.eloChange > 0 ? '+' : ''}
                      {match.eloChange}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* MATCH REVIEW MODAL - Simplified without question details */}
      <Modal visible={showMatchReview} transparent={true} animationType="fade" onRequestClose={() => setShowMatchReview(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowMatchReview(false)}>
          <View style={styles.modalContent}>
            <Pressable style={styles.reviewPanel} onPress={(e) => e.stopPropagation()}>
              {selectedMatch ? (
                <>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Match Details</Text>
                    <Pressable onPress={() => setShowMatchReview(false)}>
                      <Ionicons name="close" size={24} color={Colors.textDark} />
                    </Pressable>
                  </View>

                  <View style={styles.detailHeaderRow}>
                    <View>
                      <Text style={styles.detailOpponent}>{selectedMatch.opponent}</Text>
                      <Text style={styles.detailDate}>{formatDate(selectedMatch.createdAt)}</Text>
                    </View>
                    <View style={[styles.resultChip, selectedMatch.isWin ? styles.winChip : styles.lossChip]}>
                      <Text style={styles.resultChipText}>{selectedMatch.result}</Text>
                    </View>
                  </View>

                  <View style={{ marginVertical: 16, paddingHorizontal: 12, gap: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(26,26,26,0.06)' }}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: Colors.darkGray, fontSize: 12, fontWeight: '600' }}>Your Score</Text>
                        <Text style={{ color: Colors.textDark, fontSize: 24, fontWeight: '800', marginTop: 4 }}>{selectedMatch.playerScore}</Text>
                      </View>
                      <View style={{ justifyContent: 'center' }}>
                        <Text style={{ color: Colors.darkGray, fontSize: 14, fontWeight: '600' }}>vs</Text>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: Colors.darkGray, fontSize: 12, fontWeight: '600' }}>Opponent</Text>
                        <Text style={{ color: Colors.textDark, fontSize: 24, fontWeight: '800', marginTop: 4 }}>{selectedMatch.opponentScore}</Text>
                      </View>
                    </View>

                    <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                      <Text style={{ color: Colors.darkGray, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>ELO Change</Text>
                      <Text style={{ color: selectedMatch.eloChange >= 0 ? '#1F9D55' : '#D64545', fontSize: 20, fontWeight: '800' }}>
                        {selectedMatch.eloChange > 0 ? '+' : ''}
                        {selectedMatch.eloChange}
                      </Text>
                    </View>
                  </View>
                </>
              ) : null}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

