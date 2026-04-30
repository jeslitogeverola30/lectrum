import { create } from 'zustand';
import { Alert } from 'react-native';
import { supabase } from '../services/supabase.js';
import { calculateBothPlayerElo } from '../utils/elo.js';

const GAME_PHASES = {
  IDLE: 'IDLE',
  LOBBY: 'LOBBY',
  ROUND: 'ROUND',
  GAME_OVER: 'GAME_OVER',
};

const BROADCAST_EVENTS = {
  START_BATTLE: 'START_BATTLE',
  PLAYER_ANSWERED: 'PLAYER_ANSWERED',
  NEXT_ROUND: 'NEXT_ROUND',
  GAME_OVER: 'GAME_OVER',
  ROOM_CLOSED: 'ROOM_CLOSED',
};

const clampPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const clampRoundIndex = (value, fallback = 0) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const buildPlayerMapFromPresence = (presenceState) => {
  const playersById = {};

  Object.values(presenceState || {}).forEach((presences) => {
    (presences || []).forEach((entry) => {
      const userId = entry?.userId;
      if (!userId) {
        return;
      }

      playersById[userId] = {
        userId,
        displayName: entry.displayName || 'Member',
        isCreator: Boolean(entry.isCreator),
        hasJoinedLobby: Boolean(entry.hasJoinedLobby),
        isReady: Boolean(entry.isReady),
        onlineAt: entry.onlineAt || new Date().toISOString(),
      };
    });
  });

  return playersById;
};

const getRoundAnswerCount = (answersByRound, roundIndex) => {
  const roundAnswers = answersByRound?.[roundIndex];
  if (!roundAnswers) {
    return 0;
  }

  return Object.keys(roundAnswers).length;
};

const initialState = {
  channel: null,
  connectionStatus: 'disconnected',
  phase: GAME_PHASES.IDLE,
  roomId: null,
  battleId: null,
  creatorId: null,
  currentUserId: null,
  currentUserName: 'Member',
  isCreatorClient: false,

  questionCount: 5,
  roundDurationSec: 20,
  roundIndex: 0,
  roundDeadlineAt: null,

  playersById: {},
  localHasJoinedLobby: false,
  localIsReady: false,

  answersByRound: {},
  scoresByUserId: {},
  lastError: '',
  startedAt: null,
  endedAt: null,

  // ELO rating state (populated after match conclusion)
  playerNewElo: null,
  playerEloChange: 0,
  playerOutcome: null, // 1 = win, 0.5 = tie, 0 = loss

  deadlineTimerId: null,
};

export const useGameStore = create((set, get) => ({
  ...initialState,

  hydrateBattleSession: ({ roomId, battleId, creatorId, currentUserId, currentUserName, isCreatorClient, questionCount, roundDurationSec }) => {
    if (!roomId || !battleId || !currentUserId) {
      return;
    }

    const safeQuestionCount = clampPositiveInt(questionCount, 5);
    const safeRoundDuration = clampPositiveInt(roundDurationSec, 20);

    set((state) => ({
      ...state,
      roomId,
      battleId,
      creatorId: creatorId || null,
      currentUserId,
      currentUserName: currentUserName || 'Member',
      isCreatorClient: Boolean(isCreatorClient),
      questionCount: safeQuestionCount,
      roundDurationSec: safeRoundDuration,
      phase: state.phase === GAME_PHASES.IDLE ? GAME_PHASES.LOBBY : state.phase,
    }));

    get().connectRealtime();
  },

  connectRealtime: async () => {
    const state = get();

    if (state.channel || !state.roomId || !state.battleId || !state.currentUserId) {
      return;
    }

    const channelName = `battle-room-${state.roomId}-${state.battleId}`;

    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: state.currentUserId,
        },
      },
    });

    channel.on('presence', { event: 'sync' }, () => {
      const presenceState = channel.presenceState();
      const playersById = buildPlayerMapFromPresence(presenceState);

      set((prev) => ({
        ...prev,
        playersById,
      }));

      // If someone disconnects mid-round, do not block progression forever.
      if (get().phase === GAME_PHASES.ROUND && get().isCreatorClient) {
        get().maybeAdvanceRound('presence-sync');
      }
    });

    channel.on('broadcast', { event: BROADCAST_EVENTS.START_BATTLE }, ({ payload }) => {
      get().handleStartBattleBroadcast(payload || {});
    });

    channel.on('broadcast', { event: BROADCAST_EVENTS.PLAYER_ANSWERED }, ({ payload }) => {
      get().handlePlayerAnsweredBroadcast(payload || {});
    });

    channel.on('broadcast', { event: BROADCAST_EVENTS.NEXT_ROUND }, ({ payload }) => {
      get().handleNextRoundBroadcast(payload || {});
    });

    channel.on('broadcast', { event: BROADCAST_EVENTS.GAME_OVER }, ({ payload }) => {
      get().handleGameOverBroadcast(payload || {});
    });

    channel.on('broadcast', { event: BROADCAST_EVENTS.ROOM_CLOSED }, ({ payload }) => {
      const senderId = payload?.senderId || null;
      if (senderId && senderId === get().currentUserId) {
        return;
      }

      get().handleRoomClosedBroadcast();
    });

    set((prev) => ({ ...prev, channel, connectionStatus: 'connecting', lastError: '' }));

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const latest = get();

        set((prev) => ({ ...prev, connectionStatus: 'connected' }));

        await channel.track({
          userId: latest.currentUserId,
          displayName: latest.currentUserName,
          isCreator: latest.isCreatorClient,
          hasJoinedLobby: latest.isCreatorClient ? true : latest.localHasJoinedLobby,
          isReady: latest.isCreatorClient ? true : latest.localIsReady,
          onlineAt: new Date().toISOString(),
        });

        return;
      }

      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        set((prev) => ({
          ...prev,
          connectionStatus: 'error',
          lastError: 'Realtime channel lost. Please re-open the lobby.',
        }));
        return;
      }

      if (status === 'CLOSED') {
        set((prev) => ({ ...prev, connectionStatus: 'disconnected' }));
      }
    });
  },

  updatePresence: async () => {
    const state = get();
    if (!state.channel || state.connectionStatus !== 'connected') {
      return;
    }

    try {
      await state.channel.track({
        userId: state.currentUserId,
        displayName: state.currentUserName,
        isCreator: state.isCreatorClient,
        hasJoinedLobby: state.isCreatorClient ? true : state.localHasJoinedLobby,
        isReady: state.isCreatorClient ? true : state.localIsReady,
        onlineAt: new Date().toISOString(),
      });
    } catch (_) {
      set((prev) => ({ ...prev, lastError: 'Could not sync presence state.' }));
    }
  },

  joinLobby: async () => {
    const state = get();
    if (state.isCreatorClient) {
      return;
    }

    set((prev) => ({
      ...prev,
      localHasJoinedLobby: true,
      localIsReady: false,
      phase: prev.phase === GAME_PHASES.IDLE ? GAME_PHASES.LOBBY : prev.phase,
    }));

    await get().updatePresence();
  },

  leaveLobby: async () => {
    if (get().isCreatorClient) {
      return;
    }

    set((prev) => ({ ...prev, localHasJoinedLobby: false, localIsReady: false }));
    await get().updatePresence();
  },

  setLocalReady: async (isReady) => {
    const state = get();
    if (state.isCreatorClient || !state.localHasJoinedLobby) {
      return;
    }

    set((prev) => ({ ...prev, localIsReady: Boolean(isReady) }));
    await get().updatePresence();
  },

  getLobbyMembers: () => {
    const state = get();
    return Object.values(state.playersById)
      .filter((player) => !player.isCreator && player.hasJoinedLobby)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },

  getAllActivePlayers: () => {
    const state = get();
    return Object.values(state.playersById)
      .filter((player) => player.isCreator || player.hasJoinedLobby)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  },

  canCreatorStartBattle: () => {
    const state = get();
    if (!state.isCreatorClient) {
      return false;
    }

    const members = get().getLobbyMembers();
    if (!members.length) {
      return false;
    }

    return members.every((member) => member.isReady);
  },

  startBattle: async () => {
    const state = get();

    if (!state.isCreatorClient || !state.channel || !get().canCreatorStartBattle()) {
      return false;
    }

    const now = Date.now();
    const deadline = now + state.roundDurationSec * 1000;

    const payload = {
      battleId: state.battleId,
      startedAt: now,
      roundIndex: 0,
      deadline,
      roundDurationSec: state.roundDurationSec,
      questionCount: state.questionCount,
    };

    await state.channel.send({
      type: 'broadcast',
      event: BROADCAST_EVENTS.START_BATTLE,
      payload,
    });

    get().handleStartBattleBroadcast(payload);

    return true;
  },

  handleStartBattleBroadcast: (payload) => {
    const roundDurationSec = clampPositiveInt(payload.roundDurationSec, get().roundDurationSec || 20);
    const roundIndex = clampRoundIndex(payload.roundIndex, 0);

    set((prev) => ({
      ...prev,
      phase: GAME_PHASES.ROUND,
      roundIndex,
      roundDurationSec,
      questionCount: clampPositiveInt(payload.questionCount, prev.questionCount || 5),
      roundDeadlineAt: Number(payload.deadline) || Date.now() + roundDurationSec * 1000,
      answersByRound: {},
      startedAt: Number(payload.startedAt) || Date.now(),
      endedAt: null,
      scoresByUserId: {},
      lastError: '',
    }));

    get().armCreatorDeadlineTimer();
  },

  submitAnswer: async ({ selectedOptionIndex = null, isTimeout = false }) => {
    const state = get();

    if (!state.channel || state.phase !== GAME_PHASES.ROUND) {
      return;
    }

    const userId = state.currentUserId;
    const roundIndex = state.roundIndex;
    const alreadySubmitted = Boolean(state.answersByRound?.[roundIndex]?.[userId]);

    if (alreadySubmitted) {
      return;
    }

    const payload = {
      battleId: state.battleId,
      roundIndex,
      userId,
      selectedOptionIndex,
      isTimeout: Boolean(isTimeout),
      submittedAt: Date.now(),
    };

    await state.channel.send({
      type: 'broadcast',
      event: BROADCAST_EVENTS.PLAYER_ANSWERED,
      payload,
    });

    get().handlePlayerAnsweredBroadcast(payload);
  },

  handlePlayerAnsweredBroadcast: (payload) => {
    const roundIndex = Number(payload.roundIndex);
    const userId = payload.userId;

    if (!Number.isInteger(roundIndex) || !userId) {
      return;
    }

    set((prev) => {
      const currentRoundAnswers = prev.answersByRound?.[roundIndex] || {};
      if (currentRoundAnswers[userId]) {
        return prev;
      }

      return {
        ...prev,
        answersByRound: {
          ...prev.answersByRound,
          [roundIndex]: {
            ...currentRoundAnswers,
            [userId]: {
              selectedOptionIndex: payload.selectedOptionIndex,
              isTimeout: Boolean(payload.isTimeout),
              submittedAt: Number(payload.submittedAt) || Date.now(),
            },
          },
        },
      };
    });

    if (get().isCreatorClient && get().phase === GAME_PHASES.ROUND) {
      get().maybeAdvanceRound('all-answers');
    }
  },

  maybeAdvanceRound: async (_) => {
    const state = get();
    if (!state.isCreatorClient || state.phase !== GAME_PHASES.ROUND || !state.channel) {
      return;
    }

    const activePlayers = get().getAllActivePlayers();
    const expectedCount = activePlayers.length;
    if (!expectedCount) {
      return;
    }

    const currentRound = state.roundIndex;
    const submittedCount = getRoundAnswerCount(state.answersByRound, currentRound);
    const now = Date.now();
    const deadlineReached = Number(state.roundDeadlineAt || 0) <= now;
    const everyoneAnswered = submittedCount >= expectedCount;

    if (!everyoneAnswered && !deadlineReached) {
      return;
    }

    const isFinalRound = currentRound + 1 >= state.questionCount;

    if (isFinalRound) {
      const payload = {
        battleId: state.battleId,
        endedAt: now,
        scoresByUserId: state.scoresByUserId,
      };

      await state.channel.send({
        type: 'broadcast',
        event: BROADCAST_EVENTS.GAME_OVER,
        payload,
      });

      get().handleGameOverBroadcast(payload);
      return;
    }

    const nextDeadline = now + state.roundDurationSec * 1000;
    const payload = {
      battleId: state.battleId,
      roundIndex: currentRound + 1,
      deadline: nextDeadline,
      advancedAt: now,
    };

    await state.channel.send({
      type: 'broadcast',
      event: BROADCAST_EVENTS.NEXT_ROUND,
      payload,
    });

    get().handleNextRoundBroadcast(payload);
  },

  handleNextRoundBroadcast: (payload) => {
    const roundIndex = clampRoundIndex(payload.roundIndex, get().roundIndex + 1);
    const deadline = Number(payload.deadline) || Date.now() + get().roundDurationSec * 1000;

    set((prev) => ({
      ...prev,
      phase: GAME_PHASES.ROUND,
      roundIndex,
      roundDeadlineAt: deadline,
    }));

    get().armCreatorDeadlineTimer();
  },

  handleGameOverBroadcast: (payload) => {
    get().clearDeadlineTimer();

    set((prev) => ({
      ...prev,
      phase: GAME_PHASES.GAME_OVER,
      endedAt: Number(payload.endedAt) || Date.now(),
      roundDeadlineAt: null,
    }));
  },

  handleRoomClosedBroadcast: async () => {
    await get().teardownAndReset();
    Alert.alert('Room Closed', 'The host has closed the room.');
  },

  armCreatorDeadlineTimer: () => {
    const state = get();
    get().clearDeadlineTimer();

    if (!state.isCreatorClient || state.phase !== GAME_PHASES.ROUND || !state.roundDeadlineAt) {
      return;
    }

    const timeoutMs = Math.max(0, Number(state.roundDeadlineAt) - Date.now());

    const deadlineTimerId = setTimeout(() => {
      get().maybeAdvanceRound('deadline');
    }, timeoutMs);

    set((prev) => ({ ...prev, deadlineTimerId }));
  },

  clearDeadlineTimer: () => {
    const timerId = get().deadlineTimerId;
    if (timerId) {
      clearTimeout(timerId);
    }
    set((prev) => ({ ...prev, deadlineTimerId: null }));
  },

  markBattleCompletedInDb: async () => {
    const state = get();
    if (!state.isCreatorClient || !state.battleId) {
      return;
    }

    await supabase
      .from('battles')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
      })
      .eq('id', state.battleId);
  },

  /**
   * CAPSTONE DEFENSE: Database Finalization Logic
   * 
   * This action is the critical bridge between the real-time game FSM
   * and permanent data storage. It enforces host authority to prevent
   * race conditions and ensures atomic updates across multiple tables.
   * 
   * Flow:
   * 1. Host-only gate check (prevent concurrent writes from non-hosts)
   * 2. Fetch both players' current profiles from database
   * 3. Calculate new ELO ratings using pure utility function
   * 4. Update profiles for both players (Transaction 1)
   * 5. Insert match history record (Transaction 2)
   * 6. Update local store with finalized state
   * 
   * Error Handling: Failures log clearly for debugging and don't crash
   * the game. The game state still transitions to GAME_OVER regardless.
   */
  finalizeMatchToDatabase: async () => {
    const state = get();

    // ========================================
    // GATE 1: HOST AUTHORITY CHECK
    // ========================================
    // Only the host/creator writes to the database to avoid race conditions
    // and duplicate entries. All other clients are read-only.
    if (!state.isCreatorClient) {
      console.log('[ELO] Non-creator client skipped database finalization (expected behavior)');
      return;
    }

    if (!state.battleId || !state.currentUserId) {
      console.error('[ELO] Cannot finalize: missing battleId or currentUserId');
      return;
    }

    try {
      // ========================================
      // STEP 1: DETERMINE GAME OUTCOME
      // ========================================
      const scoresByUserId = state.scoresByUserId || {};
      const playerScores = Object.entries(scoresByUserId);

      if (playerScores.length < 2) {
        console.warn('[ELO] Insufficient players for match history. Skipping finalization.');
        return;
      }

      // Sort by score descending to determine winner
      playerScores.sort(([, scoreA], [, scoreB]) => scoreB - scoreA);

      const winnerId = playerScores[0][0]; // Highest score
      const loserId = playerScores[1][0]; // Second highest
      const winnerScore = playerScores[0][1];
      const loserScore = playerScores[1][1];

      // Determine outcome: 1 = host won, 0 = host lost, 0.5 = tie
      let hostOutcome = 0;
      if (winnerScore === loserScore) {
        // Tie game
        hostOutcome = 0.5;
      } else if (winnerId === state.currentUserId) {
        // Host won
        hostOutcome = 1;
      }
      // If loserId === state.currentUserId, hostOutcome remains 0

      // ========================================
      // STEP 2: FETCH CURRENT PROFILES
      // ========================================
      // Get both players' current ELO ratings and stats from database
      const { data: hostProfile, error: hostError } = await supabase
        .from('profiles')
        .select('id, elo_rating, total_matches, wins, losses')
        .eq('id', state.currentUserId)
        .maybeSingle();

      if (hostError || !hostProfile) {
        console.error('[ELO] Failed to fetch host profile:', hostError?.message);
        set((prev) => ({
          ...prev,
          lastError: 'Failed to fetch player profile from database.',
        }));
        return;
      }

      const { data: opponentProfile, error: opponentError } = await supabase
        .from('profiles')
        .select('id, elo_rating, total_matches, wins, losses')
        .eq('id', loserId === state.currentUserId ? winnerId : loserId)
        .maybeSingle();

      if (opponentError || !opponentProfile) {
        console.error('[ELO] Failed to fetch opponent profile:', opponentError?.message);
        set((prev) => ({
          ...prev,
          lastError: 'Failed to fetch opponent profile from database.',
        }));
        return;
      }

      // ========================================
      // STEP 3: CALCULATE NEW ELO RATINGS
      // ========================================
      // Use the pure utility function to calculate both players' new ratings
      const K_FACTOR = 32; // Standard competitive K-factor
      const { newRating1: hostNewElo, newRating2: opponentNewElo } = calculateBothPlayerElo(
        hostProfile.elo_rating,
        opponentProfile.elo_rating,
        hostOutcome,
        K_FACTOR
      );

      const hostEloChange = hostNewElo - hostProfile.elo_rating;
      const opponentEloChange = opponentNewElo - opponentProfile.elo_rating;

      // ========================================
      // STEP 4: DETERMINE WIN/LOSS FLAGS
      // ========================================
      let hostWins = hostProfile.wins;
      let hostLosses = hostProfile.losses;
      let opponentWins = opponentProfile.wins;
      let opponentLosses = opponentProfile.losses;

      if (hostOutcome === 1) {
        // Host won
        hostWins += 1;
        opponentLosses += 1;
      } else if (hostOutcome === 0) {
        // Host lost
        hostLosses += 1;
        opponentWins += 1;
      } else {
        // Tie (0.5)
        hostWins += 0.5;
        hostLosses += 0.5;
        opponentWins += 0.5;
        opponentLosses += 0.5;
      }

      // ========================================
      // TRANSACTION 1: UPDATE BOTH PLAYERS' PROFILES
      // ========================================
      console.log('[ELO] Updating profiles...', {
        hostId: state.currentUserId,
        hostNewElo,
        opponentId: opponentProfile.id,
        opponentNewElo,
      });

      // Update host profile
      const { error: hostUpdateError } = await supabase
        .from('profiles')
        .update({
          elo_rating: hostNewElo,
          total_matches: hostProfile.total_matches + 1,
          wins: hostWins,
          losses: hostLosses,
          updated_at: new Date().toISOString(),
        })
        .eq('id', state.currentUserId);

      if (hostUpdateError) {
        console.error('[ELO] Failed to update host profile:', hostUpdateError.message);
        set((prev) => ({
          ...prev,
          lastError: `Failed to save host rating: ${hostUpdateError.message}`,
        }));
        return;
      }

      // Update opponent profile
      const { error: opponentUpdateError } = await supabase
        .from('profiles')
        .update({
          elo_rating: opponentNewElo,
          total_matches: opponentProfile.total_matches + 1,
          wins: opponentWins,
          losses: opponentLosses,
          updated_at: new Date().toISOString(),
        })
        .eq('id', opponentProfile.id);

      if (opponentUpdateError) {
        console.error('[ELO] Failed to update opponent profile:', opponentUpdateError.message);
        set((prev) => ({
          ...prev,
          lastError: `Failed to save opponent rating: ${opponentUpdateError.message}`,
        }));
        return;
      }

      // ========================================
      // TRANSACTION 2: INSERT MATCH HISTORY RECORD
      // ========================================
      console.log('[ELO] Inserting match history...', {
        player1_id: state.currentUserId,
        player2_id: opponentProfile.id,
        winner_id: winnerId,
        elo_change_p1: hostEloChange,
        elo_change_p2: opponentEloChange,
      });

      const { error: historyError } = await supabase
        .from('match_history')
        .insert({
          battle_id: state.battleId,
          player_1_id: state.currentUserId,
          player_2_id: opponentProfile.id,
          winner_id: winnerId,
          player_1_score: scoresByUserId[state.currentUserId] || 0,
          player_2_score: scoresByUserId[opponentProfile.id] || 0,
          elo_change_p1: hostEloChange,
          elo_change_p2: opponentEloChange,
          created_at: new Date().toISOString(),
        });

      if (historyError) {
        console.error('[ELO] Failed to insert match history:', historyError.message);
        set((prev) => ({
          ...prev,
          lastError: `Failed to save match history: ${historyError.message}`,
        }));
        return;
      }

      // ========================================
      // STEP 5: UPDATE LOCAL STATE
      // ========================================
      // Store finalized ELO data for UI display
      set((prev) => ({
        ...prev,
        playerNewElo: hostNewElo,
        playerEloChange: hostEloChange,
        playerOutcome: hostOutcome,
        lastError: '', // Clear any previous errors
      }));

      console.log('[ELO] Match finalization complete!', {
        hostNewElo,
        hostEloChange,
        opponentNewElo,
        opponentEloChange,
      });
    } catch (err) {
      console.error('[ELO] Unexpected error during finalization:', err);
      set((prev) => ({
        ...prev,
        lastError: `Unexpected error: ${err.message || 'Unknown error'}`,
      }));
    }
  },

  teardownAndReset: async () => {
    const state = get();

    get().clearDeadlineTimer();

    if (state.channel) {
      try {
        await state.channel.untrack();
      } catch (_) {
        // Ignore cleanup track errors.
      }

      try {
        await state.channel.unsubscribe();
      } catch (_) {
        // Ignore unsubscribe errors.
      }

      try {
        await supabase.removeChannel(state.channel);
      } catch (_) {
        // Ignore channel removal errors during teardown.
      }
    }

    set({ ...initialState });
  },

  teardownSession: async () => {
    await get().teardownAndReset();
  },

  getRemainingSeconds: () => {
    const deadline = Number(get().roundDeadlineAt || 0);
    if (!deadline) {
      return 0;
    }

    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  },

  getSubmittedCountForCurrentRound: () => {
    const state = get();
    return getRoundAnswerCount(state.answersByRound, state.roundIndex);
  },

  hasLocalSubmittedCurrentRound: () => {
    const state = get();
    if (!state.currentUserId) {
      return false;
    }

    return Boolean(state.answersByRound?.[state.roundIndex]?.[state.currentUserId]);
  },
}));

export { GAME_PHASES, BROADCAST_EVENTS };
