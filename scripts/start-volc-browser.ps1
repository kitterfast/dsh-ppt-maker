param(
  [int]$Port = 9222
)

# Start the dedicated Volcengine automation browser.
#
# A SEPARATE browser profile plus a CDP port. scripts/cdp/*.mjs (and
# dsh-chrome-cdp, when installed) take it over through 127.0.0.1:<Port>, so page
# clicks (authorize / activate model) can be automated without touching the
# user's daily browser profile.
#
# Why a separate profile: Chromium 136+ ignores --remote-debugging-port on the
# DEFAULT profile, so an isolated --user-data-dir is mandatory. The profile is
# persistent, which is the whole point: the user logs into Volcengine ONCE and
# later logins/authorizations need no human.
#
# ASCII-only on purpose: Windows PowerShell reads .ps1 as ANSI/GBK and a single
# non-ASCII byte shifts the byte pairing, swallowing later quotes.
#
# NOTE: a confined sandbox kills GUI processes instantly (Start-Process notepad
# exits at once), so this needs the session permission preset "full access".

$profile = Join-Path $env:USERPROFILE '.dsh\volc-cdp-profile'
$url = 'https://console.volcengine.com/auth/login'

$candidates = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
)

$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  Write-Host '[FAIL] no Edge/Chrome found in the standard locations'
  Write-Host ('       tried: ' + ($candidates -join ' | '))
  exit 1
}

Write-Host "[ok] browser: $browser"
Write-Host "[ok] profile: $profile"
Write-Host "[ok] cdp port: $Port"

Start-Process $browser -ArgumentList @(
  "--remote-debugging-port=$Port",
  "--user-data-dir=$profile",
  '--no-first-run',
  '--no-default-browser-check',
  $url
)

Start-Sleep -Seconds 8

$probe = node -e "fetch('http://127.0.0.1:$Port/json/version').then(r=>r.json()).then(j=>console.log('OK '+j.Browser)).catch(()=>{console.log('DOWN');process.exit(1)})" 2>&1
Write-Host "[cdp] $probe"
if ($probe -notlike 'OK*') { exit 1 }
