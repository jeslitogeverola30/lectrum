-- 1. Create the Users table
CREATE TABLE users (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  username TEXT UNIQUE,
  elo_rating INTEGER DEFAULT 1200,
  total_matches INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 2. Create the Quizzes table (for your Gemini JSON later)
CREATE TABLE quizzes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  creator_id UUID REFERENCES users(id),
  topic TEXT NOT NULL,
  raw_json_content JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- 3. Create the Match History table
CREATE TABLE match_history (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  player_1_id UUID REFERENCES users(id),
  player_2_id UUID REFERENCES users(id),
  winner_id UUID REFERENCES users(id), -- Can be null if it's a tie
  points_change INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);