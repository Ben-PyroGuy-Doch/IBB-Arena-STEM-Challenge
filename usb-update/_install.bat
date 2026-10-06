@echo off
rem ===========================================================================
rem  Earn to Fire - swap the question set on the arena server (offline, from USB)
rem  Called by 1-SWITCH-TO-KS2.bat / 2-SWITCH-TO-KS3.bat with the set name.
rem  Checks the new file, backs up the old one, installs, restarts the game,
rem  and puts the old questions back by itself if anything goes wrong.
rem ===========================================================================
setlocal EnableExtensions
title Earn to Fire - question update
set "SETNAME=%~1"
set "KIT=%~dp0"
set "SRV=C:\inetpub\IBBArena\server"
if defined ARENA_TEST set "SRV=%ARENA_TEST%"
set "NEW=%KIT%question-sets\%SETNAME%.js"
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
if not exist "%NEW%" (
  echo   ERROR: %NEW% is missing from the USB stick.
  goto :fail
)

echo   [1/4] Checking the new questions...
"%NODE%" "%CHECK%" "%NEW%"
if errorlevel 1 (
  echo   ERROR: the new question file failed its check. Nothing was changed.
  goto :fail
)

for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "TS=%%t"
set "BACKUP=%SRV%\kids-questions.backup-%TS%.js"
echo   [2/4] Backing up the current questions to kids-questions.backup-%TS%.js
copy /y "%SRV%\kids-questions.js" "%BACKUP%" >nul
if errorlevel 1 (
  echo   ERROR: could not back up the current questions. Nothing was changed.
  goto :fail
)

echo   [3/4] Installing the %SETNAME% questions...
copy /y "%NEW%" "%SRV%\kids-questions.js" >nul
if errorlevel 1 goto :rollback
"%NODE%" "%CHECK%" "%SRV%\kids-questions.js" >nul
if errorlevel 1 goto :rollback

echo   [4/4] Restarting the game server (about 10 seconds)...
if defined ARENA_TEST goto :done
call :restart
if errorlevel 1 goto :rollback
goto :done

:rollback
echo.
echo   PROBLEM - putting the old questions back...
copy /y "%BACKUP%" "%SRV%\kids-questions.js" >nul
if not defined ARENA_TEST call :restart
echo   The old questions are back in place. Nothing else changed.
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
echo   * To undo, run the other SWITCH file on this stick.
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
