import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase.js';
import { Colors } from '../../styles/auth/auth_styles.js';

const formatRelativeTime = (value) => {
  if (!value) {
    return 'Just now';
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Just now';
  }

  const diffMinutes = Math.floor((Date.now() - parsedDate.getTime()) / 60000);

  if (diffMinutes < 1) {
    return 'Just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  return parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};



export default function RoomsTabScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomTopic, setRoomTopic] = useState('');
  const [inviteEmails, setInviteEmails] = useState('');
  const [rooms, setRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [roomsError, setRoomsError] = useState('');
  const [savingRoom, setSavingRoom] = useState(false);

  const currentUserId = user?.id;
  const currentUserEmail = user?.primaryEmailAddress?.emailAddress || '';
  const currentUsername = user?.username || user?.fullName || currentUserEmail.split('@')[0] || 'Member';

  const ensureProfileRecord = async () => {
    if (!currentUserId) {
      return;
    }

    const { error } = await supabase.from('profiles').upsert(
      {
        id: currentUserId,
        email: currentUserEmail || null,
        username: currentUsername,
        avatar_emoji: '👤',
      },
      { onConflict: 'id' }
    );

    if (error) {
      throw error;
    }
  };

  useEffect(() => {
    let isActive = true;

    const loadRooms = async () => {
      if (!currentUserId) {
        return;
      }

      setLoadingRooms(true);
      setRoomsError('');

      try {
        await ensureProfileRecord();
      } catch (error) {
        if (isActive) {
          setRoomsError(error?.message || 'Failed to sync your profile.');
        }
        return;
      }

      const { data: memberRows, error: membersQueryError } = await supabase
        .from('room_members')
        .select('id, room_id, joined_at, role, room:rooms(id, name, topic, avatar_emoji, created_at, creator_id)')
        .eq('user_id', currentUserId)
        .order('joined_at', { ascending: false });

      if (membersQueryError) {
        if (isActive) {
          setRooms([]);
          setRoomsError(membersQueryError.message);
        }
        return;
      }

      const roomsWithActivity = await Promise.all(
        (memberRows ?? []).map(async (memberRow) => {
          const room = memberRow.room;

          if (!room) {
            return null;
          }

          const [{ count: memberCount }, { data: latestMessages }] = await Promise.all([
            supabase.from('room_members').select('id', { count: 'exact', head: true }).eq('room_id', room.id),
            supabase
              .from('messages')
              .select('text, created_at')
              .eq('room_id', room.id)
              .order('created_at', { ascending: false })
              .limit(1),
          ]);

          const latestMessage = latestMessages?.[0];

          return {
            ...room,
            avatar: room.avatar_emoji || '🎓',
            members: memberCount ?? 0,
            lastMessage: latestMessage?.text || 'No messages yet',
            timestamp: formatRelativeTime(latestMessage?.created_at || room.created_at),
          };
        })
      );

      if (isActive) {
        setRooms(roomsWithActivity.filter(Boolean));
      }
    };

    loadRooms().finally(() => {
      if (isActive) {
        setLoadingRooms(false);
      }
    });

    return () => {
      isActive = false;
    };
  }, [currentUserEmail, currentUserId, currentUsername]);


  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/auth/sign_in" />;
  }

  const emptyState = !loadingRooms && rooms.length === 0;

  const parseInviteEmails = () =>
    inviteEmails
      .split(/[\n,;]/)
      .map((email) => email.trim())
      .filter(Boolean);

  const handleOpenRoom = (room) => {
    router.push({
      pathname: '/room/[id]',
      params: {
        id: room.id,
        name: room.name,
        topic: room.topic,
        avatar: room.avatar,
      },
    });
  };

  const renderRoomItem = ({ item }) => (
    <Pressable
      onPress={() => handleOpenRoom(item)}
      style={({ pressed }) => [styles.roomItem, pressed && styles.roomItemPressed]}
    >
      <View style={styles.roomAvatar}>
        <Text style={styles.avatarEmoji}>{item.avatar}</Text>
      </View>
      <View style={styles.roomContent}>
        <Text style={styles.roomName}>{item.name}</Text>
        <Text style={styles.roomTopic}>{item.topic}</Text>
        <Text style={styles.lastMessage} numberOfLines={1}>{item.lastMessage}</Text>
      </View>
      <View style={styles.roomMeta}>
        <Text style={styles.timestamp}>{item.timestamp}</Text>
        <View style={styles.memberBadge}>
          <Ionicons name="people-sharp" size={12} color={Colors.accent} />
          <Text style={styles.memberCount}>{item.members}</Text>
        </View>
      </View>
    </Pressable>
  );

  const handleCreateRoom = async () => {
    const trimmedRoomName = roomName.trim();
    const trimmedRoomTopic = roomTopic.trim();
    const inviteEmailList = parseInviteEmails();

    if (!trimmedRoomName) {
      Alert.alert('Missing room name', 'Enter a name for the room.');
      return;
    }

    if (inviteEmailList.length < 1) {
      Alert.alert('Missing invitee', 'Add at least 1 user by email.');
      return;
    }

    if (!currentUserId) {
      Alert.alert('Missing user', 'Please wait for your account to finish loading.');
      return;
    }

    setSavingRoom(true);

    try {
      await ensureProfileRecord();

      const { data, error } = await supabase.rpc('create_room_with_invites', {
        p_creator_id: currentUserId,
        p_creator_email: currentUserEmail || null,
        p_room_name: trimmedRoomName,
        p_room_topic: trimmedRoomTopic || 'Study Room',
        p_invite_emails: inviteEmailList,
        p_avatar_emoji: '🎓',
      });

      if (error) {
        throw error;
      }

      const createdRoom = Array.isArray(data) ? data[0] : data;

      setShowActionMenu(false);
      setRoomName('');
      setRoomTopic('');
      setInviteEmails('');

      if (createdRoom?.id) {
        router.push({
          pathname: '/room/[id]',
          params: {
            id: createdRoom.id,
            name: createdRoom.name,
            topic: createdRoom.topic,
            avatar: createdRoom.avatar_emoji || '🎓',
          },
        });
        return;
      }

      Alert.alert('Room created', 'Your room was created successfully.');
    } catch (error) {
      Alert.alert('Room creation failed', error?.message || 'Unable to create room right now.');
    } finally {
      setSavingRoom(false);
    }
  };

  const handleJoinRoom = async () => {
    const sanitizedCode = roomCode.replace(/\D/g, '');

    if (sanitizedCode.length !== 5) {
      Alert.alert('Invalid room code', 'Enter the 5-digit code your friend sent you.');
      return;
    }

    if (!currentUserId) {
      Alert.alert('Missing user', 'Please wait for your account to finish loading.');
      return;
    }

    try {
      await ensureProfileRecord();

      const { data, error } = await supabase.rpc('join_room_by_code', {
        p_user_id: currentUserId,
        p_user_email: currentUserEmail || null,
        p_room_code: sanitizedCode,
      });

      if (error) {
        throw error;
      }

      const joinedRoom = Array.isArray(data) ? data[0] : data;

      setRoomCode('');
      setShowActionMenu(false);

      if (joinedRoom?.id) {
        router.push({
          pathname: '/room/[id]',
          params: {
            id: joinedRoom.id,
            name: joinedRoom.name,
            topic: joinedRoom.topic,
            avatar: joinedRoom.avatar_emoji || '🎓',
          },
        });
        return;
      }

      Alert.alert('Joined room', 'You have been added to the room.');
    } catch (error) {
      Alert.alert('Joining room failed', error?.message || 'Unable to join room right now.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Rooms</Text>
      </View>

      {emptyState ? (
        <ScrollView style={styles.screen} contentContainerStyle={styles.emptyContent}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎓</Text>
            <Text style={styles.emptyTitle}>No Rooms Yet</Text>
            <Text style={styles.emptySubtitle}>Join or create a room to get started studying with friends</Text>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={rooms}
          renderItem={renderRoomItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={true}
        />
      )}

      {loadingRooms ? (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <Text style={styles.loadingText}>Loading rooms from Supabase...</Text>
        </View>
      ) : null}

      {roomsError ? (
        <View style={styles.errorBanner} pointerEvents="none">
          <Text style={styles.errorBannerText}>{roomsError}</Text>
        </View>
      ) : null}

      {/* Floating Action Button */}
      <Pressable
        onPress={() => setShowActionMenu(true)}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </Pressable>

      {/* Action Menu Modal */}
      <Modal
        visible={showActionMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowActionMenu(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowActionMenu(false)}>
          <View style={styles.actionMenu}>
            {/* Join Room */}
            <View style={styles.actionSection}>
              <View style={styles.actionSectionHeader}>
                <Ionicons name="keypad-outline" size={18} color={Colors.accent} />
                <Text style={styles.actionSectionTitle}>Join a Room</Text>
              </View>
              <View style={styles.actionInputRow}>
                <TextInput
                  value={roomCode}
                  onChangeText={(value) => setRoomCode(value.replace(/\D/g, '').slice(0, 5))}
                  placeholder="5-digit room code"
                  placeholderTextColor={Colors.darkGray}
                  keyboardType="number-pad"
                  maxLength={5}
                  style={styles.actionInput}
                />
                <Pressable
                  onPress={handleJoinRoom}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                >
                  <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                </Pressable>
              </View>
            </View>

            {/* Divider */}
            <View style={styles.actionDivider} />

            {/* Host Room */}
            <View style={styles.actionSection}>
              <View style={styles.actionSectionHeader}>
                <Ionicons name="people-outline" size={18} color={Colors.accent} />
                <Text style={styles.actionSectionTitle}>Create Room</Text>
              </View>

              <TextInput
                value={roomName}
                onChangeText={setRoomName}
                placeholder="Name of Room"
                placeholderTextColor={Colors.darkGray}
                style={styles.roomInput}
              />

              <TextInput
                value={roomTopic}
                onChangeText={setRoomTopic}
                placeholder="Topic (optional)"
                placeholderTextColor={Colors.darkGray}
                style={styles.roomInput}
              />

              <TextInput
                value={inviteEmails}
                onChangeText={setInviteEmails}
                placeholder="Add at least 1 user by email"
                placeholderTextColor={Colors.darkGray}
                style={[styles.roomInput, styles.roomInputMultiline]}
                multiline
                numberOfLines={3}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Pressable
                onPress={handleCreateRoom}
                disabled={savingRoom}
                style={({ pressed }) => [
                  styles.hostButton,
                  pressed && styles.hostButtonPressed,
                  savingRoom && styles.hostButtonDisabled,
                ]}
              >
                <Ionicons name="add-circle-outline" size={20} color={Colors.white} />
                <Text style={styles.hostButtonText}>{savingRoom ? 'Creating Room...' : 'Create Room'}</Text>
              </Pressable>
            </View>

            {/* Close Button */}
            <Pressable
              onPress={() => setShowActionMenu(false)}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
              <Text style={styles.closeButtonText}>Cancel</Text>
            </Pressable>
          </View>
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
  listContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  roomItem: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.04)',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    gap: 12,
    alignItems: 'center',
  },
  roomItemPressed: {
    backgroundColor: '#F8FAFC',
    opacity: 0.8,
  },
  roomAvatar: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#FFF3EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 28,
  },
  roomContent: {
    flex: 1,
    gap: 3,
  },
  roomName: {
    color: Colors.textDark,
    fontSize: 15,
    fontWeight: '700',
  },
  roomTopic: {
    color: Colors.darkGray,
    fontSize: 12,
    fontWeight: '500',
  },
  lastMessage: {
    color: '#999',
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
  },
  roomMeta: {
    alignItems: 'flex-end',
    gap: 8,
  },
  timestamp: {
    color: Colors.darkGray,
    fontSize: 11,
    fontWeight: '500',
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  memberCount: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  emptyState: {
    alignItems: 'center',
    gap: 16,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 8,
  },
  emptyTitle: {
    color: Colors.textDark,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySubtitle: {
    color: Colors.darkGray,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 280,
  },
  loadingOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 108,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  loadingText: {
    color: Colors.textDark,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 108,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#FFF3F3',
    borderWidth: 1,
    borderColor: '#F4C7C7',
  },
  errorBannerText: {
    color: '#A33',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.9,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  actionMenu: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 16,
  },
  actionSection: {
    gap: 12,
  },
  actionSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionSectionTitle: {
    color: Colors.textDark,
    fontSize: 16,
    fontWeight: '700',
  },
  actionInputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  actionInput: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.08)',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    color: Colors.textDark,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  roomInput: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.08)',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '600',
  },
  roomInputMultiline: {
    minHeight: 78,
    textAlignVertical: 'top',
  },
  actionButton: {
    width: 50,
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  hostButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.textDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  hostButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  hostButtonDisabled: {
    opacity: 0.7,
  },
  hostButtonText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  actionDivider: {
    height: 1,
    backgroundColor: 'rgba(26,26,26,0.06)',
    marginVertical: 4,
  },
  closeButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.08)',
  },
  closeButtonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  closeButtonText: {
    color: Colors.textDark,
    fontSize: 15,
    fontWeight: '700',
  },
});
