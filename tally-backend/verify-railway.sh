#!/bin/bash
# =============================================================================
# Tally microservices end-to-end verification — LIVE RAILWAY DEPLOYMENT
# =============================================================================
# Adapted from verify-local.sh. Differences from the local version:
#   - BASE defaults to the live Railway gateway (HTTPS, real internet latency
#     between services — no longer the near-zero-latency docker-compose network)
#   - Every check now also records and prints elapsed time (curl %{time_total}),
#     not just pass/fail, so latency regressions are visible even on checks
#     that still pass
#   - --max-time raised from 15s to 25s: expense-service's MoMoService retries
#     transient MoMo failures internally (up to 2 attempts, ~1.2s sleep between),
#     on top of its own 3s connect / 10s read RestTemplate timeout — 15s risked
#     the CLIENT (curl) killing the request before the SERVER's own timeout
#     budget was exhausted, which would misreport a slow-but-real server
#     response as a client-side timeout. Actual elapsed time is still printed
#     for every call regardless of outcome.
#   - settle-up now sends phoneNumber, genuinely exercising the chained
#     expense-service createExpense + MoMo request-to-pay path over Railway's
#     network (the local script never populated this optional field, so it
#     never actually called MoMo)
#   - new "momo" phase: calls POST /api/momo/pay and GET /api/momo/status
#     directly, independent of settle-up. This is the actual path the mobile
#     app's pending-state UI watches (expense-service's MoMoController
#     distinguishes "unavailable" explicitly); group-service's settle-embedded
#     MoMo call collapses both "unavailable" and a genuine decline into a
#     single momoStatus:"FAILED", so it alone isn't enough to confirm the
#     graceful-degradation shape the mobile UI depends on.
#
# Usage (Git Bash / WSL / any bash):
#   ./verify-railway.sh                 # everything
#   BASE_URL=https://other-gateway ./verify-railway.sh
#   ./verify-railway.sh auth|spend|group|settle|momo|report
#                                       (state carries over in /tmp/tally-verify-railway-state.env)
#
# Exit code 0 = all steps passed.
# =============================================================================
set -u

BASE="${BASE_URL:-https://api-gateway-production-5e04.up.railway.app}"
STATE="${STATE_FILE:-/tmp/tally-verify-railway-state.env}"
PHASE="${1:-all}"
PASS=0; FAIL=0
TODAY=$(date +%F)
TOMORROW=$(date -d "+1 day" +%F 2>/dev/null || date -v+1d +%F)

CODE=""; BODY=""; DURATION=""

call() { # METHOD PATH TOKEN [BODY]
  local method=$1 path=$2 token=$3 body=${4:-}
  local args=(-s -w $'\n%{http_code}\n%{time_total}' -X "$method" "$BASE$path" --max-time 25)
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(-H "Content-Type: application/json" -d "$body")
  local out; out=$(curl "${args[@]}")
  DURATION=$(echo "$out" | tail -1)
  CODE=$(echo "$out" | tail -2 | head -1)
  BODY=$(echo "$out" | sed '$d' | sed '$d')
}

check() { # NAME CODE_REGEX [MUST_CONTAIN] [MUST_NOT_CONTAIN]
  local name=$1 code_re=$2 must=${3:-} mustnot=${4:-}
  local ok=1
  [[ "$CODE" =~ $code_re ]] || ok=0
  if [ -n "$must" ] && ! echo "$BODY" | grep -q "$must"; then ok=0; fi
  if [ -n "$mustnot" ] && echo "$BODY" | grep -q "$mustnot"; then ok=0; fi
  # Flag anything over 3s even when it passes — near-zero on docker-compose,
  # so several seconds here is real added latency worth knowing about.
  local slow=""
  if awk "BEGIN{exit !($DURATION > 3.0)}"; then slow=" ⚠ SLOW"; fi
  if [ $ok = 1 ]; then
    PASS=$((PASS+1)); printf 'PASS  %-28s (HTTP %s, %ss)%s\n' "$name" "$CODE" "$DURATION" "$slow"
  else
    FAIL=$((FAIL+1)); printf 'FAIL  %-28s (HTTP %s, %ss)%s\n      body: %.300s\n' "$name" "$CODE" "$DURATION" "$slow" "$BODY"
  fi
}

jget_num() { echo "$BODY" | grep -o "\"$1\":[0-9]*" | head -1 | cut -d: -f2; }
jget_str() { echo "$BODY" | grep -o "\"$1\":\"[^\"]*\"" | head -1 | sed 's/^[^:]*:"//; s/"$//'; }

# ------------------------------------------------------------------ phase: auth
if [ "$PHASE" = "all" ] || [ "$PHASE" = "auth" ]; then
  TS="$(date +%s)$RANDOM"
  E1="verify.rw.$TS.u1@tally.test"; E2="verify.rw.$TS.u2@tally.test"; PW="Verify!Pass123"

  call POST /api/auth/register "" "{\"name\":\"Verify RW One\",\"email\":\"$E1\",\"password\":\"$PW\"}"
  check "register-u1" '^201$' '"success":true'
  U1=$(jget_num userId)

  call POST /api/auth/register "" "{\"name\":\"Verify RW Two\",\"email\":\"$E2\",\"password\":\"$PW\"}"
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
  # cross-service read: summary must reflect the 25.50 Food expense, now over
  # Railway's real network between budget-service and expense-service
  check "budget-summary-spend" '^200$' '25.5'
fi

# ----------------------------------------------------------------- phase: group
if [ "$PHASE" = "all" ] || [ "$PHASE" = "group" ]; then
  call POST /api/groups "$T1" "{\"name\":\"Verify RW Group $$\",\"createdBy\":\"$U1\"}"
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
  # phoneNumber populated (unlike verify-local.sh) so this genuinely exercises
  # the chained group-service -> expense-service(createExpense) +
  # expense-service -> MoMo request-to-pay path over Railway's real network.
  # settle-up must succeed regardless of MoMo's outcome (never blocking) —
  # that contract itself is part of what's being verified here.
  call POST "/api/groups/$GID/settle" "$T2" "{\"userId\":\"$U2\",\"phoneNumber\":\"0241234567\"}"
  check "settle-up-u2" '^200$' '"message"'
  check "settle-amount-20" '^200$' '"settledAmount":20'
  MOMO_SETTLE_STATUS=$(jget_str momoStatus)
  echo "      settle-embedded momoStatus: ${MOMO_SETTLE_STATUS:-<not set>}"

  call GET "/api/groups/$GID/balances" "$T1"
  check "balances-after-cleared" '^200$' '' '"owes":true'

  call GET "/api/expenses/user/$U1" "$T1"
  check "settlement-expense-u1" '^200$' 'Settlement received'

  call GET "/api/groups/user/$U1/net" "$T1"
  check "net-balance-u1" '^200$' '"success":true'
fi

# ------------------------------------------------------------------ phase: momo
# Direct MoMo path (not routed through settle-up) — this is what the mobile
# app's pending-transaction UI actually watches. expense-service's own
# MoMoController distinguishes an "unavailable" sandbox from a real failure;
# confirm that distinction survives being called from Railway's servers.
if [ "$PHASE" = "all" ] || [ "$PHASE" = "momo" ]; then
  call POST /api/momo/pay "$T1" "{\"phoneNumber\":\"0241234567\",\"amount\":\"10.00\",\"description\":\"Verify RW momo direct\"}"
  # Any of these HTTP 200 outcomes is a PASS — a graceful shape, not a crash:
  #   success:true + status:PENDING   -> sandbox accepted the request
  #   success:false + status:unavailable -> sandbox down, reported cleanly
  check "momo-pay-graceful" '^200$'
  MOMO_PAY_STATUS=$(jget_str status)
  MOMO_PAY_SUCCESS=$(jget_str success)
  MOMO_REF=$(jget_str referenceId)
  echo "      momo/pay response: status=${MOMO_PAY_STATUS:-<none>} success=${MOMO_PAY_SUCCESS:-<none>} referenceId=${MOMO_REF:-<none>}"

  if [ -n "$MOMO_REF" ]; then
    call GET "/api/momo/status/$MOMO_REF" "$T1"
    check "momo-status-graceful" '^200$'
    MOMO_STATUS_VAL=$(jget_str status)
    echo "      momo/status response: status=${MOMO_STATUS_VAL:-<none>}"
  else
    echo "      (skipping momo/status check — no referenceId returned by /pay)"
  fi
fi

# ---------------------------------------------------------------- phase: report
# API-composition endpoints: report (expense->budget+group), history
# (expense->group), export (expense only). Each of these is now 2-3 chained
# HTTP calls over Railway's public network instead of the docker-compose
# bridge network — the most latency-sensitive checks in this script.
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
# Cross-user isolation checks — confirms the authorization fixes are actually
# live on Railway, not just locally. U3 has NO relationship to group $GID and
# must be rejected from every group-scoped read/write; ownership must also be
# enforced on reminder/expense endpoints keyed by a bare resource id.
if [ "$PHASE" = "all" ] || [ "$PHASE" = "security" ]; then
  TS3="$(date +%s)$RANDOM"
  E3="verify.rw.sec.$TS3@tally.test"; PW3="Verify!Pass123"

  call POST /api/auth/register "" "{\"name\":\"Verify RW Outsider\",\"email\":\"$E3\",\"password\":\"$PW3\"}"
  check "security-register-u3" '^201$' '"success":true'
  U3=$(jget_num userId)

  call POST /api/auth/login "" "{\"email\":\"$E3\",\"password\":\"$PW3\"}"
  check "security-login-u3" '^200$' '"token"'
  T3=$(jget_str token)

  call GET "/api/groups/$GID" "$T3"
  check "security-block-view-group" '^4' '' '"success":true'
  call GET "/api/groups/$GID/balances" "$T3"
  check "security-block-view-balances" '^4'

  call POST "/api/groups/$GID/expenses" "$T3" "{\"paidBy\":\"$U3\",\"amount\":\"5\",\"description\":\"Sneaky\"}"
  check "security-block-add-expense-outsider" '^4'

  call POST "/api/groups/$GID/expenses" "$T1" "{\"paidBy\":\"$U3\",\"amount\":\"5\",\"description\":\"Fabricated\"}"
  check "security-block-paidby-non-member" '^4'

  call POST "/api/groups/$GID/members" "$T3" "{\"userId\":\"$U3\"}"
  check "security-block-self-add-member" '^4'

  call DELETE "/api/groups/$GID" "$T3"
  check "security-block-delete-group" '^4'
  call GET "/api/groups/$GID" "$T1"
  check "security-group-survives" '^200$'

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

  call GET "/api/expenses/user/$U1" "$T1"
  EID=$(jget_num id)
  if [ -n "$EID" ]; then
    call PUT "/api/expenses/$EID/recurring" "$T3" "{\"isRecurring\":\"true\",\"recurrenceType\":\"MONTHLY\"}"
    check "security-block-others-expense-recurring" '^4'
  else
    echo "      (skipping expense ownership check — no expense id found)"
  fi

  # Positive control: the creator (u1) inviting an outsider (u3) must still work.
  call POST "/api/groups/$GID/members" "$T1" "{\"userId\":\"$U3\"}"
  check "security-creator-can-still-invite" '^201$'
fi

echo "-----------------------------------------"
echo "RESULT: $PASS passed, $FAIL failed  (phase: $PHASE, base: $BASE)"
[ $FAIL = 0 ]
