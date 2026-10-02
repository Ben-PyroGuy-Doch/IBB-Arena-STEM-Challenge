// kids.js
// "Earn to Fire" - STEM quiz game for the kids' arena event.
// Two team iPads answer robot-themed questions; a right answer fires that weapon
// and scores its points. An admin page arms/disarms the hardware and resets things.
//
// Safety model:
//   - Hardware only ever moves when the admin has ARMED the arena (off at every start).
//   - Every weapon has a shared cooldown, so two teams cannot double-fire it.
//   - Spinners and the pit are timed: the "after" action (off / pit up) always follows.
//   - ALL STOP disarms, cancels pending timers and sends spinnersoff, armed or not.

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var BANK = require('./kids-questions');

// Pi paths each weapon triggers. `after` runs `secs` later (auto-off / pit back up).
// When `fire` is a list, one entry is picked at random per fire - spinners use this to run
// forwards or in reverse unpredictably. Keep `cooldown` longer than `after.secs`.
var WEAPONS = [
  { id: 'flipper',  label: 'Flipper',    icon: '⚡',           topic: 'Forces & Levers',        points: 10, cooldown: 8,
    fire: '/flipper' },
  { id: 'pit',      label: 'The Pit',    icon: '🕳️', topic: 'Circuits & Electricity', points: 15, cooldown: 20,
    fire: '/pitdown', after: { secs: 10, path: '/pitup' } },
  { id: 'spinner1', label: 'Spinner 1',  icon: '⚙️',     topic: 'Gears & Motion',         points: 20, cooldown: 15,
    fire: ['/spinner1', '/spinner1r'], after: { secs: 8, path: '/spinner1off' } },
  { id: 'spinner2', label: 'Spinner 2',  icon: '💻',     topic: 'Code & Logic',           points: 20, cooldown: 15,
    fire: ['/spinner2', '/spinner2r'], after: { secs: 8, path: '/spinner2off' } },
  { id: 'spinner3', label: 'Spinner 3',  icon: '🤖',     topic: 'Sensors & Robot Brains', points: 20, cooldown: 15,
    fire: ['/spinner3', '/spinner3r'], after: { secs: 8, path: '/spinner3off' } },
  { id: 'mega',     label: 'MEGA SPIN',  icon: '🌪️', topic: 'Boss Challenge',        points: 50, cooldown: 30,
    fire: ['/spinners', '/spinnersr'], after: { secs: 10, path: '/spinnersoff' } }
];
var BY_ID = {};
WEAPONS.forEach(function (w) { BY_ID[w.id] = w; });

// Pi paths the admin may send directly. Anything else is refused.
var ADMIN_PI_PATHS = ['/pitup', '/pitdown', '/flipper',
  '/spinner1', '/spinner1off', '/spinner2', '/spinner2off', '/spinner3', '/spinner3off',
  '/spinners', '/spinnersoff'];

var TEAMS = ['red', 'blue'];
var WRONG_LOCK_SECS = 15;   // a team that answers wrong waits this long on that weapon
var ANSWER_WINDOW_SECS = 120; // a question expires if left unanswered this long

// Bot fight scoring. Each team has two bots in the arena; the referee taps when one is pitted.
// A team's bot points = seconds survived by all its bots + a bonus per enemy bot pitted.
// When both of a team's bots are pitted it's a knockout and the round ends.
var BOTS = [
  { id: 'red1',  team: 'red',  name: 'Red Bot 1' },
  { id: 'red2',  team: 'red',  name: 'Red Bot 2' },
  { id: 'blue1', team: 'blue', name: 'Blue Bot 1' },
  { id: 'blue2', team: 'blue', name: 'Blue Bot 2' }
];
var SURVIVE_PTS_PER_SEC = 1;  // per bot, per second it is still in while the clock runs
var PIT_BONUS = 50;           // to the other team for each bot pitted

var STATE_FILE = path.join(__dirname, 'kids-state.json');
var CONFIG_FILE = path.join(__dirname, 'kids-config.json');

module.exports = function (app, opts) {
  var piBase = opts.piBase;
  var http = opts.http;

  // ---------- config (admin PIN) ----------
  var config = {};
  try { config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { config = {}; }
  if (!config.adminPin) {
    config.adminPin = String(crypto.randomInt(100000, 1000000));
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('KIDS: generated admin PIN in ' + CONFIG_FILE);
  }

  // ---------- state ----------
  // Persisted: names, scores, enabled weapons, questions already asked.
  // Never persisted: armed (always boots disarmed), cooldowns, locks, pending questions.
  var state = {
    gameOn: true,
    armed: false,
    // score = STEM points; bot = banked bot-fight points; wins = fights won
    teams: { red: { name: 'Red Team', score: 0, bot: 0, wins: 0 }, blue: { name: 'Blue Team', score: 0, bot: 0, wins: 0 } },
    botNames: {},
    enabled: {},
    asked: { red: {}, blue: {} },
    busyUntil: {},
    lockUntil: { red: {}, blue: {} },
    pending: { red: null, blue: null },
    log: []
  };
  WEAPONS.forEach(function (w) { state.enabled[w.id] = true; });
  BOTS.forEach(function (b) { state.botNames[b.id] = b.name; });

  try {
    var saved = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (saved.teams) TEAMS.forEach(function (t) {
      var x = saved.teams[t];
      if (x) state.teams[t] = { name: x.name, score: x.score || 0, bot: x.bot || 0, wins: x.wins || 0 };
    });
    if (saved.enabled) Object.keys(saved.enabled).forEach(function (k) { if (k in BY_ID) state.enabled[k] = !!saved.enabled[k]; });
    if (saved.asked) TEAMS.forEach(function (t) { if (saved.asked[t]) state.asked[t] = saved.asked[t]; });
    if (typeof saved.gameOn === 'boolean') state.gameOn = saved.gameOn;
    if (saved.botNames) BOTS.forEach(function (b) { if (saved.botNames[b.id]) state.botNames[b.id] = saved.botNames[b.id]; });
  } catch (e) { /* first run */ }

  // ---------- round timer ----------
  // Starting the clock starts the game; when it runs out the game pauses (no new
  // questions, unanswered ones are dropped). Armed state is left alone.
  var timer = { duration: 120, remaining: 120, endsAt: 0, running: false, over: false, reason: '' };
  var timerHandle = null;

  // The current bot fight = one run of the clock. pitted[botId] is seconds into the round.
  // Points are added to teams[t].bot once, when the round ends ("banked").
  var fight;
  function newFight() {
    fight = { pitted: {}, banked: false };
    BOTS.forEach(function (b) { fight.pitted[b.id] = null; });
  }
  newFight();

  var BOT_BY_ID = {};
  BOTS.forEach(function (b) { BOT_BY_ID[b.id] = b; });

  function other(t) { return t === 'red' ? 'blue' : 'red'; }
  function elapsed() { return timer.duration - timerLeft(); }
  function teamBots(t) { return BOTS.filter(function (b) { return b.team === t; }); }
  function botsIn(t) { return teamBots(t).filter(function (b) { return fight.pitted[b.id] === null; }).length; }

  function botView(b) {
    var p = fight.pitted[b.id];
    return { id: b.id, team: b.team, name: state.botNames[b.id], pitted: p, survived: p !== null ? p : elapsed() };
  }

  // Live bot-fight figures for one team.
  function botNow(t) {
    var survived = 0;
    teamBots(t).forEach(function (b) { survived += botView(b).survived; });
    var pits = teamBots(other(t)).length - botsIn(other(t));
    var bonus = pits * PIT_BONUS;
    return { survived: survived, bonus: bonus, pts: survived * SURVIVE_PTS_PER_SEC + bonus, botsIn: botsIn(t) };
  }

  // More bots still in wins; equal is a draw. A knockout always leaves the winner with >= 1.
  function fightWinner() {
    var r = botsIn('red'), b = botsIn('blue');
    return r > b ? 'red' : (b > r ? 'blue' : null);
  }

  function bankFight() {
    if (fight.banked || elapsed() <= 0) return;
    TEAMS.forEach(function (t) { state.teams[t].bot += botNow(t).pts; });
    var w = fightWinner();
    if (w) state.teams[w].wins += 1;
    fight.banked = true;
    log('Bot fight: ' + (w ? state.teams[w].name + ' win' : 'draw') +
        ' (red ' + botNow('red').pts + ', blue ' + botNow('blue').pts + ' bot pts)');
  }

  function timerLeft() {
    return timer.running ? Math.max(0, Math.ceil((timer.endsAt - now()) / 1000)) : timer.remaining;
  }

  function timerView() {
    return { duration: timer.duration, left: timerLeft(), running: timer.running, over: timer.over, reason: timer.reason };
  }

  // reason: 'time' (clock hit 0) or 'ko' (all of one team's bots pitted)
  function roundOver(reason) {
    clearTimeout(timerHandle);
    timerHandle = null;
    timer.remaining = timerLeft();
    timer.running = false;
    timer.over = true;
    timer.reason = reason || 'time';
    state.gameOn = false;
    state.pending = { red: null, blue: null };
    bankFight();
    save();
    var sv = scoreView();
    log('ROUND OVER (' + timer.reason + ') - ' + sv[0].name + ' ' + sv[0].score + ', ' + sv[1].name + ' ' + sv[1].score);
  }

  function timerStart() {
    if (timer.running) return;
    if (timer.over || timer.remaining <= 0) { timer.remaining = timer.duration; newFight(); }
    timer.running = true;
    timer.over = false;
    timer.reason = '';
    timer.endsAt = now() + timer.remaining * 1000;
    timerHandle = setTimeout(function () { roundOver('time'); }, timer.remaining * 1000);
    state.gameOn = true;
    save();
    log('Round clock started (' + timer.remaining + 's)');
  }

  function timerStop() {
    if (!timer.running) return;
    timer.remaining = timerLeft();
    timer.running = false;
    clearTimeout(timerHandle);
    timerHandle = null;
    state.gameOn = false;
    state.pending = { red: null, blue: null };
    save();
    log('Round clock stopped at ' + timer.remaining + 's');
  }

  function timerReset(secs) {
    clearTimeout(timerHandle);
    timerHandle = null;
    if (secs) timer.duration = Math.max(10, Math.min(1800, secs));
    timer.remaining = timer.duration;
    timer.running = false;
    timer.over = false;
    timer.reason = '';
    newFight();  // an unfinished fight is thrown away, never banked
    log('Round clock reset to ' + timer.duration + 's');
  }

  function save() {
    var out = { gameOn: state.gameOn, teams: state.teams, botNames: state.botNames, enabled: state.enabled, asked: state.asked };
    fs.writeFile(STATE_FILE, JSON.stringify(out, null, 2), function (err) {
      if (err) console.error('KIDS: could not save state', err.message);
    });
  }

  function log(msg) {
    state.log.unshift({ t: Date.now(), msg: msg });
    if (state.log.length > 60) state.log.length = 60;
    console.log('KIDS:', msg);
  }

  // ---------- hardware ----------
  var timers = [];

  function hit(piPath) {
    return http.get(piBase + piPath).then(function () {
      log('Pi ' + piPath + ' OK');
      return true;
    }).catch(function (err) {
      log('Pi ' + piPath + ' FAILED (' + (err.code || err.message) + ')');
      return false;
    });
  }

  // Fires a weapon if armed. Returns a promise of a short note for the iPad.
  function fire(w, who) {
    state.busyUntil[w.id] = Date.now() + w.cooldown * 1000;
    if (!state.armed) {
      log(who + ' earned ' + w.label + ' (arena not armed - no hardware)');
      return Promise.resolve('practice');
    }
    var pick = Array.isArray(w.fire) ? crypto.randomInt(0, w.fire.length) : -1;
    var path = pick === -1 ? w.fire : w.fire[pick];
    log(who + ' FIRED ' + w.label + (pick === 1 ? ' (reverse)' : pick === 0 ? ' (forward)' : ''));
    return hit(path).then(function (ok) {
      if (w.after) {
        // The follow-up runs even if the fire call errored: the Pi may have acted anyway.
        timers.push(setTimeout(function () { hit(w.after.path); }, w.after.secs * 1000));
      }
      return ok ? 'fired' : 'hw-error';
    });
  }

  function allStop(who) {
    state.armed = false;
    timerStop();
    timers.forEach(clearTimeout);
    timers = [];
    log('ALL STOP by ' + who + ' - disarmed');
    return hit('/spinnersoff');
  }

  // ---------- helpers ----------
  function now() { return Date.now(); }
  function secsLeft(ts) { return ts && ts > now() ? Math.ceil((ts - now()) / 1000) : 0; }
  function validTeam(t) { return TEAMS.indexOf(t) !== -1; }

  function weaponView(team) {
    return WEAPONS.map(function (w) {
      return {
        id: w.id, label: w.label, icon: w.icon, topic: w.topic, points: w.points,
        enabled: state.enabled[w.id],
        busy: secsLeft(state.busyUntil[w.id]),
        locked: team ? secsLeft(state.lockUntil[team][w.id]) : 0
      };
    });
  }

  // score = grand total (STEM + bot). Live bot points are included until the fight is banked.
  function scoreView() {
    return TEAMS.map(function (t) {
      var x = state.teams[t], b = botNow(t);
      var bot = x.bot + (fight.banked ? 0 : b.pts);
      return { id: t, name: x.name, stem: x.score, bot: bot, score: x.score + bot, wins: x.wins,
               survived: b.survived, pitBonus: b.bonus, botsIn: b.botsIn,
               bots: teamBots(t).map(botView) };
    });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = crypto.randomInt(0, i + 1);
      var x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  function pickQuestion(team, weaponId) {
    var bank = BANK[weaponId];
    var asked = state.asked[team][weaponId] || [];
    var fresh = [];
    for (var i = 0; i < bank.length; i++) if (asked.indexOf(i) === -1) fresh.push(i);
    if (!fresh.length) { asked = []; fresh = bank.map(function (_, i) { return i; }); } // bank used up: start again
    var idx = fresh[crypto.randomInt(0, fresh.length)];
    asked.push(idx);
    state.asked[team][weaponId] = asked;
    return idx;
  }

  // ---------- team API ----------
  app.get('/api/kids/state', function (req, res) {
    var team = req.query.team;
    if (!validTeam(team)) return res.status(400).json({ error: 'Unknown team' });
    var p = state.pending[team];
    res.json({
      gameOn: state.gameOn,
      armed: state.armed,
      team: { id: team, name: state.teams[team].name },
      scores: scoreView(),
      weapons: weaponView(team),
      timer: timerView(),
      pending: p ? p.weapon : null
    });
  });

  app.post('/api/kids/question', function (req, res) {
    var b = req.body || {};
    var team = b.team, w = BY_ID[b.weapon];
    if (!validTeam(team) || !w) return res.status(400).json({ error: 'Bad request' });
    if (!state.gameOn) return res.status(409).json({ error: 'The game is paused. Wait for the referee!' });
    if (!state.enabled[w.id]) return res.status(409).json({ error: w.label + ' is switched off right now.' });
    if (secsLeft(state.busyUntil[w.id])) return res.status(409).json({ error: w.label + ' is recharging!' });
    if (secsLeft(state.lockUntil[team][w.id])) return res.status(409).json({ error: 'Locked - try again in a moment.' });

    var idx = pickQuestion(team, w.id);
    var q = BANK[w.id][idx];
    var order = shuffle(q.o.map(function (_, i) { return i; }));
    state.pending[team] = {
      weapon: w.id, idx: idx, order: order,
      id: crypto.randomBytes(6).toString('hex'),
      expires: now() + ANSWER_WINDOW_SECS * 1000
    };
    save();
    res.json({
      qid: state.pending[team].id, weapon: w.id, label: w.label, icon: w.icon,
      topic: w.topic, points: w.points, question: q.q,
      options: order.map(function (i) { return q.o[i]; })
    });
  });

  app.post('/api/kids/answer', function (req, res) {
    var b = req.body || {};
    var team = b.team;
    if (!validTeam(team)) return res.status(400).json({ error: 'Bad request' });
    var p = state.pending[team];
    if (!p || p.id !== b.qid) {
      if (timer.over) return res.status(409).json({ error: "Time's up - the round is over!" });
      return res.status(409).json({ error: 'That question has expired. Pick a weapon again!' });
    }
    state.pending[team] = null;
    if (p.expires < now()) return res.status(409).json({ error: 'Too slow - that question expired!' });

    var w = BY_ID[p.weapon];
    var q = BANK[w.id][p.idx];
    var choice = parseInt(b.choice, 10);
    var correct = p.order[choice] === q.a;
    var who = state.teams[team].name;

    if (!correct) {
      state.lockUntil[team][w.id] = now() + WRONG_LOCK_SECS * 1000;
      log(who + ' missed a ' + w.label + ' question');
      return res.json({ correct: false, answer: q.o[q.a], explain: q.e, lock: WRONG_LOCK_SECS });
    }

    state.teams[team].score += w.points;
    save();

    // Another team may have fired it while this one was thinking: keep the points, skip the fire.
    if (secsLeft(state.busyUntil[w.id]) || !state.enabled[w.id] || !state.gameOn) {
      log(who + ' scored ' + w.points + ' on ' + w.label + ' (weapon busy - points banked)');
      return res.json({ correct: true, points: w.points, explain: q.e, result: 'banked' });
    }
    fire(w, who).then(function (result) {
      res.json({ correct: true, points: w.points, explain: q.e, result: result });
    });
  });

  // ---------- admin API ----------
  var adminTokens = {};

  app.post('/api/kids/admin/login', function (req, res) {
    var guard = opts.pinGuard;
    if (guard.locked(req.ip)) return res.status(429).json({ error: 'Too many wrong PINs - wait a minute' });
    var pin = String((req.body || {}).pin || '');
    if (pin !== String(config.adminPin)) { guard.failed(req.ip); return res.status(401).json({ error: 'Wrong PIN' }); }
    guard.clear(req.ip);
    var tok = crypto.randomBytes(16).toString('hex');
    adminTokens[tok] = true;
    log('Admin logged in from ' + req.ip);
    res.json({ token: tok });
  });

  function admin(req, res, next) {
    if (adminTokens[req.get('X-Admin-Token')]) return next();
    res.status(401).json({ error: 'Not logged in' });
  }

  app.get('/api/kids/admin/state', admin, function (req, res) {
    res.json({
      gameOn: state.gameOn, armed: state.armed,
      scores: scoreView(), weapons: weaponView(null), timer: timerView(),
      pending: { red: state.pending.red && state.pending.red.weapon, blue: state.pending.blue && state.pending.blue.weapon },
      log: state.log.slice(0, 25)
    });
  });

  app.post('/api/kids/admin/arm', admin, function (req, res) {
    state.armed = !!(req.body || {}).armed;
    log('Arena ' + (state.armed ? 'ARMED' : 'disarmed') + ' by admin');
    res.json({ ok: true, armed: state.armed });
  });

  app.post('/api/kids/admin/game', admin, function (req, res) {
    state.gameOn = !!(req.body || {}).on;
    if (!state.gameOn) { state.pending.red = null; state.pending.blue = null; timerStop(); }
    save();
    log('Game ' + (state.gameOn ? 'started' : 'paused') + ' by admin');
    res.json({ ok: true, gameOn: state.gameOn });
  });

  // Referee taps when a bot goes in the pit. undo:true takes it back (mis-tap).
  app.post('/api/kids/admin/pit', admin, function (req, res) {
    var b = req.body || {};
    var bot = BOT_BY_ID[b.bot];
    if (!bot) return res.status(400).json({ error: 'Bad bot' });
    if (fight.banked) return res.status(409).json({ error: 'That round is finished - reset the clock for a new fight' });
    var name = state.botNames[bot.id];
    if (b.undo) {
      fight.pitted[bot.id] = null;
      log('UNDO: ' + name + ' back in');
    } else {
      if (elapsed() <= 0) return res.status(409).json({ error: 'Start the round clock first' });
      if (fight.pitted[bot.id] !== null) return res.status(409).json({ error: 'Already pitted' });
      fight.pitted[bot.id] = elapsed();
      log(name + ' PITTED after ' + fight.pitted[bot.id] + 's');
      if (botsIn(bot.team) === 0) {
        log(state.teams[bot.team].name + ' KNOCKED OUT');
        roundOver('ko');
      }
    }
    res.json({ ok: true });
  });

  app.post('/api/kids/admin/botname', admin, function (req, res) {
    var b = req.body || {};
    var name = String(b.name || '').trim().slice(0, 24);
    if (!BOT_BY_ID[b.bot] || !name) return res.status(400).json({ error: 'Bad request' });
    state.botNames[b.bot] = name;
    save();
    res.json({ ok: true });
  });

  // action: 'start' | 'stop' | 'reset' (reset takes optional secs to change the round length)
  app.post('/api/kids/admin/timer', admin, function (req, res) {
    var b = req.body || {};
    if (b.action === 'start') timerStart();
    else if (b.action === 'stop') timerStop();
    else if (b.action === 'reset') timerReset(parseInt(b.secs, 10) || 0);
    else return res.status(400).json({ error: 'Bad action' });
    res.json({ ok: true, timer: timerView() });
  });

  app.post('/api/kids/admin/stop', admin, function (req, res) {
    allStop('admin').then(function (ok) { res.json({ ok: ok }); });
  });

  // scope: 'locks' (cooldowns + wrong-answer locks), 'scores', or 'all' (new round)
  app.post('/api/kids/admin/reset', admin, function (req, res) {
    var scope = (req.body || {}).scope;
    if (scope === 'locks' || scope === 'all') {
      state.busyUntil = {};
      state.lockUntil = { red: {}, blue: {} };
    }
    if (scope === 'scores' || scope === 'all') {
      TEAMS.forEach(function (t) { state.teams[t].score = 0; state.teams[t].bot = 0; state.teams[t].wins = 0; });
      timerReset();
    }
    if (scope === 'all') {
      state.asked = { red: {}, blue: {} };
      state.pending = { red: null, blue: null };
    }
    save();
    log('Admin reset: ' + scope);
    res.json({ ok: true });
  });

  app.post('/api/kids/admin/score', admin, function (req, res) {
    var b = req.body || {};
    if (!validTeam(b.team)) return res.status(400).json({ error: 'Bad team' });
    var d = parseInt(b.delta, 10) || 0;
    state.teams[b.team].score = Math.max(0, state.teams[b.team].score + d);
    save();
    log('Admin ' + (d >= 0 ? '+' : '') + d + ' to ' + state.teams[b.team].name);
    res.json({ ok: true });
  });

  app.post('/api/kids/admin/name', admin, function (req, res) {
    var b = req.body || {};
    var name = String(b.name || '').trim().slice(0, 24);
    if (!validTeam(b.team) || !name) return res.status(400).json({ error: 'Bad request' });
    state.teams[b.team].name = name;
    save();
    res.json({ ok: true });
  });

  app.post('/api/kids/admin/weapon', admin, function (req, res) {
    var b = req.body || {};
    if (!BY_ID[b.weapon]) return res.status(400).json({ error: 'Bad weapon' });
    state.enabled[b.weapon] = !!b.enabled;
    save();
    log(BY_ID[b.weapon].label + (b.enabled ? ' enabled' : ' disabled') + ' by admin');
    res.json({ ok: true });
  });

  // Fire a weapon's full sequence (incl. auto-off) on the referee's say-so. Respects ARMED.
  app.post('/api/kids/admin/fire', admin, function (req, res) {
    var w = BY_ID[(req.body || {}).weapon];
    if (!w) return res.status(400).json({ error: 'Bad weapon' });
    if (!state.armed) return res.status(409).json({ error: 'Arena is not armed' });
    fire(w, 'Admin').then(function (r) { res.json({ ok: r === 'fired', result: r }); });
  });

  // Raw Pi command (pit up/down etc.). Spinner-off commands always allowed; anything that
  // moves - including the pit in either direction - needs ARMED.
  app.post('/api/kids/admin/pi', admin, function (req, res) {
    var p = (req.body || {}).path;
    if (ADMIN_PI_PATHS.indexOf(p) === -1) return res.status(400).json({ error: 'Not allowed' });
    if (!/off$/.test(p) && !state.armed) return res.status(409).json({ error: 'Arena is not armed' });
    hit(p).then(function (ok) { res.json({ ok: ok }); });
  });

  console.log('KIDS: earn-to-fire game loaded (' + WEAPONS.length + ' weapons, arena DISARMED)');
};
