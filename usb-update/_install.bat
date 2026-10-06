@echo off
rem ===========================================================================
rem  Earn to Fire - swap the question set on the arena server (offline, from USB)
rem  Called by the SWITCH-TO-*.bat launchers with the set name (ks2 / ks3 /
rem  cyber-basic / cyber-pro).
rem
rem  It installs the chosen question set AND refreshes the game code (kids.js)
rem  so per-set features (like the cyber topic labels) work. Every change is
rem  backed up first and put straight back if anything fails.
rem ===========================================================================
setlocal EnableExtensions
title Earn to Fire - question update
set "SETNAME=%~1"
set "KIT=%~dp0"
set "SRV=C:\inetpub\IBBArena\server"
if defined ARENA_TEST set "SRV=%ARENA_TEST%"
set "NEWSET=%KIT%question-sets\%SETNAME%.js"
set "NEWCODE=%KIT%server\kids.js"
set "CHECK=%KIT%question-sets\check.js"
set "NODE=node"
where node >nul 2>&1 || set "NODE=C:\Program Files\nodejs\node.exe"

echo.
echo   EARN TO FIRE - switching the questions to: %SETNAME%
echo   ===================================================
echo.

if defined ARENA_TEST goto :skipadmin
net session >nul 2>&1
if errorlevel 1 (
  echo   ERROR: not running as Administrator.
  echo   Right-click the file and choose "Run as administrator".
  goto :fail
)
:skipadmin
if not exist "%SRV%\kids.js" (
  echo   ERROR: %SRV% not found. Is this the arena server?
  goto :fail
)
if not exist "%NEWSET%" (
  echo   ERROR: %NEWSET% is missing from the USB stick.
  goto :fail
)

echo   [1/5] Checking the new questions...
"%NODE%" "%CHECK%" "%NEWSET%"
if errorlevel 1 (
  echo   ERROR: the new question file failed its check. Nothing was changed.
  goto :fail
)

for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%t"
set "BK_SET=%SRV%\kids-questions.backup-%TS%.js"
set "BK_CODE=%SRV%\kids.backup-%TS%.js"
echo   [2/5] Backing up current files (kids-questions.backup-%TS%.js, kids.backup-%TS%.js)
copy /y "%SRV%\kids-questions.js" "%BK_SET%" >nul || goto :fail
copy /y "%SRV%\kids.js" "%BK_CODE%" >nul || goto :fail

echo   [3/5] Installing the %SETNAME% questions...
copy /y "%NEWSET%" "%SRV%\kids-questions.js" >nul || goto :rollback
"%NODE%" "%CHECK%" "%SRV%\kids-questions.js" >nul || goto :rollback

echo   [4/5] Refreshing the game code...
if exist "%NEWCODE%" (
  copy /y "%NEWCODE%" "%SRV%\kids.js" >nul || goto :rollback
  "%NODE%" --check "%SRV%\kids.js" >nul 2>&1 || goto :rollback
) else (
  echo        ^(no kids.js on the stick - leaving the game code as it is^)
)

echo   [5/5] Restarting the game server (about 10 seconds)...
if defined ARENA_TEST goto :done
call :restart || goto :rollback
goto :done

:rollback
echo.
echo   PROBLEM - putting the old files back...
copy /y "%BK_SET%" "%SRV%\kids-questions.js" >nul
copy /y "%BK_CODE%" "%SRV%\kids.js" >nul
if not defined ARENA_TEST call :restart
echo   The old questions and game code are back in place.
goto :fail

:restart
net stop "nodejsserver.exe" >nul 2>&1
net start "nodejsserver.exe" >nul 2>&1
timeout /t 6 /nobreak >nul
for /f %%c in ('powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:3000/health -TimeoutSec 10).StatusCode } catch { 0 }"') do set "HEALTH=%%c"
if not "%HEALTH%"=="200" (
  echo   The game server did not answer after the restart.
  exit /b 1
)
exit /b 0

:done
echo.
echo   ===================================================
echo   DONE - the %SETNAME% questions are now live.
echo   ===================================================
echo.
echo   * Referee: log in again on the referee page (the restart logs it out).
echo   * The arena restarts SAFE - re-arm it when you are ready.
echo   * Scores and the leaderboard are kept.
echo   * To change set again, run another SWITCH file on this stick.
echo.
pause
exit /b 0

:fail
echo.
echo   Nothing has been broken - the game is as it was.
echo   Take a photo of this screen and send it to Ben.
echo.
pause
exit /b 1
