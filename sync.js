/* Sinkronisasi antar perangkat lewat Supabase (config.js + supabase.js), atau penyimpanan bersama artifact (capability db) bila dibuka di Claude.
   Data dipecah per bagian (rekap, belanja, bahan, dst.), tiap bagian punya nomor versi sendiri.
   Dua perangkat yang mengubah bagian berbeda tidak saling menimpa. Chat Asisten tetap lokal. */
(function () {
  'use strict';
  var CC = window.CC, esc = CC.esc, $ = CC.$, view = CC.view, toast = CC.toast, openDlg = CC.openDlg, closeDlg = CC.closeDlg, dlgHead = CC.dlgHead;
  var KEYS = ['settings', 'carts', 'ingredients', 'menus', 'homemades', 'batches', 'shipments', 'recaps', 'writeoffs', 'trips', 'hmBatches', 'stockAdj', 'reminders'];
  var NAMES = { settings: 'Pengaturan', carts: 'Cart', ingredients: 'Bank of Goods', menus: 'Menu dan resep', homemades: 'Bahan homemade', batches: 'Produksi', shipments: 'Pengiriman', recaps: 'Rekap harian', writeoffs: 'Pembuangan', trips: 'Belanja', hmBatches: 'Catatan masak', stockAdj: 'Stok opname', reminders: 'Pengingat' };
  var CHUNK = 80000, META = 'coffeecost.sync', COLL = 'cc';

  function S() { return CC.state; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; }
  function sigOf(k) { return hash(JSON.stringify(S()[k] === undefined ? null : S()[k])); }

  var memMeta = null;
  function loadMeta() {
    var m = null;
    try { m = JSON.parse(window.localStorage.getItem(META)); } catch (e) { m = memMeta; }
    if (!m || typeof m !== 'object') m = { base: {}, sig: {}, synced: false, last: null };
    m.base = m.base || {}; m.sig = m.sig || {}; m.rh = m.rh || {}; return m;
  }
  var meta = loadMeta();
  function saveMeta() { try { window.localStorage.setItem(META, JSON.stringify(meta)); } catch (e) { memMeta = meta; } }

  var db = null, sb = null, sbMsg = '', sbEmail = '', col = null, status = 'init', errMsg = '', remote = {}, heads = {}, snapSeen = false;
  var pushTimer = null, pushing = false, conflicts = [], applyTimer = null, askOpen = false, slowTimer = null, lastSync = meta.last;

  function isDirty(k) { return meta.sig[k] !== sigOf(k); }
  function dirtyKeys() { return KEYS.filter(isDirty); }
  function markSynced(k, ver, rh) { meta.base[k] = ver; meta.sig[k] = sigOf(k); meta.rh[k] = rh; meta.last = lastSync = Date.now(); saveMeta(); }

  /* ---------- status ---------- */
  function statusText() {
    if (status === 'local') return { t: 'Hanya di perangkat ini', warn: true };
    if (status === 'login') return { t: 'Perlu masuk', warn: true };
    if (status === 'init') return { t: 'Menghubungkan...', warn: false };
    if (status === 'slow') return { t: 'Cloud belum terjangkau', warn: true };
    if (status === 'err') return { t: 'Gagal sinkron', warn: true };
    if (status === 'conflict') return { t: 'Perlu dipilih: data berbeda', warn: true };
    if (status === 'busy') return { t: 'Menyinkronkan...', warn: false };
    if (dirtyKeys().length) return { t: 'Menunggu dikirim', warn: false };
    return { t: 'Tersinkron', warn: false };
  }
  function paintStatus() {
    var el = document.getElementById('syncst'); if (!el) return;
    var s = statusText(); el.textContent = s.t; el.className = 'syncst' + (s.warn ? ' warn' : '');
    var box = $('#sync-box'); if (box) box.innerHTML = boxHTML();
  }

  /* ---------- baca dari cloud ---------- */
  function assemble(snap) {
    var docs = {}, out = {}, hd = {};
    snap.docs.forEach(function (d) { docs[d.id] = d.data() || {}; });
    Object.keys(docs).forEach(function (id) {
      if (id.indexOf('__') > -1) return;
      var h = docs[id]; if (KEYS.indexOf(id) < 0 || typeof h.ver !== 'number') return;
      var items = [], ok = true;
      for (var i = 0; i < (h.parts || 0); i++) {
        var c = docs[id + '__' + i]; if (!c || !Array.isArray(c.items)) { ok = false; break; }
        items = items.concat(c.items);
      }
      hd[id] = { ver: h.ver, parts: h.parts || 0 };
      if (ok) out[id] = { ver: h.ver, h: h.h, kind: h.kind, value: h.kind === 'obj' ? (items[0] || {}) : items };
    });
    remote = out; heads = hd;
  }
  function onSnap(snap) {
    clearTimeout(slowTimer); snapSeen = true;
    if (snap.metadata && snap.metadata.fromCache && !snap.size && status === 'init') return;
    try { assemble(snap); } catch (e) { status = 'err'; errMsg = 'Data cloud tidak terbaca.'; paintStatus(); return; }
    if (status === 'init' || status === 'slow' || status === 'err') status = 'ok';
    reconcile();
  }
  var ERRS = { 'no-table': 'Tabel cc_docs belum dibuat di Supabase.', denied: 'Akses ditolak. Cek kebijakan RLS tabel.', offline: 'Tidak ada koneksi.' };
  function errText(code) { return ERRS[code] || code || 'unavailable'; }
  function onErr(e) {
    if (e && e.code === 'no-login') { db = null; status = 'login'; sbMsg = 'Sesi habis. Masuk lagi.'; paintStatus(); return; }
    status = 'err'; errMsg = errText(e && e.code); paintStatus();
  }

  function remoteHasAny() { return KEYS.some(function (k) { return heads[k]; }); }

  function reconcile() {
    if (pushing) return;
    if (!meta.synced) {
      if (!remoteHasAny()) { meta.synced = true; saveMeta(); schedulePush(0); paintStatus(); return; }
      askFirst(); return;
    }
    var patch = {}, vers = {}, conf = [];
    KEYS.forEach(function (k) {
      var r = remote[k], dirty = isDirty(k);
      if (r && r.h !== meta.rh[k]) {
        if (!dirty) { patch[k] = r.value; vers[k] = r; }
        else if (hash(JSON.stringify(r.value)) === sigOf(k)) { markSynced(k, r.ver, r.h); }
        else conf.push(k);
      }
    });
    conflicts = conf;
    if (Object.keys(patch).length) applyPatch(patch, vers);
    if (conf.length) { status = 'conflict'; askConflict(); }
    else if (status === 'conflict') status = 'ok';
    if (dirtyKeys().filter(function (k) { return conf.indexOf(k) < 0; }).length) schedulePush(1500);
    paintStatus();
  }

  function busyTyping() {
    var a = document.activeElement, dlg = CC.dlg;
    return (dlg && dlg.open) || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.id !== 'q');
  }
  function applyPatch(patch, vers) {
    if (busyTyping()) { clearTimeout(applyTimer); applyTimer = setTimeout(function () { reconcile(); }, 4000); return; }
    CC.applyRemote(patch);
    Object.keys(vers).forEach(function (k) { markSynced(k, vers[k].ver, vers[k].h); });
    toast('Data diperbarui dari perangkat lain.');
  }

  /* ---------- kirim ke cloud ---------- */
  function chunks(k) {
    var v = S()[k], kind = Array.isArray(v) ? 'arr' : 'obj', arr = kind === 'arr' ? v : [v], out = [], cur = [], size = 0;
    arr.forEach(function (it) {
      var n = JSON.stringify(it).length;
      if (cur.length && size + n > CHUNK) { out.push(cur); cur = []; size = 0; }
      cur.push(it); size += n;
    });
    if (cur.length || !out.length) out.push(cur);
    return { kind: kind, parts: out };
  }
  async function headOf(k) { var sn = await col.doc(k).get(); return sn && sn.exists ? sn.data() : null; }
  async function fetchRemote(k) {
    var h = await headOf(k); if (!h) return null;
    var items = [];
    for (var i = 0; i < (h.parts || 0); i++) {
      var cs = await col.doc(k + '__' + i).get(); if (!cs.exists) return null;
      items = items.concat((cs.data() || {}).items || []);
    }
    return { ver: h.ver, h: h.h, kind: h.kind, value: h.kind === 'obj' ? (items[0] || {}) : items };
  }
  /* membaca kepala dokumen di cloud sebelum dan sesudah menulis, supaya perubahan perangkat lain tidak tertimpa diam-diam */
  async function pushKey(k) {
    var hd = await headOf(k), mine = sigOf(k);
    if (hd && hd.h !== meta.rh[k]) {
      if (hd.h === mine) { markSynced(k, hd.ver, hd.h); return true; }
      return false;
    }
    var c = chunks(k), oldParts = hd ? (hd.parts || 0) : 0, ver = (hd ? hd.ver : 0) + 1;
    for (var i = 0; i < c.parts.length; i++) await col.doc(k + '__' + i).set({ items: c.parts[i] });
    await col.doc(k).set({ ver: ver, parts: c.parts.length, kind: c.kind, h: mine, updatedAt: new Date().toISOString(), device: meta.device || '' });
    if (hd) {
      await new Promise(function (r) { setTimeout(r, 120); });
      var after = await headOf(k);
      if (after && after.h !== mine) return false;
    }
    for (var j = c.parts.length; j < oldParts; j++) await col.doc(k + '__' + j).delete();
    heads[k] = { ver: ver, parts: c.parts.length };
    remote[k] = { ver: ver, h: mine, kind: c.kind, value: JSON.parse(JSON.stringify(S()[k])) };
    markSynced(k, ver, mine);
    return true;
  }
  function schedulePush(ms) {
    if (!db || !meta.synced) return;
    clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, ms);
  }
  async function pushNow() {
    if (pushing || !db || !meta.synced || !snapSeen) return;
    var ks = dirtyKeys().filter(function (k) { return conflicts.indexOf(k) < 0; });
    if (!ks.length) { paintStatus(); return; }
    pushing = true; status = 'busy'; paintStatus();
    try {
      for (var i = 0; i < ks.length; i++) {
        var pushed = await pushKey(ks[i]);
        if (!pushed && conflicts.indexOf(ks[i]) < 0) conflicts.push(ks[i]);
      }
      status = conflicts.length ? 'conflict' : 'ok'; errMsg = '';
    } catch (e) {
      if (e && e.code === 'no-login') { pushing = false; onErr(e); return; }
      status = 'err'; errMsg = errText(e && e.code);
    } finally { pushing = false; }
    paintStatus();
    if (status === 'conflict') askConflict();
    else if (dirtyKeys().length && status === 'ok') schedulePush(1500);
  }
  async function pushAll() {
    status = 'busy'; paintStatus();
    try {
      for (var i = 0; i < KEYS.length; i++) { var hd = await headOf(KEYS[i]); meta.rh[KEYS[i]] = hd ? hd.h : undefined; meta.sig[KEYS[i]] = '#'; }
      saveMeta(); conflicts = [];
    } catch (e) { status = 'err'; errMsg = errText(e && e.code); paintStatus(); return; }
    await pushNow();
  }

  /* ---------- dialog pilihan ---------- */
  function askFirst() {
    if (askOpen) return; askOpen = true; status = 'conflict'; paintStatus();
    openDlg(dlgHead('Data cloud sudah ada') +
      '<p>Perangkat ini belum pernah disinkronkan, tetapi cloud sudah berisi data dari perangkat lain. Pilih mana yang dipakai. Yang tidak dipilih akan tertimpa.</p>' +
      '<div class="actions" style="justify-content:flex-start"><button type="button" class="btn primary" data-act="sync-first-cloud">Pakai data cloud</button>' +
      '<button type="button" class="btn danger" data-act="sync-first-local">Pakai data perangkat ini</button></div>');
  }
  function askConflict() {
    if (askOpen || !conflicts.length) return; askOpen = true;
    openDlg(dlgHead('Data berbeda di dua perangkat') +
      '<p>Bagian ini diubah di perangkat lain dan di sini sejak sinkron terakhir:</p><ul>' + conflicts.map(function (k) { return '<li>' + esc(NAMES[k]) + '</li>'; }).join('') + '</ul>' +
      '<p>Pilih satu. Versi yang tidak dipilih akan tertimpa.</p>' +
      '<div class="actions" style="justify-content:flex-start"><button type="button" class="btn primary" data-act="sync-keep-cloud">Pakai versi cloud</button>' +
      '<button type="button" class="btn danger" data-act="sync-keep-local">Pakai versi perangkat ini</button></div>');
  }
  async function takeCloud(keys) {
    var patch = {}, vers = {};
    for (var i = 0; i < keys.length; i++) { var r = await fetchRemote(keys[i]); if (r) { patch[keys[i]] = r.value; vers[keys[i]] = r; } }
    CC.applyRemote(patch); Object.keys(vers).forEach(function (k) { markSynced(k, vers[k].ver, vers[k].h); });
  }
  async function keepLocal(keys) {
    for (var i = 0; i < keys.length; i++) { var hd = await headOf(keys[i]); meta.rh[keys[i]] = hd ? hd.h : undefined; meta.base[keys[i]] = hd ? hd.ver : 0; }
    saveMeta();
  }

  function doLogin() {
    if (status === 'busy') return;
    var em = $('#sb-email'), pw = $('#sb-pass'); if (!em || !pw) return;
    sbEmail = em.value.trim();
    if (!em.value.trim() || !pw.value) { sbMsg = 'Isi email dan kata sandi.'; paintStatus(); return; }
    status = 'busy'; paintStatus();
    sb.signIn(em.value.trim(), pw.value).then(function () { sbMsg = ''; snapSeen = false; connect(); }, function (er) {
      status = 'login'; sbMsg = er.code === 'bad-login' ? 'Email atau kata sandi salah.' : er.code === 'offline' ? 'Tidak ada koneksi.' : 'Login gagal: ' + er.message; paintStatus();
    });
  }
  document.addEventListener('submit', function (e) { if (e.target.id === 'sb-form') { e.preventDefault(); doLogin(); } });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
    if (t.getAttribute('data-act') === 'sb-logout') { if (sb) sb.signOut(); db = null; col = null; snapSeen = false; status = 'login'; sbMsg = ''; paintStatus(); return; }
    var a = t.getAttribute('data-act');
    if (a === 'sync-first-cloud') {
      askOpen = false; closeDlg(); meta.synced = true; status = 'busy'; paintStatus();
      takeCloud(KEYS.filter(function (k) { return heads[k]; })).then(function () {
        KEYS.forEach(function (k) { if (!heads[k]) meta.sig[k] = '#'; });
        status = 'ok'; saveMeta(); schedulePush(500); paintStatus(); toast('Memakai data cloud.');
      }, function (er) { status = 'err'; errMsg = errText(er && er.code); paintStatus(); });
    } else if (a === 'sync-first-local') {
      askOpen = false; closeDlg(); meta.synced = true; pushAll(); toast('Data perangkat ini dikirim ke cloud.');
    } else if (a === 'sync-keep-cloud') {
      askOpen = false; closeDlg(); var ks = conflicts.slice(); conflicts = [];
      takeCloud(ks).then(function () { status = 'ok'; paintStatus(); toast('Memakai versi cloud.'); }, function () { status = 'err'; paintStatus(); });
    } else if (a === 'sync-keep-local') {
      askOpen = false; closeDlg(); var kl = conflicts.slice(); conflicts = [];
      keepLocal(kl).then(function () { status = 'ok'; schedulePush(0); paintStatus(); toast('Memakai versi perangkat ini.'); }, function () { status = 'err'; paintStatus(); });
    } else if (a === 'sync-now') {
      if (!db) { connect(); return; }
      status = status === 'err' ? 'ok' : status; schedulePush(0); reconcile(); toast('Menyinkronkan...');
    } else if (a === 'sync-pull-all') {
      CC.openConfirm('Ambil semua dari cloud', 'Semua data di perangkat ini diganti dengan data di cloud. Perubahan yang belum terkirim hilang.', 'sync-pull-ok', {}, 'Ganti dengan data cloud');
    } else if (a === 'sync-pull-ok') {
      closeDlg(); conflicts = []; takeCloud(KEYS.filter(function (k) { return heads[k]; })).then(function () { status = 'ok'; paintStatus(); toast('Data diganti dengan data cloud.'); });
    } else if (a === 'sync-push-all') {
      CC.openConfirm('Timpa cloud', 'Data di cloud diganti dengan data perangkat ini. Perangkat lain akan mengikuti.', 'sync-push-ok', {}, 'Timpa cloud');
    } else if (a === 'sync-push-ok') {
      closeDlg(); pushAll(); toast('Mengirim ke cloud...');
    }
  });

  /* ---------- tampilan di Pengaturan ---------- */
  function ago(ms) {
    if (!ms) return 'belum pernah';
    var s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'baru saja'; if (s < 3600) return Math.round(s / 60) + ' menit lalu';
    if (s < 86400) return Math.round(s / 3600) + ' jam lalu'; return Math.round(s / 86400) + ' hari lalu';
  }
  function boxHTML() {
    var s = statusText(), d = dirtyKeys().length;
    if (status === 'local') {
      return '<p class="note warn"><strong>Sinkronisasi belum aktif.</strong> Isi config.js dengan alamat dan kunci publishable Supabase, atau buka halaman ini lewat Claude. Data tetap aman di perangkat ini.</p>';
    }
    if (status === 'login') {
      return '<form id="sb-form" class="stack" novalidate>' + (sbMsg ? '<p class="note warn" role="alert">' + esc(sbMsg) + '</p>' : '') +
        '<div class="field"><label for="sb-email">Email</label><input id="sb-email" type="email" autocomplete="username" inputmode="email" autocapitalize="off" value="' + esc(sbEmail) + '" required></div>' +
        '<div class="field"><label for="sb-pass">Kata sandi</label><input id="sb-pass" type="password" autocomplete="current-password" required></div>' +
        '<div class="acts"><button type="submit" class="btn primary" data-act="sb-login">Masuk</button></div></form>';
    }
    return '<div class="mat"><div class="leader"><span>Status</span><i aria-hidden="true"></i><b>' + esc(s.t) + '</b></div>' +
      '<div class="leader"><span>Terakhir sinkron</span><i aria-hidden="true"></i><b>' + esc(ago(lastSync)) + '</b></div>' +
      '<div class="leader"><span>Bagian belum terkirim</span><i aria-hidden="true"></i><b>' + d + '</b></div></div>' +
      (status === 'err' ? '<p class="note warn"><strong>Gagal sinkron' + (errMsg ? ' (' + esc(errMsg) + ')' : '') + '.</strong> Data aman di perangkat ini. Coba lagi, atau cek koneksi.</p>' : '') +
      (sb && sb.email() ? '<div class="leader"><span>Akun</span><i aria-hidden="true"></i><b>' + esc(sb.email()) + '</b></div>' : '') +
      '<div class="acts"><button type="button" class="btn primary" data-act="sync-now">Sinkronkan sekarang</button>' +
      '<button type="button" class="btn" data-act="sync-pull-all">Ambil semua dari cloud</button>' +
      '<button type="button" class="btn danger" data-act="sync-push-all">Timpa cloud</button>' +
      (sb ? '<button type="button" class="btn" data-act="sb-logout">Keluar</button>' : '') + '</div>';
  }
  CC.addRenderHook(function (r) {
    if (r !== 'pengaturan') return;
    var sec = document.createElement('section'); sec.className = 'sec'; sec.style.marginTop = '24px';
    sec.innerHTML = '<header><h2>Sinkronisasi antar perangkat</h2><p class="hint">iPhone dan laptop memakai data yang sama lewat akun Supabase. Data dicek ulang tiap beberapa detik. Chat Asisten tetap di perangkat masing-masing.</p></header><div id="sync-box"></div>';
    var root = view.querySelector('section') || view; root.appendChild(sec); paintStatus();
  });
  CC.addSaveHook(function () {
    if (!meta.device) { meta.device = 'd' + Math.random().toString(36).slice(2, 8); saveMeta(); }
    if (db && meta.synced && snapSeen) { if (dirtyKeys().length) schedulePush(1500); }
    paintStatus();
  });

  /* ---------- sambungan ---------- */
  async function connect() {
    if (!S()) { setTimeout(connect, 60); return; }
    status = 'init'; paintStatus();
    try { db = (window.claude && window.claude.use) ? await window.claude.use('db') : null; } catch (e) { db = null; }
    var cfg = window.CC_CONFIG;
    if (!db && cfg && cfg.supabaseUrl && cfg.supabaseKey && window.CCSupabase) {
      if (!sb) sb = window.CCSupabase.create(cfg);
      if (!sb.signedIn()) { status = 'login'; paintStatus(); return; }
      db = sb;
    }
    if (!db) { status = 'local'; paintStatus(); return; }
    try {
      col = db.collection(COLL);
      slowTimer = setTimeout(function () { if (!snapSeen) { status = 'slow'; paintStatus(); } }, 10000);
      col.onSnapshot(onSnap, onErr);
    } catch (e) { status = 'err'; errMsg = errText(e && e.code); paintStatus(); }
  }
  /* dipakai inbox.js: hanya aman menerapkan perubahan dari luar bila data lokal sudah selaras dengan cloud */
  CC.syncClient = function () { return db && db === sb ? sb : null; };
  CC.syncReady = function () { return !!(db && db === sb && meta.synced && snapSeen && !pushing && !conflicts.length && status === 'ok' && !askOpen); };
  CC.busyTyping = busyTyping;
  window.addEventListener('online', function () { if (db) schedulePush(500); });
  connect();
})();
