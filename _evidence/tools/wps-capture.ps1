# WPS playback capture, third revision -- works where the COM route did not.
#
# FINDINGS THAT DROVE THIS (measured 2026-09-15):
#   * $pres.SlideShowWindow.HWND returns 0 on this WPS build, and AppActivate
#     cannot resolve the caption, so the COM window handle is unusable.
#   * The show window DOES exist as a plain top-level window:
#       class=Qt5QWindowIcon
#       title="WPS Presentation Slide Show - [<file name>]"
#     It is simply never brought to the foreground, so CopyFromScreen filmed
#     whatever was in front (a desktop window: paper share 3.3%, centre 16,22,36).
#   * Raising that window by raw handle works (foreground acquired).
#   * Full EnumWindows costs ~1.5 s, which misses the whole entrance, so this
#     revision finds the window with a single FindWindowW call in a 10 ms poll.
#
# ASCII-only on purpose: Windows PowerShell reads .ps1 as ANSI.
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$ProgId = 'KWPP.Application',
  [int]$Frames = 40,
  [int]$FindTimeoutMs = 4000
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
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  // FindWindowW with a NULL class did not match on this WPS build (PowerShell
  // marshals $null to "" for a string parameter), so match by title prefix in C#.
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
$app = $null; $pres = $null
try {
  $app = New-Object -ComObject $ProgId
  try { $app.Visible = -1 } catch { }
  $pres = $app.Presentations.Open($Pptx, $true, $false, $true)
  Note("opened slides=" + $pres.Slides.Count + "  file=" + $leaf)
  Note("target window title = $title")

  $pres.SlideShowSettings.ShowType = 1
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $run = [System.Diagnostics.Stopwatch]::StartNew()
  $null = $pres.SlideShowSettings.Run()

  # fast poll: exact title first, then prefix match (C# side, ~ms per sweep)
  $prefix = "WPS Presentation Slide Show"
  $hwnd = [IntPtr]::Zero
  while ($run.ElapsedMilliseconds -lt $FindTimeoutMs) {
    $hwnd = [W32]::FindWindowW([IntPtr]::Zero, $title)
    if ($hwnd -eq [IntPtr]::Zero) { $hwnd = [W32]::FindByTitlePrefix($prefix) }
    if ($hwnd -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 20
  }
  $foundAt = $run.ElapsedMilliseconds
  Note("show window found = $($hwnd.ToInt64()) at $foundAt ms")

  $fg = $false
  if ($hwnd -ne [IntPtr]::Zero) {
    for ($i = 0; $i -lt 25; $i++) {
      [void][W32]::ShowWindow($hwnd, 3)
      [void][W32]::BringWindowToTop($hwnd)
      [void][W32]::SetForegroundWindow($hwnd)
      Start-Sleep -Milliseconds 10
      if ([W32]::GetForegroundWindow() -eq $hwnd) { $fg = $true; break }
    }
  }
  $raiseAt = $run.ElapsedMilliseconds
  Note("foreground acquired = $fg at $raiseAt ms")
  Note("VERDICT: found=$($hwnd -ne [IntPtr]::Zero) foreground=$fg foundAt=${foundAt}ms raiseAt=${raiseAt}ms")

  for ($i = 0; $i -lt $Frames; $i++) {
    $t = $run.ElapsedMilliseconds
    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bmp.Size)
    $bmp.Save((Join-Path $OutDir ("f{0:d2}.png" -f $i)), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    if ($i -eq 0) { Note("frame0_at=${t}ms") }
  }
  Note("frameLast_at=$($run.ElapsedMilliseconds)ms frames=$Frames")
  Note("foreground at end = $([W32]::GetForegroundWindow().ToInt64()) show=$($hwnd.ToInt64())")
  try { $null = $pres.SlideShowWindow.View.Exit() } catch { Note("exit: " + $_.Exception.Message) }
}
catch { Note("FAILED: " + $_.Exception.Message) }
finally {
  if ($pres -ne $null) { try { $null = $pres.Close() } catch { } }
  if ($app -ne $null) { try { $null = $app.Quit() } catch { } }
  Set-Content -Path $log -Value $lines -Encoding UTF8
}
