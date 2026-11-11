(() => {
  const API = window.NOPA_API;
  const $ = (id) => document.getElementById(id);
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('id-ID') : n ?? '—');
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const JENIS = {tender: 'Email tender', akuisisi: 'Akuisisi', konfirmasi: 'Konfirmasi daftar', kampanye: 'Kampanye'};
  const WARNA = {tender: 'var(--c-tender)', akuisisi: 'var(--c-akuisisi)', konfirmasi: 'var(--c-konfirmasi)', kampanye: 'var(--c-kampanye)'};
  const wib = () => new Date(Date.now() + 7 * 3600e3); // jam WIB dibaca lewat getUTC*
  const hariIni = () => wib().toISOString().slice(0, 10);
  const tgl = (iso) => { if (!iso) return '—'; const [, m, d] = String(iso).slice(0, 10).split('-'); return (+d) + ' ' + BULAN[+m - 1]; };
  const tglPanjang = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return HARI[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + BULAN_PANJANG[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
  const jamWib = (isoUtc) => new Date(Date.parse(isoUtc) + 7 * 3600e3).toISOString().slice(11, 16);
  const simpan = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    del: (k) => { try { localStorage.removeItem(k); } catch {} },
  };
  const el = (tag, txt, cls) => { const e = document.createElement(tag); if (txt != null) e.textContent = txt; if (cls) e.className = cls; return e; };
  const td = (txt, cls) => el('td', txt, cls);
  const angkaTd = (n, buruk) => td(fmt(n), 'r' + (n === 0 ? ' zero' : buruk && n > 0 ? ' bad' : ''));

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

  let sibuk = false;

  async function ambil(pin) {
    const res = await fetch(API, { headers: { 'x-pin': pin }, cache: 'no-store' });
    if (res.status === 401) { const e = new Error('PIN salah'); e.pin = true; throw e; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(body.error || ('Server menjawab ' + res.status));
    return body;
  }

  function banner(teks, err) {
    const b = $('banner'); b.textContent = teks || ''; b.hidden = !teks; b.classList.toggle('err', !!err);
  }

  // Data hanya diambil saat tombol Perbarui ditekan (atau sekali setelah PIN dimasukkan).
  async function perbarui() {
    const pin = simpan.get('nopa_pin');
    if (!pin || sibuk) return;
    sibuk = true;
    const btn = $('tombol-perbarui'); btn.disabled = true; btn.classList.add('loading'); btn.querySelector('span').textContent = 'Memuat';
    try {
      const data = await ambil(pin);
      simpan.set('nopa_data', JSON.stringify(data));
      gambar(data);
    } catch (e) {
      if (e.pin) { simpan.del('nopa_pin'); tampilPin('PIN sudah diganti. Masukkan PIN baru.'); return; }
      banner(navigator.onLine ? 'Gagal memuat data. Coba tekan Perbarui lagi.' : 'Tidak ada internet. Yang tampil adalah data terakhir.', true);
    } finally {
      sibuk = false; btn.disabled = false; btn.classList.remove('loading'); btn.querySelector('span').textContent = 'Perbarui';
    }
  }

  function gambar(d) {
    const h = d.hari || {};
    $('tanggal').textContent = tglPanjang(h.hari_ini || hariIni());
    $('stamp').textContent = 'Data ' + (h.hari_ini === hariIni() ? '' : tgl(h.hari_ini) + ' ') + jamWib(d.dibuat) + ' WIB';
    banner(h.hari_ini && h.hari_ini !== hariIni() ? 'Ini data tanggal ' + tgl(h.hari_ini) + '. Tekan Perbarui untuk melihat hari ini.' : '');

    hero(h);

    $('k-terkirim').textContent = fmt(h.email_terkirim);
    $('k-gagal').textContent = fmt(h.email_gagal);
    $('kpi-gagal').classList.toggle('bad', h.email_gagal > 0);
    $('kpi-gagal').classList.toggle('ok', h.email_gagal === 0);
    $('k-dilewati').textContent = fmt(h.email_dilewati);
    $('k-tender').textContent = fmt(h.tender_baru);
    $('k-tender-s').textContent = (h.scraping_terakhir ? 'Scraping terakhir ' + h.scraping_terakhir : 'Belum ada scraping hari ini') + ' · ' + fmt(h.tender_menunggu) + ' menunggu';

    $('t-jenis').replaceChildren(...(d.per_jenis || []).map((r) => {
      const tr = el('tr'); const nama = td(); const dot = el('span', null, 'dot'); dot.style.background = WARNA[r.jenis] || 'var(--muted)';
      nama.append(dot, JENIS[r.jenis] || r.jenis);
      tr.append(nama, angkaTd(r.terkirim), angkaTd(r.gagal, true), angkaTd(r.dilewati)); return tr;
    }));

    perJam(d.per_jam || [], h.hari_ini === hariIni());

    const brevo = d.brevo || [];
    $('t-brevo').replaceChildren(...(brevo.length ? brevo.map((b) => {
      const li = el('li'); const p = b.batas_harian ? Math.min(1, b.terkirim_hari_ini / b.batas_harian) : 0;
      const num = el('span', null, 'num'); num.append(el('b', fmt(b.terkirim_hari_ini)), ' / ' + fmt(b.batas_harian));
      const bar = el('div', null, 'bar'); const i = el('i', null, p >= 0.9 ? 'full' : ''); i.style.width = p * 100 + '%'; bar.append(i);
      li.append(el('span', b.akun), num, bar); return li;
    }) : [el('li', 'Tidak ada akun Brevo aktif', 'empty')]));

    const sumber = d.per_sumber || [];
    $('t-sumber').replaceChildren(...(sumber.length ? sumber.map((s) => { const tr = el('tr'); tr.append(td(s.sumber), angkaTd(s.baru_hari_ini), angkaTd(s.menunggu)); return tr; })
      : [(() => { const tr = el('tr'); const c = td('Belum ada tender baru hari ini', 'empty'); c.colSpan = 3; tr.append(c); return tr; })()]));

    const hi = hariIni(), besok = new Date(Date.parse(hi + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
    const tender = d.tender || [];
    $('t-tender').replaceChildren(...(tender.length ? tender.map((t) => {
      const li = el('li'); const kiri = el('div', null, 't');
      if (/^https?:\/\//i.test(t.link || '')) { const a = el('a', t.judul); a.href = t.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; kiri.append(a); }
      else kiri.append(el('span', t.judul, 'judul'));
      kiri.append(el('div', t.sumber, 'src'));
      const label = !t.batas ? 'Tanpa batas' : t.batas === hi ? 'Hari ini' : t.batas === besok ? 'Besok' : tgl(t.batas);
      li.append(kiri, el('span', label, 'chip' + (t.batas && t.batas <= besok ? ' warn' : ''))); return li;
    }) : [el('li', 'Semua tender sudah dikirim', 'empty')]));

    $('t-kirim').replaceChildren(...(d.pengiriman || []).map((p) => {
      const [t, j] = String(p.waktu || '').split(' ');
      const tr = el('tr'); const mode = td(); mode.append(el('span', p.mode === 'asli' ? 'Pelanggan' : 'Uji', 'chip' + (p.mode === 'asli' ? ' ok' : '')));
      tr.append(td((t === hi ? 'Hari ini' : tgl(t)) + ' ' + (j || '')), mode, angkaTd(p.tender), (() => { const c = angkaTd(p.penerima); c.classList.add('hide-sm'); return c; })(), angkaTd(p.terkirim), angkaTd(p.gagal, true)); return tr;
    }));
  }

  function hero(h) {
    const target = h.penerima_bisa_dikirim || 0, sampai = h.tender_sampai || 0, belum = h.tender_belum || 0, gagal = h.tender_gagal || 0;
    const p = target ? sampai / target : 0;
    $('h-sampai').textContent = fmt(sampai);
    $('h-target').textContent = fmt(target);
    $('h-pelanggan').textContent = fmt(h.pelanggan_aktif);
    $('h-penerima').textContent = fmt(h.penerima_total);
    $('h-belum').textContent = fmt(belum);
    $('h-gagal').textContent = fmt(gagal);
    $('h-gagal').classList.toggle('bad', gagal > 0);
    $('h-belum').classList.toggle('bad', h.jadwal_tender_hari_ini && sampai > 0 && belum > 0);
    $('h-waktu').textContent = h.tender_mulai ? (h.tender_mulai === h.tender_selesai ? h.tender_mulai : h.tender_mulai + '–' + h.tender_selesai) : '—';

    const sekarang = wib(); const sebelumJadwal = sekarang.getUTCHours() < 9 || (sekarang.getUTCHours() === 9 && sekarang.getUTCMinutes() < 15);
    const hariLama = h.hari_ini !== hariIni();
    let badge = 'Tidak ada jadwal', kelas = '', hint = 'Email tender dijadwalkan Senin, Rabu dan Jumat pukul 09:00 WIB.';
    if (sampai > 0 && belum === 0 && gagal === 0) { badge = 'Semua terkirim'; kelas = 'ok'; hint = ''; }
    else if (sampai > 0) { badge = 'Belum lengkap'; kelas = 'warn'; hint = fmt(belum) + ' penerima belum menerima email tender hari ini' + (gagal ? ' dan ' + fmt(gagal) + ' email gagal.' : '.'); }
    else if (h.jadwal_tender_hari_ini && sebelumJadwal && !hariLama) { badge = 'Terjadwal 09:00'; kelas = ''; hint = 'Email tender hari ini akan dikirim pukul 09:00 WIB.'; }
    else if (h.jadwal_tender_hari_ini) { badge = 'Belum dikirim'; kelas = 'bad'; hint = 'Hari ini jadwal kirim, tapi belum ada email tender yang terkirim. Periksa workflow "NOPA Supabase - Kirim Email Tender" di n8n.'; }
    const b = $('h-badge'); b.textContent = badge; b.className = 'badge ' + kelas;
    const prog = $('h-prog'); prog.className = 'progress ' + (kelas === 'ok' || !kelas ? '' : kelas); prog.setAttribute('aria-valuenow', Math.round(p * 100));
    $('h-bar').style.width = (p * 100) + '%';
    $('h-hint').textContent = hint;
  }

  function perJam(rows, hariSama) {
    const jam = Array.from({length: 24}, () => ({}));
    rows.forEach((r) => { if (r.jam >= 0 && r.jam < 24) jam[r.jam][r.jenis] = (jam[r.jam][r.jenis] || 0) + r.terkirim; });
    const total = jam.map((o) => Object.values(o).reduce((a, b) => a + b, 0));
    const mx = Math.max(1, ...total); const kini = wib().getUTCHours();
    const box = $('jam'); const tip = el('p', 'Ketuk sebuah jam untuk melihat rinciannya.', 'hours-tip');
    const kolom = jam.map((o, i) => {
      const c = el('div', null, 'h' + (hariSama && i === kini ? ' now' : '') + (hariSama && i > kini ? ' future' : ''));
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', String(i).padStart(2, '0') + ':00, ' + total[i] + ' email terkirim');
      Object.keys(JENIS).forEach((k) => { if (!o[k]) return; const seg = el('i'); seg.style.height = (o[k] / mx * 100) + '%'; seg.style.background = WARNA[k]; c.append(seg); });
      const tunjuk = () => {
        tip.replaceChildren(el('b', String(i).padStart(2, '0') + ':00–' + String(i).padStart(2, '0') + ':59'), ' · ' + (total[i] ? fmt(total[i]) + ' email (' + Object.keys(JENIS).filter((k) => o[k]).map((k) => JENIS[k] + ' ' + fmt(o[k])).join(', ') + ')' : 'tidak ada email'));
      };
      c.addEventListener('pointerenter', tunjuk); c.addEventListener('click', tunjuk);
      return c;
    });
    const sumbu = el('div', null, 'hours-x');
    for (let i = 0; i < 24; i++) sumbu.append(el('span', i % 6 === 0 ? String(i).padStart(2, '0') : ''));
    box.replaceChildren(...kolom);
    box.parentElement.querySelectorAll('.hours-x,.hours-tip').forEach((n) => n.remove());
    box.after(sumbu, tip);
  }

  function mulai() {
    $('layar-pin').hidden = true; $('aplikasi').hidden = false;
    const lama = simpan.get('nopa_data');
    let ada = false;
    if (lama) { try { const d = JSON.parse(lama); if (d && d.hari) { gambar(d); ada = true; } else simpan.del('nopa_data'); } catch { simpan.del('nopa_data'); } }
    if (!ada) { $('tanggal').textContent = tglPanjang(hariIni()); banner('Belum ada data. Tekan Perbarui untuk mengambil data hari ini.'); }
  }

  function tampilPin(pesan) {
    $('aplikasi').hidden = true; $('layar-pin').hidden = false;
    $('pesan-pin').textContent = pesan || ''; $('input-pin').value = ''; $('input-pin').focus();
  }

  $('form-pin').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const pin = $('input-pin').value.trim(); if (!pin) { $('pesan-pin').textContent = 'Isi PIN terlebih dahulu.'; return; }
    $('tombol-pin').disabled = true; $('tombol-pin').textContent = 'Memeriksa…'; $('pesan-pin').textContent = '';
    try {
      const data = await ambil(pin);
      simpan.set('nopa_pin', pin); simpan.set('nopa_data', JSON.stringify(data)); mulai();
    } catch (e) {
      $('pesan-pin').textContent = e.pin ? 'PIN salah. Coba lagi.' : 'Tidak bisa terhubung. Periksa internet Anda.';
    } finally { $('tombol-pin').disabled = false; $('tombol-pin').textContent = 'Buka'; }
  });
  // Tema: Otomatis (ikut HP) -> Terang -> Gelap
  const NAMA_TEMA = {auto: 'otomatis', light: 'terang', dark: 'gelap'};
  const terapkanTema = (t) => {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else { delete document.documentElement.dataset.theme; t = 'auto'; }
    document.querySelectorAll('#tombol-tema [data-ikon]').forEach((s) => { s.toggleAttribute('hidden', s.dataset.ikon !== t); });
    const b = $('tombol-tema'); b.title = 'Tema: ' + NAMA_TEMA[t];
    b.setAttribute('aria-label', 'Tema: ' + NAMA_TEMA[t] + '. Ketuk untuk mengganti.');
    const gelap = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = gelap ? '#0b1218' : '#ffffff'; m.removeAttribute('media'); });
    return t;
  };
  let tema = terapkanTema(simpan.get('nopa_tema') || 'auto');
  $('tombol-tema').addEventListener('click', () => {
    tema = {auto: 'light', light: 'dark', dark: 'auto'}[tema];
    simpan.set('nopa_tema', tema); terapkanTema(tema);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (tema === 'auto') terapkanTema('auto'); });
  $('tombol-perbarui').addEventListener('click', perbarui);
  $('keluar').addEventListener('click', (ev) => { ev.preventDefault(); simpan.del('nopa_pin'); simpan.del('nopa_data'); tampilPin(); });

  simpan.get('nopa_pin') ? mulai() : tampilPin();
})();
