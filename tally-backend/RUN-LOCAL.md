# Running the Tally microservices locally

Five processes, five terminals. Start order doesn't strictly matter, but starting the gateway last avoids a few noisy 500s.

Each backend service already has its `application-local.properties` (gitignored, copied from the monolith's) in `src/main/resources/`, so `SPRING_PROFILES_ACTIVE=local` works exactly as it did for the monolith. The gateway needs no local override file.

## Commands (PowerShell, one terminal each)

```powershell
# Terminal 1 — auth-service (port 8090)
cd tally-backend\auth-service
$env:SPRING_PROFILES_ACTIVE="local"; .\mvnw.cmd spring-boot:run

# Terminal 2 — expense-service (port 8091; also serves /api/categories, /api/reminders, /api/momo)
cd tally-backend\expense-service
$env:SPRING_PROFILES_ACTIVE="local"; .\mvnw.cmd spring-boot:run

# Terminal 3 — budget-service (port 8092)
cd tally-backend\budget-service
$env:SPRING_PROFILES_ACTIVE="local"; .\mvnw.cmd spring-boot:run

# Terminal 4 — group-service (port 8093)
cd tally-backend\group-service
$env:SPRING_PROFILES_ACTIVE="local"; .\mvnw.cmd spring-boot:run

# Terminal 5 — api-gateway (port 8082 — the only port the mobile app talks to)
cd tally-backend\api-gateway
.\mvnw.cmd spring-boot:run
```

## Automated verification (preferred)

With all 5 services running, one command runs the whole sequence below and prints PASS/FAIL per step (22 checks, exit 0 = all green):

```bash
./verify-local.sh          # from tally-backend/, in Git Bash or WSL
```

Each run registers two throwaway users (`verify.<timestamp>.*@tally.test`). To prune them later:
`DELETE FROM users WHERE email LIKE 'verify.%@tally.test';` (after deleting their expenses/budgets/reminders/groups rows, or just leave them — they're inert).

Settle-up contract (the one that tripped up the manual Postman pass): **POST** `/api/groups/{groupId}/settle` with body `{"userId":"<id>", "phoneNumber":"<optional>"}` and the settling user's own JWT. Any other verb returns "That HTTP method is not supported".

## Postman pass (all through http://localhost:8082)

Every path is identical to the monolith's. Suggested order: `POST /api/auth/register` → `POST /api/auth/login` (grab JWT) → `POST /api/expenses` → `GET /api/expenses/user/{id}` → `POST /api/budgets` → `GET /api/budgets/user/{id}/summary` → `GET /api/categories/user/{id}` → `GET /api/reminders/user/{id}` → `POST /api/groups` → `POST /api/groups/{id}/members` → `POST /api/groups/{id}/expenses` → `GET /api/groups/{id}/balances` → `POST /api/groups/{id}/settle` → `GET /api/momo/balance`.

All non-public endpoints need `Authorization: Bearer <token>` — same as before (JWT is enforced; see SecurityConfig audit in the migration report).

## Notes

- Services use `ddl-auto=validate` — they will refuse to start if the schema is missing. The existing Neon DB (or your local `tally-db` Postgres, if its schema is current) already satisfies this.
- The old monolith also defaults to port 8082 — don't run it at the same time as the gateway.
