# T2 + U4 diagnostic -- pin down the declared-layers branch with MEASURED numbers.
#
# Previous run established:
#   * `patchMerge` looks a declaration up by 1-BASED PAGE (`bySlide.get(d.page)`),
#     while the render manifest's own `slides[].index` is 0-BASED. A declaration
#     written with index 6 was therefore looked up as page 6, found nothing, and
#     was silently dropped (no error) -- the page fell back to DOM facts while
#     A_MEMBERS still counted as "covered". That is the silent path.
#   * This run uses index 7 (1-based) so the declaration actually lands, and
#     probes the DOM layer's true member count through the error message itself,
#     which prints both numbers.
#
# Declarations, all index 7, all carrying the required capturePad:
#   probe-0   members []                       -> error text reveals DOM count N
#   bogus-1   members ["#definitely-not-in-dom"] -> if N != 1 it must FAIL;
#                                                   if N == 1 the count-only check
#                                                   cannot tell a wrong selector apart
#   example-2 members [".cols2 > div.a4", "#threeAI"] -> the previously shipped
#                                                   example values, never verified
#
# ASCII-ONLY SOURCE (PS 5.1 reads a BOM-less .ps1 as ANSI). `Sha`, not `H`
# (`h` is an alias for Get-History).

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$utf8 = New-Object System.Text.UTF8Encoding($false)

$root = (Get-Location).Path
$keep = Join-Path $root '_seal-2.6.0'
$log  = Join-Path $keep 't2-u4-index.log'

$desktop = Split-Path $root -Parent
$deck = $null
foreach ($d in Get-ChildItem $desktop -Directory -ErrorAction SilentlyContinue) {
  $cand = Join-Path $d.FullName '_ppt-skill-forensics\refdeck\deck.config.json'
  if (Test-Path $cand) { $deck = Split-Path $cand -Parent; break }
}
if ($null -eq $deck) { Write-Host 'FATAL: refdeck not found'; exit 2 }
$pipe = Join-Path (Split-Path $deck -Parent) 'pipeline'
$cfg  = Join-Path $deck 'deck.config.json'
$mf   = Join-Path $deck 'render\manifest.json'
$side = Join-Path $deck 'deck.manifest.json'

if (Test-Path $log) { Remove-Item $log -Force }
$script:sw = New-Object System.IO.StreamWriter($log, $false, $utf8)
$script:sw.AutoFlush = $true

function Log([string]$s) { $script:sw.WriteLine($s) }
function Sha([string]$p) { if (Test-Path $p) { (Get-FileHash $p -Algorithm SHA256).Hash.Substring(0,16) } else { '(missing)' } }
function WriteText([string]$p, [string]$t) { [System.IO.File]::WriteAllText($p, $t, $utf8) }

function Decl([int]$index, [string]$members) {
  return @"
{
  "version": 1,
  "capturePad": 10,
  "slides": [
    { "index": $index,
      "layers": [
        { "cls": "a4", "delayMs": 370, "members": $members }
      ] }
  ]
}
"@
}

Log "===== declared-layers diagnostic (1-based index) ====="
Log "deck-render  : $(Sha (Join-Path $pipe 'deck-render.mjs'))"
Log "lib/manifest : $(Sha (Join-Path $pipe 'lib\manifest.mjs'))"
Log ""

$rev = Join-Path $keep 't2-reverse-full.json'
if (-not (Test-Path $rev)) { Copy-Item $mf $rev -Force }
Log "[reverse] baseline t2-reverse-full.json $(Sha $rev) $((Get-Item $rev).Length) B"
Log ""

function RunRender([string]$tag, [string]$only, [string]$json) {
  WriteText $side $json
  $bytes = [System.IO.File]::ReadAllBytes($side)
  $bom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
  Log "[$tag] sidecar $($bytes.Length) B  BOM=$bom"
  Log "[$tag] content: $($json -replace '\s+', ' ')"
  Log "[$tag] command: node `"$pipe\deck-render.mjs`" `"$cfg`" --only=$only"
  $out = & node (Join-Path $pipe 'deck-render.mjs') $cfg "--only=$only" 2>&1
  Log "[$tag] exit=$LASTEXITCODE"
  foreach ($l in $out) { Log "    $l" }
  Log ""
}

RunRender 'probe-0'   '7' (Decl 7 '[]')
RunRender 'bogus-1'   '7' (Decl 7 '["#definitely-not-in-dom"]')
RunRender 'example-2' '7' (Decl 7 '[".cols2 > div.a4", "#threeAI"]')

if (Test-Path $side) { Remove-Item $side -Force }
Copy-Item $rev $mf -Force
Log "[restore] sidecar removed; reverse full manifest restored $(Sha $mf)"
$script:sw.Close()
