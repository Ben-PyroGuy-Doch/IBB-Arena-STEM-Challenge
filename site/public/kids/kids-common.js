// kids-common.js - shared helpers for the kids' panel.
// Plain ES5 + XMLHttpRequest on purpose: the team iPads run iOS 9-10 Safari,
// which has no fetch, no arrow functions, no let/const in all contexts.

var KIDS = (function () {
  // The API is the Node server on :3000 of whatever host served this page,
  // so it keeps working when the server's IP changes on the day.
  var API = location.protocol + '//' + location.hostname + ':3000';

  function request(method, path, body, headers, cb) {
    var x = new XMLHttpRequest();
    x.open(method, API + path, true);
    x.timeout = 10000;
    if (body) x.setRequestHeader('Content-Type', 'application/json');
    if (headers) for (var k in headers) if (headers.hasOwnProperty(k)) x.setRequestHeader(k, headers[k]);
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var data = null;
      try { data = JSON.parse(x.responseText); } catch (e) { data = null; }
      if (x.status >= 200 && x.status < 300) cb(null, data);
      else cb({ status: x.status, error: (data && data.error) || (x.status ? 'Error ' + x.status : 'Cannot reach the arena server') }, data);
    };
    x.ontimeout = function () { /* readystate 4 with status 0 follows */ };
    x.send(body ? JSON.stringify(body) : null);
  }

  // Private browsing on old iOS throws on every storage write.
  function store(key, val) {
    try {
      if (val === undefined) return sessionStorage.getItem(key);
      if (val === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, val);
    } catch (e) { return null; }
  }

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  return { get: function (p, h, cb) { request('GET', p, null, h, cb); },
           post: function (p, b, h, cb) { request('POST', p, b, h, cb); },
           store: store, $: $, esc: esc, param: param };
})();
