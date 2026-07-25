-- budget-service — owned tables only
-- Generated from budget_service.model.Budget. Reference only — see database/README.md.

CREATE TABLE IF NOT EXISTS budgets (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL,
  category      VARCHAR(255) NOT NULL,
  monthly_limit NUMERIC(19,2) NOT NULL,
  created_at    TIMESTAMP
);
