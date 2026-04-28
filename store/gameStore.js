import { create } from 'zustand';
import { supabase } from '../services/supabase.js';

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

  teardownSession: async () => {
    const state = get();

    get().clearDeadlineTimer();

    if (state.channel) {
      try {
        await state.channel.untrack();
      } catch (_) {
        // Ignore cleanup track errors.
      }

      await supabase.removeChannel(state.channel);
    }

    set({ ...initialState });
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
