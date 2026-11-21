/* Bahan homemade: bahan olahan dari Bank of Goods yang hasilnya masuk lagi ke Bank of Goods. */
(function () {
  'use strict';
  var CC = window.CC, esc = CC.esc, rp = CC.rp, nf0 = CC.nf0, nf2 = CC.nf2, NB = CC.NB, num = CC.numOrNull, uid = CC.uid,
    toast = CC.toast, openDlg = CC.openDlg, closeDlg = CC.closeDlg, dlgHead = CC.dlgHead, $ = CC.$, view = CC.view,
    dlg = CC.dlg, leader = CC.leader, openConfirm = CC.openConfirm, UNITS = CC.UNITS;
  function S() { return CC.state; }
  function rpS(n) { return 'Rp' + NB + (n >= 100 ? nf0 : nf2).format(n); }

  function hmById(id) { return CC.homemadeById(id); }
  function current() {
    var st = S(), u = CC.ui;
    var hm = hmById(u.homemadeId) || st.homemades[0] || null;
    if (hm) u.homemadeId = hm.id;
    return hm;
  }
  function ingOf(hm) { return CC.ingById(hm.ingId); }

  /* bahan yang bergantung pada resep ini tidak boleh dipilih, supaya tidak saling memanggil */
  function dependsOn(ing, hmId, depth) {
    if (!ing || !ing.homemadeId) return false;
    if (ing.homemadeId === hmId) return true;
    if ((depth || 0) > 8) return true;
    var h2 = hmById(ing.homemadeId);
    return !!h2 && h2.lines.some(function (l) { return dependsOn(CC.ingById(l.ingId), hmId, (depth || 0) + 1); });
  }
  function candidates(hm) {
    return S().ingredients.filter(function (i) { return i.id !== hm.ingId && !dependsOn(i, hm.id); });
  }

  function lineHTML(hm, l, calc) {
    var ing = CC.ingById(l.ingId), id = esc(l.id);
    var opts = candidates(hm).map(function (i) {
      return '<option value="' + esc(i.id) + '"' + (i.id === l.ingId ? ' selected' : '') + '>' + esc(i.name) + '</option>';
    }).join('');
    if (!ing) opts = '<option value="" selected>Bahan sudah dihapus</option>' + opts;
    var units = ing ? CC.unitOptions(ing) : [l.unit];
    var uopts = units.map(function (u) { return '<option value="' + u + '"' + (u === l.unit ? ' selected' : '') + '>' + UNITS[u].label + '</option>'; }).join('');
    return '<li class="line">' +
      '<div class="field ing"><label for="hi-' + id + '">Bahan dari Bank of Goods</label><select id="hi-' + id + '" data-hf="ing" data-id="' + id + '">' + opts + '</select></div>' +
      '<div class="field qty"><label for="hq-' + id + '">Jumlah</label><input id="hq-' + id + '" type="number" inputmode="decimal" min="0" step="any" data-hf="qty" data-id="' + id + '" value="' + (l.qty > 0 ? esc(l.qty) : '') + '"></div>' +
      '<div class="field unit"><label for="hu-' + id + '">Satuan</label><select id="hu-' + id + '" data-hf="unit" data-id="' + id + '">' + uopts + '</select></div>' +
      '<div class="field cost"><span class="lbl">Biaya</span>' + CC.costOutHTML(l.id, calc.per[l.id]).replace('data-cost=', 'data-hcost=') + '</div>' +
      '<button type="button" class="btn rm" data-act="hm-rm-line" data-id="' + id + '" aria-label="Hapus baris ' + esc(ing ? ing.name : 'bahan') + '">Hapus</button></li>';
  }

  function outHTML(hm, c) {
    var u = UNITS[hm.base].label, big = hm.base === 'ml' ? 'liter' : 'kg';
    var h = '<h2 id="h-hm-out">Struk bahan homemade</h2>';
    h += leader('Biaya semua bahan', rp(c.total));
    if (c.massIn != null) h += leader('Bahan masuk', nf2.format(Math.round(c.massIn * 100) / 100) + ' ' + u);
    h += leader('Hasil jadi', c.yield ? nf2.format(c.yield) + ' ' + u : 'Belum diisi');
    if (c.shrink != null) h += leader(c.shrink >= 0 ? 'Susut dari bahan masuk' : 'Bertambah dari bahan masuk', nf2.format(Math.abs(c.shrink)) + '%');
    h += leader('Harga per ' + u, c.perBase != null ? rpS(c.perBase) : 'Belum bisa dihitung', 'total');
    if (c.perBase != null) h += leader('Harga per ' + big, rp(c.perBase * 1000));
    var ing = ingOf(hm), n = ing ? CC.usedIn(ing.id).length : 0;
    h += '<p class="note">Tersimpan di Bank of Goods sebagai <strong>' + esc(hm.name || 'tanpa nama') + '</strong>. ' + (n ? 'Dipakai di ' + n + ' resep.' : 'Belum dipakai di resep mana pun.') + '</p>';
    if (!c.yield) h += '<p class="note warn"><strong>Isi hasil jadi.</strong> Harga per ' + u + ' dihitung dari hasil setelah dimasak, jadi bahan ini belum bisa dipakai di menu.</p>';
    if (c.missing) h += '<p class="note warn"><strong>Biaya belum lengkap.</strong> ' + c.missing + ' baris belum ada jumlah dan dihitung Rp0.</p>';
    if (c.bad) h += '<p class="note warn"><strong>' + c.bad + ' baris tidak bisa dihitung.</strong> Bahannya dihapus atau satuannya tidak cocok.</p>';
    return h;
  }

  function render() {
    var st = S(), hm = current();
    var head = '<div class="pagehead"><div><h1 id="h-hm" tabindex="-1">Bahan homemade</h1>' +
      '<p class="lede">Olah bahan dari Bank of Goods menjadi bahan baru, misalnya sirup Butterscotch. Hasilnya otomatis masuk Bank of Goods dengan harga per gram, dan ikut berubah saat harga bahan penyusunnya berubah.</p></div></div>';
    if (!hm) {
      view.innerHTML = '<section aria-labelledby="h-hm">' + head + '<div class="empty"><p>Belum ada bahan homemade.' +
        (st.ingredients.length ? ' Buat yang pertama, lalu pilih bahan penyusunnya dari Bank of Goods.' : ' Isi dulu bahan mentahnya di <a href="#bank">Bank of Goods</a>, misalnya gula halus, butter, gula merah, dan susu evaporasi.') +
        '</p><button type="button" class="btn primary" data-act="hm-new">Buat bahan homemade</button></div></section>';
      return;
    }
    var c = CC.calcHomemade(hm, 0), u = UNITS[hm.base].label;
    var sel = st.homemades.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === hm.id ? ' selected' : '') + '>' + esc(x.name || 'Tanpa nama') + '</option>'; }).join('');
    var none = !candidates(hm).length;
    view.innerHTML = '<section aria-labelledby="h-hm">' + head +
      '<div class="picker"><div class="field"><label for="hm-sel">Bahan homemade</label><select id="hm-sel">' + sel + '</select></div>' +
      '<button type="button" class="btn" data-act="hm-new">Bahan homemade baru</button>' +
      '<button type="button" class="btn" data-act="hm-cook"' + (hm.yieldQty > 0 && hm.lines.length ? '' : ' disabled') + '>Catat masak</button>' +
      '<button type="button" class="btn danger" data-act="hm-del">Hapus</button></div>' +
      '<div class="editor"><div class="fields">' +
      '<div class="field wide"><label for="hm-name">Nama bahan</label><input id="hm-name" type="text" autocomplete="off" data-hmf="name" value="' + esc(hm.name) + '"></div>' +
      '<div class="field"><label for="hm-yield">Hasil jadi setelah dimasak (' + u + ')</label><input id="hm-yield" type="number" inputmode="decimal" min="0" step="any" data-hmf="yieldQty" value="' + (hm.yieldQty > 0 ? esc(hm.yieldQty) : '') + '" aria-describedby="hm-yield-h"><span class="hint" id="hm-yield-h">Timbang hasil akhir. Harga per ' + u + ' dibagi dari angka ini.</span></div>' +
      '<div class="field"><label for="hm-dens">Berat jenis (gram per ml), opsional</label><input id="hm-dens" type="number" inputmode="decimal" min="0" step="any" data-hmf="density" value="' + (hm.density > 0 ? esc(hm.density) : '') + '" aria-describedby="hm-dens-h"><span class="hint" id="hm-dens-h">Isi bila bahan ini dipakai di resep dengan satuan gram dan ml.</span></div>' +
      '<div class="field wide"><label for="hm-note">Catatan cara membuat, opsional</label><input id="hm-note" type="text" autocomplete="off" data-hmf="note" value="' + esc(hm.note || '') + '"></div></div>' +
      '<div class="struk" id="hm-out" aria-labelledby="h-hm-out">' + outHTML(hm, c) + '</div>' +
      '<div class="sections"><section class="sec" aria-labelledby="h-hm-lines"><header><h2 id="h-hm-lines">Bahan yang dipakai</h2><p class="hint">Pilih dari Bank of Goods. Bahan homemade lain juga boleh dipakai.</p></header>' +
      (hm.lines.length ? '<ul class="lines">' + hm.lines.map(function (l) { return lineHTML(hm, l, c); }).join('') + '</ul>' : '<p class="line-empty">Belum ada bahan di resep ini.</p>') +
      '<div><button type="button" class="btn" data-act="hm-add-line"' + (none ? ' disabled' : '') + '>Tambah bahan</button>' +
      (none ? ' <span class="hint">Isi Bank of Goods dulu.</span>' : '') + '</div></section>' + cookHistoryHTML(hm) + '</div></div></section>';
  }
  function cookHistoryHTML(hm) {
    var u = UNITS[hm.base].label;
    var list = S().hmBatches.filter(function (b) { return b.hmId === hm.id; }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    return '<section class="sec" aria-labelledby="h-hm-cook"><header><h2 id="h-hm-cook">Riwayat masak</h2><p class="hint">Tiap catatan menambah stok bahan ini dan mengurangi stok bahan penyusunnya di Stok bahan.</p></header>' +
      (list.length ? '<ul class="hist">' + list.map(function (b) {
        return '<li><span>' + esc(CC.fmtDate(b.date)) + ': hasil ' + nf2.format(b.qty) + ' ' + u + (b.note ? ', ' + esc(b.note) : '') + '</span>' +
          '<button type="button" class="btn" data-act="hm-cook-del" data-id="' + esc(b.id) + '" aria-label="Hapus catatan masak ' + esc(CC.fmtDate(b.date)) + '">Hapus</button></li>';
      }).join('') + '</ul>' : '<p class="line-empty">Belum ada catatan masak.</p>') + '</section>';
  }
  function cookPreview(hm, qty) {
    var u = UNITS[hm.base].label, use = CC.usageForHm(hm, qty);
    if (!(qty > 0)) return '<span class="hint">Isi hasil masak untuk melihat bahan yang terpakai.</span>';
    return '<strong>Bahan terpakai</strong>' + use.map(function (x) {
      var ing = CC.ingById(x.ingId);
      return leader(esc(ing ? ing.name : 'bahan'), nf2.format(Math.round(x.base * 100) / 100) + ' ' + UNITS[ing.base].label);
    }).join('') + leader('Biaya per ' + u, rpS(CC.calcHomemade(hm, 0).perBase || 0));
  }
  function openCook() {
    var hm = current(); if (!hm) return;
    var u = UNITS[hm.base].label;
    openDlg(dlgHead('Catat masak ' + esc(hm.name)) + '<form id="f-cook" novalidate>' +
      '<div class="grid2"><div class="field"><label for="ck-date">Tanggal masak</label><input id="ck-date" type="date" value="' + CC.todayISO() + '"></div>' +
      '<div class="field"><label for="ck-qty">Hasil jadi aktual (' + u + ')</label><input id="ck-qty" type="number" inputmode="decimal" min="0" step="any" value="' + esc(hm.yieldQty) + '"></div></div>' +
      '<div class="field"><label for="ck-note">Catatan, opsional</label><input id="ck-note" type="text" autocomplete="off"></div>' +
      '<div class="mat" id="ck-prev" aria-live="polite">' + cookPreview(hm, hm.yieldQty) + '</div><p class="err" id="ck-err" role="alert"></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="close">Batal</button><button type="submit" class="btn primary">Simpan catatan</button></div></form>', '#ck-qty');
  }
  function refresh() {
    var hm = current(); if (!hm) return;
    var c = CC.calcHomemade(hm, 0), o = $('#hm-out'); if (o) o.innerHTML = outHTML(hm, c);
    hm.lines.forEach(function (l) {
      var el = view.querySelector('[data-hcost="' + l.id + '"]');
      if (el) { var t = document.createElement('div'); t.innerHTML = CC.costOutHTML(l.id, c.per[l.id]).replace('data-cost=', 'data-hcost='); el.replaceWith(t.firstChild); }
    });
  }

  function openNew() {
    openDlg(dlgHead('Bahan homemade baru') +
      '<form id="f-hm-new" novalidate><div class="field"><label for="hn-name">Nama bahan</label><input id="hn-name" type="text" autocomplete="off"></div>' +
      '<fieldset class="seg"><legend>Satuan hasil dan harga</legend><label><input type="radio" name="hn-base" value="g" checked>Gram</label><label><input type="radio" name="hn-base" value="ml">Mililiter</label></fieldset>' +
      '<p class="err" id="hn-err" role="alert"></p><div class="actions"><button type="button" class="btn" data-act="close">Batal</button><button type="submit" class="btn primary">Buat bahan</button></div></form>', '#hn-name');
  }
  function nameTaken(name, exceptIngId) {
    return S().ingredients.some(function (i) { return i.id !== exceptIngId && i.name.toLowerCase() === name.toLowerCase(); });
  }
  function submitNew() {
    var name = $('#hn-name', dlg).value.trim(), err = $('#hn-err', dlg);
    var base = ($('input[name="hn-base"]:checked', dlg) || {}).value || 'g';
    if (!name) { err.textContent = 'Isi nama bahan.'; $('#hn-name', dlg).focus(); return; }
    if (nameTaken(name)) { err.textContent = 'Sudah ada bahan dengan nama ini di Bank of Goods. Pakai nama lain.'; $('#hn-name', dlg).focus(); return; }
    var hid = uid('h'), iid = uid('i');
    S().homemades.push({ id: hid, name: name, base: base, yieldQty: null, density: null, note: '', ingId: iid, lines: [] });
    S().ingredients.push({ id: iid, name: name, base: base, density: null, purchases: [], homemadeId: hid });
    CC.ui.homemadeId = hid; CC.save(); closeDlg(); location.hash === '#homemade' ? CC.render() : (location.hash = '#homemade');
    toast('Bahan "' + name + '" dibuat dan masuk ke Bank of Goods.');
  }

  CC.addRoute('homemade', { label: 'Bahan homemade', order: 55, primary: false, render: render });

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
    var a = t.getAttribute('data-act'), id = t.getAttribute('data-id'), st = S();
    if (a === 'hm-new') openNew();
    else if (a === 'hm-add-line') {
      var hm = current(); if (!hm) return;
      var cand = candidates(hm); if (!cand.length) return;
      var nl = { id: uid('hl'), ingId: cand[0].id, qty: null, unit: CC.unitOptions(cand[0])[0] };
      hm.lines.push(nl); CC.save(); render(); var f = $('#hi-' + nl.id); if (f) f.focus();
    }
    else if (a === 'hm-rm-line') {
      var h2 = current(); if (!h2) return;
      h2.lines = h2.lines.filter(function (l) { return l.id !== id; }); CC.save(); render();
      var b = $('[data-act="hm-add-line"]'); if (b) b.focus();
    }
    else if (a === 'hm-del') {
      var h3 = current(); if (!h3) return;
      var used = CC.usedIn(h3.ingId);
      if (used.length) openConfirm('Bahan masih dipakai', 'Bahan "' + esc(h3.name) + '" dipakai di ' + used.map(function (m) { return esc(m.name); }).join(', ') + '. Hapus barisnya dari resep itu dulu.', 'close', {}, 'Mengerti');
      else openConfirm('Hapus bahan homemade?', 'Resep "' + esc(h3.name) + '" dan bahannya di Bank of Goods akan dihapus. Ini tidak bisa dibatalkan.', 'hm-del-ok', { id: h3.id }, 'Hapus bahan');
    }
    else if (a === 'hm-del-ok') {
      var h4 = hmById(id); if (!h4) return;
      st.ingredients = st.ingredients.filter(function (i) { return i.id !== h4.ingId; });
      st.homemades = st.homemades.filter(function (h) { return h.id !== id; });
      st.hmBatches = st.hmBatches.filter(function (b) { return b.hmId !== id; });
      CC.ui.homemadeId = null; CC.save(); closeDlg(); render(); toast('Bahan homemade dihapus.');
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target, f = t.getAttribute('data-hmf'), lf = t.getAttribute('data-hf');
    if (!f && !lf) return;
    var hm = current(); if (!hm) return;
    if (f) {
      if (f === 'name') { hm.name = t.value; }
      else if (f === 'note') hm.note = t.value;
      else {
        hm[f] = num(t.value);
        if (f === 'density') { var ing = ingOf(hm); if (ing) ing.density = hm.density > 0 ? hm.density : null; }
      }
      CC.save(); refresh(); return;
    }
    if (lf === 'qty') {
      var l = hm.lines.filter(function (x) { return x.id === t.getAttribute('data-id'); })[0];
      if (l) { l.qty = num(t.value); CC.save(); refresh(); }
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'hm-sel') { CC.ui.homemadeId = t.value; render(); var f = $('#hm-sel'); if (f) f.focus(); return; }
    var hm = current(); if (!hm) return;
    if (t.id === 'hm-name') {
      var nm = t.value.trim(), ing = ingOf(hm);
      if (!nm) { t.value = hm.name; toast('Nama bahan tidak boleh kosong.'); return; }
      if (nameTaken(nm, hm.ingId)) { t.value = hm.name; toast('Nama itu sudah dipakai bahan lain.'); return; }
      hm.name = nm; if (ing) ing.name = nm; CC.save();
      var opt = $('#hm-sel option:checked'); if (opt) opt.textContent = nm;
      refresh(); return;
    }
    var lf = t.getAttribute('data-hf'); if (!lf) return;
    var l = hm.lines.filter(function (x) { return x.id === t.getAttribute('data-id'); })[0]; if (!l) return;
    if (lf === 'ing') {
      l.ingId = t.value; var ig = CC.ingById(l.ingId);
      if (ig && CC.unitOptions(ig).indexOf(l.unit) < 0) l.unit = CC.unitOptions(ig)[0];
      CC.save(); render(); var f2 = $('#hi-' + l.id); if (f2) f2.focus();
    } else if (lf === 'unit') { l.unit = t.value; CC.save(); refresh(); }
  });

  CC.recordCook = function (hmId, date, qty, note, via) {
    var hm = CC.homemadeById(hmId); if (!hm) return null;
    var rec = { id: uid('hb'), date: date, hmId: hm.id, qty: qty, usage: CC.usageForHm(hm, qty), note: note || '' };
    if (via) rec.via = via;
    S().hmBatches.push(rec); CC.save();
    return rec;
  };
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.id === 'f-hm-new') submitNew();
    else if (f.id === 'f-cook') {
      var hm = current(), qty = num($('#ck-qty', dlg).value), date = $('#ck-date', dlg).value, err = $('#ck-err', dlg);
      if (!hm) return;
      if (!date) { err.textContent = 'Pilih tanggal masak.'; return; }
      if (!(qty > 0)) { err.textContent = 'Isi hasil jadi yang lebih dari 0.'; $('#ck-qty', dlg).focus(); return; }
      CC.recordCook(hm.id, date, qty, $('#ck-note', dlg).value.trim());
      closeDlg(); render(); toast('Catatan masak disimpan, stok diperbarui.');
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'ck-qty') return;
    var hm = current(); if (hm) $('#ck-prev', dlg).innerHTML = cookPreview(hm, num(e.target.value));
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
    var a = t.getAttribute('data-act');
    if (a === 'hm-cook') openCook();
    else if (a === 'hm-cook-del') {
      var id = t.getAttribute('data-id');
      S().hmBatches = S().hmBatches.filter(function (b) { return b.id !== id; }); CC.save(); render(); toast('Catatan masak dihapus.');
    }
  });
})();
