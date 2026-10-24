-- AfterHours initial schema. Migration history is monotonic; never edit an applied migration.

CREATE TABLE workspace_settings (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  settings_json TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT
);

CREATE TABLE oauth_states (
  state_hash  TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT
);

CREATE TABLE integrations (
  id              TEXT PRIMARY KEY,
  provider        TEXT NOT NULL UNIQUE CHECK (provider IN ('gmail')),
  state           TEXT NOT NULL CHECK (state IN ('disconnected','connected','error')),
  account         TEXT,
  connected_at    TEXT,
  last_poll_at    TEXT,
  last_error      TEXT,
  checkpoint_json TEXT NOT NULL DEFAULT '{}',
  credentials_enc TEXT,
  updated_at      TEXT NOT NULL
);

CREATE TABLE intake_messages (
  id            TEXT PRIMARY KEY,
  source_key    TEXT NOT NULL UNIQUE,
  ingestion_mode TEXT NOT NULL CHECK (ingestion_mode IN ('demo','gmail')),
  integration_id TEXT REFERENCES integrations(id),
  envelope_json TEXT NOT NULL,
  received_at   TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE TABLE intake_audit (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reason      TEXT NOT NULL,
  source_ref  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE tasks (
  id                     TEXT PRIMARY KEY,
  intake_id              TEXT NOT NULL UNIQUE REFERENCES intake_messages(id),
  status                 TEXT NOT NULL CHECK (status IN
    ('queued','planning','running','needs_input','ready','approved','dismissed','failed','skipped')),
  revision               INTEGER NOT NULL CHECK (revision >= 1),
  title                  TEXT NOT NULL,
  ingestion_mode         TEXT NOT NULL CHECK (ingestion_mode IN ('demo','gmail')),
  generation_mode        TEXT NOT NULL CHECK (generation_mode IN ('fixture','live')),
  fixture_scenario       TEXT,
  sender_name            TEXT,
  sender_email           TEXT NOT NULL,
  subject                TEXT NOT NULL,
  requested_outputs_json TEXT NOT NULL DEFAULT '[]',
  due_at                 TEXT,
  plan_json              TEXT,
  products_json          TEXT NOT NULL DEFAULT '[]',
  questions_json         TEXT NOT NULL DEFAULT '[]',
  answers_json           TEXT NOT NULL DEFAULT '[]',
  warning_count          INTEGER NOT NULL DEFAULT 0,
  error_json             TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE INDEX idx_tasks_order ON tasks (created_at DESC, id DESC);
CREATE INDEX idx_tasks_status ON tasks (status, created_at DESC, id DESC);

-- Immutable input snapshot: attachment bytes captured at ingestion.
CREATE TABLE task_attachments (
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attachment_id TEXT NOT NULL,
  filename      TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  bytes         BLOB NOT NULL,
  PRIMARY KEY (task_id, attachment_id)
);

-- Superseded answers stay traceable after a new revision is queued.
CREATE TABLE answer_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  revision    INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE task_sources (
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  revision    INTEGER NOT NULL,
  source_id   TEXT NOT NULL,
  ordinal     INTEGER NOT NULL,
  source_json TEXT NOT NULL,
  PRIMARY KEY (task_id, revision, source_id)
);

CREATE TABLE task_events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  id         TEXT NOT NULL UNIQUE,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  revision   INTEGER NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('status','progress','warning','error','review')),
  stage      TEXT NOT NULL CHECK (stage IN
    ('intake','plan','extract','generate','verify','export','notify','review')),
  message    TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_events_task ON task_events (task_id, seq);

CREATE TABLE jobs (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  revision     INTEGER NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('queued','running','done','failed')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  lease_until  TEXT,
  lease_owner  TEXT,
  heartbeat_at TEXT,
  last_error   TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (task_id, revision)
);
CREATE INDEX idx_jobs_claim ON jobs (status, available_at);

CREATE TABLE artifacts (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  revision   INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  format     TEXT NOT NULL CHECK (format IN ('docx','pptx')),
  rel_path   TEXT NOT NULL,
  filename   TEXT NOT NULL,
  mime_type  TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256     TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (task_id, revision, product_id, format)
);
CREATE INDEX idx_artifacts_task ON artifacts (task_id, revision);

CREATE TABLE notifications (
  id                  TEXT PRIMARY KEY,
  dedupe_key          TEXT NOT NULL UNIQUE,
  task_id             TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  revision            INTEGER,
  channel             TEXT NOT NULL CHECK (channel IN ('outbox','whatsapp')),
  state               TEXT NOT NULL CHECK (state IN
    ('queued','simulated','accepted','delivered','blocked','failed')),
  message             TEXT NOT NULL,
  task_ids_json       TEXT NOT NULL,
  task_revisions_json TEXT NOT NULL,
  scheduled_for       TEXT NOT NULL,
  local_date          TEXT,
  timezone            TEXT,
  attempts            INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  last_error          TEXT,
  lease_until         TEXT,
  lease_owner         TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX idx_notifications_due ON notifications (state, scheduled_for);
CREATE INDEX idx_notifications_order ON notifications (created_at DESC, id DESC);

CREATE TABLE worker_status (
  id           TEXT PRIMARY KEY,
  heartbeat_at TEXT NOT NULL,
  last_error   TEXT
);
