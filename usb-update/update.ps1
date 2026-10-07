<#
  Earn to Fire - swap the question set on the arena server (offline, from USB).
  Called by the SWITCH-TO-*.bat launchers. Writes a full log to the USB
  (update-log.txt) so any failure is captured. Backs everything up and rolls
  back automatically if the server does not come back healthy.

  Works on Windows Server 2012 R2 (PowerShell 4) and up. Stdlib only.
#>
param(
  [string]$Set = '',
  [switch]$Check   # just check the stick + server + node, change nothing
)

$ErrorActionPreference = 'Stop'
$kit  = $PSScriptRoot
$log  = Join-Path $kit 'update-log.txt'
$test = $env:ARENA_TEST
try { Start-Transcript -Path $log -Append -ErrorAction SilentlyContinue | Out-Null } catch {}

function Say($m) { Write-Host "  $m" }
function Finish([int]$code) {
  try { Stop-Transcript -ErrorAction SilentlyContinue | Out-Null } catch {}
  exit $code
}
function Fail($m) {
  Write-Host ''
  Write-Host "  ERROR: $m" -ForegroundColor Red
  Write-Host "  Nothing has been broken - the game is as it was." -ForegroundColor Yellow
  Write-Host "  The file update-log.txt on this USB stick has the details for Ben."
  Finish 1
}

Write-Host ''
Write-Host "  EARN TO FIRE - question update   ($(Get-Date))"
Write-Host "  =================================================="

# --- server folder ---------------------------------------------------------
$srv = if ($test) { $test } else { 'C:\inetpub\IBBArena\server' }
Say "Server folder: $srv"
if (-not (Test-Path (Join-Path $srv 'kids.js'))) {
  Fail "arena server not found at $srv. Is this the right machine?"
}

# --- admin check (real runs only) ------------------------------------------
if (-not $test) {
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $admin) { Fail "not running as Administrator. Right-click the file and choose 'Run as administrator'." }
}

# --- find node (best effort) ----------------------------------------------
$node = $null
$c = Get-Command node -ErrorAction SilentlyContinue
if ($c) { $node = $c.Source }
if (-not $node) {
  foreach ($p in @("$env:ProgramFiles\nodejs\node.exe", "${env:ProgramFiles(x86)}\nodejs\node.exe")) {
    if (Test-Path $p) { $node = $p; break }
  }
}
Say ("Node: " + $(if ($node) { $node } else { 'not found (will trust the stick files)' }))

# --- CHECK mode: report and stop ------------------------------------------
if ($Check) {
  $sets = Get-ChildItem (Join-Path $kit 'question-sets') -Filter '*.js' | Where-Object { $_.Name -ne 'check.js' } | ForEach-Object { $_.BaseName }
  Say ("Question sets on this stick: " + ($sets -join ', '))
  $svc = Get-Service | Where-Object { $_.Name -like '*nodejs*' -or $_.DisplayName -like '*node*' } | Select-Object -First 1
  Say ("Arena service: " + $(if ($svc) { "$($svc.Name) ($($svc.Status))" } else { 'NOT FOUND' }))
  try { $h = (Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/health' -TimeoutSec 5).StatusCode } catch { $h = 'no answer' }
  Say "Game health now: $h"
  Write-Host ''
  Write-Host "  CHECK complete - nothing was changed." -ForegroundColor Green
  Finish 0
}

if (-not $Set) { Fail "no set named. Run one of the SWITCH-TO-*.bat files, not this script." }
$newSet  = Join-Path $kit ("question-sets\$Set.js")
$newCode = Join-Path $kit 'server\kids.js'
$checkJs = Join-Path $kit 'question-sets\check.js'
if (-not (Test-Path $newSet)) { Fail "$Set.js is missing from the USB stick." }

Write-Host ''
Say "Switching questions to: $Set"

# --- [1] validate the new set (if node) -----------------------------------
if ($node) {
  Say "[1/5] Checking the new questions..."
  & $node $checkJs $newSet
  if ($LASTEXITCODE -ne 0) { Fail "the new question file failed its check. Nothing changed." }
} else {
  Say "[1/5] Skipping node check (node not found) - trusting the stick files."
}

# --- [2] back up -----------------------------------------------------------
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$bkSet  = Join-Path $srv "kids-questions.backup-$ts.js"
$bkCode = Join-Path $srv "kids.backup-$ts.js"
Say "[2/5] Backing up current files (...backup-$ts.js)"
Copy-Item (Join-Path $srv 'kids-questions.js') $bkSet -Force
Copy-Item (Join-Path $srv 'kids.js')           $bkCode -Force

# --- [3+4] install, with rollback -----------------------------------------
$didChange = $false
try {
  Say "[3/5] Installing the $Set questions..."
  Copy-Item $newSet (Join-Path $srv 'kids-questions.js') -Force
  $didChange = $true
  if ($node) { & $node $checkJs (Join-Path $srv 'kids-questions.js') | Out-Null; if ($LASTEXITCODE -ne 0) { throw "installed set failed re-check" } }

  Say "[4/5] Refreshing the game code..."
  if (Test-Path $newCode) {
    Copy-Item $newCode (Join-Path $srv 'kids.js') -Force
    if ($node) { & $node --check (Join-Path $srv 'kids.js') 2>&1 | Out-Null; if ($LASTEXITCODE -ne 0) { throw "kids.js failed node --check" } }
  } else {
    Say "      (no kids.js on the stick - leaving the game code as it is)"
  }

  # --- [5] restart + wait for health (real runs only) ---------------------
  if ($test) {
    Say "[5/5] (test mode - skipping the restart)"
  } else {
    Say "[5/5] Restarting the game server (can take up to a minute)..."
    $svc = Get-Service | Where-Object { $_.Name -like '*nodejs*' -or $_.DisplayName -like '*node*' } | Select-Object -First 1
    if (-not $svc) { throw "could not find the arena Windows service" }
    try { Restart-Service -InputObject $svc -Force -ErrorAction Stop } catch {
      Stop-Service -InputObject $svc -Force -ErrorAction SilentlyContinue
      Start-Sleep 2
      Start-Service -InputObject $svc -ErrorAction SilentlyContinue
    }
    $healthy = $false
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep 3
      try { if ((Invoke-WebRequest -UseBasicParsing 'http://localhost:3000/health' -TimeoutSec 5).StatusCode -eq 200) { $healthy = $true; break } } catch {}
      Write-Host "       ...waiting ($([int](($i+1)*3))s)"
    }
    if (-not $healthy) { throw "the game server did not answer after the restart" }
  }
}
catch {
  Write-Host ''
  Write-Host "  PROBLEM: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "  Putting the old files back..." -ForegroundColor Yellow
  if ($didChange) {
    Copy-Item $bkSet  (Join-Path $srv 'kids-questions.js') -Force
    Copy-Item $bkCode (Join-Path $srv 'kids.js') -Force
    if (-not $test) {
      $svc = Get-Service | Where-Object { $_.Name -like '*nodejs*' -or $_.DisplayName -like '*node*' } | Select-Object -First 1
      if ($svc) { try { Restart-Service -InputObject $svc -Force } catch {} }
    }
  }
  Fail "rolled back. $($_.Exception.Message)"
}

Write-Host ''
Write-Host "  ==================================================" -ForegroundColor Green
Write-Host "  DONE - the $Set questions are now live." -ForegroundColor Green
Write-Host "  =================================================="
Write-Host ''
Write-Host "  * Referee: log in again on the referee page (restart logged it out)."
Write-Host "  * The arena restarts SAFE - re-arm when ready."
Write-Host "  * Scores and the leaderboard are kept."
Write-Host "  * To change set again, run another SWITCH file on this stick."
Finish 0
