import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useClerk, useAuth, useUser } from '@clerk/expo';
import { Redirect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase.js';
import { Colors } from '../../styles/auth/auth_styles.js';

export default function ProfileTabScreen() {
  const { signOut } = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(true);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // ===== FETCH USER PROFILE FROM DATABASE =====
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user?.id) {
      return;
    }

    const fetchUserProfile = async () => {
      try {
        setIsLoadingProfile(true);
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, avatar_emoji, elo_rating, total_matches, wins, losses')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching profile:', error);
        } else {
          setUserProfile(data);
        }
      } catch (err) {
        console.error('Unexpected error fetching profile:', err);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    fetchUserProfile();
  }, [isLoaded, isSignedIn, user?.id]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const profilePreferences = user.unsafeMetadata?.appPreferences ?? {};

    setSoundEffectsEnabled(profilePreferences.soundEffectsEnabled ?? true);
    setMusicEnabled(profilePreferences.musicEnabled ?? true);
    setPushNotificationsEnabled(profilePreferences.pushNotificationsEnabled ?? true);
  }, [user]);

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (error) {
      Alert.alert('Sign out failed', 'Unable to sign out right now.');
      console.error(error);
    }
  };

  const persistPreferences = async (nextPreferences) => {
    if (!user) {
      return;
    }

    setIsSavingPreferences(true);
    try {
      await user.update({
        unsafeMetadata: {
          ...(user.unsafeMetadata ?? {}),
          appPreferences: nextPreferences,
        },
      });
    } catch (error) {
      Alert.alert('Settings failed', 'Unable to save your settings right now.');
      console.error(error);
    } finally {
      setIsSavingPreferences(false);
    }
  };

  const handleToggleSoundEffects = (value) => {
    setSoundEffectsEnabled(value);
    persistPreferences({
      soundEffectsEnabled: value,
      musicEnabled,
      pushNotificationsEnabled,
    });
  };

  const handleToggleMusic = (value) => {
    setMusicEnabled(value);
    persistPreferences({
      soundEffectsEnabled,
      musicEnabled: value,
      pushNotificationsEnabled,
    });
  };

  const handleTogglePushNotifications = (value) => {
    setPushNotificationsEnabled(value);
    persistPreferences({
      soundEffectsEnabled,
      musicEnabled,
      pushNotificationsEnabled: value,
    });
  };

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/auth/sign_in" />;
  }

  const displayName = user?.username || user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Commander';
  const emailAddress = user?.primaryEmailAddress?.emailAddress || 'No email connected';
  const eloRating = userProfile?.elo_rating || 1200;
  const totalMatches = userProfile?.total_matches || 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <View style={styles.profileTopRow}>
            <View style={styles.avatar}>
              {user?.imageUrl ? (
                <Image source={{ uri: user.imageUrl }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="person" size={30} color={Colors.white} />
              )}
            </View>

            <View style={styles.profileMeta}>
              <Text style={styles.displayName}>{displayName}</Text>
              <Text style={styles.emailText}>{emailAddress}</Text>
            </View>
          </View>

          <View style={styles.profileBadgesRow}>
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Active</Text>
            </View>
          </View>

          <View style={styles.metricsRow}>
            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Current ELO</Text>
              {isLoadingProfile ? (
                <ActivityIndicator color={Colors.primary} size="small" />
              ) : (
                <Text style={styles.metricValue}>{eloRating}</Text>
              )}
            </View>

            <View style={styles.metricBox}>
              <Text style={styles.metricLabel}>Matches Played</Text>
              {isLoadingProfile ? (
                <ActivityIndicator color={Colors.primary} size="small" />
              ) : (
                <Text style={styles.metricValue}>{totalMatches}</Text>
              )}
            </View>
          </View>
        </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>App Settings</Text>
            <Text style={styles.sectionSubtitle}>Audio and notification preferences.</Text>
          </View>
          {isSavingPreferences ? <ActivityIndicator color={Colors.accent} /> : null}
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingTextWrap}>
            <Text style={styles.settingTitle}>Sound Effects</Text>
            <Text style={styles.settingSubtitle}>Click, timer, and success cues.</Text>
          </View>
          <Switch
            value={soundEffectsEnabled}
            onValueChange={handleToggleSoundEffects}
            trackColor={{ false: Colors.borderColor, true: `${Colors.accent}66` }}
            thumbColor={soundEffectsEnabled ? Colors.accent : Colors.white}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingTextWrap}>
            <Text style={styles.settingTitle}>Music</Text>
            <Text style={styles.settingSubtitle}>Atmosphere during intense rounds.</Text>
          </View>
          <Switch
            value={musicEnabled}
            onValueChange={handleToggleMusic}
            trackColor={{ false: Colors.borderColor, true: `${Colors.primary}66` }}
            thumbColor={musicEnabled ? Colors.primary : Colors.white}
          />
        </View>

        <View style={[styles.settingRow, styles.settingRowLast]}>
          <View style={styles.settingTextWrap}>
            <Text style={styles.settingTitle}>Push Notifications</Text>
            <Text style={styles.settingSubtitle}>Room invites, streaks, and reminders.</Text>
          </View>
          <Switch
            value={pushNotificationsEnabled}
            onValueChange={handleTogglePushNotifications}
            trackColor={{ false: Colors.borderColor, true: `${Colors.gold}66` }}
            thumbColor={pushNotificationsEnabled ? Colors.gold : Colors.white}
          />
        </View>
      </View>

      <Pressable onPress={handleLogout} style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutPressed]}>
        <Ionicons name="log-out-outline" size={18} color={Colors.white} />
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
      </ScrollView>
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
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  profileCard: {
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
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.textDark,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  profileMeta: {
    flex: 1,
  },
  displayName: {
    color: Colors.textDark,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 2,
  },
  emailText: {
    color: Colors.darkGray,
    fontSize: 13,
  },
  profileBadgesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3FE08C',
  },
  statusText: {
    color: Colors.textDark,
    fontSize: 12,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricBox: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.04)',
    backgroundColor: '#FAFBFD',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 3,
  },
  metricLabel: {
    color: Colors.darkGray,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    color: Colors.textDark,
    fontSize: 18,
    fontWeight: '800',
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  sectionTitle: {
    color: Colors.textDark,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 2,
  },
  sectionSubtitle: {
    color: Colors.darkGray,
    fontSize: 12,
    lineHeight: 17,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(26,26,26,0.05)',
    gap: 12,
  },
  settingRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  settingTextWrap: {
    flex: 1,
  },
  settingTitle: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  settingSubtitle: {
    color: Colors.darkGray,
    fontSize: 12,
    lineHeight: 17,
  },
  signOutButton: {
    marginTop: 2,
    marginHorizontal: 4,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.textDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  signOutPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  signOutText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
});
