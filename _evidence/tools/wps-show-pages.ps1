# WPS playback capture, PAGE BY PAGE.
#
# wps-show-frames.ps1 deliberately never navigates: it captures from show start,
# which covers slide 1 only. This variant drives the show forward so every page's
# entrance and settled state can be checked, which is what the seal left open.
#
# It reuses the activation fix that made the original tool usable at all: the WPS
# COM object exposes no usable window handle ($pres.SlideShowWindow.HWND == 0 and
# AppActivate cannot resolve the caption), so the show window is located as a
# top-level window by title prefix and raised with SetForegroundWindow.
#
# Output: <OutDir>\pNN\fNN.png  plus log.txt with per-page timing.
# ASCII-only on purpose: Windows PowerShell reads .ps1 as ANSI.
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$ProgId = 'KWPP.Application',
  [int]$FramesPerPage = 16,
  [int]$FindTimeoutMs = 4000,
  [int]$AdvanceSettleMs = 200
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$sig = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class W32 {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowW(IntPtr cls, string title);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  public static IntPtr FindByTitlePrefix(string prefix) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      var t = new StringBuilder(512);
      GetWindowTextW(h, t, 512);
      if (t.ToString().StartsWith(prefix, StringComparison.Ordinal)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
'@
Add-Type -TypeDefinition $sig -ErrorAction Stop

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$log = Join-Path $OutDir 'log.txt'
$lines = New-Object System.Collections.ArrayList
function Note($m) { [void]$lines.Add([string]$m) }

$leaf = Split-Path $Pptx -Leaf
$title = "WPS Presentation Slide Show - [$leaf]"
$prefix = "WPS Presentation Slide Show"
$app = $null; $pres = $null
try {
  $app = New-Object -ComObject $ProgId
  try { $app.Visible = -1 } catch { }
  $pres = $app.Presentations.Open($Pptx, $true, $false, $true)
  $total = $pres.Slides.Count
  Note("opened slides=$total  file=$leaf")

  $pres.SlideShowSettings.ShowType = 1
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $run = [System.Diagnostics.Stopwatch]::StartNew()
  $null = $pres.SlideShowSettings.Run()

  $hwnd = [IntPtr]::Zero
  while ($run.ElapsedMilliseconds -lt $FindTimeoutMs) {
    $hwnd = [W32]::FindWindowW([IntPtr]::Zero, $title)
    if ($hwnd -eq [IntPtr]::Zero) { $hwnd = [W32]::FindByTitlePrefix($prefix) }
    if ($hwnd -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 20
  }
  $fg = $false
  if ($hwnd -ne [IntPtr]::Zero) {
    for ($i = 0; $i -lt 40; $i++) {
      [void][W32]::ShowWindow($hwnd, 3)
      [void][W32]::BringWindowToTop($hwnd)
      [void][W32]::SetForegroundWindow($hwnd)
      Start-Sleep -Milliseconds 10
      if ([W32]::GetForegroundWindow() -eq $hwnd) { $fg = $true; break }
    }
  }
  Note("show window=$($hwnd.ToInt64()) foreground=$fg at $($run.ElapsedMilliseconds) ms")

  for ($p = 1; $p -le $total; $p++) {
    $dir = Join-Path $OutDir ("p{0:d2}" -f $p)
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $t0 = $run.ElapsedMilliseconds
    for ($i = 0; $i -lt $FramesPerPage; $i++) {
      $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bmp.Size)
      $bmp.Save((Join-Path $dir ("f{0:d2}.png" -f $i)), [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose(); $bmp.Dispose()
    }
    $fgNow = ([W32]::GetForegroundWindow() -eq $hwnd)
    Note("page $p : burst ${t0}-$($run.ElapsedMilliseconds) ms  frames=$FramesPerPage  foreground_held=$fgNow")
    if ($p -lt $total) {
      try { $null = $pres.SlideShowWindow.View.Next() } catch { Note("page $p : Next() failed: " + $_.Exception.Message) }
      Start-Sleep -Milliseconds $AdvanceSettleMs
    }
  }
  Note("done, total=$($run.ElapsedMilliseconds) ms")
  try { $null = $pres.SlideShowWindow.View.Exit() } catch { }
}
catch { Note("FAILED: " + $_.Exception.Message) }
finally {
  if ($pres -ne $null) { try { $null = $pres.Close() } catch { } }
  if ($app -ne $null) { try { $null = $app.Quit() } catch { } }
  Set-Content -Path $log -Value $lines -Encoding UTF8
}
