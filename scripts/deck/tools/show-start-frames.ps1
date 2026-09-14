# Capture the first seconds of a slide show WITHOUT touching the view.
#
# GotoSlide(slide, ResetSlide) does not reliably replay a slide's entrance
# animation, so every capture that navigated first reported "no animation" even
# for decks that plainly animate. Let the show enter slide 1 by itself and grab
# frames immediately.
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [int]$Frames = 30,
  [int]$AdvanceAfter = 0,
  [int]$ShowType = 1
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$log = Join-Path $OutDir 'log.txt'
$lines = New-Object System.Collections.ArrayList
function Note($m) { [void]$lines.Add([string]$m) }

$app = $null; $pres = $null
try {
  $app = New-Object -ComObject PowerPoint.Application
  try { $app.Visible = -1 } catch { Note("could not set Visible: " + $_.Exception.Message) }
  $pres = $app.Presentations.Open($Pptx, $true, $false, $true)
  $pres.SlideShowSettings.ShowType = $ShowType
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  # start the show and capture IMMEDIATELY - no sleeps, no navigation
  $null = $pres.SlideShowSettings.Run()
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  for ($i = 0; $i -lt $Frames; $i++) {
    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bmp.Size)
    $bmp.Save((Join-Path $OutDir ("f{0:d2}.png" -f $i)), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
  }
  $sw.Stop()
  Note("captured $Frames frames in $($sw.ElapsedMilliseconds) ms (from show start, no navigation)")
  try { $null = $pres.SlideShowWindow.View.Exit() } catch {}
}
catch { Note("FAILED: " + $_.Exception.Message) }
finally {
  if ($pres -ne $null) { try { $null = $pres.Close() } catch {} }
  if ($app -ne $null) { try { $null = $app.Quit() } catch {} }
  Set-Content -Path $log -Value $lines -Encoding UTF8
}
