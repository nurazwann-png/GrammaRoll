-- Grammar Ball database schema
CREATE TABLE IF NOT EXISTS level_scores (
  id          SERIAL PRIMARY KEY,
  player_name TEXT        NOT NULL,
  level_key   TEXT        NOT NULL,
  score       INTEGER     NOT NULL,
  stars       SMALLINT    NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_level_scores_level ON level_scores(level_key, score DESC);

CREATE TABLE IF NOT EXISTS player_progress (
  player_name  TEXT        PRIMARY KEY,
  total_stars  INTEGER     NOT NULL DEFAULT 0,
  total_score  INTEGER     NOT NULL DEFAULT 0,
  achievements JSONB       NOT NULL DEFAULT '{}',
  unlocked_skins TEXT[]    NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
