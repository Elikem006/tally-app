# Tally — demo-day end-to-end API smoke test (PowerShell)
# Usage:  .\demo-e2e.ps1                        (tests Railway production)
#         .\demo-e2e.ps1 -BaseUrl http://localhost:8082   (tests local backend)
param(
    [string]$BaseUrl = "https://tally-app-production-939a.up.railway.app"
)

$ErrorActionPreference = "Continue"
$stamp = Get-Date -Format "HHmmss"
$email = "demo$stamp@tally.test"
$pass  = "demo123pass1"
$fails = 0

function Step($name, $ok, $detail) {
    if ($ok) { Write-Host "  PASS  $name" -ForegroundColor Green }
    else     { Write-Host "  FAIL  $name -> $detail" -ForegroundColor Red; $script:fails++ }
}

Write-Host "`n=== Tally E2E against $BaseUrl ===" -ForegroundColor Cyan

# 1. Register
$r = Invoke-RestMethod -Uri "$BaseUrl/api/auth/register" -Method Post -ContentType "application/json" `
     -Body (@{ name = "Demo User"; email = $email; password = $pass } | ConvertTo-Json)
Step "register" ($r.success -eq $true -and $r.userId) ($r | ConvertTo-Json -Compress)

# 2. Login
$login = Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -ContentType "application/json" `
         -Body (@{ email = $email; password = $pass } | ConvertTo-Json)
Step "login" ($login.token -and $login.userId) ($login | ConvertTo-Json -Compress)
$uid = $login.userId
$hdr = @{ Authorization = "Bearer $($login.token)" }

# 3. Wrong password -> clean error (429 possible after retries)
try {
    Invoke-RestMethod -Uri "$BaseUrl/api/auth/login" -Method Post -ContentType "application/json" `
        -Body (@{ email = $email; password = "wrongpass9" } | ConvertTo-Json) | Out-Null
    Step "wrong-password rejected" $false "login unexpectedly succeeded"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Step "wrong-password rejected ($code)" ($code -eq 400 -or $code -eq 401 -or $code -eq 429) $code
}

# 4. Duplicate email -> clean error
try {
    Invoke-RestMethod -Uri "$BaseUrl/api/auth/register" -Method Post -ContentType "application/json" `
        -Body (@{ name = "Dup"; email = $email; password = $pass } | ConvertTo-Json) | Out-Null
    Step "duplicate-email rejected" $false "register unexpectedly succeeded"
} catch { Step "duplicate-email rejected" $true "" }

# 5. Add expense
$today = Get-Date -Format "yyyy-MM-dd"
$exp = Invoke-RestMethod -Uri "$BaseUrl/api/expenses" -Method Post -Headers $hdr -ContentType "application/json" `
       -Body (@{ userId = "$uid"; amount = "-45.50"; category = "Food"; description = "Demo waakye"; date = $today; paymentMethod = "CASH" } | ConvertTo-Json)
Step "add expense" ($exp.id -and $exp.category -eq "Food") ($exp | ConvertTo-Json -Compress)

# 6. Set budget
$bud = Invoke-RestMethod -Uri "$BaseUrl/api/budgets" -Method Post -Headers $hdr -ContentType "application/json" `
       -Body (@{ userId = "$uid"; category = "Food"; monthlyLimit = "300" } | ConvertTo-Json)
Step "set budget" ($bud.id) ($bud | ConvertTo-Json -Compress)

# 7. Budget summary
$sum = Invoke-RestMethod -Uri "$BaseUrl/api/budgets/user/$uid/summary" -Headers $hdr
Step "budget summary has Food" ($null -ne $sum.Food) ($sum | ConvertTo-Json -Compress)

# 8. Create group
$grp = Invoke-RestMethod -Uri "$BaseUrl/api/groups" -Method Post -Headers $hdr -ContentType "application/json" `
       -Body (@{ name = "Demo Group $stamp"; createdBy = "$uid" } | ConvertTo-Json)
Step "create group" ($grp.id) ($grp | ConvertTo-Json -Compress)
$gid = $grp.id

# 9. Add shared expense (solo group: payer owes their own share only)
$se = Invoke-RestMethod -Uri "$BaseUrl/api/groups/$gid/expenses" -Method Post -Headers $hdr -ContentType "application/json" `
      -Body (@{ paidBy = "$uid"; amount = "90"; description = "Demo dinner" } | ConvertTo-Json)
Step "add shared expense" ($se.id -and $se.amount -eq 90) ($se | ConvertTo-Json -Compress)

# 10. Balances
$bal = Invoke-RestMethod -Uri "$BaseUrl/api/groups/$gid/balances" -Headers $hdr
Step "get balances (json array)" ($bal -is [array] -or $null -eq $bal) ($bal | ConvertTo-Json -Compress)

# 11. Settle
$settle = Invoke-RestMethod -Uri "$BaseUrl/api/groups/$gid/settle" -Method Post -Headers $hdr -ContentType "application/json" `
          -Body (@{ userId = "$uid" } | ConvertTo-Json)
Step "settle up" ($settle.success -eq $true -or $settle.message) ($settle | ConvertTo-Json -Compress)

# 12. Nonexistent group -> clean error (400/404, never 500)
try {
    Invoke-RestMethod -Uri "$BaseUrl/api/groups/999999" -Headers $hdr | Out-Null
    Step "nonexistent group -> clean error" $false "unexpected 200"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Step "nonexistent group -> clean error ($code)" ($code -eq 400 -or $code -eq 404) $code
}

# 13. No token -> 401
try {
    Invoke-RestMethod -Uri "$BaseUrl/api/expenses/user/$uid" | Out-Null
    Step "unauthenticated request rejected" $false "unexpected 200"
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Step "unauthenticated request rejected ($code)" ($code -eq 401) $code
}

Write-Host "`n=== $(if ($fails -eq 0) { 'ALL CHECKS PASSED' } else { "$fails CHECK(S) FAILED" }) ===" -ForegroundColor $(if ($fails -eq 0) { 'Green' } else { 'Red' })
