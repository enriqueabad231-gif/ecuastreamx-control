PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  payment_date TEXT NOT NULL,
  customer TEXT NOT NULL,
  platform TEXT NOT NULL,
  service_type TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  months INTEGER NOT NULL DEFAULT 1 CHECK (months >= 1),
  amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
  start_date TEXT NOT NULL,
  cut_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_payment_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_cut_date ON payments(cut_date);
CREATE INDEX IF NOT EXISTS idx_payments_platform ON payments(platform);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

CREATE TABLE IF NOT EXISTS platform_details (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  group_name TEXT NOT NULL,
  detail_type TEXT NOT NULL DEFAULT '',
  space TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  password_enc TEXT NOT NULL DEFAULT '',
  pin_enc TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT '',
  start_date TEXT,
  cut_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_group_space
  ON platform_details(platform, group_name, space);
CREATE INDEX IF NOT EXISTS idx_platform_cut_date ON platform_details(cut_date);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
