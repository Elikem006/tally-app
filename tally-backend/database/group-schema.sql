-- group-service — owned tables only
-- Generated from group_service.model.*. Reference only — see database/README.md.

CREATE TABLE IF NOT EXISTS groups (
  id         BIGSERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS group_members (
  id         BIGSERIAL PRIMARY KEY,
  group_id   BIGINT NOT NULL,
  user_id    BIGINT NOT NULL,
  joined_at  TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shared_expenses (
  id              BIGSERIAL PRIMARY KEY,
  group_id        BIGINT NOT NULL,
  paid_by         BIGINT NOT NULL,
  amount          NUMERIC(19,2) NOT NULL,
  description     VARCHAR(255) NOT NULL,
  split_type      VARCHAR(255) NOT NULL DEFAULT 'EQUAL',
  split_ratios    TEXT,
  participant_ids TEXT,
  settled         BOOLEAN DEFAULT FALSE,
  version         BIGINT,
  created_at      TIMESTAMP
);

-- One row per (shared_expense, debtor) once that debtor has paid their share.
-- shared_expenses.settled only flips true once every debtor on that expense
-- has a row here — see group_service.service.GroupService#settleUp.
CREATE TABLE IF NOT EXISTS shared_expense_settlements (
  id                 BIGSERIAL PRIMARY KEY,
  shared_expense_id  BIGINT NOT NULL,
  user_id            BIGINT NOT NULL,
  settled_at         TIMESTAMP NOT NULL,
  UNIQUE (shared_expense_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_expense_settlements_expense_id
  ON shared_expense_settlements (shared_expense_id);
