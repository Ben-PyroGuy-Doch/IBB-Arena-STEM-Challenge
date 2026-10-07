EARN TO FIRE - QUESTION SET USB
================================

Changes which questions the game asks. Works with no internet.

1. Plug this USB stick into the ARENA SERVER (the Windows box under the arena).
2. Open the stick in File Explorer.
3. (Optional, recommended first time) double-click:
       0-CHECK-USB.bat        reads the stick + server, changes nothing
4. RIGHT-CLICK the set you want and choose "Run as administrator"
   (or just double-click - it will ask for admin itself):

       1-SWITCH-TO-KS2.bat            ages 7-11   (primary)   <- STEMfest
       2-SWITCH-TO-KS3.bat            ages 12-14  (secondary)
       3-SWITCH-TO-CYBER-BASIC.bat    adults / workplace cyber awareness
       4-SWITCH-TO-CYBER-PRO.bat      infosec pros (BSides etc.)

5. Wait for "DONE" (the restart can take up to a minute on the server).
6. On the referee iPad, log in again. The arena restarts SAFE, so re-arm it.

Scores and the leaderboard are kept. You can switch as often as you like.

If anything goes wrong it puts the old files back by itself and nothing is broken.
Every run writes a log to  update-log.txt  on this stick - send that to Ben.

What's on the stick
-------------------
  update.ps1               does the work (the .bat files just launch it)
  0-CHECK-USB.bat          non-destructive check
  1..4-SWITCH-TO-*.bat     switch to each set
  question-sets\*.js       the four sets (72 questions each) + check.js
  server\kids.js           the matching game code
  update-log.txt           created on first run - the record of what happened
