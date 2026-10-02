# IBB Arena Control

Control system for the **InfoSec Battle Bots** arena: a Windows server hosts a web panel
that drives the arena hazards (pit, flipper, three spinners) through a Raspberry Pi.
Includes **Earn to Fire**, a STEM quiz game for kids' events where answering robot-themed
questions fires the arena weapons.

![status](https://img.shields.io/badge/status-live-brightgreen) ![code: Apache 2.0](https://img.shields.io/badge/code-Apache%202.0-blue.svg) ![docs: CC BY 4.0](https://img.shields.io/badge/docs-CC%20BY%204.0-lightgrey.svg)

## How it fits together

```
 iPads / browsers ──► IIS :80  (static pages, site/public)
        │
        └──XHR──────► Node/Express :3000  (site/server)
                          │   Windows Server 2012 R2, dual-homed
                          ▼
              Internal NIC 192.168.80.1
                ├── Raspberry Pi    192.168.80.100:8000  pit / flipper / spinners
                └── Crane (Klipper) 192.168.80.101:7125  X/Y/Z + claw (not fitted for every event)
```

Browsers only ever talk to the server. The Node API proxies every hardware command, so
the 192.168.80.x side is never exposed.

| | |
|---|---|
| Server | `Arena-Server`, Server 2012 R2 Standard (6.3.9600), retail licence, Node v22.16.0 |
| External NIC | **192.168.0.102**, gateway 192.168.0.1 |
| Internal NIC | **192.168.80.1** (no gateway), direct to the Pi side |
| IIS site | `IBB Arena` → `C:\inetpub\IBBArena\public`, `*:80` (IIS 8.5) |
| Node service | **`nodejsserver.exe`** (node-windows via `qckwinsvc`, `--maxrestarts 3`) running `C:\inetpub\IBBArena\server\server.js` |
| Other ports | RDP 3389, WinRM 5985, SSH 22, DNS 53, SMB 445 |

## What's in here

| Path | What it is |
|---|---|
| [`site/public/`](site/public) | IIS docroot — original PIN-login operator panels (`index.html`, `Arena_*.html`) |
| [`site/public/kids/`](site/public/kids) | **Earn to Fire** — team page, referee page, landing page |
| [`site/server/server.js`](site/server/server.js) | Express API: PIN login, Pi proxy routes, crane routes |
| [`site/server/kids.js`](site/server/kids.js) | Earn to Fire game engine (mounted from one line in `server.js`) |
| [`site/server/kids-questions.js`](site/server/kids-questions.js) | 72 STEM questions, 12 per weapon topic |
| [`site/server/pins.example.json`](site/server/pins.example.json) | Template for the operator PINs (real `pins.json` is gitignored) |
| [`deploy.sh`](deploy.sh) | One-command deploy to the arena server |
| [`DEPLOY.md`](DEPLOY.md) | Deploying, server access setup, rollback, troubleshooting |
| [`LICENSE`](LICENSE) · [`LICENSE-docs`](LICENSE-docs) · [`NOTICE`](NOTICE) | Code under Apache 2.0, docs and questions under CC BY 4.0, both require credit. The IBB name and logo are not covered |
| [`docs/HOW-TO-PLAY.md`](docs/HOW-TO-PLAY.md) | Rules, scoring and referee cheat sheet for event volunteers |
| [`docs/copilot-handover.txt`](docs/copilot-handover.txt) | Architecture notes from the first build (the PINs in it are stale) |

## Setting up your own arena

Nothing secret is in this repo — PINs, the referee PIN and scores live only on the server.
To run it on your own kit:

1. **Server:** any Windows box with IIS and Node 18+ works (ours is Server 2012 R2). Point an
   IIS site at `site/public`, copy `site/server` beside it and run `npm ci --omit=dev`.
   Run `server.js` as a service (we use [node-windows](https://github.com/coreybutler/node-windows)
   via `qckwinsvc`) so it survives reboots.
2. **Operator PINs:** copy `site/server/pins.example.json` to `site/server/pins.json` and
   replace the placeholder PINs. Each entry maps a PIN to a page and role:
   ```json
   {
     "4821": { "page": "arena_Root.html",    "role": "root" },
     "7350": { "page": "arena_Flipper.html", "role": "flipper" }
   }
   ```
   Leave out any roles you don't need. No `pins.json` = PIN login disabled (logged at start-up).
   Restart the service after editing. **Don't commit it** — `.gitignore` already excludes it.
3. **Referee PIN (kids' game):** generated for you on first start — 6 random digits written to
   `site/server/kids-config.json`. Read it from there, or replace `adminPin` with your own and
   restart.
4. **Your hardware:** set `PI_BASE` (default `http://192.168.80.100:8000`) and `CRANE_BASE`
   (default `http://192.168.80.101:7125`) as environment variables if your controllers live
   elsewhere, and `PORT` to move the API off 3000. Your Pi needs to answer plain GETs on the
   paths in the `WEAPONS` table in `kids.js` (`/flipper`, `/pitdown`, `/spinner1off` …).
5. **Wrong-PIN lockout:** 5 wrong PINs from one address (operator or referee) locks that
   address out for 60 s.

## Operator panel (original)

`http://<server>/` → PIN → a role page. Roles: `root` (everything), `flipper`, `pit`,
`spinners`, `crane`. PINs are read from `server/pins.json` on the box.

> The token is unsigned base64 checked only in the browser, and the `/api/*` hardware
> routes are unauthenticated GETs. This is LAN-only kit — never expose port 3000 or 80.

The original `index.html` hardcodes `API_BASE = http://192.168.0.102:3000`, so that panel
breaks if the server's IP changes. The kids' pages don't have this problem.

## Earn to Fire — kids' STEM game

For ages 12–14. Two team iPads (Red / Blue) plus a referee tablet.

1. A team taps a weapon card and gets a multiple-choice question on that weapon's topic.
2. **Right** → that weapon fires and the team scores its points.
   **Wrong** → the right answer plus an explanation, and that team waits 15 s on that weapon.
3. Answers are checked on the server; they never reach the iPad.

| Weapon | Topic | Pts | Cooldown | Pi sequence |
|--------|-------|-----|----------|-------------|
| Flipper | Forces & Levers | 10 | 8 s | `/flipper` |
| The Pit | Circuits & Electricity | 15 | 20 s | `/pitdown`, then `/pitup` after 10 s |
| Spinner 1 | Gears & Motion | 20 | 15 s | `/spinner1`, off after 5 s |
| Spinner 2 | Code & Logic | 20 | 15 s | `/spinner2`, off after 5 s |
| Spinner 3 | Sensors & Robot Brains | 20 | 15 s | `/spinner3`, off after 5 s |
| MEGA SPIN | Boss Challenge | 50 | 30 s | `/spinners`, off after 6 s |

All of it is tunable in the `WEAPONS` table at the top of `kids.js`. In
`kids-questions.js` the correct answer is always option `a: 0`; the server shuffles them.

| URL | Device |
|-----|--------|
| `http://<server>/kids/` | landing: Red / Blue / Referee |
| `/kids/team.html?team=red` · `?team=blue` | team iPads — Add to Home Screen |
| `/kids/admin.html` | referee tablet — PIN in `server/kids-config.json` on the box |

**Bot fight:** each team also has **two bots** in the arena. Final score = **STEM + bot
points**. Bot points are +1 per second per bot still in while the clock runs, plus +50 per
enemy bot pitted (the referee taps **PITTED**, with Undo). Both of a team's bots pitted =
knockout, which ends the round. More bots left at the end wins the fight. Full rules and a
worked example: [`docs/HOW-TO-PLAY.md`](docs/HOW-TO-PLAY.md).

**Round clock:** default **2:00** (presets 1:00–5:00). Shown big on both team iPads,
red and pulsing for the last 10 s. **START** starts the game, **STOP** freezes the clock and
pauses the game, **RESET** returns to the round length. At 0:00 the round ends: the game
pauses, unanswered questions are dropped and the iPads show the winner. Arming is left alone.
ALL STOP and *New round* also stop/reset the clock.

**Referee page:** ALL STOP · round clock start/stop/reset · arm/disarm · pause game · scores ±5/±10 · rename teams ·
per-weapon on/off and manual fire · pit up/down · resets (cooldowns / scores / new round) ·
live activity log.

### Safety model
- **Boots DISARMED on every restart.** Disarmed = practice mode: answers score, nothing moves.
- Cooldowns are per weapon and **shared by both teams**, so a weapon can't be double-fired.
- Spinners and the pit are always timed: the off / pit-up follow-up is scheduled with the fire.
- **ALL STOP** disarms, cancels pending timers and sends `/spinnersoff`, armed or not.
- While disarmed, the referee's raw Pi buttons only accept `*off` commands.
- ⚠ The auto-off timers live in the Node process. If Node dies mid-spin, the spinner stays
  on until someone sends an off command.

### Old-iPad compatibility
The team iPads run **iOS 9–10 Safari**. All browser JS under `site/public/kids/` is
**ES5 + XMLHttpRequest** — no `fetch`, arrow functions, `let`/`const`, CSS variables, grid
or flex `gap`. Check before deploying:

```bash
npx acorn@8 --ecma5 --silent site/public/kids/kids-common.js
```

The pages call the API on `:3000` of whatever host served them, so they keep working if the
server's IP changes on the day.

### State
Team names, scores, enabled weapons and question history persist in
`server/kids-state.json` on the box. Armed state, cooldowns and locks are memory-only.

## Network notes

- Plug the External NIC into any 192.168.0.x LAN (a venue router, or a routed VLAN at home)
  and point browsers at `http://192.168.0.102/`.
- **Never put another 192.168.80.x network on the venue/home router.** Its gateway would
  collide with the server's Internal NIC; the 80.x side belongs to the server alone.
- Pi endpoints are bare **GET triggers** (`/pitup`, `/flipper`, `/spinner1` …). Never probe
  them to "test" — a GET moves hardware.

## Security checks

- **CodeQL** (`.github/workflows/codeql.yml`, security-extended queries) runs on every push,
  every PR and weekly. Results: *Security → Code scanning* on GitHub.
- **Dependabot** (`.github/dependabot.yml`) watches `site/server` npm packages weekly.
- Before going public (2 Oct 2026) the repo was swept with `npm audit` (6 → 0 after
  updates), Semgrep (JS, Node, Express, XSS, OWASP Top 10, secrets, gitleaks — no real
  findings) and a history check for PINs and network identifiers.

## Known quirks

- Moonraker returns odd responses after `G28`; the crane home route deliberately treats them as success.
- `/api/debug-routes` returns `[]` under Express 5 (`app._router` no longer exists).
- If the server ever shuts itself down unprompted, check activation with `slmgr /dli`
  (licensed retail as of 2 Oct 2026).

## Licence

Open source, credit required:

- **Code** ([`LICENSE`](LICENSE)): **Apache 2.0**.
- **Docs and teaching material** ([`LICENSE-docs`](LICENSE-docs)): **CC BY 4.0**. This covers
  the README, DEPLOY, `docs/`, and the STEM questions and explanations.

Use it, adapt it and run your own arena. Keep the [`NOTICE`](NOTICE) file or credit
Ben Docherty / InfoSec Battle Bots. The IBB name and logo are not licensed for reuse.
