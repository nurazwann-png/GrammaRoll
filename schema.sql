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

CREATE TABLE IF NOT EXISTS certificates (
  id          SERIAL PRIMARY KEY,
  player_name TEXT        NOT NULL,
  level_key   TEXT        NOT NULL,
  score       INTEGER     NOT NULL DEFAULT 0,
  stars       SMALLINT    NOT NULL DEFAULT 1,
  world       TEXT        NOT NULL DEFAULT '',
  year        SMALLINT    NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certificates_created ON certificates(created_at DESC);

CREATE TABLE IF NOT EXISTS classes (
  code        TEXT        PRIMARY KEY,
  name        TEXT        NOT NULL DEFAULT '',
  assignment  JSONB,
  questions   JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attempts (
  id          SERIAL PRIMARY KEY,
  class_code  TEXT        NOT NULL REFERENCES classes(code) ON DELETE CASCADE,
  player_name TEXT        NOT NULL,
  level_key   TEXT        NOT NULL,
  won         BOOLEAN     NOT NULL DEFAULT FALSE,
  stars       SMALLINT    NOT NULL DEFAULT 0,
  score       INTEGER     NOT NULL DEFAULT 0,
  accuracy    SMALLINT    NOT NULL DEFAULT 0,
  missed      JSONB       NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attempts_class ON attempts(class_code, created_at);

CREATE TABLE IF NOT EXISTS pupil_progress (
  class_code  TEXT        NOT NULL REFERENCES classes(code) ON DELETE CASCADE,
  pupil_key   TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  data        JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (class_code, pupil_key)
);

CREATE TABLE IF NOT EXISTS player_progress (
  player_name  TEXT        PRIMARY KEY,
  total_stars  INTEGER     NOT NULL DEFAULT 0,
  total_score  INTEGER     NOT NULL DEFAULT 0,
  achievements JSONB       NOT NULL DEFAULT '{}',
  unlocked_skins TEXT[]    NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reviews (
  id           SERIAL PRIMARY KEY,
  name         TEXT        NOT NULL,
  role         TEXT        NOT NULL,
  organisation TEXT        NOT NULL DEFAULT '',
  rating       SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
  tags         JSONB       NOT NULL DEFAULT '[]',
  comment      TEXT        NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reviews_created ON reviews(created_at DESC);
