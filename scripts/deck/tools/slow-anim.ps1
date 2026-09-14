# Make every effect in a deck slow (default 5s) and long-distance, so a
# frame-capture harness cannot miss the motion merely by being a few hundred
# milliseconds late. Used to validate the harness AND to compare formats.
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$Out,
  [double]$Seconds = 5
)
$ErrorActionPreference = 'Stop'
$app = $null; $pres = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  $pres = $app.Presentations.Open($Pptx, $false, $false, $false)
  $total = 0
  foreach ($slide in $pres.Slides) {
    $seq = $slide.TimeLine.MainSequence
    for ($j = 1; $j -le $seq.Count; $j++) {
      $e = $seq.Item($j)
      try { $e.Timing.Duration = $Seconds } catch {}
      try { $e.Timing.TriggerDelayTime = 0.2 * ($j - 1) } catch {}
      $total++
    }
  }
  $pres.SaveAs($Out)
  Write-Host "slowed $total effects to ${Seconds}s -> $Out"
}
finally {
  if ($pres -ne $null) { try { $null = $pres.Close() } catch {} }
  if ($app -ne $null) { try { $null = $app.Quit() } catch {} }
}
