# Volcengine SSO: zero-manual login, end to end.
#
# Chain (all measured working on 2026-09-13):
#   Phase 1  arkcli auth login volc-sso --no-browser   -> authorize_url (valid 600s)
#   Browser  scripts/cdp/authorize.mjs drives the dedicated browser:
#            identity confirm -> "continue login" -> "authorization succeeded"
#            -> reads the base64 code out of the page
#   Phase 2  arkcli auth login --no-browser --code <code>
#   Verify   arkcli auth status
#
# Preconditions:
#   - the dedicated automation browser is running with CDP (scripts/start-volc-browser.ps1)
#   - it has been logged into Volcengine ONCE by the user (SMS/QR, one time ever)
#   - session permission preset = full access (arkcli writes %USERPROFILE%\.arkcli*,
#     and the browser itself needs a GUI process, which a confined sandbox kills)
#
# ASCII-only on purpose: see start-volc-browser.ps1.

param(
  [switch]$Check
)

$ErrorActionPreference = 'Continue'

# arkcli attribution, as the flow's own rules require.
$env:ARKCLI_NO_UPDATE_NOTIFIER = '1'
$env:ARKCLI_CALLER_TYPE = 'ai_agent'
$env:ARKCLI_CALLER_NAME = 'dsh-ppt-maker'
$env:ARKCLI_SKILL_NAME = 'volc-0manual-login'

$root = $PSScriptRoot
# Use the .cmd shim: the .ps1 shim is blocked by the PowerShell execution policy.
$arkcli = Join-Path $env:APPDATA 'npm\arkcli.cmd'

if (-not (Test-Path $arkcli)) {
  Write-Host "[FAIL] arkcli not found at $arkcli"
  Write-Host '       install with: npm i -g @volcengine/ark-cli@latest'
  exit 1
}

function Get-LoggedIn {
  $value = & $arkcli auth status --transform 'logged_in' 2>$null | Out-String
  return ($value.Trim() -eq 'true')
}

if ($Check) {
  if (Get-LoggedIn) { Write-Host '[ok] already logged in'; exit 0 }
  Write-Host '[--] not logged in'
  exit 2
}

Write-Host '=== Phase 1: request the authorize URL ==='
$raw = & $arkcli auth login volc-sso --no-browser 2>$null | Out-String
$info = $null
try { $info = $raw | ConvertFrom-Json } catch { }
if (-not $info -or -not $info.authorize_url) {
  Write-Host "[FAIL] no authorize_url in output: $raw"
  exit 1
}
Write-Host ("authorize_url: " + $info.authorize_url)
Write-Host ("expires_in_sec: " + $info.expires_in_sec)

# CSRF state from phase 1: every code accepted below must carry it, so a stale
# code (a previous run's, or whatever sits in the clipboard) can never be used.
$stateMatch = [regex]::Match($info.authorize_url, '[?&]state=([^&]+)')
$state = if ($stateMatch.Success) { $stateMatch.Groups[1].Value } else { '' }
if ($state -eq '') { Write-Host '[WARN] no state in the authorize URL; code validation is disabled' }

Write-Host ''
Write-Host '=== Browser: open it and consent (no human) ==='
$log = node (Join-Path $root 'cdp\authorize.mjs') $info.authorize_url --state $state 2>&1 | Out-String
$log | Out-Host

$match = [regex]::Match($log, 'CODE:(\S+)')
$code = $null
if ($match.Success) {
  $code = $match.Groups[1].Value
} else {
  Write-Host '[--] no CODE marker; checking the clipboard (validated against state)'
  $clipped = (Get-Clipboard -Raw -ErrorAction SilentlyContinue)
  if ($clipped) {
    $clipped = $clipped.Trim()
    $decoded = ''
    try { $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($clipped)) } catch { }
    if ($state -ne '' -and $decoded -like "*state=$state*") { $code = $clipped }
    else { Write-Host '[--] clipboard content is not this run''s code (state mismatch); ignoring it' }
  }
}
if (-not $code) {
  Write-Host '[FAIL] could not obtain the authorization code'
  Write-Host '       most likely the dedicated browser is NOT logged into Volcengine yet:'
  Write-Host '       open it, log in once (SMS/QR), then re-run this script.'
  exit 3
}
Write-Host ("code (head): " + $code.Substring(0, [Math]::Min(40, $code.Length)))

Write-Host ''
Write-Host '=== Phase 2: exchange the code ==='
& $arkcli auth login --no-browser --code $code 2>&1 | Out-Host

Write-Host ''
Write-Host '=== Verify ==='
if (Get-LoggedIn) {
  Write-Host '[ok] logged_in = true'
  & $arkcli auth status 2>$null | Out-Host
  exit 0
}
Write-Host '[FAIL] still logged_in = false'
exit 4
