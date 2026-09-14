# Ask PowerPoint to build a staggered entrance sequence, then dump the XML it wrote.
# This is calibration: the converter must emit what PowerPoint emits, not what we guess.
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'calib'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$app = $null; $pres = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $pres = $app.Presentations.Add(0)              # WithWindow = msoFalse
  $slide = $pres.Slides.Add(1, 12)               # 12 = ppLayoutBlank
  $made = @()
  for ($i = 1; $i -le 3; $i++) {
    $sh = $slide.Shapes.AddShape(1, 80, 40 * $i, 240, 30)   # 1 = msoShapeRectangle
    $sh.Name = "box$i"
    $made += $sh
  }
  $seq = $slide.TimeLine.MainSequence
  # 10 = msoAnimEffectFade (entrance); 3 = msoAnimTriggerAfterPrevious, 2 = msoAnimTriggerWithPrevious
  $e1 = $seq.AddEffect($made[0], 10, 0, 3)
  $e2 = $seq.AddEffect($made[1], 10, 0, 2)
  $e3 = $seq.AddEffect($made[2], 10, 0, 2)
  $e1.Timing.TriggerDelayTime = 0.06
  $e2.Timing.TriggerDelayTime = 0.11
  $e3.Timing.TriggerDelayTime = 0.11
  $path = Join-Path $out 'calib.pptx'
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
