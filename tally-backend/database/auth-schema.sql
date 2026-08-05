-- auth-service — owned tables only
-- Generated from auth_service.model.User. Reference only — see database/README.md.

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
  reset_otp_expiry TIMESTAMP,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token VARCHAR(255),
  verification_token_expiry TIMESTAMP
);

-- Applied to the live Neon database on 2026-08-05 (ddl-auto=validate means
-- Hibernate never alters anything — this file is reference only):
--
--   ALTER TABLE users
--     ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
--     ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255),
--     ADD COLUMN IF NOT EXISTS verification_token_expiry TIMESTAMP;
--   UPDATE users SET email_verified = TRUE;  -- grandfather pre-existing accounts
