import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import { Redirect, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Modal, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../styles/auth/auth_styles.js';

const MY_ROOMS = [
  {
    id: 'room-1',
    name: 'Biology Study Group',
    topic: 'Biology 101',
    members: 3,
    lastMessage: 'Great session today!',
    timestamp: '2 min ago',
    avatar: '🧬',
  },
  {
    id: 'room-2',
    name: 'History Buffs',
    topic: 'Ancient History',
    members: 5,
    lastMessage: 'What about the Silk Road?',
    timestamp: '1 hour ago',
    avatar: '🏛️',
  },
  {
    id: 'room-3',
    name: 'Code Masters',
    topic: 'Computer Science',
    members: 2,
    lastMessage: 'That algorithm is clever',
    timestamp: 'Yesterday',
    avatar: '💻',
  },
  {
    id: 'room-4',
    name: 'Capital Challenge',
    topic: 'World Capitals',
    members: 4,
    lastMessage: 'You: Looking for more players',
    timestamp: '3 days ago',
    avatar: '🌍',
  },
];



export default function RoomsTabScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [roomCode, setRoomCode] = useState('');

  const handleJoinRoom = () => {
    const sanitizedCode = roomCode.replace(/\D/g, '');

    if (sanitizedCode.length !== 5) {
      Alert.alert('Invalid room code', 'Enter the 5-digit code your friend sent you.');
      return;
    }

    Alert.alert('Joining room', `Looking for lobby ${sanitizedCode}.`);
    setRoomCode('');
    setShowActionMenu(false);
  };

  const handleCreateRoom = () => {
    setShowActionMenu(false);
    Alert.alert('Room Created', 'Your private battle is ready!');
  };


  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/auth/sign_in" />;
  }

  const emptyState = MY_ROOMS.length === 0;

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
          data={MY_ROOMS}
          renderItem={renderRoomItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          scrollEnabled={true}
        />
      )}

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
              <Pressable
                onPress={handleCreateRoom}
                style={({ pressed }) => [styles.hostButton, pressed && styles.hostButtonPressed]}
              >
                <Ionicons name="add-circle-outline" size={20} color={Colors.white} />
                <Text style={styles.hostButtonText}>Create Private Battle</Text>
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
