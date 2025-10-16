param(
  [string]$GoodRef = "DHT237FBZ",
  [string]$BadRef  = "BEmetkB9C"
)

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git not found in PATH" }
if (-not (Test-Path .git)) { throw "Немає .git: запусти в корені репозиторію" }

$Targets = @(
  "src/components/MapView.tsx",
  "src/components/MapView.css",
  "src/components/StoryBar.tsx",
  "src/components/StoryBar.css"
)

function Get-GitFile([string]$ref, [string]$path) {
  $out = & git show "${ref}:$path" 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return ($out | Out-String)
}

function Find-Suspicious([string[]]$lines, [string]$label) {
  $rx = @{
    Fixed      = 'position\s*:\s*fixed'
    Absolute   = 'position\s*:\s*absolute'
    Inset0     = 'inset\s*:\s*0(\b|px\b)'
    ZIndex     = 'z-index\s*:\s*\d+'
    PeAny      = 'pointer-events\s*:'
    PeNotNone  = 'pointer-events\s*:\s*(?!none)\w+'
    FullFixed  = 'position\s*[:=]\s*["'']?fixed["'']?.*\binset\s*[:=]\s*["'']?0\b'
  }
  $hits = @{}
  foreach ($k in $rx.Keys) { $hits[$k] = @() }
  for ($i=0; $i -lt $lines.Count; $i++) {
    $l = $lines[$i]
    foreach ($k in $rx.Keys) {
      if ($l -match $rx[$k]) { $hits[$k] += @{ line=$i+1; text=$l } }
    }
  }
  [PSCustomObject]@{
    Label     = $label
    Fixed     = $hits.Fixed.Count
    Absolute  = $hits.Absolute.Count
    Inset0    = $hits.Inset0.Count
    ZIndex    = $hits.ZIndex.Count
    PeAny     = $hits.PeAny.Count
    PeNotNone = $hits.PeNotNone.Count
    FullFixed = $hits.FullFixed.Count
    Hits      = $hits
  }
}

function Print-Hunks([string]$goodRef,[string]$badRef,[string]$path) {
  $diff = & git diff --unified=0 "$goodRef..$badRef" -- "$path"
  if ([string]::IsNullOrWhiteSpace($diff)) { return }
  Write-Host "─── DIFF: $path ─────────────────────────────────────────────" -ForegroundColor Cyan
  $sus = '(position\s*:\s*(fixed|absolute))|(inset\s*:\s*0\b)|(z-index\s*:\s*\d+)|(pointer-events\s*:)'
  foreach ($line in ($diff -split "`r?`n")) {
    if ($line -like '+*' -and ($line -match $sus)) {
      Write-Host $line -ForegroundColor Yellow
    } elseif ($line -like '+*' -and $path -like '*.tsx' -and ($line -match 'style\s*=\s*{|position\s*:\s*["'']?fixed|inset\s*:|backdrop|overlay|inset:0')) {
      Write-Host $line -ForegroundColor DarkYellow
    }
  }
  Write-Host ""
}

$summary = @()
foreach ($p in $Targets) {
  $good = Get-GitFile $GoodRef $p
  $bad  = Get-GitFile $BadRef  $p
  if (-not $good -and -not $bad) { continue }

  if ($good) {
    $gLines = $good -split "`r?`n"
    $summary += Find-Suspicious $gLines "$($GoodRef):$p"
  }
  if ($bad) {
    $bLines = $bad -split "`r?`n"
    $summary += Find-Suspicious $bLines "$($BadRef):$p"
  }

  Print-Hunks $GoodRef $BadRef $p
}

Write-Host "=== Підозрілі лічильники (чим більша різниця між Bad і Good — тим ймовірніша причина) ===" -ForegroundColor Green
$summary | Sort-Object Label | Format-Table Label,Fixed,Absolute,Inset0,ZIndex,PeAny,PeNotNone,FullFixed -AutoSize
Write-Host "`nПідказка: шукай у DIFF жовті рядки з 'position:fixed', 'inset:0', 'z-index', 'pointer-events'." -ForegroundColor Gray
