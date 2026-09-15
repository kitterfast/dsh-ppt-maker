# Playback acceptance using WPS Presentation (KWPP.Application).
#
# Same interface as before: -Pptx, -OutDir, -ProgId, -Frames. Writes log.txt and
# f00.png..f(NN).png into -OutDir, exactly like the previous revision.
#
# WHAT WAS WRONG (measured 2026-09-15, this machine, WPS 14.0)
# The previous revision set $app.Visible, ran the show, then grabbed the screen
# with CopyFromScreen. It produced 24 PNGs, but the centre pixel of every frame
# was 16,22,36 and the deck's paper colour covered only 3.4-3.7% of the pixels:
# it filmed whatever window happened to be in FRONT, not the show. A whole round
# of conclusions was drawn from those frames. The show object did exist --
# SlideShowWindow.View.Exit() never threw -- it simply never reached the front.
#
# THREE FINDINGS THAT DROVE THIS REVISION
#   1. $pres.SlideShowWindow.HWND returns 0 on this WPS build, so the COM route
#      cannot supply a handle. VisualBasic AppActivate cannot resolve the caption
#      either ("process 0 not found").
#   2. The show window IS a normal top-level window and can be raised by handle:
#        class = Qt5QWindowIcon
#        title = "WPS Presentation Slide Show - [<file name>]"
#   3. FindWindowW(NULL, title) does NOT match here: PowerShell marshals $null to
#      "" for a string parameter, which searches for an empty class name. Match by
#      title PREFIX on the C# side instead. A full EnumWindows sweep costs ~1.5 s
#      and misses the entrance, so poll the prefix match every 20 ms.
#
# Result after the fix: window found at ~320-350 ms, foreground at ~360-390 ms,
# first frame at ~360-390 ms, and the entrance stagger is caught (frames 4-9).
#
# The capture is full-screen, so a pure slide shows no title bar and no taskbar.
# tools/wps-purity.mjs checks that separately.
#
# ASCII-only on purpose: Windows PowerShell reads .ps1 as ANSI, and a single
# non-ASCII byte shifts the pairing and swallows following quotes.
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
  try { $app.Visible = -1 } catch { Note("set Visible failed: " + $_.Exception.Message) }
  Note("progId=$ProgId version=" + $app.Version)
  $pres = $app.Presentations.Open($Pptx, $true, $false, $true)
  Note("opened slides=" + $pres.Slides.Count + "  file=" + $leaf)
  Note("target window title = $title")

  $pres.SlideShowSettings.ShowType = 1
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  Note("virtualscreen=$($bounds.Width)x$($bounds.Height)")
  $run = [System.Diagnostics.Stopwatch]::StartNew()
  $null = $pres.SlideShowSettings.Run()

  # raise the show window: exact title first, then prefix match, polled every 20 ms
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
    for ($i = 0; $i -lt 40; $i++) {
      [void][W32]::ShowWindow($hwnd, 3)
      [void][W32]::BringWindowToTop($hwnd)
      [void][W32]::SetForegroundWindow($hwnd)
      Start-Sleep -Milliseconds 10
      if ([W32]::GetForegroundWindow() -eq $hwnd) { $fg = $true; break }
    }
  }
  $raiseAt = $run.ElapsedMilliseconds
  Note("foreground acquired = $fg at $raiseAt ms")

  for ($i = 0; $i -lt $Frames; $i++) {
    $t = $run.ElapsedMilliseconds
    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bmp.Size)
    $bmp.Save((Join-Path $OutDir ("f{0:d2}.png" -f $i)), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    if ($i -eq 0) { Note("frame0_at=${t}ms") }
  }
  $fgEnd = [W32]::GetForegroundWindow()
  Note("captured $Frames frames, last_at=$($run.ElapsedMilliseconds)ms")
  Note("foreground at end = $($fgEnd.ToInt64()) show=$($hwnd.ToInt64())")
  $ok = $fg -and ($fgEnd -eq $hwnd)
  Note("VERDICT: found=$($hwnd -ne [IntPtr]::Zero) foreground=$fg foreground_held=$($fgEnd -eq $hwnd) capture_valid=$ok")
  try { $null = $pres.SlideShowWindow.View.Exit() } catch { Note("exit: " + $_.Exception.Message) }
}
catch { Note("FAILED: " + $_.Exception.Message) }
finally {
  if ($pres -ne $null) { try { $null = $pres.Close() } catch { } }
  if ($app -ne $null) { try { $null = $app.Quit() } catch { } }
  Set-Content -Path $log -Value $lines -Encoding UTF8
}
