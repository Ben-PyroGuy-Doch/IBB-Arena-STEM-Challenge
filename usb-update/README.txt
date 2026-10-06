EARN TO FIRE - QUESTION SET USB
================================

Changes which questions the game asks. Works with no internet.

1. Plug this USB stick into the ARENA SERVER (the Windows box under the arena).
2. Open the stick in File Explorer.
3. RIGHT-CLICK the set you want and choose "Run as administrator":

     1-SWITCH-TO-KS2.bat            ages 7-11   (primary)   <- STEMfest
     2-SWITCH-TO-KS3.bat            ages 12-14  (secondary)
     3-SWITCH-TO-CYBER-BASIC.bat    adults / workplace cyber awareness
     4-SWITCH-TO-CYBER-PRO.bat      infosec pros (BSides etc.)

4. Wait for "DONE". It takes about 15 seconds.
5. On the referee iPad, log in again. The arena restarts SAFE, so re-arm it when ready.

Scores and the leaderboard are kept. You can switch as often as you like.

If anything goes wrong, the script puts the old files back by itself and nothing is
broken. Take a photo of the screen and send it to Ben.

Notes
-----
- The cyber sets relabel the weapon cards (e.g. "Phishing & Scams"). The referee page
  shows which set is live, top-right.
- Each switch also refreshes the game code (kids.js) from the stick, so every set works
  properly even with no internet. The old code is backed up and restored on any failure.

What's on the stick
-------------------
  question-sets\ks2.js / ks3.js / cyber-basic.js / cyber-pro.js   the four sets (72 each)
  question-sets\check.js   checks a question file before it goes live
  server\kids.js           the matching game code
  _install.bat             does the work (called by the SWITCH files)
