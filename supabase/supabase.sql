-- Lectrum Supabase schema for Clerk-authenticated client usage.
-- User identifiers are stored as TEXT so Clerk user IDs can be persisted directly.
DROP TABLE IF EXISTS 
  match_history,
  battle_participants,
  battles,
  messages,
  room_members,
  rooms,
  quizzes,
  profiles 
CASCADE;


CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. PROFILES
-- ============================================

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  avatar_emoji TEXT DEFAULT '👤',
  avatar_url TEXT DEFAULT NULL,
  bio TEXT DEFAULT NULL,
  elo_rating INTEGER DEFAULT 1200,
  total_matches INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ============================================
-- 2. QUIZZES
-- ============================================

CREATE TABLE IF NOT EXISTS quizzes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  creator_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  topic TEXT NOT NULL,
  description TEXT,
  raw_json_content JSONB NOT NULL,
  question_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ============================================
-- 3. ROOMS
-- ============================================

CREATE TABLE IF NOT EXISTS rooms (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  creator_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  topic TEXT NOT NULL,
  avatar_emoji TEXT DEFAULT '🎓',
  description TEXT,
  member_limit INTEGER DEFAULT 10,
  is_private BOOLEAN DEFAULT false,
  room_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ============================================
-- 4. ROOM MEMBERSHIP
-- ============================================

CREATE TABLE IF NOT EXISTS room_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  UNIQUE(room_id, user_id)
);

-- ============================================
-- 5. ROOM MESSAGES
-- ============================================

CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  sender_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  attachment_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ============================================
-- 6. BATTLES & RESULTS
-- ============================================

CREATE TABLE IF NOT EXISTS battles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  quiz_id UUID REFERENCES quizzes(id) ON DELETE SET NULL,
  creator_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  round_count INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending',
  winner_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ended_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE TABLE IF NOT EXISTS battle_participants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  battle_id UUID REFERENCES battles(id) ON DELETE CASCADE NOT NULL,
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  score INTEGER DEFAULT 0,
  correct_answers INTEGER DEFAULT 0,
  total_answers INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  UNIQUE(battle_id, user_id)
);

CREATE TABLE IF NOT EXISTS match_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  battle_id UUID REFERENCES battles(id) ON DELETE SET NULL,
  player_1_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  player_2_id TEXT REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  winner_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  player_1_score INTEGER DEFAULT 0,
  player_2_score INTEGER DEFAULT 0,
  elo_change_p1 INTEGER DEFAULT 0,
  elo_change_p2 INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- ============================================
-- HELPERS
-- ============================================

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_room_code()
RETURNS TEXT AS $$
DECLARE
  generated_code TEXT;
BEGIN
  LOOP
    generated_code := LPAD((FLOOR(RANDOM() * 100000))::INT::TEXT, 5, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM rooms WHERE room_code = generated_code);
  END LOOP;

  RETURN generated_code;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION normalize_profile_username(p_email TEXT, p_username TEXT DEFAULT NULL)
RETURNS TEXT AS $$
BEGIN
  IF p_username IS NOT NULL AND LENGTH(TRIM(p_username)) > 0 THEN
    RETURN TRIM(p_username);
  END IF;

  IF p_email IS NOT NULL AND POSITION('@' IN p_email) > 1 THEN
    RETURN SPLIT_PART(p_email, '@', 1);
  END IF;

  RETURN 'member';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION create_room_with_invites(
  p_creator_id TEXT,
  p_creator_email TEXT,
  p_room_name TEXT,
  p_room_topic TEXT,
  p_invite_emails TEXT[],
  p_avatar_emoji TEXT DEFAULT '🎓'
)
RETURNS rooms AS $$
DECLARE
  created_room rooms;
  invite_email TEXT;
  invite_profile_id TEXT;
BEGIN
  IF p_creator_id IS NULL OR LENGTH(TRIM(p_creator_id)) = 0 THEN
    RAISE EXCEPTION 'Missing creator id.';
  END IF;

  IF p_room_name IS NULL OR LENGTH(TRIM(p_room_name)) = 0 THEN
    RAISE EXCEPTION 'Room name is required.';
  END IF;

  IF p_invite_emails IS NULL OR ARRAY_LENGTH(p_invite_emails, 1) IS NULL OR ARRAY_LENGTH(p_invite_emails, 1) = 0 THEN
    RAISE EXCEPTION 'At least one invite email is required.';
  END IF;

  INSERT INTO profiles (id, email, username)
  VALUES (
    p_creator_id,
    p_creator_email,
    normalize_profile_username(p_creator_email, NULL)
  )
  ON CONFLICT (id)
  DO UPDATE SET
    email = COALESCE(EXCLUDED.email, profiles.email),
    username = COALESCE(profiles.username, EXCLUDED.username),
    updated_at = TIMEZONE('utc'::text, NOW());

  INSERT INTO rooms (creator_id, name, topic, avatar_emoji, room_code)
  VALUES (
    p_creator_id,
    TRIM(p_room_name),
    COALESCE(NULLIF(TRIM(p_room_topic), ''), 'Study Room'),
    COALESCE(NULLIF(TRIM(p_avatar_emoji), ''), '🎓'),
    generate_room_code()
  )
  RETURNING * INTO created_room;

  INSERT INTO room_members (room_id, user_id, role)
  VALUES (created_room.id, p_creator_id, 'creator');

  FOREACH invite_email IN ARRAY p_invite_emails
  LOOP
    IF invite_email IS NULL OR LENGTH(TRIM(invite_email)) = 0 THEN
      CONTINUE;
    END IF;

    SELECT id INTO invite_profile_id
    FROM profiles
    WHERE LOWER(email) = LOWER(TRIM(invite_email))
    LIMIT 1;

    IF invite_profile_id IS NULL THEN
      RAISE EXCEPTION 'No profile found for invite email: %', invite_email;
    END IF;

    INSERT INTO room_members (room_id, user_id, role)
    VALUES (created_room.id, invite_profile_id, 'member')
    ON CONFLICT (room_id, user_id) DO NOTHING;
  END LOOP;

  RETURN created_room;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION join_room_by_code(
  p_user_id TEXT,
  p_user_email TEXT,
  p_room_code TEXT
)
RETURNS rooms AS $$
DECLARE
  target_room rooms;
BEGIN
  IF p_user_id IS NULL OR LENGTH(TRIM(p_user_id)) = 0 THEN
    RAISE EXCEPTION 'Missing user id.';
  END IF;

  IF p_room_code IS NULL OR LENGTH(TRIM(p_room_code)) = 0 THEN
    RAISE EXCEPTION 'Room code is required.';
  END IF;

  INSERT INTO profiles (id, email, username)
  VALUES (
    p_user_id,
    p_user_email,
    normalize_profile_username(p_user_email, NULL)
  )
  ON CONFLICT (id)
  DO UPDATE SET
    email = COALESCE(EXCLUDED.email, profiles.email),
    username = COALESCE(profiles.username, EXCLUDED.username),
    updated_at = TIMEZONE('utc'::text, NOW());

  SELECT * INTO target_room
  FROM rooms
  WHERE room_code = TRIM(p_room_code)
  LIMIT 1;

  IF target_room.id IS NULL THEN
    RAISE EXCEPTION 'Room not found for code %', p_room_code;
  END IF;

  INSERT INTO room_members (room_id, user_id, role)
  VALUES (target_room.id, p_user_id, 'member')
  ON CONFLICT (room_id, user_id) DO NOTHING;

  RETURN target_room;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION send_room_message(
  p_sender_id TEXT,
  p_room_id UUID,
  p_text TEXT
)
RETURNS messages AS $$
DECLARE
  created_message messages;
BEGIN
  IF p_sender_id IS NULL OR LENGTH(TRIM(p_sender_id)) = 0 THEN
    RAISE EXCEPTION 'Missing sender id.';
  END IF;

  IF p_room_id IS NULL THEN
    RAISE EXCEPTION 'Missing room id.';
  END IF;

  IF p_text IS NULL OR LENGTH(TRIM(p_text)) = 0 THEN
    RAISE EXCEPTION 'Message text cannot be empty.';
  END IF;

  INSERT INTO messages (room_id, sender_id, text)
  VALUES (p_room_id, p_sender_id, TRIM(p_text))
  RETURNING * INTO created_message;

  RETURN created_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGERS
-- ============================================

DROP TRIGGER IF EXISTS profiles_updated_at_trigger ON profiles;
CREATE TRIGGER profiles_updated_at_trigger
BEFORE UPDATE ON profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS quizzes_updated_at_trigger ON quizzes;
CREATE TRIGGER quizzes_updated_at_trigger
BEFORE UPDATE ON quizzes
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS rooms_updated_at_trigger ON rooms;
CREATE TRIGGER rooms_updated_at_trigger
BEFORE UPDATE ON rooms
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS messages_updated_at_trigger ON messages;
CREATE TRIGGER messages_updated_at_trigger
BEFORE UPDATE ON messages
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS battles_updated_at_trigger ON battles;
CREATE TRIGGER battles_updated_at_trigger
BEFORE UPDATE ON battles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles USING btree (email);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles USING btree (username);
CREATE INDEX IF NOT EXISTS idx_quizzes_creator_id ON quizzes USING btree (creator_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_created_at ON quizzes USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_rooms_creator_id ON rooms USING btree (creator_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON rooms USING btree (room_code);
CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members USING btree (room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages USING btree (room_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages USING btree (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_battles_room_id ON battles USING btree (room_id);
CREATE INDEX IF NOT EXISTS idx_battles_creator_id ON battles USING btree (creator_id);
CREATE INDEX IF NOT EXISTS idx_battles_status ON battles USING btree (status);
CREATE INDEX IF NOT EXISTS idx_battle_participants_battle_id ON battle_participants USING btree (battle_id);
CREATE INDEX IF NOT EXISTS idx_battle_participants_user_id ON battle_participants USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_match_history_player_1_id ON match_history USING btree (player_1_id);
CREATE INDEX IF NOT EXISTS idx_match_history_player_2_id ON match_history USING btree (player_2_id);
CREATE INDEX IF NOT EXISTS idx_match_history_created_at ON match_history USING btree (created_at);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view profiles" ON profiles;
CREATE POLICY "Anyone can view profiles"
  ON profiles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert profiles" ON profiles;
CREATE POLICY "Anyone can insert profiles"
  ON profiles FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update profiles" ON profiles;
CREATE POLICY "Anyone can update profiles"
  ON profiles FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view quizzes" ON quizzes;
CREATE POLICY "Anyone can view quizzes"
  ON quizzes FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert quizzes" ON quizzes;
CREATE POLICY "Anyone can insert quizzes"
  ON quizzes FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update quizzes" ON quizzes;
CREATE POLICY "Anyone can update quizzes"
  ON quizzes FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view rooms" ON rooms;
CREATE POLICY "Anyone can view rooms"
  ON rooms FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert rooms" ON rooms;
CREATE POLICY "Anyone can insert rooms"
  ON rooms FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update rooms" ON rooms;
CREATE POLICY "Anyone can update rooms"
  ON rooms FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view room members" ON room_members;
CREATE POLICY "Anyone can view room members"
  ON room_members FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert room members" ON room_members;
CREATE POLICY "Anyone can insert room members"
  ON room_members FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update room members" ON room_members;
CREATE POLICY "Anyone can update room members"
  ON room_members FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view messages" ON messages;
CREATE POLICY "Anyone can view messages"
  ON messages FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert messages" ON messages;
CREATE POLICY "Anyone can insert messages"
  ON messages FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update messages" ON messages;
CREATE POLICY "Anyone can update messages"
  ON messages FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view battles" ON battles;
CREATE POLICY "Anyone can view battles"
  ON battles FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert battles" ON battles;
CREATE POLICY "Anyone can insert battles"
  ON battles FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update battles" ON battles;
CREATE POLICY "Anyone can update battles"
  ON battles FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view battle participants" ON battle_participants;
CREATE POLICY "Anyone can view battle participants"
  ON battle_participants FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert battle participants" ON battle_participants;
CREATE POLICY "Anyone can insert battle participants"
  ON battle_participants FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update battle participants" ON battle_participants;
CREATE POLICY "Anyone can update battle participants"
  ON battle_participants FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view match history" ON match_history;
CREATE POLICY "Anyone can view match history"
  ON match_history FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert match history" ON match_history;
CREATE POLICY "Anyone can insert match history"
  ON match_history FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update match history" ON match_history;
CREATE POLICY "Anyone can update match history"
  ON match_history FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Optional views for convenience
CREATE OR REPLACE VIEW room_activity AS
SELECT
  r.id,
  r.creator_id,
  r.name,
  r.topic,
  COUNT(DISTINCT rm.user_id) AS member_count,
  COUNT(DISTINCT m.id) AS message_count,
  MAX(m.created_at) AS last_message_at
FROM rooms r
LEFT JOIN room_members rm ON r.id = rm.room_id
LEFT JOIN messages m ON r.id = m.room_id
GROUP BY r.id;

CREATE OR REPLACE VIEW leaderboard AS
SELECT
  p.id,
  p.username,
  p.avatar_emoji,
  p.elo_rating,
  p.total_matches,
  p.wins,
  p.losses,
  CASE
    WHEN p.total_matches > 0 THEN ROUND((p.wins::NUMERIC / p.total_matches * 100), 2)
    ELSE 0
  END AS win_rate
FROM profiles p
WHERE p.total_matches > 0
ORDER BY p.elo_rating DESC;
