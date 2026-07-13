-- Tally App Database Schema
-- Generated from JPA entity classes (user_service.model.*).
--
-- NOTE: You do NOT need to run this manually against Neon.
-- With spring.jpa.hibernate.ddl-auto=update (the default), Hibernate creates
-- and updates all tables automatically on first startup.
--
-- This file is a REFERENCE only — keep it in sync with the entity classes
-- if you ever need to inspect the schema or bootstrap a blank database manually.
--
-- 8 tables total: users, expenses, budgets, groups, group_members,
-- shared_expenses, reminders, custom_categories

-- ============================================================
-- users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  created_at      TIMESTAMP,
  avatar_type     VARCHAR(255),
  avatar_data     TEXT,
  phone_number    VARCHAR(255),
  reset_otp       VARCHAR(255),
  reset_otp_expiry TIMESTAMP
);

-- ============================================================
-- expenses
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL,
  amount            NUMERIC(19,2) NOT NULL,
  category          VARCHAR(255) NOT NULL,
  description       VARCHAR(255),
  date              DATE NOT NULL,
  created_at        TIMESTAMP,
  payment_method    VARCHAR(255) DEFAULT 'CASH',
  status            VARCHAR(255) DEFAULT 'COMPLETED',
  momo_reference_id VARCHAR(255) UNIQUE,
  notes             TEXT,
  receipt_photo     TEXT,
  is_recurring      BOOLEAN DEFAULT FALSE,
  recurrence_type   VARCHAR(255),
  next_due_date     DATE
);

-- ============================================================
-- budgets
-- ============================================================
CREATE TABLE IF NOT EXISTS budgets (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL,
  category      VARCHAR(255) NOT NULL,
  monthly_limit NUMERIC(19,2) NOT NULL,
  created_at    TIMESTAMP
);

-- ============================================================
-- groups
-- ============================================================
CREATE TABLE IF NOT EXISTS groups (
  id         BIGSERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMP
);

-- ============================================================
-- group_members
-- ============================================================
CREATE TABLE IF NOT EXISTS group_members (
  id         BIGSERIAL PRIMARY KEY,
  group_id   BIGINT NOT NULL,
  user_id    BIGINT NOT NULL,
  joined_at  TIMESTAMP
);

-- ============================================================
-- shared_expenses
-- ============================================================
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

-- ============================================================
-- reminders
-- ============================================================
CREATE TABLE IF NOT EXISTS reminders (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL,
  title           VARCHAR(255) NOT NULL,
  amount          NUMERIC(19,2),
  due_date        DATE,
  is_recurring    BOOLEAN DEFAULT FALSE,
  recurrence_type VARCHAR(255),
  is_paid         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP
);

-- ============================================================
-- custom_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_categories (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  name       VARCHAR(255) NOT NULL,
  emoji      VARCHAR(255) NOT NULL,
  created_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_categories_user_id ON custom_categories (user_id);
