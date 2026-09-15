# Playback acceptance using WPS Presentation (KWPP.Application) -- activation-aware.
#
# WHY THIS EXISTS
# The original wps-show-frames.ps1 sets $app.Visible and immediately runs the
# show, then grabs the screen with CopyFromScreen. Measured 2026-09-15: it
# produced 24 PNGs whose centre pixel was 16,22,36 and whose paper-coloured share
# was 3.4-3.7% -- i.e. it captured whatever window was in FRONT, not the show.
# SlideShowWindow.View.Exit() did not throw, so the show object existed; it just
# never reached the foreground.
#
# WHAT THIS ADDS
#   1. Activate the application BEFORE Run(), so the show window can take the
#      foreground instead of opening behind the current window.
#   2. After Run(), poll for the show window and force it to the foreground
#      (ShowWindow + BringWindowToTop + SetForegroundWindow + View.Activate).
#   3. Record how long activation took and each frame's elapsed time since Run(),
#      so it is possible to tell whether the entrance window was actually caught.
#   4. Write a machine-checkable verdict line at the end.
#
# ASCII-only on purpose: Windows PowerShell reads .ps1 as ANSI, and a single
# non-ASCII byte shifts the pairing and swallows following quotes.
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$ProgId = 'KWPP.Application',
  [int]$Frames = 24,
  [int]$ActivateTimeoutMs = 1200
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic

$sig = @'
using System;
using System.Runtime.InteropServices;
public class W32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr SetActiveWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a, uint b, bool f);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
}
'@
try { Add-Type -TypeDefinition $sig -ErrorAction Stop } catch { }

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

  # (1) foreground the APP first
  try { $app.Activate() } catch { Note("app.Activate failed: " + $_.Exception.Message) }
  Start-Sleep -Milliseconds 500

  $pres.SlideShowSettings.ShowType = 1
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  Note("virtualscreen=$($bounds.Width)x$($bounds.Height)")
  $run = [System.Diagnostics.Stopwatch]::StartNew()
  $null = $pres.SlideShowSettings.Run()

  # (2) force the show window to the foreground
  $shown = $false
  $hwnd = [IntPtr]::Zero
  $act = [System.Diagnostics.Stopwatch]::StartNew()
  while ($act.ElapsedMilliseconds -lt $ActivateTimeoutMs) {
    try { $hwnd = [IntPtr]$pres.SlideShowWindow.HWND } catch { $hwnd = [IntPtr]::Zero }
    if ($hwnd -ne [IntPtr]::Zero) {
      [void][W32]::ShowWindow($hwnd, 3)
      [void][W32]::BringWindowToTop($hwnd)
      [void][W32]::SetForegroundWindow($hwnd)
    }
    try { $pres.SlideShowWindow.Activate() } catch { }
    Start-Sleep -Milliseconds 60
    if ($hwnd -ne [IntPtr]::Zero -and [W32]::GetForegroundWindow() -eq $hwnd) { $shown = $true; break }
  }
  if (-not $shown) {
    try { [void][Microsoft.VisualBasic.Interaction]::AppActivate($pres.SlideShowWindow.Caption) } catch { Note("AppActivate failed: " + $_.Exception.Message) }
  }
  Note("activation: hwnd=$hwnd foreground=$shown took=$($act.ElapsedMilliseconds) ms")
  Note("elapsed since Run at first frame = $($run.ElapsedMilliseconds) ms")

  $stamps = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt $Frames; $i++) {
    $t = $run.ElapsedMilliseconds
    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bmp.Size)
    $bmp.Save((Join-Path $OutDir ("f{0:d2}.png" -f $i)), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    [void]$stamps.Add($t)
  }
  Note("captured $Frames frames in $($run.ElapsedMilliseconds) ms with no navigation")
  Note("frame0_at=$($stamps[0])ms frameLast_at=$($stamps[$stamps.Count-1])ms")
  $fgEnd = [W32]::GetForegroundWindow()
  Note("foreground at end = $fgEnd (show=$hwnd)")
  Note("VERDICT: foreground_acquired=$shown")
  try { $null = $pres.SlideShowWindow.View.Exit() } catch { Note("exit: " + $_.Exception.Message) }
}
catch { Note("FAILED: " + $_.Exception.Message) }
finally {
  if ($pres -ne $null) { try { $null = $pres.Close() } catch { } }
  if ($app -ne $null) { try { $null = $app.Quit() } catch { } }
  Set-Content -Path $log -Value $lines -Encoding UTF8
}
