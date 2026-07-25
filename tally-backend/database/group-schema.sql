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
