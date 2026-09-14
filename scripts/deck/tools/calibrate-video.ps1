# Ground truth #3: how does PowerPoint write a video that PLAYS AUTOMATICALLY?
# Same technique that cracked the entrance effect: let PowerPoint author it, then
# read the XML back and copy the idiom instead of guessing.
#
# ASCII-only on purpose: Windows PowerShell reads .ps1 as ANSI, and one non-ASCII
# byte shifts the pairing and swallows following quotes.
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'calib'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$mp4 = Join-Path $out 'test.mp4'

$ff = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
if (-not $ff) {
  $cand = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cand) { $ff = $cand.FullName }
}
if (-not $ff) { Write-Host '[FAIL] ffmpeg not found'; exit 1 }
Write-Host "[ok] ffmpeg: $ff"

# a 2 second 1280x720 clip that visibly changes
$prev = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $ff -y -loglevel error -f lavfi -i "testsrc=size=1280x720:rate=30:duration=2" -pix_fmt yuv420p -c:v libx264 -crf 18 $mp4 *> $null
$ErrorActionPreference = $prev
if (-not (Test-Path $mp4)) { Write-Host '[FAIL] could not create test.mp4'; exit 1 }
Write-Host ("[ok] test.mp4 {0:N0} bytes" -f (Get-Item $mp4).Length)

$app = $null; $pres = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $pres = $app.Presentations.Add(0)
  $slide = $pres.Slides.Add(1, 12)
  $shape = $slide.Shapes.AddMediaObject2($mp4, $false, $true, 0, 0, 960, 540)
  Write-Host ("[ok] inserted shape: {0} ({1})" -f $shape.Name, $shape.Type)
  try {
    $shape.AnimationSettings.PlaySettings.PlayOnEntry = -1
    Write-Host '[ok] PlayOnEntry = true'
  } catch { Write-Host ("[warn] PlayOnEntry failed: " + $_.Exception.Message) }
  try {
    $shape.AnimationSettings.PlaySettings.LoopUntilStopped = 0
    Write-Host '[ok] LoopUntilStopped = false'
  } catch { Write-Host ("[warn] loop failed: " + $_.Exception.Message) }
  $path = Join-Path $out 'calib-video.pptx'
  $pres.SaveAs($path)
  Write-Host "[ok] saved $path"
}
finally {
  if ($pres -ne $null) { try { $null = $pres.Close() } catch {} }
  if ($app -ne $null) { try { $null = $app.Quit() } catch {} }
}
