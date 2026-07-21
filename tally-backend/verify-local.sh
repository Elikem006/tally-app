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
#   ./verify-local.sh auth|spend|group   # run a single phase (state carries over
#                                          in /tmp/tally-verify-state.env)
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

echo "-----------------------------------------"
echo "RESULT: $PASS passed, $FAIL failed  (phase: $PHASE, base: $BASE)"
[ $FAIL = 0 ]
