# Environment self-check + auto-install for the components the flow now uses.
#
# Idempotent: everything is verified first and only what is missing gets
# installed. Safe to run at the start of every run.
#
# Checks, in order:
#   1. Node.js              >= 22 required (scripts/cdp/*.mjs use the global WebSocket)
#   2. arkcli               npm i -g @volcengine/ark-cli@latest when missing
#   3. dsh-chrome-cdp       DSH profile bundle; `dsh plugin --profile web add` when missing
#   4. automation browser   CDP endpoint on VOLC_CDP_PORT; start-volc-browser.ps1 when down
#   5. Volcengine login     arkcli auth status; volc-0manual-login.ps1 when logged out
#                           (the ONLY ever-manual step is the first browser login)
#
# ASCII-only on purpose: Windows PowerShell reads .ps1 as ANSI/GBK and one
# non-ASCII byte shifts the byte pairing, swallowing later quotes.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File check-env.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File check-env.ps1 -NoInstall   # report only

param(
  [switch]$NoInstall,
  [int]$Port = 9222
)

$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
$failures = @()

function Say($tag, $message) {
  Write-Host ("[{0}] {1}" -f $tag, $message)
}

Write-Host '=== 1/5 Node.js ==='
$nodeVersion = (node -v 2>$null)
if (-not $nodeVersion) {
  Say 'FAIL' 'Node.js not found on PATH'
  $failures += 'node'
} else {
  $major = [int](($nodeVersion -replace '^v', '') -split '\.')[0]
  if ($major -ge 22) { Say 'ok' "Node.js $nodeVersion" }
  else {
    Say 'WARN' "Node.js $nodeVersion - scripts/cdp/*.mjs need the global WebSocket (Node >= 22)"
    $failures += 'node-version'
  }
}

Write-Host ''
Write-Host '=== 2/5 arkcli ==='
$arkcli = Join-Path $env:APPDATA 'npm\arkcli.cmd'
if (Test-Path $arkcli) {
  $arkVersion = (& $arkcli --version 2>$null | Out-String).Trim()
  Say 'ok' "arkcli $arkVersion ($arkcli)"
} elseif ($NoInstall) {
  Say 'MISSING' 'arkcli - run: npm i -g @volcengine/ark-cli@latest'
  $failures += 'arkcli'
} else {
  Say 'MISSING' 'arkcli - installing: npm i -g @volcengine/ark-cli@latest'
  & npm.cmd i -g '@volcengine/ark-cli@latest' 2>&1 | Out-Host
  if (Test-Path $arkcli) { Say 'ok' 'arkcli installed' } else { Say 'FAIL' 'arkcli install failed'; $failures += 'arkcli' }
}

Write-Host ''
Write-Host '=== 3/5 dsh-chrome-cdp plugin ==='
$profileJson = Join-Path $env:USERPROFILE '.dsh\profiles\web\package.json'
$profileDir = Join-Path $env:USERPROFILE '.dsh\profiles\web\node_modules\dsh-chrome-cdp'
$installed = $false
if (Test-Path $profileJson) {
  try {
    $profile = Get-Content $profileJson -Raw | ConvertFrom-Json
    $bundles = @($profile.dsh.profile.bundles)
    if ($bundles -contains 'dsh-chrome-cdp') { $installed = $true }
  } catch {
    Say 'WARN' "cannot parse $profileJson : $($_.Exception.Message)"
  }
}
if (-not $installed -and (Test-Path $profileDir)) { $installed = $true }

if ($installed) {
  Say 'ok' 'dsh-chrome-cdp is present in the DSH profile (gives the agent native chrome_* tools)'
} else {
  $dsh = $null
  foreach ($candidate in @('dsh.cmd', 'dsh')) {
    $found = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($found) { $dsh = $found.Source; break }
  }
  if (-not $dsh) {
    $fallback = Join-Path $env:LOCALAPPDATA 'deepseek-harness\bin\dsh.cmd'
    if (Test-Path $fallback) { $dsh = $fallback }
  }
  $installLine = 'dsh plugin --profile web add github:xiaobai2017666/dsh-chrome-cdp'
  if ($NoInstall -or -not $dsh) {
    Say 'MISSING' "dsh-chrome-cdp - run: $installLine"
    if (-not $dsh) { Say 'WARN' 'dsh CLI not found on PATH; run the command above from a terminal' }
    $failures += 'dsh-chrome-cdp'
  } else {
    Say 'MISSING' "dsh-chrome-cdp - installing via $dsh"
    & $dsh plugin --profile web add 'github:xiaobai2017666/dsh-chrome-cdp' 2>&1 | Out-Host
    Say 'WARN' 'a DSH host restart is needed before the chrome_* tools appear'
  }
}
Say 'note' 'the 0-manual login does NOT depend on this plugin: scripts/cdp/*.mjs speak CDP directly'

Write-Host ''
Write-Host '=== 4/5 automation browser (CDP) ==='
$probe = node -e "fetch('http://127.0.0.1:$Port/json/version').then(r=>r.json()).then(j=>console.log('OK '+j.Browser)).catch(()=>{console.log('DOWN');process.exit(1)})" 2>&1
if ($probe -like 'OK*') {
  Say 'ok' "CDP endpoint alive: $probe"
} elseif ($NoInstall) {
  Say 'MISSING' "no CDP endpoint on port $Port - run: scripts\start-volc-browser.ps1"
  $failures += 'cdp'
} else {
  Say 'MISSING' "no CDP endpoint on port $Port - starting scripts\start-volc-browser.ps1"
  & (Join-Path $root 'start-volc-browser.ps1') -Port $Port | Out-Host
  $probe = node -e "fetch('http://127.0.0.1:$Port/json/version').then(r=>r.json()).then(j=>console.log('OK '+j.Browser)).catch(()=>{console.log('DOWN');process.exit(1)})" 2>&1
  if ($probe -like 'OK*') { Say 'ok' "CDP endpoint alive: $probe" }
  else {
    Say 'FAIL' 'browser did not come up. A confined sandbox kills GUI processes: switch the session to the full-access permission preset and retry.'
    $failures += 'cdp'
  }
}

Write-Host ''
Write-Host '=== 5/5 Volcengine login ==='
if (-not (Test-Path $arkcli)) {
  Say 'SKIP' 'arkcli missing, cannot check the login state'
} else {
  $loggedIn = ((& $arkcli auth status --transform 'logged_in' 2>$null | Out-String).Trim() -eq 'true')
  if ($loggedIn) {
    Say 'ok' 'logged_in = true'
  } elseif ($NoInstall) {
    Say 'MISSING' 'logged_in = false - run: scripts\volc-0manual-login.ps1'
    $failures += 'login'
  } else {
    Say 'MISSING' 'logged_in = false - running scripts\volc-0manual-login.ps1'
    & (Join-Path $root 'volc-0manual-login.ps1') | Out-Host
    $loggedIn = ((& $arkcli auth status --transform 'logged_in' 2>$null | Out-String).Trim() -eq 'true')
    if ($loggedIn) { Say 'ok' 'logged_in = true after the zero-manual login' }
    else {
      Say 'HUMAN' 'still logged out. If the dedicated browser has never been logged in, the user must log in ONCE (SMS/QR) in that window:'
      Say 'HUMAN' '        scripts\start-volc-browser.ps1  (opens the login page) - then re-run this script'
      $failures += 'login'
    }
  }
}

Write-Host ''
if ($failures.Count -eq 0) { Write-Host '[DONE] environment ready'; exit 0 }
Write-Host ('[DONE] unresolved: ' + ($failures -join ', '))
exit 9
