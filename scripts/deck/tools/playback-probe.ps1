# Does the entrance animation actually take effect in the SHOW?
#
# Control experiment: this probe is run against BOTH the generated deck and a
# file PowerPoint itself authored (lib/calib/calib.pptx). If the control also
# reports "visible at start", the probe is measuring nothing and only a real
# frame capture can settle it.
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [int]$Slide = 1
)
$ErrorActionPreference = 'Stop'
$app = $null; $pres = $null

function Invoke-Retry([scriptblock]$Block, [int]$Tries = 20) {
  for ($i = 1; $i -le $Tries; $i++) {
    try { return & $Block } catch { Start-Sleep -Milliseconds 250 }
  }
  return $null
}

try {
  $app = New-Object -ComObject PowerPoint.Application
  # 2026-09-14: 必须让放映真正可见，否则"正在放映"根本没渲染到屏幕，
  # 形状 Visible 读到的也不是放映态（与 show-start-frames.ps1 的同一条要求）。
  try { $app.Visible = -1 } catch {}
  $pres = $app.Presentations.Open($Pptx, $true, $false, $true)
  $pres.SlideShowSettings.ShowType = 1
  $pres.SlideShowSettings.Run()
  Start-Sleep -Milliseconds 400
  $view = Invoke-Retry { $pres.SlideShowWindow.View }
  Invoke-Retry { $view.GotoSlide($Slide) } | Out-Null

  $names = New-Object System.Collections.ArrayList
  $count = Invoke-Retry { $view.Slide.Shapes.Count }
  for ($i = 1; $i -le $count; $i++) {
    $nm = Invoke-Retry { $view.Slide.Shapes.Item($i).Name }
    [void]$names.Add($nm)
  }
  $rows = @()
  foreach ($nm in $names) {
    $early = Invoke-Retry { $view.Slide.Shapes.Item($nm).Visible }
    $rows += [pscustomobject]@{ shape = $nm; early = $early }
  }
  Start-Sleep -Milliseconds 2500
  Write-Host "=== $([System.IO.Path]::GetFileName($Pptx)) / slide $Slide ==="
  Write-Host ("  {0,-10} {1,-14} {2}" -f 'shape', 'at start', 'after 2.5s')
  foreach ($r in $rows) {
    $late = Invoke-Retry { $view.Slide.Shapes.Item($r.shape).Visible }
    Write-Host ("  {0,-10} {1,-14} {2}" -f $r.shape, $r.early, $late)
  }
  $hidden = ($rows | Where-Object { $_.early -eq 0 }).Count
  Write-Host "  => hidden at start: $hidden / $($rows.Count)"
  Invoke-Retry { $view.Exit() } | Out-Null
}
catch { Write-Host "[probe] FAILED: $($_.Exception.Message)" }
finally {
  if ($pres -ne $null) { try { $pres.Close() } catch {} }
  if ($app -ne $null) { try { $app.Quit() } catch {} }
}
