# Railway deployment prep — Tally microservices

**Config only. Nothing has been deployed.** Provisioning 5 Railway services instead of 1 has real billing implications — that decision is yours.

Each module has a committed `application.properties` with env-var placeholders only (no secrets), the same pattern the monolith used. Each has its own `mvnw`, so Railway/Nixpacks builds each module by setting the service's **Root Directory** to the module folder (e.g. `tally-backend/auth-service`).

## Deploy order

1. Deploy the 4 backend services first; note each one's Railway domain.
2. Deploy `api-gateway` last, pointing its `*_SERVICE_URL` vars at those domains.
3. Only the gateway needs a **public** domain. If your Railway plan supports private networking, give the 4 backend services private-only domains and use `http://<service>.railway.internal` URLs in the gateway — the mobile app must never reach them directly.
4. Finally, point the mobile app's `BASE_URL` (tally-mobile/services/api.ts) at the gateway's public URL.

## Environment variables

Shared by all 4 backend services (identical values — same Neon DB, same JWT secret):

| Var | Value |
|---|---|
| `DB_HOST` | ep-…neon.tech (same as monolith) |
| `DB_NAME` | tallydb |
| `DB_USERNAME` / `DB_PASSWORD` | same as monolith |
| `JWT_SECRET` | **must be identical everywhere** — auth-service signs, the rest verify |
| `INCLUDE_ERROR_MESSAGES` | `never` (production) |

expense-service and group-service additionally need all `MOMO_*` vars (same values as the monolith): `MOMO_SUBSCRIPTION_KEY`, `MOMO_API_USER`, `MOMO_API_KEY`, `MOMO_BASE_URL`, `MOMO_ENVIRONMENT`, `MOMO_CURRENCY`, `MOMO_CALLBACK_URL`, `MOMO_DISBURSEMENT_SUBSCRIPTION_KEY`, `MOMO_DISBURSEMENT_API_USER`, `MOMO_DISBURSEMENT_API_KEY`, `MOMO_DISBURSEMENT_BASE_URL`.

Set `MOMO_CALLBACK_URL` to `https://<gateway-domain>/api/momo/callback` (the callback route lands on expense-service via the gateway).

api-gateway only:

| Var | Value |
|---|---|
| `AUTH_SERVICE_URL` | auth-service Railway URL |
| `EXPENSE_SERVICE_URL` | expense-service Railway URL |
| `BUDGET_SERVICE_URL` | budget-service Railway URL |
| `GROUP_SERVICE_URL` | group-service Railway URL |
| `ALLOWED_ORIGINS` | your allowed origins (CORS is centralized here) |

`PORT` is injected by Railway automatically on every service — don't set it.

Note: `DDL_AUTO` no longer exists as a variable — every service hardcodes `validate` so no service can alter tables another service owns.
