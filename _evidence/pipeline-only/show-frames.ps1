# Capture real frames from a running slide show.
#
# Two things had to be right before this harness told the truth:
#   1. A COM-created PowerPoint instance is INVISIBLE by default, so a "running"
#      slide show renders nowhere and every captured frame is just the desktop.
#      Hence `$app.Visible = -1` before opening anything.
#   2. Every COM call must be captured. If a returned object reaches the output
#      stream PowerShell formats it, that call is rejected while the show runs,
#      and the script dies before writing a single frame.
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [int]$Slide = 1,
  [int]$Frames = 24,
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
  $null = $pres.SlideShowSettings.Run()
  Start-Sleep -Milliseconds 1200
  $view = $pres.SlideShowWindow.View
  Note("started: appVisible=" + $app.Visible + " fullScreen=" + $pres.SlideShowWindow.IsFullScreen + " targetSlide=" + $Slide)

  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $null = $view.GotoSlide($Slide, 1)
  for ($i = 0; $i -lt $Frames; $i++) {
    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bmp.Size)
    $bmp.Save((Join-Path $OutDir ("f{0:d2}.png" -f $i)), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
  }
  Note("captured $Frames frames")
  Start-Sleep -Milliseconds 1500
  foreach ($tag in @('settled-a', 'settled-b')) {
    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bmp.Size)
    $bmp.Save((Join-Path $OutDir "$tag.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Start-Sleep -Milliseconds 700
  }
  try { $null = $view.Exit() } catch { Note("exit failed: " + $_.Exception.Message) }
}
catch { Note("FAILED: " + $_.Exception.Message) }
finally {
  if ($pres -ne $null) { try { $null = $pres.Close() } catch {} }
  if ($app -ne $null) { try { $null = $app.Quit() } catch {} }
  Set-Content -Path $log -Value $lines -Encoding UTF8
}
