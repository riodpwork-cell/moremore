/* Antrean aksi dari agen (tabel cc_inbox di Supabase).
   Agen memasukkan baris berstatus pending. Aplikasi memeriksa, menerapkan lewat jalur yang sama dengan Asisten
   (CC.agentApply), lalu menandai applied atau rejected. Hanya berjalan saat sinkronisasi sudah tersambung dan selaras. */
(function () {
  'use strict';
  var CC = window.CC, esc = CC.esc, view = CC.view, toast = CC.toast;
  var T = 'cc_inbox', POLL = 6000, MAXRUN = 10;
  var LABEL = { belanja: 'Belanja', masak: 'Catat masak', rekap: 'Rekap harian', pengingat: 'Pengingat', hapus_contoh: 'Hapus contoh' };
  var recent = [], st = 'wait', errMsg = '', working = false;

  function client() { return CC.syncClient && CC.syncClient(); }
  function pending(r) { return r.status === 'pending'; }
  function firstLine(s) { return String(s || '').split('\n')[0]; }
  function safeRender() { if (!CC.busyTyping || !CC.busyTyping()) CC.render(false); }

  async function patch(sb, id, body, onlyPending) {
    var q = '?id=eq.' + encodeURIComponent(id) + (onlyPending ? '&status=eq.pending' : '');
    return await sb.rest('PATCH', T, q, body, { Prefer: 'return=representation' });
  }

  async function handle(sb, row) {
    var dry = CC.agentApply(row.kind, row.payload, { dry: true });
    if (!dry.ok) {
      var rj = await patch(sb, row.id, { status: 'rejected', error: String(dry.error).slice(0, 500) }, true);
      if (rj && rj.length) toast('Agen: ' + (LABEL[row.kind] || row.kind) + ' ditolak. ' + firstLine(dry.error));
      return;
    }
    var claimed = await patch(sb, row.id, { status: 'applied' }, true);
    if (!claimed || !claimed.length) return;
    var res = CC.agentApply(row.kind, row.payload, { via: 'agen' });
    if (res.ok) {
      await patch(sb, row.id, { summary: String(res.summary || '').slice(0, 800) }, false);
      toast('Agen: ' + firstLine(res.summary));
      safeRender();
    } else {
      await patch(sb, row.id, { error: String(res.error).slice(0, 500), summary: 'Gagal diterapkan di aplikasi.' }, false);
      toast('Agen: gagal diterapkan. ' + firstLine(res.error));
    }
  }

  async function cycle() {
    if (working || document.visibilityState === 'hidden') return;
    var sb = client(); if (!sb) { if (st !== 'wait') { st = 'wait'; paint(); } return; }
    working = true;
    try {
      var rows = await sb.rest('GET', T, '?select=id,kind,payload,status,created_at,applied_at,error,summary&order=created_at.desc&limit=30');
      recent = rows || []; st = 'ok';
      var todo = recent.filter(pending).sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; }).slice(0, MAXRUN);
      for (var i = 0; i < todo.length; i++) {
        if (!CC.syncReady() || (CC.busyTyping && CC.busyTyping())) break;
        await handle(sb, todo[i]);
      }
      if (todo.length) recent = await sb.rest('GET', T, '?select=id,kind,payload,status,created_at,applied_at,error,summary&order=created_at.desc&limit=30') || recent;
    } catch (e) {
      if (e && e.code === 'no-inbox') st = 'missing'; else if (e && e.code === 'no-login') st = 'wait'; else { st = 'err'; errMsg = (e && e.code) || 'unavailable'; }
    } finally { working = false; }
    paint();
  }

  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    return CC.fmtDate(d.toISOString().slice(0, 10)) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function boxHTML() {
    if (st === 'wait') return '<p class="note">Aktif setelah sinkronisasi ke Supabase tersambung dan status "Tersinkron".</p>';
    if (st === 'missing') return '<p class="note warn"><strong>Tabel cc_inbox belum dibuat di Supabase.</strong> Agen belum bisa mengirim catatan ke aplikasi.</p>';
    if (st === 'err') return '<p class="note warn"><strong>Antrean agen tidak terbaca' + (errMsg ? ' (' + esc(errMsg) + ')' : '') + '.</strong> Dicoba lagi otomatis.</p>';
    var n = recent.filter(pending).length;
    if (!recent.length) return '<div class="empty"><p>Belum ada catatan dari agen. Catatan yang dikirim agen muncul di sini, lalu diterapkan otomatis setelah diperiksa.</p></div>';
    return '<p class="hint">' + (n ? n + ' catatan menunggu diterapkan.' : 'Tidak ada yang menunggu.') + '</p><ul class="ck">' + recent.slice(0, 10).map(function (r) {
      var pill = r.status === 'applied' ? (r.error ? '<span class="pill warn">Bermasalah</span>' : '<span class="pill good">Diterapkan</span>')
        : r.status === 'rejected' ? '<span class="pill">Ditolak</span>' : '<span class="pill warn">Menunggu</span>';
      var detail = r.error ? 'Alasan: ' + r.error : (r.summary ? firstLine(r.summary) : '');
      return '<li><span class="tx">' + esc(LABEL[r.kind] || r.kind) + '<span class="meta hint">' + esc(when(r.created_at)) + (detail ? ', ' + esc(detail) : '') + '</span></span>' + pill + '</li>';
    }).join('') + '</ul>';
  }
  function paint() { var b = document.getElementById('inbox-box'); if (b) b.innerHTML = boxHTML(); }

  CC.addRenderHook(function (r) {
    if (r !== 'pengaturan') return;
    var sec = document.createElement('section'); sec.className = 'sec'; sec.style.marginTop = '24px';
    sec.innerHTML = '<header><h2>Antrean dari agen</h2><p class="hint">Catatan yang dikirim agen dari chat Claude. Aplikasi memeriksa lalu menerapkannya sendiri, dan menolak yang datanya janggal.</p></header><div id="inbox-box"></div>';
    var root = view.querySelector('section') || view; root.appendChild(sec); paint(); cycle();
  });
  setInterval(cycle, POLL);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(cycle, 500); });
  setTimeout(cycle, 2500);
})();
