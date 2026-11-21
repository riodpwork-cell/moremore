/* Penyimpanan bersama lewat Supabase (REST + Auth email/sandi). Bentuknya meniru db artifact
   (collection, doc get/set/delete, onSnapshot) supaya sync.js tidak perlu tahu bedanya.
   onSnapshot memakai polling berkala, bukan realtime. */
(function () {
  'use strict';
  var SKEY = 'coffeecost.sb.session', POLL = 5000;
  var memSess = null;

  function loadSess() { try { return JSON.parse(window.localStorage.getItem(SKEY)); } catch (e) { return memSess; } }
  function saveSess(s) { memSess = s; try { if (s) window.localStorage.setItem(SKEY, JSON.stringify(s)); else window.localStorage.removeItem(SKEY); } catch (e) { /* penyimpanan penuh atau dilarang */ } }

  function create(cfg) {
    var base = String(cfg.supabaseUrl || '').replace(/\/+$/, ''), key = cfg.supabaseKey, table = cfg.table || 'cc_docs';
    var sess = loadSess(), refreshing = null;

    function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }

    async function authCall(path, body) {
      var res;
      try {
        res = await fetch(base + '/auth/v1/' + path, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch (e) { throw err('offline', 'Tidak ada koneksi.'); }
      var j = null; try { j = await res.json(); } catch (e) { j = null; }
      if (!res.ok) {
        var c = (j && (j.error_code || j.code)) || String(res.status);
        throw err(c === 'invalid_credentials' || res.status === 400 ? 'bad-login' : c, (j && (j.msg || j.error_description)) || 'Login gagal.');
      }
      return j;
    }
    function keep(j) {
      sess = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000, email: (j.user && j.user.email) || (sess && sess.email) || '' };
      saveSess(sess);
    }
    async function signIn(email, pass) { keep(await authCall('token?grant_type=password', { email: email, password: pass })); }
    function signOut() { sess = null; saveSess(null); }
    function signedIn() { return !!(sess && sess.refresh); }
    async function fresh() {
      if (!sess) throw err('no-login', 'Belum masuk.');
      if (sess.exp - Date.now() > 60000) return sess.access;
      if (!refreshing) {
        refreshing = authCall('token?grant_type=refresh_token', { refresh_token: sess.refresh }).then(keep, function (e) {
          if (e.code !== 'offline') signOut();
          throw e.code === 'offline' ? e : err('no-login', 'Sesi habis. Masuk lagi.');
        }).then(function () { refreshing = null; }, function (e) { refreshing = null; throw e; });
      }
      await refreshing; return sess.access;
    }

    async function rest(method, query, body, extra, tbl) {
      var tok = await fresh(), res;
      var headers = { apikey: key, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
      if (extra) Object.keys(extra).forEach(function (h) { headers[h] = extra[h]; });
      try {
        res = await fetch(base + '/rest/v1/' + (tbl || table) + query, { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body) });
      } catch (e) { throw err('offline', 'Tidak ada koneksi.'); }
      if (res.status === 401) throw err('no-login', 'Sesi habis. Masuk lagi.');
      if (!res.ok) {
        var j = null; try { j = await res.json(); } catch (e) { j = null; }
        var code = (j && j.code) === '42P01' ? (tbl ? 'no-inbox' : 'no-table') : (res.status === 403 || (j && j.code === '42501')) ? 'denied' : String(res.status);
        throw err(code, (j && j.message) || 'Permintaan gagal.');
      }
      if (res.status === 204) return null;
      var t = await res.text(); return t ? JSON.parse(t) : null;
    }

    var listeners = [], timer = null, lastPayload = null, first = true, polling = false;
    async function poll() {
      if (polling || !listeners.length) return; polling = true;
      try {
        var rows = await rest('GET', '?select=id,data');
        var text = JSON.stringify(rows);
        if (first || text !== lastPayload) {
          first = false; lastPayload = text;
          var snap = { docs: rows.map(function (r) { return { id: r.id, data: function () { return r.data; } }; }), size: rows.length, metadata: { fromCache: false } };
          listeners.slice().forEach(function (l) { l.ok(snap); });
        }
      } catch (e) { listeners.slice().forEach(function (l) { l.fail(e); }); first = true; }
      polling = false;
    }
    function soon(ms) { setTimeout(poll, ms || 400); }
    function visible() { return typeof document === 'undefined' || document.visibilityState !== 'hidden'; }

    var api = {
      rest: function (method, tbl, query, body, extra) { return rest(method, query, body, extra, tbl); },
      signIn: signIn, signOut: signOut, signedIn: signedIn, email: function () { return sess ? sess.email : ''; },
      collection: function () {
        return {
          doc: function (id) {
            var q = '?id=eq.' + encodeURIComponent(id);
            return {
              get: async function () {
                var rows = await rest('GET', q + '&select=id,data');
                var row = rows && rows[0];
                return { exists: !!row, id: id, data: function () { return row ? row.data : undefined; } };
              },
              set: async function (data) {
                await rest('POST', '?on_conflict=id', [{ id: id, data: data, updated_at: new Date().toISOString() }], { Prefer: 'resolution=merge-duplicates,return=minimal' });
                soon(600);
              },
              delete: async function () { await rest('DELETE', q, undefined, { Prefer: 'return=minimal' }); }
            };
          },
          onSnapshot: function (ok, fail) {
            var l = { ok: ok, fail: fail }; listeners.push(l);
            if (!timer) {
              timer = setInterval(function () { if (visible()) poll(); }, POLL);
              document.addEventListener('visibilitychange', function () { if (visible()) poll(); });
            }
            poll();
            return function () { listeners = listeners.filter(function (x) { return x !== l; }); };
          }
        };
      }
    };
    return api;
  }
  window.CCSupabase = { create: create };
})();
