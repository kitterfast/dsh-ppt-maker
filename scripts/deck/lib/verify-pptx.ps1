# Reads a PPTX through the real PowerPoint (COM) and writes a JSON report.
#
# Why: the 2026-09-14 run "verified" its animation by regex-matching its own XML.
# That cannot detect the failure that actually shipped -- an off-by-one shape id
# that pointed every effect at the wrong shape. Only PowerPoint can say which
# shape an effect is attached to, so PowerPoint is what we ask.
#
# ASCII-only on purpose (Windows PowerShell reads .ps1 as ANSI; non-ASCII bytes
# shift the pairing and swallow later quotes).
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutJson,
  [string]$ShotDir = '',
  [int]$Width = 1280,
  [int]$Height = 720
)

$ErrorActionPreference = 'Stop'
$result = [ordered]@{
  ok = $false
  powerpoint = $null
  slides = 0
  exported = @()
  timeline = @()
  error = $null
  tookMs = 0
}
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$app = $null
$pres = $null

try {
  $app = New-Object -ComObject PowerPoint.Application
  $result.powerpoint = $app.Version
  # WithWindow:=$false -> no visible window, no taskbar entry.
  $pres = $app.Presentations.Open([string]$Pptx, $true, $false, $false)
  $result.slides = $pres.Slides.Count

  for ($i = 1; $i -le $pres.Slides.Count; $i++) {
    $slide = $pres.Slides.Item($i)
    $seq = $slide.TimeLine.MainSequence
    $effects = @()
    for ($j = 1; $j -le $seq.Count; $j++) {
      $e = $seq.Item($j)
      $effects += [ordered]@{
        index         = $j
        effectType    = [int]$e.EffectType
        shapeName     = [string]$e.Shape.Name
        shapeId       = [int]$e.Shape.Id
        triggerType   = [int]$e.Timing.TriggerType
        delaySec      = [double]$e.Timing.TriggerDelayTime
        durationSec   = [double]$e.Timing.Duration
      }
    }
    $result.timeline += [ordered]@{ slide = $i; count = $seq.Count; effects = $effects }

    if ($ShotDir -ne '') {
      if (-not (Test-Path $ShotDir)) { New-Item -ItemType Directory -Force -Path $ShotDir | Out-Null }
      $file = Join-Path $ShotDir ('slide-{0:d2}.png' -f $i)
      $slide.Export($file, 'PNG', $Width, $Height)
      $result.exported += $file
    }
  }
  $result.ok = $true
}
catch {
  $result.error = $_.Exception.Message
}
finally {
  if ($pres -ne $null) { try { $pres.Close() } catch {} }
  if ($app -ne $null) { try { $app.Quit() } catch {} }
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
  $sw.Stop()
  $result.tookMs = [int]$sw.ElapsedMilliseconds
}

$result | ConvertTo-Json -Depth 8 | Set-Content -Path $OutJson -Encoding UTF8
if ($result.ok) { Write-Host "[com] ok: $($result.slides) slides, PowerPoint $($result.powerpoint)" }
else { Write-Host "[com] FAILED: $($result.error)" }
