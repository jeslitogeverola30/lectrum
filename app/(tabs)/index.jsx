import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/expo';
import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../styles/auth/auth_styles.js';

export default function HomeTabScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const displayName = user?.username || user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Arena Player';
  const todayKey = new Date().toISOString().slice(0, 10);

  const { streakCount, didCompleteToday } = useMemo(() => {
    const progress = user?.unsafeMetadata?.appProgress ?? {};
    const persistedStreak = Number(progress.streakCount ?? 0);
    const lastMissionDate = progress.lastMissionDate;

    return {
      streakCount: persistedStreak,
      didCompleteToday: lastMissionDate === todayKey,
    };
  }, [todayKey, user]);

  const dailyMissions = useMemo(
    () => [
      {
        id: 'mission-1',
        title: 'Play 1 Battle',
        subtitle: 'Join any room and complete one full match.',
        done: didCompleteToday,
      },
      {
        id: 'mission-2',
        title: 'Review 1 Match',
        subtitle: 'Open History and study at least one explanation.',
        done: false,
      },
      {
        id: 'mission-3',
        title: 'Keep Streak Alive',
        subtitle: 'Complete today\'s mission before midnight.',
        done: didCompleteToday,
      },
    ],
    [didCompleteToday]
  );

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/auth/sign_in" />;
  }

  return (
    <SafeAreaView style={homeStyles.safeArea} edges={['top', 'left', 'right']}>
      <View style={homeStyles.header}>
        <Text style={homeStyles.headerTitle}>Home</Text>
      </View>

      <View style={homeStyles.screen}>
        <View style={homeStyles.greetingCard}>
          <Text style={homeStyles.kicker}>Welcome Back</Text>
          <Text style={homeStyles.greeting}>Hey {displayName}</Text>
          <Text style={homeStyles.subtitle}>Finish today\'s mission to keep your streak alive.</Text>
        </View>

        <View style={homeStyles.streakCard}>
          <View style={homeStyles.streakLeft}>
            <View style={homeStyles.streakIconWrap}>
              <Ionicons name="flame" size={20} color={Colors.accent} />
            </View>
            <View>
              <Text style={homeStyles.streakTitle}>Current Streak</Text>
              <Text style={homeStyles.streakSubtitle}>
                {didCompleteToday ? 'Mission complete today' : 'Complete today\'s mission to continue'}
              </Text>
            </View>
          </View>
          <Text style={homeStyles.streakValue}>{streakCount}d</Text>
        </View>

        <View style={homeStyles.missionsCard}>
          <Text style={homeStyles.sectionTitle}>Daily Mission</Text>
          <Text style={homeStyles.sectionSubtitle}>Reset every day at midnight.</Text>

          <View style={homeStyles.missionsList}>
            {dailyMissions.map((mission) => (
              <View key={mission.id} style={homeStyles.missionRow}>
                <View style={[homeStyles.missionStatus, mission.done && homeStyles.missionStatusDone]}>
                  <Ionicons
                    name={mission.done ? 'checkmark' : 'ellipse-outline'}
                    size={14}
                    color={mission.done ? Colors.white : Colors.darkGray}
                  />
                </View>
                <View style={homeStyles.missionContent}>
                  <Text style={homeStyles.missionTitle}>{mission.title}</Text>
                  <Text style={homeStyles.missionSubtitle}>{mission.subtitle}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const homeStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F4F7FB',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(26,26,26,0.04)',
    backgroundColor: '#F4F7FB',
  },
  headerTitle: {
    color: Colors.textDark,
    fontSize: 28,
    fontWeight: '900',
  },
  screen: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: '#F4F7FB',
    gap: 12,
  },
  greetingCard: {
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
    gap: 4,
  },
  kicker: {
    color: Colors.darkGray,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  greeting: {
    color: Colors.textDark,
    fontSize: 24,
    fontWeight: '800',
  },
  subtitle: {
    color: Colors.darkGray,
    fontSize: 13,
  },
  streakCard: {
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  streakLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  streakIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FFF3EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakTitle: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '700',
  },
  streakSubtitle: {
    color: Colors.darkGray,
    fontSize: 12,
    marginTop: 1,
  },
  streakValue: {
    color: Colors.textDark,
    fontSize: 22,
    fontWeight: '800',
  },
  missionsCard: {
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
    gap: 10,
  },
  sectionTitle: {
    color: Colors.textDark,
    fontSize: 17,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: Colors.darkGray,
    fontSize: 12,
    lineHeight: 17,
  },
  missionsList: {
    gap: 10,
  },
  missionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 2,
  },
  missionStatus: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFBFD',
    marginTop: 1,
  },
  missionStatusDone: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  missionContent: {
    flex: 1,
  },
  missionTitle: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 1,
  },
  missionSubtitle: {
    color: Colors.darkGray,
    fontSize: 12,
    lineHeight: 17,
  },
});
