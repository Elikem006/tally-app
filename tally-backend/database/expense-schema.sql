-- expense-service — owned tables only
-- Generated from expense_service.model.*. Reference only — see database/README.md.

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

CREATE TABLE IF NOT EXISTS custom_categories (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL,
  name       VARCHAR(255) NOT NULL,
  emoji      VARCHAR(255) NOT NULL,
  created_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_custom_categories_user_id ON custom_categories (user_id);
