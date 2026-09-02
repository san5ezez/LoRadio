CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  youtube_url TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 180,
  restricted INTEGER NOT NULL DEFAULT 0 CHECK (restricted IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS votes (
  round_id TEXT NOT NULL,
  track_id TEXT NOT NULL REFERENCES tracks(id),
  voter_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (round_id, voter_fingerprint)
);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id TEXT NOT NULL REFERENCES tracks(id),
  played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source TEXT NOT NULL CHECK (source IN ('vote', 'random', 'admin_force'))
);

CREATE TABLE IF NOT EXISTS admins (
  login TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL
);

INSERT OR IGNORE INTO tracks (id, title, youtube_url, youtube_id, duration_seconds, restricted) VALUES
  ('new-generation', 'Новое Поколение', 'https://www.youtube.com/watch?v=cAKepjg8nwM', 'cAKepjg8nwM', 210, 0),
  ('pawns', 'Пешки', 'https://www.youtube.com/watch?v=REOGhI703Ec', 'REOGhI703Ec', 210, 1),
  ('shining-hymn', 'Сияние / Гимн Сияния', 'https://www.youtube.com/watch?v=Z3RQ2KKbj38', 'Z3RQ2KKbj38', 210, 0),
  ('true-path', 'Верный Путь', 'https://www.youtube.com/watch?v=SwjfG2Z4kpk', 'SwjfG2Z4kpk', 210, 0),
  ('great-flame', 'Великое Пламя', 'https://www.youtube.com/watch?v=jsuyL--MN6Y', 'jsuyL--MN6Y', 210, 0),
  ('we-are', 'Мы Есть', 'https://www.youtube.com/watch?v=aIlr4F4gI7I', 'aIlr4F4gI7I', 210, 0),
  ('world-heart', 'Сердце Мира', 'https://www.youtube.com/watch?v=oQf6ZUPb_74', 'oQf6ZUPb_74', 210, 0);
