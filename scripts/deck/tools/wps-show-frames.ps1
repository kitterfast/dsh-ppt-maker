# Playback acceptance using WPS Presentation (KWPP.Application).
#
# Every earlier acceptance ran through PowerPoint COM, but the user's player is
# WPS - so the acceptance target itself was wrong. This drives WPS: open, run the
# show, and capture frames from the very start with NO navigation.
#
# Two rules carried over from the PowerPoint harness:
#   1. A COM-created instance is invisible, so a "running" show renders nowhere.
#      Set Visible before opening anything.
#   2. GotoSlide does not replay a slide's entrance, so never navigate - capture
#      from show start instead.
#
# ASCII-only on purpose: Windows PowerShell reads .ps1 as ANSI, and a single
# non-ASCII byte shifts the pairing and swallows following quotes.
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$ProgId = 'KWPP.Application',
  [int]$Frames = 24
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
  $app = New-Object -ComObject $ProgId
  try { $app.Visible = -1 } catch { Note("set Visible failed: " + $_.Exception.Message) }
  Note("progId=$ProgId version=" + $app.Version)
  $pres = $app.Presentations.Open($Pptx, $true, $false, $true)
  Note("opened slides=" + $pres.Slides.Count)
  $pres.SlideShowSettings.ShowType = 1
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
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
  Note("captured $Frames frames in $($sw.ElapsedMilliseconds) ms with no navigation")
  try { $null = $pres.SlideShowWindow.View.Exit() } catch { Note("exit: " + $_.Exception.Message) }
}
catch { Note("FAILED: " + $_.Exception.Message) }
finally {
  if ($pres -ne $null) { try { $null = $pres.Close() } catch {} }
  if ($app -ne $null) { try { $null = $app.Quit() } catch {} }
  Set-Content -Path $log -Value $lines -Encoding UTF8
}
