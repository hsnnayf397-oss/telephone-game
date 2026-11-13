const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e6 });
const path = require('path');
const FILES = ['/index.html', '/manifest.json', '/sw.js', '/icon-192.png', '/icon-512.png'];
app.get(['/', ...FILES], (req, res) => res.sendFile(path.join(__dirname, req.path === '/' ? '/index.html' : req.path)));

const rooms = new Map();
const AV = ['🦊','🐙','🦄','🐸','🐼','🦁','🐧','🦖','👾','🐝','🦉','🐢'];
const clean = s => String(s || '').trim().slice(0, 16) || 'لاعب';
const makeCode = () => {
  let code;
  do { code = String(1000 + Math.floor(Math.random() * 9000)); } while (rooms.has(code));
  return code;
};

// اللاعب i في الجولة r يشتغل على سلسلة اللاعب (i - r)
const chainIdx = (room, i) => (i - room.round + room.players.length) % room.players.length;

function sendLobby(room) {
  io.to(room.code).emit('lobby', {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map(p => ({ id: p.id, name: p.name, av: p.av })),
  });
}

function startRound(room) {
  const r = room.round, n = room.players.length;
  const isDraw = r % 2 === 1;
  const seconds = Math.round((r === 0 ? 45 : isDraw ? 75 : 50) * (room.speed || 1));
  room.submitted = new Set();
  io.to(room.code).emit('progress', { done: 0, total: n });
  room.players.forEach((p, i) => {
    const prev = r > 0 ? room.chains[chainIdx(room, i)].slice(-1)[0] : null;
    io.to(p.id).emit('task', {
      round: r + 1, total: n,
      type: isDraw ? 'draw' : 'write',
      prompt: prev ? prev.content : null,
      seconds,
    });
  });
  room.timer = setTimeout(() => endRound(room), (seconds + 5) * 1000);
}

function endRound(room) {
  clearTimeout(room.timer);
  const type = room.round % 2 === 1 ? 'image' : 'text';
  room.players.forEach((p, i) => {
    if (!room.submitted.has(p.id))
      room.chains[chainIdx(room, i)].push({ by: p.name, type, content: '' });
  });
  room.round++;
  if (room.round < room.players.length) return startRound(room);
  room.phase = 'reveal';
  room.rv = { k: 0, i: -1 };
  io.to(room.code).emit('reveal', room.chains.map((entries, k) => ({
    owner: room.players[k].name, entries,
  })));
}

function addPlayer(socket, room, name) {
  const used = new Set(room.players.map(p => p.av));
  room.players.push({ id: socket.id, name, connected: true, av: AV.find(a => !used.has(a)) || AV[0] });
  socket.join(room.code);
  socket.data.code = room.code;
  sendLobby(room);
}

// ================= وضع ارسم وخمّن =================
const WORDS = ['قطة','أسد','فيل','جمل','حصان','سمكة','ثعبان','نحلة','فراشة','دجاجة','بطريق','قرد','زرافة','تمساح','ببغاء','سلحفاة','عنكبوت','صقر','خروف','تفاحة','موزة','بطيخ','برتقال','بيتزا','برجر','كبسة','قهوة','شاي','كيكة','خبز','بيضة','جزرة','طماطم','سيارة','طيارة','دراجة','سفينة','قطار','صاروخ','شاحنة','هاتف','حاسوب','تلفاز','مفتاح','ساعة','نظارة','مظلة','كرسي','سرير','باب','نافذة','مصباح','كتاب','قلم','مقص','مطرقة','كاميرا','شمس','قمر','نجمة','سحابة','مطر','جبل','شجرة','وردة','نخلة','صحراء','بحر','نار','قلب','يد','عين','طبيب','شرطي','طباخ','ملك','روبوت','شبح','تاج','سيف','كرة قدم','جيتار','ملعقة','ثلاجة','مكيف','برج','خيمة','فانوس','عقال','دلة'];
const norm = s => s.replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
const EXTRA = ['دب','ذئب','ثعلب','غزال','حمار','بقرة','ديناصور','دلفين','حوت','قرش','أخطبوط','سرطان','نسر','بومة','حمامة','بجعة','طاووس','خفاش','فأر','أرنب','سنجاب','كنغر','باندا','وحيد القرن','فرس النهر','ضفدع','عقرب','نملة','دودة','حلزون','بعوضة','ذبابة','خنزير','ماعز','كلب','ناقة','قنفذ','لاما','نحلة عسل','حرباء','عنب','فراولة','بطاطس','ذرة','خيار','بصل','ثوم','فلفل','مشروم','تمر','مندي','شاورما','سمبوسة','فشار','دونات','بسكويت','شوكولاتة','عسل','حليب','جبن','لحم','دجاج مشوي','سمك مشوي','سندويتش','معكرونة','سوشي','عصير','لبن','حلوى','مطبق','فول','فلافل','رز','شوربة','سلطة','قهوة عربية','طاولة','مرآة','سجادة','وسادة','بطانية','فرشاة أسنان','صابون','منشفة','حنفية','ستارة','سلم','دلو','مكنسة','غسالة','فرن','قدر','سكين','شوكة','صحن','كوب','إبريق','زجاجة','حقيبة','محفظة','خاتم','سلسلة','قبعة','حذاء','جوارب','قميص','ثوب','شماغ','بشت','عباية','حزام','جاكيت','عصا','شمعة','مروحة','سماعة','لابتوب','لوحة مفاتيح','ماوس','شاحن','بطارية','ريموت','ميكروفون','منبه','خريطة','بوصلة','منظار','مجهر','مغناطيس','مسمار','منشار','فأس','مفك','حبل','مسجد','مدرسة','مستشفى','مطار','ملعب','حديقة','شاطئ','جزيرة','كهف','بركان','شلال','نهر','غابة','مزرعة','قلعة','فندق','سوق','مطعم','مكتبة','سينما','سجن','جسر','نفق','منارة','معلم','طيار','جندي','مزارع','رسام','مغني','حارس','نجار','حلاق','إطفائي','بائع','سباك','مصور','مذيع','ساحر','مهرج','قرصان','فارس','ثلج','رعد','برق','قوس قزح','عاصفة','ريح','رمل','حجر','ورقة','غصن','زهرة','عشب','صدفة','ماء','موجة','كوكب','مجرة','نيزك','ليل','شروق','كرة سلة','كرة طائرة','تنس','سباحة','ملاكمة','جري','شطرنج','بلياردو','سهم','قوس','لعبة فيديو','تزلج','غوص','رمح','ينام','يركض','يسبح','يضحك','يبكي','يطبخ','يصور','يغني','يرقص','يتسلق','يقرأ','يرسم','يشرب قهوة','ينفخ بالون','بالون','هدية','كرة','دمية','طائرة ورقية','فقاعة','شباك','فضائي','صحن طائر','تنين','ساحرة','حورية','عملاق','قزم','زومبي','مصباح علاء الدين','كنز','درع','مجلس','عود','مبخرة','فنجال','دباب','ربابة','حنة','سفرة','تنور','كشتة','نار حطب','ماسورة','مقلاة','خلاط','مكواة','سخان','مصعد','سلم كهربائي','عربة تسوق','حاوية زبالة','عمود إنارة','إشارة مرور','لوحة إعلان','كاشير','صراف آلي','بصمة','باب مفتوح','دراجة نارية','قارب','غواصة','هليكوبتر','منطاد','مظلة هبوط','عربة','حصان خشبي','أرجوحة','زحليقة','قلعة رمل','حوض سمك','بيت شجرة','عش طائر','شبكة صيد','سنارة','صنارة صياد','خوذة','قفازات','قناع','نظارة سباحة','ساعة رملية','مقلمة','حقيبة مدرسية','سبورة','طابعة','مسطرة','دفتر','ممحاة','صاروخ فضاء','قمر صناعي','محطة فضاء','تلسكوب','طبق فضائي'];
const POOL = [...new Map([...WORDS, ...EXTRA].map(w => [norm(w), w])).values()];
function pickWords(g) {
  let free = POOL.filter(w => !g.used.has(w));
  if (free.length < 3) { g.used.clear(); free = POOL.slice(); }
  for (let i = free.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [free[i], free[j]] = [free[j], free[i]]; }
  const picks = free.slice(0, 3);
  picks.forEach(w => g.used.add(w));
  return picks;
}
function lev1(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}
const board = room => { const g = room.g; return room.players.map(p => ({ id: p.id, name: p.name, pts: g.scores[p.id] || 0, ok: g.guessed.has(p.id) || p.id === g.drawer })).sort((a, b) => b.pts - a.pts); };
const clearG = g => { clearTimeout(g.timer); g.timers.forEach(clearTimeout); g.timers = []; };

function startGuess(room, target) {
  room.g = { turn: 0, target, scores: {}, guessed: new Set(), timers: [], used: new Set() };
  room.players.forEach(p => room.g.scores[p.id] = 0);
  room.phase = 'guess'; room.g.stage = 'loading';
  io.to(room.code).emit('gload', { ms: 15000, target });
  room.g.timer = setTimeout(() => nextTurn(room), 15000);
}
function nextTurn(room) {
  const g = room.g, n = room.players.length; clearG(g);
  if (Object.values(g.scores).some(v => v >= g.target)) return endGuess(room);
  const d = room.players[g.turn % n]; g.turn++;
  if (!d.connected) return nextTurn(room);
  Object.assign(g, { drawer: d.id, word: null, guessed: new Set(), stage: 'choose', choices: pickWords(g) });
  io.to(room.code).emit('gturn', { drawer: d.name, drawerId: d.id, turn: g.turn, target: g.target, board: board(room) });
  io.to(d.id).emit('gchoose', g.choices);
  g.timer = setTimeout(() => startDraw(room, g.choices[0]), 15000);
}
function startDraw(room, word) {
  const g = room.g; clearG(g);
  g.word = word; g.stage = 'draw'; g.seconds = Math.round(80 * (room.speed || 1)); g.t0 = Date.now(); g.rev = new Set();
  const hint = () => [...word].map((c, i) => c === ' ' ? ' ' : g.rev.has(i) ? c : '_');
  io.to(room.code).emit('gdraw', { hint: hint(), seconds: g.seconds });
  io.to(g.drawer).emit('gword', word);
  [.5, .75].forEach(f => g.timers.push(setTimeout(() => {
    const free = [...word].map((c, i) => i).filter(i => word[i] !== ' ' && !g.rev.has(i));
    if (free.length > 2) { g.rev.add(free[Math.random() * free.length | 0]); io.to(room.code).emit('ghint', hint()); }
  }, g.seconds * 1000 * f)));
  g.timer = setTimeout(() => endTurn(room), g.seconds * 1000);
}
function endTurn(room) {
  const g = room.g; if (g.stage !== 'draw') return;
  clearG(g); g.stage = 'between';
  io.to(room.code).emit('gend', { word: g.word, board: board(room) });
  g.timer = setTimeout(() => nextTurn(room), 5000);
}
function endGuess(room) { room.phase = 'gover'; io.to(room.code).emit('gover', board(room)); }

io.on('connection', socket => {
  socket.on('create', (name, cb) => {
    const room = { code: makeCode(), hostId: socket.id, players: [], phase: 'lobby',
                   round: 0, chains: [], submitted: new Set(), timer: null };
    rooms.set(room.code, room);
    addPlayer(socket, room, clean(name));
    cb({ ok: true });
  });

  socket.on('join', ({ name, code }, cb) => {
    const room = rooms.get(String(code || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, ''));
    if (!room) return cb({ ok: false, error: 'الغرفة غير موجودة' });
    if (room.phase !== 'lobby') return cb({ ok: false, error: 'اللعبة بدأت' });
    if (room.players.length >= 12) return cb({ ok: false, error: 'الغرفة ممتلئة' });
    addPlayer(socket, room, clean(name));
    cb({ ok: true });
  });

  socket.on('start', (opts, cb) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    if (room.players.length < 2) return cb({ ok: false, error: 'تحتاج لاعبين على الأقل' });
    room.speed = { fast: 0.7, normal: 1, slow: 1.5 }[opts && opts.speed] || 1;
    if (opts && opts.mode === 'guess') { startGuess(room, [500, 1000, 1500, 2000].includes(opts.target) ? opts.target : 1000); return cb({ ok: true }); }
    room.phase = 'play';
    room.round = 0;
    room.chains = room.players.map(() => []);
    startRound(room);
    cb({ ok: true });
  });

  socket.on('submit', content => {
    const room = rooms.get(socket.data.code);
    if (!room || room.phase !== 'play' || typeof content !== 'string') return;
    const i = room.players.findIndex(p => p.id === socket.id);
    if (i < 0 || room.submitted.has(socket.id)) return;
    const isImg = room.round % 2 === 1;
    const value = isImg
      ? (content.startsWith('data:image/png;base64,') && content.length < 1.5e6 ? content : '')
      : content.trim().slice(0, 120);
    room.chains[chainIdx(room, i)].push({ by: room.players[i].name, type: isImg ? 'image' : 'text', content: value });
    room.submitted.add(socket.id);
    io.to(room.code).emit('progress', { done: room.submitted.size, total: room.players.length });
    if (room.players.every(p => !p.connected || room.submitted.has(p.id))) endRound(room);
  });

  socket.on('next', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.id || room.phase !== 'reveal') return;
    const rv = room.rv;
    if (rv.i + 1 < room.chains[rv.k].length) rv.i++;
    else if (rv.k + 1 < room.chains.length) { rv.k++; rv.i = 0; }
    else return io.to(room.code).emit('end');
    io.to(room.code).emit('step', { k: rv.k, i: rv.i });
  });

  socket.on('react', e => {
    const room = rooms.get(socket.data.code);
    const p = room && room.players.find(x => x.id === socket.id);
    if (p && ['😂', '🔥', '👏', '😱', '💀'].includes(e)) io.to(room.code).emit('react', { e, from: p.name });
  });

  socket.on('gpick', w => {
    const room = rooms.get(socket.data.code);
    if (!room || room.phase !== 'guess') return;
    const g = room.g;
    if (g.stage === 'choose' && socket.id === g.drawer && g.choices.includes(w)) startDraw(room, w);
  });

  socket.on('gs', st => {
    const room = rooms.get(socket.data.code);
    if (!room || room.phase !== 'guess' || room.g.stage !== 'draw' || socket.id !== room.g.drawer || !st || typeof st !== 'object') return;
    socket.to(room.code).emit('gs', st);
  });

  socket.on('guess', text => {
    const room = rooms.get(socket.data.code);
    if (!room || room.phase !== 'guess' || typeof text !== 'string') return;
    const g = room.g, p = room.players.find(x => x.id === socket.id);
    text = text.trim().slice(0, 60);
    if (!p || !text) return;
    const msg = { name: p.name, text };
    if (g.stage !== 'draw' || p.id === g.drawer || g.guessed.has(p.id)) {
      if (g.stage === 'draw') [...g.guessed, g.drawer].forEach(id => io.to(id).emit('gchat', { ...msg, priv: true }));
      else io.to(room.code).emit('gchat', msg);
      return;
    }
    const a = norm(text), b = norm(g.word);
    if (a === b) {
      const pts = g.target / 10;
      g.scores[p.id] += pts; g.scores[g.drawer] += pts / 2; g.guessed.add(p.id);
      io.to(p.id).emit('gok', pts);
      io.to(room.code).emit('gchat', { name: p.name, text: 'خمّن الكلمة! 🎉', sys: true, board: board(room) });
      if (room.players.filter(x => x.connected && x.id !== g.drawer).every(x => g.guessed.has(x.id))) endTurn(room);
    } else {
      if (lev1(a, b)) io.to(p.id).emit('gclose');
      io.to(room.code).emit('gchat', msg);
    }
  });

  socket.on('kick', id => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby' || id === socket.id) return;
    const p = room.players.find(x => x.id === id);
    if (!p) return;
    room.players = room.players.filter(x => x !== p);
    const t = io.sockets.sockets.get(id);
    if (t) { t.leave(room.code); t.data.code = null; t.emit('kicked'); }
    sendLobby(room);
  });

  socket.on('restart', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.id || !['reveal', 'gover'].includes(room.phase)) return;
    room.players = room.players.filter(p => p.connected);
    room.phase = 'lobby';
    sendLobby(room);
  });

  const drop = () => {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    const p = room.players.find(x => x.id === socket.id);
    if (!p) return;
    if (room.phase === 'lobby') room.players = room.players.filter(x => x !== p);
    else p.connected = false;
    const alive = room.players.filter(x => x.connected);
    if (!alive.length) { clearTimeout(room.timer); if (room.g) clearG(room.g); rooms.delete(room.code); return; }
    if (room.hostId === socket.id) { const nh = alive[Math.random() * alive.length | 0]; room.hostId = nh.id; io.to(room.code).emit('host', { id: nh.id, name: nh.name }); }
    if (room.phase === 'lobby') sendLobby(room);
    else if (room.phase === 'play' && alive.every(x => room.submitted.has(x.id))) endRound(room);
    else if (room.phase === 'guess') {
      const g = room.g;
      if (g.stage === 'draw' && (g.drawer === socket.id || alive.filter(x => x.id !== g.drawer).every(x => g.guessed.has(x.id)))) endTurn(room);
      else if (g.stage === 'choose' && g.drawer === socket.id) nextTurn(room);
    }
  };
  socket.on('disconnect', drop);
  socket.on('leave', () => {
    const code = socket.data.code;
    if (code) socket.leave(code);
    drop();
    socket.data.code = null;
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`http://localhost:${PORT}`));
