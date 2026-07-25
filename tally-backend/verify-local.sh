#!/bin/bash
# =============================================================================
# Tally microservices end-to-end verification
# =============================================================================
# Runs the full API sequence through the gateway and prints PASS/FAIL per step:
#   register x2 -> login x2 -> create expense -> read expenses -> categories
#   -> create reminder -> read reminders -> create budget -> budget summary
#   -> create group -> add member -> add shared expense -> balances
#   -> settle-up -> balances again -> settlement expense visible -> net balance
#
# Usage (Git Bash / WSL / any bash):
#   ./verify-local.sh                 # everything (services must be running, see RUN-LOCAL.md)
#   BASE_URL=http://localhost:8082 ./verify-local.sh
#   ./verify-local.sh auth|spend|group|settle|report|security|integrity   # run a single phase
#                                       (state carries over in /tmp/tally-verify-state.env)
#
# Exit code 0 = all steps passed.
# =============================================================================
set -u

BASE="${BASE_URL:-http://localhost:8082}"
STATE="${STATE_FILE:-/tmp/tally-verify-state.env}"
PHASE="${1:-all}"
PASS=0; FAIL=0
TODAY=$(date +%F)
TOMORROW=$(date -d "+1 day" +%F 2>/dev/null || date -v+1d +%F)

CODE=""; BODY=""

call() { # METHOD PATH TOKEN [BODY]
  local method=$1 path=$2 token=$3 body=${4:-}
  local args=(-s -w $'\n%{http_code}' -X "$method" "$BASE$path" --max-time 15)
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-H "Content-Type: application/json" -d "$body")
  local out; out=$(curl "${args[@]}")
  CODE=$(echo "$out" | tail -1); BODY=$(echo "$out" | sed '$d')
}

check() { # NAME CODE_REGEX [MUST_CONTAIN] [MUST_NOT_CONTAIN]
  local name=$1 code_re=$2 must=${3:-} mustnot=${4:-}
  local ok=1
  [[ "$CODE" =~ $code_re ]] || ok=0
  if [ -n "$must" ] && ! echo "$BODY" | grep -q "$must"; then ok=0; fi
  if [ -n "$mustnot" ] && echo "$BODY" | grep -q "$mustnot"; then ok=0; fi
  if [ $ok = 1 ]; then
    PASS=$((PASS+1)); printf 'PASS  %-28s (HTTP %s)\n' "$name" "$CODE"
  else
    FAIL=$((FAIL+1)); printf 'FAIL  %-28s (HTTP %s)\n      body: %.300s\n' "$name" "$CODE" "$BODY"
  fi
}

jget_num() { echo "$BODY" | grep -o "\"$1\":[0-9]*" | head -1 | cut -d: -f2; }
jget_str() { echo "$BODY" | grep -o "\"$1\":\"[^\"]*\"" | head -1 | sed 's/^[^:]*:"//; s/"$//'; }

# ------------------------------------------------------------------ phase: auth
if [ "$PHASE" = "all" ] || [ "$PHASE" = "auth" ]; then
  TS="$(date +%s)$RANDOM"
  E1="verify.$TS.u1@tally.test"; E2="verify.$TS.u2@tally.test"; PW="Verify!Pass123"

  call POST /api/auth/register "" "{\"name\":\"Verify One\",\"email\":\"$E1\",\"password\":\"$PW\"}"
  check "register-u1" '^201$' '"success":true'
  U1=$(jget_num userId)

  call POST /api/auth/register "" "{\"name\":\"Verify Two\",\"email\":\"$E2\",\"password\":\"$PW\"}"
  check "register-u2" '^201$' '"success":true'
  U2=$(jget_num userId)

  call POST /api/auth/login "" "{\"email\":\"$E1\",\"password\":\"$PW\"}"
  check "login-u1" '^200$' '"token"'
  T1=$(jget_str token)

  call POST /api/auth/login "" "{\"email\":\"$E2\",\"password\":\"$PW\"}"
  check "login-u2" '^200$' '"token"'
  T2=$(jget_str token)

  { echo "U1=$U1"; echo "U2=$U2"; echo "T1=$T1"; echo "T2=$T2"; } > "$STATE"
fi

[ -f "$STATE" ] && . "$STATE"

# ----------------------------------------------------------------- phase: spend
if [ "$PHASE" = "all" ] || [ "$PHASE" = "spend" ]; then
  call POST /api/expenses "$T1" "{\"userId\":\"$U1\",\"amount\":\"25.50\",\"category\":\"Food\",\"date\":\"$TODAY\",\"description\":\"Verify lunch\"}"
  check "create-expense" '^2..$' '"id"'

  call GET "/api/expenses/user/$U1" "$T1"
  check "list-expenses-u1" '^200$' '25.5'

  call GET "/api/categories/user/$U1" "$T1"
  check "categories-u1" '^200$'

  call POST /api/reminders "$T1" "{\"userId\":\"$U1\",\"title\":\"Verify rent\",\"amount\":\"100\",\"dueDate\":\"$TOMORROW\"}"
  check "create-reminder" '^2..$'

  call GET "/api/reminders/user/$U1" "$T1"
  check "list-reminders-u1" '^200$' 'Verify rent'

  call GET "/api/reminders/user/$U1/upcoming" "$T1"
  check "reminders-upcoming-u1" '^200$'

  call POST /api/budgets "$T1" "{\"userId\":\"$U1\",\"category\":\"Food\",\"monthlyLimit\":\"500\"}"
  check "create-budget" '^2..$'

  call GET "/api/budgets/user/$U1/summary" "$T1"
  check "budget-summary-u1" '^200$' 'Food'
  # cross-service read: summary must reflect the 25.50 Food expense
  check "budget-summary-spend" '^200$' '25.5'
fi

# ----------------------------------------------------------------- phase: group
if [ "$PHASE" = "all" ] || [ "$PHASE" = "group" ]; then
  call POST /api/groups "$T1" "{\"name\":\"Verify Group $$\",\"createdBy\":\"$U1\"}"
  check "create-group" '^201$' '"id"'
  GID=$(jget_num id)

  call POST "/api/groups/$GID/members" "$T1" "{\"userId\":\"$U2\"}"
  check "add-member-u2" '^201$'

  call POST "/api/groups/$GID/expenses" "$T1" "{\"paidBy\":\"$U1\",\"amount\":\"40\",\"description\":\"Verify dinner\"}"
  check "add-shared-expense" '^201$' '"settled":false'

  call GET "/api/groups/$GID/balances" "$T1"
  check "balances-before" '^200$' '\-20'

  echo "GID=$GID" >> "$STATE"
fi

[ -f "$STATE" ] && . "$STATE"

# ---------------------------------------------------------------- phase: settle
if [ "$PHASE" = "all" ] || [ "$PHASE" = "settle" ]; then
  call POST "/api/groups/$GID/settle" "$T2" "{\"userId\":\"$U2\"}"
  check "settle-up-u2" '^200$' '"success":true'
  check "settle-amount-20" '^200$' '"settledAmount":20'

  call GET "/api/groups/$GID/balances" "$T1"
  check "balances-after-cleared" '^200$' '' '"owes":true'

  call GET "/api/expenses/user/$U1" "$T1"
  check "settlement-expense-u1" '^200$' 'Settlement received'

  call GET "/api/groups/user/$U1/net" "$T1"
  check "net-balance-u1" '^200$' '"success":true'
fi

# ---------------------------------------------------------------- phase: report
# API-composition endpoints: report (expense→budget+group), history
# (expense→group), export (expense only). Requires all services running.
if [ "$PHASE" = "all" ] || [ "$PHASE" = "report" ]; then
  call GET "/api/expenses/user/$U1/report" "$T1"
  check "monthly-report" '^200$' '"budgetPerformance"'
  check "report-has-budget-food" '^200$' '"category":"Food"'
  # 25.50 personal + 20.00 share of the 40.00 group dinner = 45.50
  check "report-current-month" '^200$' '"currentMonth":45.5'
  check "report-shared-category" '^200$' '"Shared"'

  call GET "/api/expenses/user/$U1/history" "$T1"
  check "combined-history" '^200$' '"type":"shared"'
  check "history-group-expense" '^200$' 'Verify dinner'

  call GET "/api/expenses/user/$U1/export?format=csv" "$T1"
  check "csv-export" '^200$' 'Date,Category,Description,Amount,PaymentMethod'
fi

# --------------------------------------------------------------- phase: security
# Cross-user isolation checks. U3 has NO relationship to group $GID and must
# be rejected from every group-scoped read/write; ownership must also be
# enforced on reminder/expense endpoints keyed by a bare resource id (not a
# /user/{id} path, so JwtAuthFilter's own same-user check does not apply —
# these rely entirely on the explicit checks added in this fix).
if [ "$PHASE" = "all" ] || [ "$PHASE" = "security" ]; then
  TS3="$(date +%s)$RANDOM"
  E3="verify.sec.$TS3@tally.test"; PW3="Verify!Pass123"

  call POST /api/auth/register "" "{\"name\":\"Verify Outsider\",\"email\":\"$E3\",\"password\":\"$PW3\"}"
  check "security-register-u3" '^201$' '"success":true'
  U3=$(jget_num userId)

  call POST /api/auth/login "" "{\"email\":\"$E3\",\"password\":\"$PW3\"}"
  check "security-login-u3" '^200$' '"token"'
  T3=$(jget_str token)

  # Outsider must NOT be able to view group details or balances
  call GET "/api/groups/$GID" "$T3"
  check "security-block-view-group" '^4' '' '"success":true'
  call GET "/api/groups/$GID/balances" "$T3"
  check "security-block-view-balances" '^4'

  # Outsider must NOT be able to add a shared expense to a group they're not in
  call POST "/api/groups/$GID/expenses" "$T3" "{\"paidBy\":\"$U3\",\"amount\":\"5\",\"description\":\"Sneaky\"}"
  check "security-block-add-expense-outsider" '^4'

  # A real member (u1) must NOT be able to attribute a shared expense to a
  # non-member (u3) — this is what let a fabricated expense inflate real
  # members' balances before this fix.
  call POST "/api/groups/$GID/expenses" "$T1" "{\"paidBy\":\"$U3\",\"amount\":\"5\",\"description\":\"Fabricated\"}"
  check "security-block-paidby-non-member" '^4'

  # Outsider must NOT be able to add themself as a member
  call POST "/api/groups/$GID/members" "$T3" "{\"userId\":\"$U3\"}"
  check "security-block-self-add-member" '^4'

  # Outsider must NOT be able to delete the group; group must survive
  call DELETE "/api/groups/$GID" "$T3"
  check "security-block-delete-group" '^4'
  call GET "/api/groups/$GID" "$T1"
  check "security-group-survives" '^200$'

  # Reminder ownership — u3 must not touch u1's reminder (created in "spend")
  call GET "/api/reminders/user/$U1" "$T1"
  RID=$(jget_num id)
  if [ -n "$RID" ]; then
    call PUT "/api/reminders/$RID/paid" "$T3" ""
    check "security-block-mark-paid-others-reminder" '^4'
    call DELETE "/api/reminders/$RID" "$T3" ""
    check "security-block-delete-others-reminder" '^4'
  else
    echo "      (skipping reminder ownership checks — no reminder id found)"
  fi

  # Expense ownership — u3 must not toggle recurring on u1's expense
  call GET "/api/expenses/user/$U1" "$T1"
  EID=$(jget_num id)
  if [ -n "$EID" ]; then
    call PUT "/api/expenses/$EID/recurring" "$T3" "{\"isRecurring\":\"true\",\"recurrenceType\":\"MONTHLY\"}"
    check "security-block-others-expense-recurring" '^4'
  else
    echo "      (skipping expense ownership check — no expense id found)"
  fi

  # Positive control: the CREATOR (u1) inviting an outsider (u3) must still
  # work — confirms the fix blocks the exploit without breaking real invites.
  call POST "/api/groups/$GID/members" "$T1" "{\"userId\":\"$U3\"}"
  check "security-creator-can-still-invite" '^201$'
fi

# --------------------------------------------------------------- phase: integrity
# True database-per-service (separate Neon project per service, no shared
# tables, no FK constraints anywhere — see database/README.md) means nothing
# at the DB level stops a fabricated cross-service reference. This phase
# exercises the application-level replacement: group-service now calls
# auth-service's GET /api/auth/users/{id}/exists before writing an invite to
# group_members, since that's the one place an arbitrary (not the caller's
# own JWT-derived) userId could enter the system.
if [ "$PHASE" = "all" ] || [ "$PHASE" = "integrity" ]; then
  # A userId this large will never collide with a real registered user.
  FAKE_USER_ID=999999999

  call POST "/api/groups/$GID/members" "$T1" "{\"userId\":\"$FAKE_USER_ID\"}"
  check "integrity-block-fake-user-invite" '^4'

  # The rejection must be a real application-level check, not a lucky error
  # from something else — confirm the existence-check endpoint itself agrees.
  call GET "/api/auth/users/$FAKE_USER_ID/exists" "$T1"
  check "integrity-fake-user-reported-nonexistent" '^200$' '"exists":false'

  call GET "/api/auth/users/$U1/exists" "$T1"
  check "integrity-real-user-reported-existent" '^200$' '"exists":true'
fi

echo "-----------------------------------------"
echo "RESULT: $PASS passed, $FAIL failed  (phase: $PHASE, base: $BASE)"
[ $FAIL = 0 ]
