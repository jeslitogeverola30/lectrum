import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/expo';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../services/supabase.js';
import { Colors } from '../../styles/auth/auth_styles.js';

const formatRoomTime = (value) => {
  if (!value) {
    return 'Just now';
  }
  

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return 'Just now';
  }

  return parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const readUriAsBase64 = async (uri) => {
  try {
    return await FileSystemLegacy.readAsStringAsync(uri, {
      encoding: FileSystemLegacy.EncodingType.Base64,
    });
  } catch (_) {
    // Some providers expose URIs that fail direct fs reads; fetch + blob works in those cases.
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error('Unable to read the selected file. Please pick it again.');
    }

    const blob = await response.blob();
    const base64FromBlob = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const value = typeof reader.result === 'string' ? reader.result : '';
        resolve(value.includes(',') ? value.split(',')[1] : value);
      };
      reader.onerror = () => reject(new Error('Failed to convert file to base64.'));
      reader.readAsDataURL(blob);
    });

    return base64FromBlob;
  }
};

export default function RoomChatScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [inputMessage, setInputMessage] = useState('');
  const [showConversationInfo, setShowConversationInfo] = useState(false);
  const [showBattleConfig, setShowBattleConfig] = useState(false);
  const [showWaitingRoom, setShowWaitingRoom] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [selectedSourceFile, setSelectedSourceFile] = useState(null);
  const [isCreatingBattle, setIsCreatingBattle] = useState(false);
  const [selectedItemCount, setSelectedItemCount] = useState(5);
  const [selectedTimePerItem, setSelectedTimePerItem] = useState(20);
  const [activeBattle, setActiveBattle] = useState(null);

  const roomId = Array.isArray(params.id) ? params.id[0] : params.id;
  const roomName = Array.isArray(params.name) ? params.name[0] : params.name;
  const roomTopic = Array.isArray(params.topic) ? params.topic[0] : params.topic;
  const roomAvatar = Array.isArray(params.avatar) ? params.avatar[0] : params.avatar;
  const [roomRecord, setRoomRecord] = useState(null);
  const [messages, setMessages] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);
  const [isLoadingRoom, setIsLoadingRoom] = useState(true);
  const [roomError, setRoomError] = useState('');
  const [currentRoomAvatar, setCurrentRoomAvatar] = useState(roomAvatar || '🎓');
  const isRoomAvatarImage =
    typeof currentRoomAvatar === 'string' &&
    (currentRoomAvatar.startsWith('file://') ||
      currentRoomAvatar.startsWith('content://') ||
      currentRoomAvatar.startsWith('http://') ||
      currentRoomAvatar.startsWith('https://'));

  const displayName = user?.username || user?.fullName || user?.primaryEmailAddress?.emailAddress || 'You';
  const isCreator = Boolean(roomRecord?.creator_id && user?.id && roomRecord.creator_id === user.id);
  const creatorBattleReady = Boolean(activeBattle?.id && roomRecord?.creator_id && activeBattle.creator_id === roomRecord.creator_id);

  const ensureProfileRecord = async () => {
    if (!user?.id) {
      return;
    }

    const { error } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        email: user?.primaryEmailAddress?.emailAddress || null,
        username: user?.username || user?.fullName || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Member',
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

    const loadRoom = async () => {
      if (!roomId) {
        if (isActive) {
          setRoomError('Missing room id.');
          setIsLoadingRoom(false);
        }
        return;
      }

      setIsLoadingRoom(true);
      setRoomError('');

      try {
        await ensureProfileRecord();
      } catch (error) {
        if (isActive) {
          setRoomError(error?.message || 'Failed to sync your profile.');
          setIsLoadingRoom(false);
        }
        return;
      }

      const { data: roomData, error: roomQueryError } = await supabase
        .from('rooms')
        .select('id, name, topic, avatar_emoji, room_code, creator_id, creator:profiles(username)')
        .eq('id', roomId)
        .maybeSingle();

      if (roomQueryError) {
        if (isActive) {
          setRoomError(roomQueryError.message);
          setIsLoadingRoom(false);
        }
        return;
      }

      if (isActive) {
        setRoomRecord(roomData ?? null);
        setCurrentRoomAvatar(roomData?.avatar_emoji || roomAvatar || '🎓');
      }

      const [messageResult, memberResult, battleResult] = await Promise.all([
        supabase
          .from('messages')
          .select('id, text, created_at, sender_id, sender:profiles(username)')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true }),
        supabase
          .from('room_members')
          .select('id, user_id, role, joined_at, member:profiles(username)')
          .eq('room_id', roomId)
          .order('joined_at', { ascending: true }),
        supabase
          .from('battles')
          .select('id, creator_id, quiz_id, round_count, time_per_item, status, created_at')
          .eq('room_id', roomId)
          .in('status', ['pending', 'active'])
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (isActive) {
        if (!messageResult.error) {
          setMessages(
            (messageResult.data ?? []).map((message) => ({
              id: message.id,
              sender: message.sender?.username || message.sender_id || 'Member',
              text: message.text,
              mine: message.sender_id === user?.id,
              time: formatRoomTime(message.created_at),
            }))
          );
        } else {
          setRoomError(messageResult.error.message);
          setMessages([]);
        }

        if (!memberResult.error) {
          const creatorId = roomData?.creator_id;

          setRoomMembers(
            (memberResult.data ?? []).map((member) => ({
              id: member.id,
              userId: member.user_id,
              name: member.member?.username || (member.user_id === user?.id ? 'You' : 'Member'),
              role: member.role || (member.user_id === creatorId ? 'creator' : 'member'),
            }))
          );
        }

        if (!battleResult.error) {
          setActiveBattle((battleResult.data ?? [])[0] ?? null);
        } else {
          setActiveBattle(null);
        }
      }

      if (isActive) {
        setIsLoadingRoom(false);
      }
    };

    loadRoom();

    return () => {
      isActive = false;
    };
  }, [roomAvatar, roomId, user?.id, user?.fullName, user?.primaryEmailAddress?.emailAddress, user?.username]);

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/auth/sign_in" />;
  }

  const handleUpload = () => {
    handlePickSource();
  };

  const handleSend = async () => {
    const trimmedMessage = inputMessage.trim();

    if (!trimmedMessage) {
      return;
    }

    if (!roomId || !user?.id) {
      Alert.alert('Cannot send message', 'Room data is still loading.');
      return;
    }

    try {
      await ensureProfileRecord();

      const { data, error } = await supabase.rpc('send_room_message', {
        p_sender_id: user.id,
        p_room_id: roomId,
        p_text: trimmedMessage,
      });

      if (error) {
        throw error;
      }

      const createdMessage = Array.isArray(data) ? data[0] : data;

      if (createdMessage?.id) {
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            id: createdMessage.id,
            sender: displayName,
            text: createdMessage.text,
            mine: true,
            time: formatRoomTime(createdMessage.created_at),
          },
        ]);
      }

      setInputMessage('');
    } catch (error) {
      Alert.alert('Message failed', error?.message || 'Unable to send message right now.');
    }
  };

  const handlePickSource = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.ms-word',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        return;
      }

      const pickedFile = result.assets?.[0];
      if (!pickedFile) {
        return;
      }

      const mimeType = pickedFile.mimeType || '';
      const fileName = pickedFile.name || 'uploaded-file';
      const normalizedName = fileName.toLowerCase();
      const isPdf = mimeType.includes('pdf') || normalizedName.endsWith('.pdf');
      const isDocx =
        mimeType.includes('officedocument.wordprocessingml.document') ||
        normalizedName.endsWith('.docx');

      if (!isPdf && !isDocx) {
        Alert.alert('Unsupported file', 'Please upload a PDF or DOCX file.');
        return;
      }

      setSelectedSourceFile({
        name: fileName,
        uri: pickedFile.uri,
        mimeType: mimeType || (isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
      });
      setSelectedFileName(fileName);
      Alert.alert('File selected', `Attached ${fileName}.`);
    } catch (error) {
      Alert.alert('Upload failed', 'Unable to pick a file right now.');
      console.error(error);
    }
  };

  const handleStartQuizBattle = async () => {
    if (!selectedSourceFile) {
      Alert.alert('No file selected', 'Please upload a source file before starting the battle.');
      return;
    }

    if (!isCreator || !roomId || !user?.id) {
      Alert.alert('Cannot create battle', 'Only the creator can launch a battle.');
      return;
    }

    try {
      setIsCreatingBattle(true);

      if (!selectedSourceFile?.uri) {
        throw new Error('Selected file is missing a readable URI. Please pick the file again.');
      }

      const fileBase64 = await readUriAsBase64(selectedSourceFile.uri);

      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('generate-quiz', {
        body: {
          file_base64: fileBase64,
          file_mime_type: selectedSourceFile.mimeType,
          file_name: selectedSourceFile.name,
          question_count: selectedItemCount,
          input_text: roomRecord?.topic || roomTopic || '',
        },
      });

      if (edgeError || edgeData?.error) {
        let edgeErrorMessage = edgeError?.message;

        if (edgeError?.context && typeof edgeError.context.json === 'function') {
          const payload = await edgeError.context.json().catch(() => null);
          if (payload?.error) {
            edgeErrorMessage = payload.error;
          }
        }

        throw new Error(edgeErrorMessage || edgeData?.error || 'Failed to generate quiz from source file.');
      }

      const generatedQuiz = Array.isArray(edgeData?.quiz) ? edgeData.quiz : [];
      if (!generatedQuiz.length) {
        throw new Error('No quiz items were generated from the uploaded file.');
      }

      const { data: quizRow, error: quizError } = await supabase
        .from('quizzes')
        .insert([
          {
            creator_id: user.id,
            topic: roomRecord?.topic || roomTopic || selectedSourceFile.name,
            description: `Generated from ${selectedSourceFile.name}`,
            raw_json_content: generatedQuiz,
            question_count: generatedQuiz.length,
          },
        ])
        .select('id')
        .single();

      if (quizError || !quizRow?.id) {
        throw quizError || new Error('Quiz could not be saved.');
      }

      const { data, error } = await supabase
        .from('battles')
        .insert([
          {
            room_id: roomId,
            quiz_id: quizRow.id,
            creator_id: user.id,
            round_count: selectedItemCount,
            time_per_item: selectedTimePerItem,
            status: 'pending',
          },
        ])
        .select('id, creator_id, quiz_id, round_count, time_per_item, status, created_at')
        .single();

      if (error) {
        throw error;
      }

      setActiveBattle(data ?? null);
    } catch (error) {
      Alert.alert('Battle creation failed', error?.message || 'Unable to create battle right now.');
      return;
    } finally {
      setIsCreatingBattle(false);
    }

    setShowBattleConfig(false);
    setShowWaitingRoom(true);
  };

  const handleEnterBattleArena = async () => {
    if (activeBattle?.id) {
      await supabase.from('battles').update({ status: 'active' }).eq('id', activeBattle.id);
    }

    setShowWaitingRoom(false);
    router.push({
      pathname: '/battle/[id]',
      params: {
        id: roomId || 'room',
        roomName: roomName || 'Study Room',
        roomTopic: roomTopic || 'General Knowledge',
        battleId: activeBattle?.id || '',
        quizId: activeBattle?.quiz_id || '',
        rounds: String(activeBattle?.round_count || selectedItemCount),
        timePerItem: String(activeBattle?.time_per_item || selectedTimePerItem),
      },
    });
  };

  const handleJoinCreatorBattle = () => {
    if (!creatorBattleReady) {
      Alert.alert('No active battle', 'The creator has not launched a battle yet.');
      return;
    }

    router.push({
      pathname: '/battle/[id]',
      params: {
        id: roomId || 'room',
        roomName: roomRecord?.name || roomName || 'Study Room',
        roomTopic: roomRecord?.topic || roomTopic || 'General Knowledge',
        battleId: activeBattle?.id || '',
        quizId: activeBattle?.quiz_id || '',
        rounds: String(activeBattle?.round_count || 5),
        timePerItem: String(activeBattle?.time_per_item || 20),
      },
    });
  };

  const handleRemoveMember = (member) => {
    if (!isCreator || member.role === 'creator') {
      return;
    }

    Alert.alert('Remove member', `Remove ${member.name} from this room?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setRoomMembers((prevMembers) => prevMembers.filter((prevMember) => prevMember.id !== member.id));
        },
      },
    ]);
  };

  const handleChangeRoomPhoto = async () => {
    if (!isCreator) {
      Alert.alert('Permission denied', 'Only the room creator can change the room photo.');
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow photo library access to change the room photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });

      if (result.canceled) {
        return;
      }

      const selectedAsset = result.assets?.[0];
      if (!selectedAsset?.uri) {
        return;
      }

      setCurrentRoomAvatar(selectedAsset.uri);
    } catch (error) {
      Alert.alert('Photo update failed', 'Unable to update the room photo right now.');
      console.error(error);
    }
  };

  const renderMessage = ({ item }) => (
    <View style={[styles.messageRow, item.mine && styles.messageRowMine]}>
      {!item.mine ? <Text style={styles.senderName}>{item.sender}</Text> : null}
      <View style={[styles.messageBubble, item.mine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
        <Text style={[styles.messageText, item.mine && styles.messageTextMine]}>{item.text}</Text>
      </View>
      <Text style={[styles.messageTime, item.mine && styles.messageTimeMine]}>{item.time}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}>
          <Ionicons name="chevron-back" size={20} color={Colors.textDark} />
        </Pressable>

        <View style={styles.headerMeta}>
          <View style={styles.avatarWrap}>
            {isRoomAvatarImage ? (
              <Image source={{ uri: currentRoomAvatar }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>{currentRoomAvatar}</Text>
            )}
          </View>
          <View>
            <Text style={styles.headerTitle}>{roomRecord?.name || roomName || 'Room Chat'}</Text>
            <Text style={styles.headerSubtitle}>{roomRecord?.topic || roomTopic || 'Study Room'}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => setShowConversationInfo(true)}
          style={({ pressed }) => [styles.infoButton, pressed && styles.backButtonPressed]}
        >
          <Ionicons name="information-circle-outline" size={20} color={Colors.textDark} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesContent}
          ListEmptyComponent={
            roomError ? (
              <Text style={styles.emptyText}>{roomError}</Text>
            ) : isLoadingRoom ? (
              <Text style={styles.emptyText}>Loading room data from Supabase...</Text>
            ) : (
              <Text style={styles.emptyText}>No messages yet. Start the conversation.</Text>
            )
          }
        />

        <View style={styles.composerWrap}>
          <Pressable onPress={handleUpload} style={({ pressed }) => [styles.uploadButton, pressed && styles.uploadButtonPressed]}>
            <Ionicons name="attach" size={18} color={Colors.textDark} />
          </Pressable>

          <TextInput
            value={inputMessage}
            onChangeText={setInputMessage}
            placeholder="Type a message"
            placeholderTextColor={Colors.darkGray}
            style={styles.input}
            multiline
            maxLength={500}
          />

          <Pressable onPress={handleSend} style={({ pressed }) => [styles.sendButton, pressed && styles.sendButtonPressed]}>
            <Ionicons name="send" size={16} color={Colors.white} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {isCreator ? (
        <Pressable
          onPress={() => setShowBattleConfig(true)}
          style={({ pressed }) => [styles.battleFab, pressed && styles.battleFabPressed]}
        >
          <Ionicons name="flash" size={18} color={Colors.white} />
          <Text style={styles.battleFabText}>Quiz Battle</Text>
        </Pressable>
      ) : creatorBattleReady ? (
        <Pressable
          onPress={handleJoinCreatorBattle}
          style={({ pressed }) => [styles.battleFab, styles.joinBattleFab, pressed && styles.battleFabPressed]}
        >
          <Ionicons name="play" size={16} color={Colors.white} />
          <Text style={styles.battleFabText}>Join Battle</Text>
        </Pressable>
      ) : null}

      <Modal
        visible={showConversationInfo}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowConversationInfo(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowConversationInfo(false)}>
          <View style={styles.infoPanel}>
            <View style={styles.infoHeader}>
              <View>
                <Text style={styles.infoTitle}>Room Info</Text>
                <Text style={styles.infoSubtitle}>{roomMembers.length} members</Text>
                <Text style={styles.infoRoomCode}>Code: {roomRecord?.room_code || '-----'}</Text>
              </View>
              <Pressable onPress={() => setShowConversationInfo(false)} style={styles.infoCloseButton}>
                <Ionicons name="close" size={20} color={Colors.textDark} />
              </Pressable>
            </View>

            <View style={styles.creatorPill}>
              <Text style={styles.creatorText}>Creator: {roomRecord?.creator?.username || (isCreator ? displayName : 'Unknown')}</Text>
            </View>

            <View style={styles.roomPhotoCard}>
              <View style={styles.roomPhotoLeft}>
                <View style={styles.roomPhotoAvatarWrap}>
                  {isRoomAvatarImage ? (
                    <Image source={{ uri: currentRoomAvatar }} style={styles.roomPhotoAvatarImage} />
                  ) : (
                    <Text style={styles.roomPhotoAvatarText}>{currentRoomAvatar}</Text>
                  )}
                </View>
                <View>
                  <Text style={styles.roomPhotoTitle}>Room Photo</Text>
                  <Text style={styles.roomPhotoSubtitle}>Visible to all members in this conversation.</Text>
                </View>
              </View>

              <Pressable
                onPress={handleChangeRoomPhoto}
                style={({ pressed }) => [
                  styles.changePhotoButton,
                  !isCreator && styles.changePhotoButtonDisabled,
                  pressed && styles.changePhotoButtonPressed,
                ]}
              >
                <Text style={styles.changePhotoButtonText}>{isCreator ? 'Change Photo' : 'Creator Only'}</Text>
              </Pressable>
            </View>

            <View style={styles.membersList}>
              {roomMembers.map((member) => {
                const isMemberCreator = member.role === 'creator' || member.userId === roomRecord?.creator_id;
                const canRemove = isCreator && !isMemberCreator;
                const initial = member.name.slice(0, 1).toUpperCase();

                return (
                  <View key={member.id} style={styles.memberRow}>
                    <View style={styles.memberLeft}>
                      <View style={styles.memberAvatar}>
                        <Text style={styles.memberAvatarText}>{initial}</Text>
                      </View>
                      <View>
                        <Text style={styles.memberName}>{member.name}</Text>
                        <Text style={styles.memberRole}>{isMemberCreator ? 'Creator' : 'Member'}</Text>
                      </View>
                    </View>

                    {canRemove ? (
                      <Pressable
                        onPress={() => handleRemoveMember(member)}
                        style={({ pressed }) => [styles.removeMemberButton, pressed && styles.removeMemberButtonPressed]}
                      >
                        <Text style={styles.removeMemberText}>Remove</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showBattleConfig}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBattleConfig(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowBattleConfig(false)}>
          <View style={styles.infoPanel}>
            <View style={styles.infoHeader}>
              <View>
                <Text style={styles.infoTitle}>Create Quiz Battle</Text>
                <Text style={styles.infoSubtitle}>Upload source, choose items, and set timer.</Text>
              </View>
              <Pressable onPress={() => setShowBattleConfig(false)} style={styles.infoCloseButton}>
                <Ionicons name="close" size={20} color={Colors.textDark} />
              </Pressable>
            </View>

            <View style={styles.sectionGroup}>
              <Text style={styles.groupLabel}>Source File</Text>
              <Pressable
                onPress={handlePickSource}
                style={({ pressed }) => [styles.sourceButton, pressed && styles.sourceButtonPressed]}
              >
                <Ionicons name="document-attach-outline" size={16} color={Colors.textDark} />
                <Text style={styles.sourceButtonText}>Upload File</Text>
              </Pressable>

              <Text style={styles.selectedFileText}>
                {selectedFileName ? `Selected: ${selectedFileName}` : 'No file selected'}
              </Text>
              <Text style={styles.sourceHintText}>Supports PDF and DOCX</Text>
            </View>

            <View style={styles.sectionGroup}>
              <Text style={styles.groupLabel}>Number of Items</Text>
              <View style={styles.countRow}>
                {[5, 10].map((count) => (
                  <Pressable
                    key={count}
                    onPress={() => setSelectedItemCount(count)}
                    style={({ pressed }) => [
                      styles.countButton,
                      selectedItemCount === count && styles.countButtonActive,
                      pressed && styles.countButtonPressed,
                    ]}
                  >
                    <Text style={[styles.countButtonText, selectedItemCount === count && styles.countButtonTextActive]}>{count}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.sectionGroup}>
              <Text style={styles.groupLabel}>Time Per Item (seconds)</Text>
              <View style={styles.countRow}>
                {[5, 10, 15, 20, 25, 30].map((seconds) => (
                  <Pressable
                    key={seconds}
                    onPress={() => setSelectedTimePerItem(seconds)}
                    style={({ pressed }) => [
                      styles.countButton,
                      selectedTimePerItem === seconds && styles.countButtonActive,
                      pressed && styles.countButtonPressed,
                    ]}
                  >
                    <Text style={[styles.countButtonText, selectedTimePerItem === seconds && styles.countButtonTextActive]}>{seconds}s</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable
              onPress={handleStartQuizBattle}
              disabled={isCreatingBattle}
              style={({ pressed }) => [
                styles.launchBattleButton,
                isCreatingBattle && styles.launchBattleButtonDisabled,
                pressed && styles.launchBattleButtonPressed,
              ]}
            >
              <Ionicons name="rocket-outline" size={18} color={Colors.white} />
              <Text style={styles.launchBattleText}>{isCreatingBattle ? 'Generating Quiz...' : 'Launch Battle'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showWaitingRoom}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowWaitingRoom(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowWaitingRoom(false)}>
          <View style={styles.waitingPanel}>
            <View style={styles.waitingIconWrap}>
              <Ionicons name="people-outline" size={28} color={Colors.primary} />
            </View>
            <Text style={styles.waitingTitle}>Waiting for Members</Text>
            <Text style={styles.waitingSubtitle}>
              Battle configured with {selectedItemCount} items from {selectedFileName || 'your file'}.
              {isCreator ? ' Start when everyone is ready.' : ' Waiting for the creator to start the battle.'}
            </Text>

            <View style={styles.waitingMetaRow}>
              <Text style={styles.waitingMetaText}>Room: {roomName || 'Study Room'}</Text>
              <Text style={styles.waitingMetaText}>Items: {selectedItemCount}</Text>
              <Text style={styles.waitingMetaText}>Time: {activeBattle?.time_per_item || selectedTimePerItem}s</Text>
            </View>

            <View style={styles.lobbyMembersCard}>
              <Text style={styles.lobbyMembersTitle}>Lobby Members</Text>
              {roomMembers.map((member) => {
                const isMemberCreator = member.role === 'creator' || member.userId === roomRecord?.creator_id;
                const initial = member.name.slice(0, 1).toUpperCase();

                return (
                  <View key={`waiting-${member.id}`} style={styles.lobbyMemberRow}>
                    <View style={styles.lobbyMemberLeft}>
                      <View style={styles.lobbyMemberAvatar}>
                        <Text style={styles.lobbyMemberAvatarText}>{initial}</Text>
                      </View>
                      <View>
                        <Text style={styles.lobbyMemberName}>{member.name}</Text>
                        <Text style={styles.lobbyMemberRole}>{isMemberCreator ? 'Creator' : 'Member'}</Text>
                      </View>
                    </View>

                    <View style={[styles.lobbyStatusPill, isMemberCreator && styles.lobbyStatusCreator]}>
                      <Text style={styles.lobbyStatusText}>{isMemberCreator ? 'Can Start' : 'In Lobby'}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <Pressable
              onPress={() => setShowWaitingRoom(false)}
              style={({ pressed }) => [styles.closeWaitingButton, pressed && styles.closeWaitingButtonPressed]}
            >
              <Text style={styles.closeWaitingText}>Close</Text>
            </Pressable>

            {isCreator ? (
              <Pressable
                onPress={handleEnterBattleArena}
                style={({ pressed }) => [styles.enterArenaButton, pressed && styles.enterArenaButtonPressed]}
              >
                <Ionicons name="game-controller-outline" size={18} color={Colors.white} />
                <Text style={styles.enterArenaText}>Start Battle</Text>
              </Pressable>
            ) : (
              <View style={styles.waitingCreatorNotice}>
                <Ionicons name="time-outline" size={16} color={Colors.darkGray} />
                <Text style={styles.waitingCreatorNoticeText}>Waiting for the creator to start the battle...</Text>
              </View>
            )}
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(26,26,26,0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  infoButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.06)',
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFF3EF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 18,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  headerTitle: {
    color: Colors.textDark,
    fontSize: 15,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: Colors.darkGray,
    fontSize: 12,
    marginTop: 1,
  },
  messagesContent: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 10,
  },
  messageRow: {
    alignItems: 'flex-start',
    maxWidth: '82%',
  },
  messageRowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  senderName: {
    color: Colors.darkGray,
    fontSize: 11,
    marginBottom: 3,
    marginLeft: 2,
  },
  messageBubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
  },
  messageBubbleOther: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(26,26,26,0.06)',
  },
  messageBubbleMine: {
    backgroundColor: Colors.textDark,
    borderColor: Colors.textDark,
  },
  messageText: {
    color: Colors.textDark,
    fontSize: 13,
    lineHeight: 18,
  },
  messageTextMine: {
    color: Colors.white,
  },
  messageTime: {
    color: '#999',
    fontSize: 10,
    marginTop: 3,
    marginLeft: 2,
  },
  messageTimeMine: {
    marginRight: 2,
    marginLeft: 0,
  },
  emptyText: {
    color: Colors.darkGray,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 30,
  },
  composerWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(26,26,26,0.04)',
    backgroundColor: '#F4F7FB',
  },
  uploadButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonPressed: {
    opacity: 0.8,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.08)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textDark,
    fontSize: 14,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonPressed: {
    opacity: 0.85,
  },
  battleFab: {
    position: 'absolute',
    right: 14,
    bottom: 100,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  joinBattleFab: {
    backgroundColor: Colors.accent,
  },
  battleFabPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.96 }],
  },
  battleFabText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  infoPanel: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 32,
    gap: 12,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  infoTitle: {
    color: Colors.textDark,
    fontSize: 18,
    fontWeight: '800',
  },
  infoSubtitle: {
    color: Colors.darkGray,
    fontSize: 12,
    marginTop: 2,
  },
  infoRoomCode: {
    color: Colors.darkGray,
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  infoCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.06)',
  },
  creatorPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF6FF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  creatorText: {
    color: Colors.textDark,
    fontSize: 12,
    fontWeight: '600',
  },
  roomPhotoCard: {
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.05)',
    borderRadius: 14,
    backgroundColor: '#FAFBFD',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
  },
  roomPhotoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  roomPhotoAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFF3EF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  roomPhotoAvatarImage: {
    width: '100%',
    height: '100%',
  },
  roomPhotoAvatarText: {
    fontSize: 18,
  },
  roomPhotoTitle: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '700',
  },
  roomPhotoSubtitle: {
    color: Colors.darkGray,
    fontSize: 11,
    marginTop: 1,
  },
  changePhotoButton: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.08)',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changePhotoButtonDisabled: {
    opacity: 0.6,
  },
  changePhotoButtonPressed: {
    opacity: 0.85,
  },
  changePhotoButtonText: {
    color: Colors.textDark,
    fontSize: 12,
    fontWeight: '700',
  },
  membersList: {
    gap: 8,
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.05)',
    borderRadius: 14,
    backgroundColor: '#FAFBFD',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  memberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#FFF3EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    color: Colors.textDark,
    fontSize: 13,
    fontWeight: '700',
  },
  memberName: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '700',
  },
  memberRole: {
    color: Colors.darkGray,
    fontSize: 11,
    marginTop: 1,
  },
  removeMemberButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F2B3B3',
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  removeMemberButtonPressed: {
    opacity: 0.7,
  },
  removeMemberText: {
    color: '#B94040',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionGroup: {
    gap: 8,
  },
  groupLabel: {
    color: Colors.textDark,
    fontSize: 13,
    fontWeight: '700',
  },
  sourceButton: {
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.08)',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  sourceButtonPressed: {
    opacity: 0.85,
  },
  sourceButtonText: {
    color: Colors.textDark,
    fontSize: 12,
    fontWeight: '700',
  },
  selectedFileText: {
    color: Colors.darkGray,
    fontSize: 12,
  },
  sourceHintText: {
    color: Colors.darkGray,
    fontSize: 11,
  },
  countRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countButton: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.08)',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countButtonActive: {
    backgroundColor: '#EEF6FF',
    borderColor: `${Colors.primary}55`,
  },
  countButtonPressed: {
    opacity: 0.85,
  },
  countButtonText: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '700',
  },
  countButtonTextActive: {
    color: Colors.primary,
  },
  launchBattleButton: {
    marginTop: 4,
    height: 50,
    borderRadius: 14,
    backgroundColor: Colors.textDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  launchBattleButtonPressed: {
    opacity: 0.85,
  },
  launchBattleButtonDisabled: {
    opacity: 0.6,
  },
  launchBattleText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  waitingPanel: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: 'center',
    gap: 10,
  },
  waitingIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: '#EEF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingTitle: {
    color: Colors.textDark,
    fontSize: 18,
    fontWeight: '800',
  },
  waitingSubtitle: {
    color: Colors.darkGray,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  waitingMetaRow: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.05)',
    backgroundColor: '#FAFBFD',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  waitingMetaText: {
    color: Colors.textDark,
    fontSize: 12,
    fontWeight: '600',
  },
  lobbyMembersCard: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.05)',
    backgroundColor: '#FAFBFD',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 8,
  },
  lobbyMembersTitle: {
    color: Colors.textDark,
    fontSize: 13,
    fontWeight: '700',
  },
  lobbyMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  lobbyMemberLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  lobbyMemberAvatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3EF',
  },
  lobbyMemberAvatarText: {
    color: Colors.textDark,
    fontSize: 12,
    fontWeight: '700',
  },
  lobbyMemberName: {
    color: Colors.textDark,
    fontSize: 13,
    fontWeight: '700',
  },
  lobbyMemberRole: {
    color: Colors.darkGray,
    fontSize: 11,
    marginTop: 1,
  },
  lobbyStatusPill: {
    borderRadius: 999,
    backgroundColor: '#EEF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  lobbyStatusCreator: {
    backgroundColor: '#FFF3EF',
  },
  lobbyStatusText: {
    color: Colors.textDark,
    fontSize: 11,
    fontWeight: '600',
  },
  closeWaitingButton: {
    marginTop: 2,
    width: '100%',
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeWaitingButtonPressed: {
    opacity: 0.8,
  },
  closeWaitingText: {
    color: Colors.textDark,
    fontSize: 14,
    fontWeight: '700',
  },
  enterArenaButton: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    backgroundColor: Colors.textDark,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  enterArenaButtonPressed: {
    opacity: 0.85,
  },
  enterArenaText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  waitingCreatorNotice: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,26,26,0.08)',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  waitingCreatorNoticeText: {
    color: Colors.darkGray,
    fontSize: 12,
    fontWeight: '600',
  },
});
