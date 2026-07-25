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
  reset_otp_expiry TIMESTAMP
);
