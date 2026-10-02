// server.js
// Battle Bot Arena API - Windows Server friendly (CommonJS, Node 10+ safe)

const express = require('express');
const cors = require('cors');
const http = require('http');
const https = require('https');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Back-end network endpoints (override via env if needed)
const PI_BASE    = process.env.PI_BASE    || 'http://192.168.80.100:8000'; // Pit/Flipper/Spinners Pi
const CRANE_BASE = process.env.CRANE_BASE || 'http://192.168.80.101:7125'; // Mainsail/Moonraker

// Axios instance (robust defaults; no keepAlive to avoid odd stalls)
const axiosHttpAgent  = new http.Agent({ keepAlive: false });
const axiosHttpsAgent = new https.Agent({ keepAlive: false });
const axiosApi = axios.create({
  timeout: 8000,
  httpAgent: axiosHttpAgent,
  httpsAgent: axiosHttpsAgent,
});

// Middleware
app.use(cors());          // Allow cross-origin (HTML on :80 -> API on :3000)
app.use(express.json());  // Parse JSON bodies

// Simple request logger
app.use(function(req, res, next) {
  console.log(new Date().toISOString(), req.method, req.url, 'from', req.ip);
  next();
});

// ---------- Health ----------
app.get('/health', function(req, res) {
  res.json({
    ok: true,
    service: 'battle-bot-arena',
    time: new Date().toISOString(),
    piBase: PI_BASE,
    craneBase: CRANE_BASE
  });
});

// ---------- Route lister (debug) ----------
app.get('/api/debug-routes', function(req, res) {
  var routes = [];
  if (app._router && app._router.stack) {
    app._router.stack.forEach(function(layer) {
      if (layer.route && layer.route.path) {
        var methods = Object.keys(layer.route.methods || {}).map(function(m){ return m.toUpperCase(); });
        routes.push({ path: layer.route.path, methods: methods });
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        layer.handle.stack.forEach(function(h) {
          if (h.route && h.route.path) {
            var methods2 = Object.keys(h.route.methods || {}).map(function(m){ return m.toUpperCase(); });
            routes.push({ path: h.route.path, methods: methods2 });
          }
        });
      }
    });
  }
  res.json(routes);
});

// ---------- PIN Login (FIXED PINS) ----------
// PINs live in pins.json beside this file (gitignored) - see pins.example.json.
var pinToPageMap = {};
try {
  pinToPageMap = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'pins.json'), 'utf8'));
  console.log('Loaded ' + Object.keys(pinToPageMap).length + ' PINs from pins.json');
} catch (e) {
  console.error('No usable pins.json - PIN login disabled:', e.message);
}

// Brute-force guard: 5 wrong PINs from one address locks it out for 60 s.
var pinFails = {};
function pinLocked(ip) {
  var f = pinFails[ip];
  return f && f.until > Date.now();
}
function pinFailed(ip) {
  var f = pinFails[ip] || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) { f.n = 0; f.until = Date.now() + 60000; console.log('PIN lockout for ' + ip); }
  pinFails[ip] = f;
}

app.post('/api/verify-pin', function(req, res) {
  if (pinLocked(req.ip)) return res.status(429).json({ success: false, error: 'Too many wrong PINs - wait a minute' });
  var pin = String((req.body || {}).pin || '');
  var entry = Object.prototype.hasOwnProperty.call(pinToPageMap, pin) ? pinToPageMap[pin] : null;
  if (!entry) { pinFailed(req.ip); return res.status(401).json({ success: false, error: 'Invalid PIN' }); }
  delete pinFails[req.ip];

  var token = Buffer.from(JSON.stringify({ role: entry.role, time: Date.now() })).toString('base64');
  return res.json({ success: true, page: entry.page, token: token });
});

// ---------- Helper: proxy to Pi ----------
function proxyToPi(res, url, okMessage) {
  axiosApi.get(url).then(function(r) {
    // Optionally: return res.status(r.status).send(r.data);
    res.send(okMessage);
  }).catch(function(err) {
    console.error('Proxy error ->', url, err.code || err.message);
    res.status(500).send('Could not reach the Pi');
  });
}

// ---------- Arena actions (Pi on 192.168.80.100:8000) ----------
// Pit
app.get('/api/pit-up',    function(req, res){ proxyToPi(res, PI_BASE + '/pitup',    'Pit Up !'); });
app.get('/api/pit-down',  function(req, res){ proxyToPi(res, PI_BASE + '/pitdown',  'Pit Down !'); });

// Flipper
app.get('/api/flipper',   function(req, res){ proxyToPi(res, PI_BASE + '/flipper',  'Flipper !'); });

// Spinner 1
app.get('/api/spinner1',    function(req, res){ proxyToPi(res, PI_BASE + '/spinner1',    'Spinner 1 On'); });
app.get('/api/spinner1r',   function(req, res){ proxyToPi(res, PI_BASE + '/spinner1r',   'Spinner 1 Reverse'); });
app.get('/api/spinner1off', function(req, res){ proxyToPi(res, PI_BASE + '/spinner1off', 'Spinner 1 Off'); });

// Spinner 2
app.get('/api/spinner2',    function(req, res){ proxyToPi(res, PI_BASE + '/spinner2',    'Spinner 2 On'); });
app.get('/api/spinner2r',   function(req, res){ proxyToPi(res, PI_BASE + '/spinner2r',   'Spinner 2 Reverse'); });
app.get('/api/spinner2off', function(req, res){ proxyToPi(res, PI_BASE + '/spinner2off', 'Spinner 2 Off'); });

// Spinner 3
app.get('/api/spinner3',    function(req, res){ proxyToPi(res, PI_BASE + '/spinner3',    'Spinner 3 On'); });
app.get('/api/spinner3r',   function(req, res){ proxyToPi(res, PI_BASE + '/spinner3r',   'Spinner 3 Reverse'); });
app.get('/api/spinner3off', function(req, res){ proxyToPi(res, PI_BASE + '/spinner3off', 'Spinner 3 Off'); });

// Global
app.get('/api/spinners',    function(req, res){ proxyToPi(res, PI_BASE + '/spinners',    'All Spinners On'); });
app.get('/api/spinnersr',   function(req, res){ proxyToPi(res, PI_BASE + '/spinnersr',   'All Spinners Reverse'); });
app.get('/api/spinnersoff', function(req, res){ proxyToPi(res, PI_BASE + '/spinnersoff', 'All Spinners Off'); });

// ---------- Crane (Mainsail/Moonraker on 192.168.80.101:7125) ----------

// Position
app.get('/api/crane/position', function(req, res) {
  axiosApi.get(CRANE_BASE + '/printer/objects/query?toolhead')
    .then(function(r) {
      var posObj = (((r.data || {}).result || {}).status || {}).toolhead || {};
      var p = posObj.position || [0,0,0,0];
      res.json({ x: p[0] || 0, y: p[1] || 0, z: p[2] || 0 });
    })
    .catch(function(err) {
      console.error('CRANE position error:', err.code || err.message);
      res.status(500).json({ error: 'Could not reach crane' });
    });
});

// Home (G28) � tolerant of Moonraker's empty/nonstandard responses
app.post('/api/crane/home', async function(req, res) {
  try {
    var r = await axiosApi.post(
      CRANE_BASE + '/printer/gcode/script',
      { script: 'G28' },
      { validateStatus: function(){ return true; } } // accept any status
    );

    if (r.status < 400) {
      return res.send('Crane homing started');
    } else {
      return res.status(200).send('Crane homing started (non-standard response)');
    }
  } catch (err) {
    console.error('CRANE home error:', err.code || err.message);
    // Homing may have started; return success to avoid UI error
    return res.status(200).send('Crane homing may have already started');
  }
});

// Relative move (X/Y/Z)
app.post('/api/crane/move', function(req, res) {
  var command = (req.body || {}).command;
  if (!command || !/^[XYZ]-?\d+$/i.test(command)) {
    return res.status(400).send('Invalid command');
  }
  var script = 'G91\nG1 ' + command.toUpperCase() + ' F5000\nG90';

  axiosApi.post(CRANE_BASE + '/printer/gcode/script', { script: script })
    .then(function(){ res.send('Move ' + command + ' OK'); })
    .catch(function(err){
      console.error('CRANE move error:', err.code || err.message);
      res.status(500).send('Could not move crane');
    });
});

// Fire: Z=0 absolute + fan on (solenoid)
app.post('/api/crane/fire', function(req, res) {
  var script = 'G90\nG1 Z0 F3000\nM106 S255';
  axiosApi.post(CRANE_BASE + '/printer/gcode/script', { script: script })
    .then(function(){ res.send('Fire: Z=0 and fan ON'); })
    .catch(function(err){
      console.error('CRANE fire error:', err.code || err.message);
      res.status(500).send('Could not execute FIRE command');
    });
});

// Release: fan off, lift Z to 220 (absolute), no homing
app.post('/api/crane/release', function(req, res) {
  var script = 'M106 S0\nG90\nG1 Z220 F6000';
  axiosApi.post(CRANE_BASE + '/printer/gcode/script', { script: script })
    .then(function(){ res.send('Release: fan OFF, Z?220'); })
    .catch(function(err){
      console.error('CRANE release error:', err.code || err.message);
      res.status(500).send('Could not execute RELEASE sequence');
    });
});

// ---------- Kids STEM "earn to fire" game ----------
require('./kids')(app, {
  piBase: PI_BASE,
  http: axiosApi,
  pinGuard: { locked: pinLocked, failed: pinFailed, clear: function (ip) { delete pinFails[ip]; } }
});

// ---------- Global error handler ----------
app.use(function(err, req, res, next) {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Unhandled server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', function() {
  console.log('API listening on http://0.0.0.0:' + PORT);
  console.log('Pi base:    ' + PI_BASE);
  console.log('Crane base: ' + CRANE_BASE);
});