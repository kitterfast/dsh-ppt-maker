# Ground truth #2: what does PowerPoint write for an entrance that combines a
# fade with a vertical move? That is exactly the effect this pipeline emits.
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'calib'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$app = $null; $pres = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $pres = $app.Presentations.Add(0)
  $slide = $pres.Slides.Add(1, 12)
  $made = @()
  for ($i = 1; $i -le 3; $i++) {
    $sh = $slide.Shapes.AddShape(1, 80, 40 * $i, 240, 30)
    $made += $sh
  }
  $seq = $slide.TimeLine.MainSequence
  # 2 = msoAnimEffectFly (entrance with a move), 3 = after previous, 2 = with previous
  $e1 = $seq.AddEffect($made[0], 2, 0, 3)
  $e2 = $seq.AddEffect($made[1], 2, 0, 2)
  $e3 = $seq.AddEffect($made[2], 2, 0, 2)
  # 10 = msoAnimDirectionBottom -> "fly in from the bottom", the vertical case we need
  foreach ($e in @($e1, $e2, $e3)) { try { $e.EffectParameters.Direction = 10 } catch { Write-Host "direction set failed: $($_.Exception.Message)" } }
  $e1.Timing.TriggerDelayTime = 0.06
  $e2.Timing.TriggerDelayTime = 0.11
  $e3.Timing.TriggerDelayTime = 0.11
  # smooth the motion so we can see how the curve is written
  try { $e1.Timing.SmoothStart = -1; $e1.Timing.SmoothEnd = -1 } catch {}
  $path = Join-Path $out 'calib-fly.pptx'
  $pres.SaveAs($path)
  Write-Host "=== PowerPoint reports ==="
  for ($j = 1; $j -le $seq.Count; $j++) {
    $e = $seq.Item($j)
    Write-Host ("  {0}: shape={1} effectType={2} trigger={3} delay={4} dur={5}" -f $j, $e.Shape.Name, [int]$e.EffectType, [int]$e.Timing.TriggerType, $e.Timing.TriggerDelayTime, $e.Timing.Duration)
  }
  Write-Host "saved: $path"
}
finally {
  if ($pres -ne $null) { try { $pres.Close() } catch {} }
  if ($app -ne $null) { try { $app.Quit() } catch {} }
}

