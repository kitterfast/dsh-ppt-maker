# Definitive WPS diagnostic: does a slide-show window EXIST, and can it be raised?
#
# The COM route failed twice: $pres.SlideShowWindow.HWND returns 0 and
# AppActivate cannot resolve a process id from the caption. So enumerate every
# top-level window belonging to the WPS process while the show is running, log
# it, and try to raise the best candidate by raw handle. ASCII-only.
param(
  [Parameter(Mandatory = $true)][string]$Pptx,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$ProgId = 'KWPP.Application',
  [int]$Frames = 24
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$sig = @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class WinEnum {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassNameW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  public static List<string> All() {
    var outp = new List<string>();
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      var t = new StringBuilder(512); GetWindowTextW(h, t, 512);
      var c = new StringBuilder(256); GetClassNameW(h, c, 256);
      uint pid; GetWindowThreadProcessId(h, out pid);
      outp.Add(h.ToInt64() + "|" + pid + "|" + (IsWindowVisible(h) ? "1" : "0") + "|" + c.ToString() + "|" + t.ToString());
      return true;
    }, IntPtr.Zero);
    return outp;
  }
}
'@
Add-Type -TypeDefinition $sig -ErrorAction Stop

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$log = Join-Path $OutDir 'log.txt'
$lines = New-Object System.Collections.ArrayList
function Note($m) { [void]$lines.Add([string]$m) }

$app = $null; $pres = $null
try {
  $app = New-Object -ComObject $ProgId
  try { $app.Visible = -1 } catch { }
  $pres = $app.Presentations.Open($Pptx, $true, $false, $true)
  Note("opened slides=" + $pres.Slides.Count + "  file=" + (Split-Path $Pptx -Leaf))
  try { $app.Activate() } catch { }
  Start-Sleep -Milliseconds 400

  $pres.SlideShowSettings.ShowType = 1
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $run = [System.Diagnostics.Stopwatch]::StartNew()
  $null = $pres.SlideShowSettings.Run()
  Start-Sleep -Milliseconds 900

  # which processes look like WPS Presentation?
  $wpsPids = @(Get-Process | Where-Object { $_.ProcessName -match '^(wpp|wps|et|kwpp)$' } | Select-Object -ExpandProperty Id)
  Note("wps-like pids: " + ($wpsPids -join ','))

  $fg = [WinEnum]::GetForegroundWindow()
  $fgpid = [uint32]0
  [void][WinEnum]::GetWindowThreadProcessId($fg, [ref]$fgpid)
  Note("foreground hwnd=$($fg.ToInt64()) pid=$fgpid")

  $all = [WinEnum]::All()
  Note("total top-level windows = " + $all.Count)
  $cand = @()
  foreach ($w in $all) {
    $p = $w.Split('|')
    if ($wpsPids -contains [int]$p[1]) {
      Note("  WPS-WINDOW hwnd=$($p[0]) pid=$($p[1]) visible=$($p[2]) class=$($p[3]) title=$($p[4])")
      if ($p[2] -eq '1') { $cand += [IntPtr][int64]$p[0] }
    }
  }
  Note("visible WPS windows = " + $cand.Count)

  # try to raise the largest visible WPS window (the show should be full screen)
  $raised = $false
  foreach ($h in $cand) {
    [void][WinEnum]::ShowWindow($h, 3)
    [void][WinEnum]::BringWindowToTop($h)
    [void][WinEnum]::SetForegroundWindow($h)
    Start-Sleep -Milliseconds 150
    if ([WinEnum]::GetForegroundWindow() -eq $h) { $raised = $true; Note("raised hwnd=$($h.ToInt64())"); break }
  }
  Note("raised_foreground=$raised elapsed=$($run.ElapsedMilliseconds)ms")
  Note("elapsed since Run at first frame = $($run.ElapsedMilliseconds) ms")

  for ($i = 0; $i -lt $Frames; $i++) {
    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bmp.Size)
    $bmp.Save((Join-Path $OutDir ("f{0:d2}.png" -f $i)), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
  }
  Note("captured $Frames frames, end=$($run.ElapsedMilliseconds)ms")
  Note("VERDICT: raised_foreground=$raised wps_windows=$($cand.Count)")
  try { $null = $pres.SlideShowWindow.View.Exit() } catch { }
}
catch { Note("FAILED: " + $_.Exception.Message) }
finally {
  if ($pres -ne $null) { try { $null = $pres.Close() } catch { } }
  if ($app -ne $null) { try { $null = $app.Quit() } catch { } }
  Set-Content -Path $log -Value $lines -Encoding UTF8
}
