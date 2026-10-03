# Earn to Fire: how a round plays

**Red vs Blue.** Each team has **one iPad** and **two bots** in the arena.

## Who does what

| Who | Job |
|---|---|
| Team drivers (2 per team) | Drive the team's two bots and try to stay out of the pit |
| Team brains (the rest of the team) | Answer STEM questions on the team iPad to fire the arena hazards |
| Referee (admin iPad) | Starts and stops the clock, taps **PITTED** when a bot goes in, arms the arena, hits ALL STOP |

Rotate the kids between driving and the iPad between rounds so everyone does both.

## A round

1. The referee picks a round length (default **2:00**) and taps **START**. Both iPads count down.
2. Drivers fight. The brains tap a weapon card on their iPad and answer its question:
   - **Right:** the weapon fires in the arena and the team scores its STEM points.
   - **Wrong:** the iPad shows the right answer and why, and that team is locked off that
     weapon for 15 seconds.
3. Each weapon has one recharge timer that **both teams share**. If Red fires the flipper,
   Blue has to wait for it too.
4. The round ends when **the clock hits 0:00** or **both of one team's bots are pitted**
   (a knockout).

## Points

**Final score = STEM points + bot points.**

### STEM points (from the iPad)

| Weapon | Topic | Points |
|---|---|---|
| ⚡ Flipper | Forces & Levers | 10 |
| 🕳️ The Pit | Circuits & Electricity | 15 |
| ⚙️ Spinner 1 | Gears & Motion | 20 |
| 💻 Spinner 2 | Code & Logic | 20 |
| 🤖 Spinner 3 | Sensors & Robot Brains | 20 |
| 🌪️ MEGA SPIN | Boss Challenge (hardest) | 50 |

Harder topics score more. The referee can add or remove STEM points by hand (±5 / ±10).

### Bot points (from the arena)

| How | Points |
|---|---|
| Survival | **+1 per second, per bot**, while the clock runs. Two bots in for a full 2:00 = 240 |
| Pit bonus | **+50** for every enemy bot that gets pitted |
| Fight win | The team with **more bots still in** at the end wins the fight (shown as a tally, no extra points). Equal = draw. |

A pitted bot stops earning survival points from that second. The referee's **Undo** button
fixes a mis-tap.

### Example (2:00 round)

- Red answers 4 flipper and 2 spinner questions right: 4×10 + 2×20 = **80 STEM**.
- Blue answers 1 MEGA SPIN and 3 pit questions right: 50 + 3×15 = **95 STEM**.
- One Blue bot is pitted at 1:00 and the other survives.
  - Red: both bots in for 120 s = 240, plus 50 pit bonus = **290 bot**.
  - Blue: 60 + 120 = **180 bot**.
- **Red 370, Blue 275.** Red also wins the fight, 2 bots in to 1.

## The tactics we want the kids to find

- Pitting an enemy bot is worth as much as a boss question, and it stops their survival
  points too. So use the hazards near the enemy bots.
- Firing a weapon also blocks the other team from it while it recharges.
- Expensive questions are worth more but take longer to answer. Quick flipper questions
  keep the arena busy.

## Referee cheat sheet

| Button | Does |
|---|---|
| **ALL STOP** | Disarms, stops the clock, pauses the questions, cancels pending moves, turns all spinners off |
| **SAFE / ARMED** | Disarmed = practice: answers score but nothing moves. Starts SAFE on every restart |
| **START / STOP / RESET** | Round clock. STOP pauses the game; RESET starts a fresh fight |
| **PITTED** (one per bot) | Tap when a bot goes in. Tap the bot name to rename it |
| *Clear cooldowns & locks* | Unsticks the weapons |
| *Scores to 0* | Zeroes STEM, bot points and fight wins |
| *New round (everything)* | Scores, locks, question history and clock all reset |

## Balance knobs

At the top of `site/server/kids.js`: `SURVIVE_PTS_PER_SEC`, `PIT_BONUS`, and each weapon's
`points` and `cooldown` in `WEAPONS`. As set, a full-length round with no pits gives each
team 240 bot points, which usually outweighs the STEM side. Lower `SURVIVE_PTS_PER_SEC` or
raise weapon points if the quiz should count for more.
