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
      (none ? ' <span class="hint">Isi Bank of Goods dulu.</span>' : '') + '</div></section>' + ratioHTML(hm) + cookHistoryHTML(hm) + '</div></div></section>';
  }
  function cookHistoryHTML(hm) {
    var u = UNITS[hm.base].label;
    var list = S().hmBatches.filter(function (b) { return b.hmId === hm.id; }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    return '<section class="sec" aria-labelledby="h-hm-cook"><header><h2 id="h-hm-cook">Riwayat masak</h2><p class="hint">Tiap catatan menambah stok bahan ini dan mengurangi stok bahan penyusunnya di Stok bahan.</p></header>' +
      (list.length ? '<ul class="hist">' + list.map(function (b) {
        var how = b.mode === 'lengkap' ? 'timbang lengkap, rasio ' + pctS(b.ratio) : b.mode === 'cepat' ? 'cepat, ' + levelName(b.level) + (b.ratio ? ' ' + pctS(b.ratio) : '') : '';
        var per = b.cost > 0 && b.qty > 0 ? ', ' + rpS(b.cost / b.qty) + ' per ' + u : '';
        return '<li><span>' + esc(CC.fmtDate(b.date)) + ': hasil ' + nf2.format(b.qty) + ' ' + u + (how ? ' (' + esc(how) + ')' : '') + per + (b.note ? ', ' + esc(b.note) : '') + '</span>' +
          '<button type="button" class="btn" data-act="hm-cook-del" data-id="' + esc(b.id) + '" aria-label="Hapus catatan masak ' + esc(CC.fmtDate(b.date)) + '">Hapus</button></li>';
      }).join('') + '</ul>' : '<p class="line-empty">Belum ada catatan masak.</p>') + '</section>';
  }
  /* ---------- catat masak: cepat (berat jadi + kekentalan) atau lengkap (timbang bahan + berat jadi) ---------- */
  var LEVELS = [{ k: 'cair', t: 'Cair' }, { k: 'kental', t: 'Kental' }, { k: 'thick', t: 'Thick' }];
  function levelName(k) { var x = LEVELS.filter(function (l) { return l.k === k; })[0]; return x ? x.t.toLowerCase() : 'kental'; }
  function pctS(r) { return r > 0 ? nf2.format(Math.round(r * 1000) / 10) + '%' : '-'; }
  function recipeMass(hm) { var c = CC.calcHomemade(hm, 0); return c && c.massIn > 0 ? c.massIn : null; }
  /* rasio = hasil jadi dibagi bahan masuk. Bila rasio kekentalan belum diisi, pakai rasio resep (hasil jadi resep / bahan resep). */
  CC.hmRatio = function (hm, level) {
    var r = hm.ratios && hm.ratios[level];
    if (r > 0) return r;
    var m = recipeMass(hm);
    return m && hm.yieldQty > 0 ? hm.yieldQty / m : null;
  };
  CC.hmRatioSet = function (hm, level) { return !!(hm.ratios && hm.ratios[level] > 0); };
  function costOf(usage) {
    return usage.reduce(function (s, u) { var ing = CC.ingById(u.ingId), p = ing ? CC.pricePerBase(ing) : null; return s + (p != null ? u.base * p : 0); }, 0);
  }
  /* cepat: bahan terpakai dihitung mundur. Total bahan = hasil / rasio, dibagi sesuai proporsi resep. */
  CC.cookFast = function (hm, qty, level) {
    level = level || 'kental';
    if (!(qty > 0)) return null;
    var r = CC.hmRatio(hm, level), m = recipeMass(hm), usage;
    if (r && m) {
      var f = (qty / r) / m;
      usage = [];
      hm.lines.forEach(function (l) {
        var ing = CC.ingById(l.ingId); if (!ing || !(l.qty > 0)) return;
        var b = CC.toBase(ing, l.qty, l.unit); if (b > 0) usage.push({ ingId: ing.id, base: b * f });
      });
    } else { usage = CC.usageForHm(hm, qty); r = null; }
    return { mode: 'cepat', level: level, qty: qty, ratio: r, raw: r ? qty / r : null, usage: usage, cost: costOf(usage) };
  };
  /* lengkap: bahan sesuai resep, gramasi sungguhan. amounts = {idBarisResep: jumlah dalam satuan baris resep} */
  CC.cookFull = function (hm, qty, amounts, level) {
    if (!(qty > 0)) return null;
    var usage = [], lines = [], mass = 0, massOk = true;
    hm.lines.forEach(function (l) {
      var ing = CC.ingById(l.ingId); if (!ing) return;
      var q = amounts[l.id]; if (!(q > 0)) return;
      var b = CC.toBase(ing, q, l.unit); if (!(b > 0)) return;
      usage.push({ ingId: ing.id, base: b }); lines.push({ ingId: ing.id, qty: q, unit: l.unit });
      var m = CC.toBase({ base: hm.base, density: ing.density }, q, l.unit);
      if (m == null) massOk = false; else mass += m;
    });
    var r = massOk && mass > 0 ? qty / mass : null;
    return { mode: 'lengkap', level: level || null, qty: qty, ratio: r, raw: massOk ? mass : null, usage: usage, lines: lines, cost: costOf(usage) };
  };
  function previewHTML(hm, res) {
    var u = UNITS[hm.base].label;
    if (!res) return '<span class="hint">Isi hasil jadi untuk melihat bahan yang terpakai.</span>';
    var h = '<strong>Bahan terpakai</strong>' + res.usage.map(function (x) {
      var ing = CC.ingById(x.ingId);
      return leader(esc(ing ? ing.name : 'bahan'), nf2.format(Math.round(x.base * 100) / 100) + ' ' + UNITS[ing.base].label);
    }).join('');
    if (!res.usage.length) h += '<p class="hint">Belum ada bahan yang terisi.</p>';
    if (res.raw) h += leader('Total bahan masuk', nf2.format(Math.round(res.raw)) + ' ' + u);
    if (res.ratio) h += leader(res.mode === 'lengkap' ? 'Rasio hasil aktual' : 'Rasio ' + levelName(res.level), pctS(res.ratio));
    if (res.mode === 'cepat' && !CC.hmRatioSet(hm, res.level) && res.ratio) h += '<p class="hint">Rasio ' + levelName(res.level) + ' belum diisi, memakai rasio resep.</p>';
    h += leader('Biaya batch', rp(res.cost));
    h += leader('Biaya per ' + u, rpS(res.cost / res.qty), 'total');
    return h;
  }
  function readCook(hm) {
    var mode = ($('input[name="ck-mode"]:checked', dlg) || {}).value || 'cepat';
    var level = ($('input[name="ck-level"]:checked', dlg) || {}).value || 'kental';
    var qty = num($('#ck-qty', dlg).value);
    if (mode === 'lengkap') {
      var amounts = {};
      dlg.querySelectorAll('[data-ckl]').forEach(function (inp) { amounts[inp.getAttribute('data-ckl')] = num(inp.value); });
      return { mode: mode, level: level, qty: qty, amounts: amounts, res: CC.cookFull(hm, qty, amounts, level) };
    }
    return { mode: mode, level: level, qty: qty, res: CC.cookFast(hm, qty, level) };
  }
  function paintCook() {
    var hm = current(); if (!hm || !dlg.open || !$('#f-cook', dlg)) return;
    var v = readCook(hm), box = $('#ck-lines', dlg);
    if (box) box.hidden = v.mode !== 'lengkap';
    var lg = $('#ck-level-legend', dlg);
    if (lg) lg.textContent = v.mode === 'lengkap' ? 'Kekentalan hasil (untuk kalibrasi rasio)' : 'Kekentalan';
    $('#ck-prev', dlg).innerHTML = previewHTML(hm, v.res);
  }
  function openCook() {
    var hm = current(); if (!hm) return;
    var u = UNITS[hm.base].label;
    var lv = LEVELS.map(function (l) {
      var r = CC.hmRatio(hm, l.k);
      return '<label><input type="radio" name="ck-level" value="' + l.k + '"' + (l.k === 'kental' ? ' checked' : '') + '>' + l.t + (r ? ' (' + pctS(r) + ')' : '') + '</label>';
    }).join('');
    var lines = hm.lines.map(function (l) {
      var ing = CC.ingById(l.ingId); if (!ing) return '';
      return '<div class="field"><label for="ckl-' + esc(l.id) + '">' + esc(ing.name) + ' (' + UNITS[l.unit].label + ')</label><input id="ckl-' + esc(l.id) + '" type="number" inputmode="decimal" min="0" step="any" data-ckl="' + esc(l.id) + '" value="' + (l.qty > 0 ? esc(l.qty) : '') + '"></div>';
    }).join('');
    openDlg(dlgHead('Catat masak ' + esc(hm.name)) + '<form id="f-cook" novalidate>' +
      '<fieldset class="seg"><legend>Cara catat</legend><label><input type="radio" name="ck-mode" value="cepat" checked>Cepat: berat jadi saja</label><label><input type="radio" name="ck-mode" value="lengkap">Lengkap: timbang bahan</label></fieldset>' +
      '<div class="grid2"><div class="field"><label for="ck-date">Tanggal masak</label><input id="ck-date" type="date" value="' + CC.todayISO() + '"></div>' +
      '<div class="field"><label for="ck-qty">Hasil jadi aktual (' + u + ')</label><input id="ck-qty" type="number" inputmode="decimal" min="0" step="any" placeholder="resep: ' + esc(hm.yieldQty) + '"></div></div>' +
      '<fieldset class="seg"><legend id="ck-level-legend">Kekentalan</legend>' + lv + '</fieldset>' +
      '<div id="ck-lines" hidden><p class="hint">Bahan mengikuti resep. Ubah gramasi sesuai yang benar-benar dipakai. Kosongkan bila tidak dipakai.</p><div class="grid2">' + lines + '</div></div>' +
      '<div class="field"><label for="ck-note">Catatan, opsional</label><input id="ck-note" type="text" autocomplete="off"></div>' +
      '<div class="mat" id="ck-prev" aria-live="polite">' + previewHTML(hm, null) + '</div><p class="err" id="ck-err" role="alert"></p>' +
      '<div class="actions"><button type="button" class="btn" data-act="close">Batal</button><button type="submit" class="btn primary">Simpan catatan</button></div></form>', '#ck-qty');
  }
  /* rasio kekentalan di halaman homemade */
  function ratioHTML(hm) {
    var m = recipeMass(hm), base = m && hm.yieldQty > 0 ? hm.yieldQty / m : null;
    var cal = {};
    S().hmBatches.forEach(function (b) {
      if (b.hmId !== hm.id || b.mode !== 'lengkap' || !(b.ratio > 0) || !b.level) return;
      (cal[b.level] = cal[b.level] || []).push(b.ratio);
    });
    return '<section class="sec" aria-labelledby="h-hm-ratio"><header><h2 id="h-hm-ratio">Rasio hasil per kekentalan</h2><p class="hint">Hasil jadi dibagi bahan masuk, dalam persen. Dipakai saat catat masak cepat untuk menghitung bahan terpakai. Kosong berarti memakai rasio resep' + (base ? ' (' + pctS(base) + ')' : '') + '.</p></header>' +
      '<div class="grid2">' + LEVELS.map(function (l) {
        var r = hm.ratios && hm.ratios[l.k], arr = cal[l.k], avg = arr ? arr.reduce(function (s, x) { return s + x; }, 0) / arr.length : null;
        return '<div class="field"><label for="hr-' + l.k + '">' + l.t + ' (%)</label><input id="hr-' + l.k + '" type="number" inputmode="decimal" min="1" max="150" step="any" data-hmr="' + l.k + '" value="' + (r > 0 ? esc(Math.round(r * 1000) / 10) : '') + '">' +
          (avg ? '<span class="hint">Rata-rata timbang: ' + pctS(avg) + ' (' + arr.length + ' kali) <button type="button" class="btn" data-act="hm-ratio-use" data-level="' + l.k + '" data-val="' + avg + '">Pakai</button></span>' : '') + '</div>';
      }).join('') + '</div></section>';
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

  CC.hmCandidates = candidates;
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

  /* opts: {mode: 'cepat'|'lengkap', level, amounts}. Tanpa opts = cepat, kekentalan kental (sama dengan perilaku lama bila rasio belum diisi). */
  CC.recordCook = function (hmId, date, qty, note, via, opts) {
    var hm = CC.homemadeById(hmId); if (!hm) return null;
    opts = opts || {};
    var res = opts.mode === 'lengkap' ? CC.cookFull(hm, qty, opts.amounts || {}, opts.level) : CC.cookFast(hm, qty, opts.level);
    if (!res) return null;
    var rec = { id: uid('hb'), date: date, hmId: hm.id, qty: qty, usage: res.usage, note: note || '', mode: res.mode, level: res.level, ratio: res.ratio, cost: Math.round(res.cost) };
    if (res.lines) rec.lines = res.lines;
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
      var v = readCook(hm);
      if (v.mode === 'lengkap' && (!v.res || !v.res.usage.length)) { err.textContent = 'Isi gramasi bahan yang dipakai.'; return; }
      if (!v.res || !v.res.usage.length) { err.textContent = 'Bahan terpakai tidak bisa dihitung. Cek resep dan satuannya.'; return; }
      CC.recordCook(hm.id, date, qty, $('#ck-note', dlg).value.trim(), null, { mode: v.mode, level: v.level, amounts: v.amounts });
      closeDlg(); render(); toast('Catatan masak disimpan, stok diperbarui.');
    }
  });
  function cookEvt(e) {
    var t = e.target; if (!t || !t.closest || !t.closest('#f-cook')) return;
    paintCook();
  }
  document.addEventListener('input', cookEvt);
  document.addEventListener('change', cookEvt);
  document.addEventListener('input', function (e) {
    var k = e.target.getAttribute && e.target.getAttribute('data-hmr'); if (!k) return;
    var hm = current(); if (!hm) return;
    var v = num(e.target.value);
    hm.ratios = hm.ratios || {};
    hm.ratios[k] = v > 0 && v <= 150 ? v / 100 : null;
    CC.save();
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
    var a = t.getAttribute('data-act');
    if (a === 'hm-cook') openCook();
    else if (a === 'hm-ratio-use') {
      var hr = current(); if (!hr) return;
      var lk = t.getAttribute('data-level'), val = parseFloat(t.getAttribute('data-val'));
      if (!(val > 0)) return;
      hr.ratios = hr.ratios || {}; hr.ratios[lk] = Math.round(val * 1000) / 1000; CC.save(); render();
      toast('Rasio ' + levelName(lk) + ' diperbarui dari hasil timbang.');
    }
    else if (a === 'hm-cook-del') {
      var id = t.getAttribute('data-id');
      S().hmBatches = S().hmBatches.filter(function (b) { return b.id !== id; }); CC.save(); render(); toast('Catatan masak dihapus.');
    }
  });
})();
