const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e6, pingInterval: 12000, pingTimeout: 20000 });
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

const lobbyPayload = room => ({ code: room.code, hostId: room.hostId,
  players: room.players.map(p => ({ id: p.id, name: p.name, av: p.av, connected: p.connected })) });
function sendLobby(room) { io.to(room.code).emit('lobby', lobbyPayload(room)); }
const chainsPayload = room => room.chains.map((entries, k) => ({ owner: room.players[k].name, entries }));

function startRound(room) {
  const r = room.round, n = room.players.length;
  const isDraw = r % 2 === 1;
  const seconds = Math.round((r === 0 ? 45 : isDraw ? 75 : 50) * (room.speed || 1));
  room.submitted = new Set();
  io.to(room.code).emit('progress', { done: 0, total: n });
  room.players.forEach((p, i) => {
    const prev = r > 0 ? room.chains[chainIdx(room, i)].slice(-1)[0] : null;
    p.task = { round: r + 1, total: n, type: isDraw ? 'draw' : 'write', prompt: prev ? prev.content : null, seconds, t0: Date.now() };
    io.to(p.id).emit('task', p.task);
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
  io.to(room.code).emit('reveal', chainsPayload(room));
}

const sanitizeTok = t => String(t || '').replace(/[^\w-]/g, '').slice(0, 40) || Math.random().toString(36).slice(2);
const everyone = room => [...room.players, ...(room.spec || [])];
const findTok = (room, tok) => everyone(room).find(p => p.token === tok);
const findId = (room, id) => everyone(room).find(p => p.id === id);
function addPlayer(socket, room, name, token, spec) {
  const used = new Set(everyone(room).map(p => p.av));
  const p = { id: socket.id, name, token, connected: true, av: AV.find(a => !used.has(a)) || AV[0] };
  if (spec) { p.spec = true; (room.spec = room.spec || []).push(p); } else room.players.push(p);
  socket.join(room.code); socket.data.code = room.code;
  if (room.phase === 'lobby') sendLobby(room);
  return p;
}

// ================= وضع ارسم وخمّن =================
const WORDS = ['قطة','أسد','فيل','بعير','حصان','سمكة','ثعبان','نحلة','فراشة','دجاجة','بطريق','قرد','زرافة','تمساح','ببغا','سلحفاة','عنكبوت','صقر','خروف','تفاحة','موزة','حبحب','برتقال','بيتزا','برجر','كبسة','قهوة','شاي','كيكة','خبز','بيضة','جزرة','طماطم','سيارة','طيارة','سيكل','سفينة','قطار','صاروخ','تريلا','جوال','كمبيوتر','تلفزيون','مفتاح','ساعة','نظارة','شمسية','كرسي','سرير','باب','شباك','لمبة','كتاب','قلم','مقص','شاكوش','كاميرا','شمس','قمر','نجمة','غيمة','مطر','جبل','شجرة','وردة','نخلة','صحراء','بحر','نار','قلب','إيد','عين','دكتور','شرطي','طباخ','ملك','روبوت','عفريت','تاج','سيف','كورة قدم','جيتار','معلقة','ثلاجة','مكيف','برج','خيمة','فانوس','عقال','دلة'];
const norm = s => s.replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim().toLowerCase();
const EXTRA = ['دب','ذيب','ثعلب','غزال','حمار','بقرة','ديناصور','دلفين','حوت','قرش','أخطبوط','سرطان','نسر','بومة','حمامة','بجعة','طاووس','خفاش','فار','أرنب','سنجاب','كنغر','باندا','وحيد القرن','فرس النهر','ضفدع','عقرب','نملة','دودة','حلزون','ناموسة','ذبانة','خنزير','ماعز','كلب','ناقة','قنفذ','لاما','نحلة عسل','حرباء','عنب','فراولة','بطاطس','ذرة','خيار','بصل','ثوم','فلفل','مشروم','تمر','مندي','شاورما','سمبوسة','فشار','دونات','بسكويت','شوكولاتة','عسل','حليب','جبن','لحم','دجاج مشوي','سمك مشوي','سندويتش','مكرونة','سوشي','عصير','لبن','حلا','مطبق','فول','فلافل','رز','شوربة','سلطة','قهوة عربية','طاولة','مراية','سجادة','مخدة','بطانية','فرشاة أسنان','صابون','فوطة','حنفية','ستارة','سلم','سطل','مكنسة','غسالة','فرن','قدر','سكين','شوكة','صحن','كاسة','إبريق','قارورة','شنطة','محفظة','خاتم','سلسلة','كاب','جزمة','شراب','قميص','ثوب','شماغ','بشت','عباية','حزام','جاكيت','عصا','شمعة','مروحة','سماعة','لابتوب','كيبورد','ماوس','شاحن','بطارية','ريموت','ميكروفون','منبه','خريطة','بوصلة','منظار','ميكروسكوب','مغناطيس','مسمار','منشار','فاس','مفك','حبل','مسجد','مدرسة','مستشفى','مطار','ملعب','حديقة','شاطئ','جزيرة','كهف','بركان','شلال','نهر','غابة','مزرعة','قلعة','فندق','سوق','مطعم','مكتبة','سينما','سجن','جسر','نفق','منارة','معلم','طيار','عسكري','مزارع','رسام','مغني','حارس','نجار','حلاق','إطفائي','بياع','سباك','مصور','مذيع','ساحر','مهرج','قرصان','فارس','ثلج','رعد','برق','قوس قزح','عاصفة','ريح','رمل','حجر','ورقة','غصن','زهرة','عشب','صدفة','مويه','موجة','كوكب','مجرة','نيزك','ليل','شروق','كورة سلة','كورة طايرة','تنس','سباحة','ملاكمة','جري','شطرنج','بلياردو','سهم','قوس','لعبة فيديو','تزلج','غوص','رمح','ينام','يركض','يسبح','يضحك','يبكي','يطبخ','يصور','يغني','يرقص','يتسلق','يقرأ','يرسم','يشرب قهوة','ينفخ بالون','بالون','هدية','كورة','دمية','طيارة ورق','فقاعة','شباك','فضائي','صحن طاير','تنين','ساحرة','حورية','عملاق','قزم','زومبي','لمبة علاء الدين','كنز','درع','مجلس','عود','مبخرة','فنجال','دباب','ربابة','حنة','سفرة','تنور','كشتة','نار حطب','ماسورة','طاسة','خلاط','مكواة','سخان','مصعد','سلم كهربائي','ترولي','برميل زبالة','عمود إنارة','إشارة','لوحة إعلان','كاشير','صراف','بصمة','باب مفتوح','موتر','قارب','غواصة','هليكوبتر','منطاد','باراشوت','عربانة','حصان خشبي','مرجيحة','زحليقة','قلعة رمل','حوض سمك','بيت شجرة','عش طير','شبكة صيد','سنارة','خوذة','قفازات','قناع','نظارة سباحة','ساعة رملية','مقلمة','شنطة مدرسة','سبورة','طابعة','مسطرة','دفتر','ممحاة','صاروخ فضاء','قمر صناعي','محطة فضاء','تلسكوب','طبق فضائي'];
const POOL = [...new Map([...WORDS, ...EXTRA].map(w => [norm(w), w])).values()];
const ALIASES = {"بعير": ["جمل"], "ببغا": ["ببغاء"], "حبحب": ["بطيخ"], "سيكل": ["دراجة"], "تريلا": ["شاحنة"], "جوال": ["هاتف"], "كمبيوتر": ["حاسوب"], "تلفزيون": ["تلفاز"], "شمسية": ["مظلة"], "شباك": ["نافذة"], "لمبة": ["مصباح"], "شاكوش": ["مطرقة"], "غيمة": ["سحابة"], "إيد": ["يد"], "دكتور": ["طبيب"], "عفريت": ["شبح"], "كورة قدم": ["كرة قدم"], "معلقة": ["ملعقة"], "ذيب": ["ذئب"], "فار": ["فأر"], "ناموسة": ["بعوضة"], "ذبانة": ["ذبابة"], "مكرونة": ["معكرونة"], "حلا": ["حلوى"], "مراية": ["مرآة"], "مخدة": ["وسادة"], "فوطة": ["منشفة"], "سطل": ["دلو"], "كاسة": ["كوب"], "قارورة": ["زجاجة"], "شنطة": ["حقيبة"], "كاب": ["قبعة"], "جزمة": ["حذاء"], "شراب": ["جوارب"], "كيبورد": ["لوحة مفاتيح"], "ميكروسكوب": ["مجهر"], "فاس": ["فأس"], "عسكري": ["جندي"], "بياع": ["بائع"], "مويه": ["ماء"], "كورة سلة": ["كرة سلة"], "كورة طايرة": ["كرة طائرة"], "كورة": ["كرة"], "طيارة ورق": ["طائرة ورقية"], "صحن طاير": ["صحن طائر"], "لمبة علاء الدين": ["مصباح علاء الدين"], "طاسة": ["مقلاة"], "ترولي": ["عربة تسوق"], "برميل زبالة": ["حاوية زبالة"], "إشارة": ["إشارة مرور"], "صراف": ["صراف آلي"], "موتر": ["دراجة نارية"], "باراشوت": ["مظلة هبوط"], "عربانة": ["عربة"], "مرجيحة": ["أرجوحة"], "عش طير": ["عش طائر"], "شنطة مدرسة": ["حقيبة مدرسية"]};
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
const board = (room, all) => { const g = room.g; return room.players.filter(p => all || p.connected).map(p => ({ id: p.id, name: p.name, av: p.av, pts: g.scores[p.id] || 0, ok: g.guessed.has(p.id) || p.id === g.drawer, off: !p.connected })).sort((a, b) => b.pts - a.pts); };
const clearG = g => { clearTimeout(g.timer); g.timers.forEach(clearTimeout); g.timers = []; };

function startGuess(room, target) {
  room.g = { turn: 0, target, scores: {}, guessed: new Set(), timers: [], used: new Set(), strokes: [] };
  room.players.forEach(p => room.g.scores[p.id] = 0);
  room.phase = 'guess'; room.g.stage = 'loading'; room.g.loadEnd = Date.now() + 15000;
  io.to(room.code).emit('gload', { ms: 15000, target });
  room.g.timer = setTimeout(() => nextTurn(room), 15000);
}
function nextTurn(room) {
  const g = room.g, n = room.players.length; clearG(g);
  if (Object.values(g.scores).some(v => v >= g.target)) return endGuess(room);
  const d = room.players[g.turn % n]; g.turn++;
  if (!d.connected) return nextTurn(room);
  Object.assign(g, { drawer: d.id, word: null, guessed: new Set(), stage: 'choose', choices: pickWords(g), strokes: [], rev: new Set() });
  io.to(room.code).emit('gturn', { drawer: d.name, drawerId: d.id, turn: g.turn, target: g.target, board: board(room) });
  io.to(d.id).emit('gchoose', g.choices);
  g.timer = setTimeout(() => startDraw(room, g.choices[0]), 15000);
}
function startDraw(room, word) {
  const g = room.g; clearG(g);
  g.word = word; g.strokes = []; g.stage = 'draw'; g.seconds = Math.round(80 * (room.speed || 1)); g.t0 = Date.now(); g.rev = new Set();
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
function endGuess(room) { room.phase = 'gover'; io.to(room.code).emit('gover', board(room, true)); }

// ================= لوحة المطوّر =================
// الرمز السري ما يتكتب في الكود أبدًا (الكود عام على GitHub)، ينقرأ من متغير البيئة ADMIN_CODE في Render
const crypto = require('crypto');
const ADMIN_CODE = process.env.ADMIN_CODE || '';
const sha = x => crypto.createHash('sha256').update(String(x)).digest();
const okCode = c => ADMIN_CODE.length >= 8 && crypto.timingSafeEqual(sha(c), sha(ADMIN_CODE));
const fails = new Map();
const ipOf = sk => String(sk.handshake.headers['x-forwarded-for'] || sk.handshake.address).split(',')[0].trim();
const snapshot = () => ({
  online: io.engine.clientsCount,
  rooms: [...rooms.values()].map(r => ({ code: r.code, phase: r.phase, hostId: r.hostId,
    players: r.players.map(p => ({ id: p.id, name: p.name, av: p.av, connected: p.connected })) })),
});
const GRACE = 30000;   // مهلة الرجوع بعد الانقطاع (ثواني × 1000)

// اللاعب رجع بجلسة جديدة: نبدّل رقم جلسته في كل مكان
function reid(room, p, newId) {
  const oldId = p.id; p.id = newId;
  if (room.hostId === oldId) room.hostId = newId;
  if (room.submitted && room.submitted.has(oldId)) { room.submitted.delete(oldId); room.submitted.add(newId); }
  const g = room.g;
  if (g) {
    if (g.drawer === oldId) g.drawer = newId;
    if (g.guessed && g.guessed.has(oldId)) { g.guessed.delete(oldId); g.guessed.add(newId); }
    if (g.scores && oldId in g.scores) { g.scores[newId] = g.scores[oldId]; delete g.scores[oldId]; }
  }
}

// نرسل للاعب الحالة الحالية للعبة (يستخدم للرجوع، الدخول المتأخر، والمزامنة)
function syncState(room, socket, p) {
  if (room.phase === 'lobby') return socket.emit('lobby', lobbyPayload(room));
  if (room.phase === 'play') {
    if (p.spec) return socket.emit('swait', { spec: true });
    if (!room.submitted.has(p.id) && p.task) {
      const left = Math.max(5, p.task.seconds - Math.floor((Date.now() - p.task.t0) / 1000));
      socket.emit('task', { ...p.task, seconds: left });
    } else socket.emit('swait', {});
    return socket.emit('progress', { done: room.submitted.size, total: room.players.length });
  }
  if (room.phase === 'reveal') {
    socket.emit('reveal', chainsPayload(room));
    for (let i = 0; i <= room.rv.i; i++) socket.emit('step', { k: room.rv.k, i });
    if (room.rv.done) socket.emit('end');
    return;
  }
  if (room.phase === 'gover') return socket.emit('gover', board(room, true));
  if (room.phase === 'guess') {
    const g = room.g;
    if (g.stage === 'loading') return socket.emit('gload', { ms: Math.max(1500, g.loadEnd - Date.now()), target: g.target });
    const d = room.players.find(x => x.id === g.drawer), me = socket.id === g.drawer;
    socket.emit('gsync', {
      drawerId: g.drawer, drawer: d ? d.name : '', turn: g.turn, target: g.target, board: board(room), stage: g.stage,
      hint: g.word ? [...g.word].map((c, i) => c === ' ' ? ' ' : g.rev && g.rev.has(i) ? c : '_') : [],
      left: g.stage === 'draw' ? Math.max(1, Math.round((g.t0 + g.seconds * 1000 - Date.now()) / 1000)) : 0,
      total: g.seconds || 0, word: me ? g.word : null, choices: me && g.stage === 'choose' ? g.choices : null,
      strokes: g.strokes || [],
    });
  }
}

function rejoin(socket, room, p, cb) {
  clearTimeout(p.grace);
  if (p.id !== socket.id) {
    const o = io.sockets.sockets.get(p.id);
    if (o) { o.leave(room.code); o.data.code = null; }
    reid(room, p, socket.id);
  }
  p.connected = true;
  socket.join(room.code); socket.data.code = room.code;
  cb({ ok: true, code: room.code });
  if (room.phase === 'lobby') sendLobby(room); else syncState(room, socket, p);
}

// انقطع اتصاله: نعطيه مهلة يرجع قبل ما نشيله
function markDown(socket) {
  const room = rooms.get(socket.data.code); if (!room) return;
  const p = findId(room, socket.id); if (!p) return;
  p.connected = false;
  if (room.phase === 'lobby') sendLobby(room);
  clearTimeout(p.grace); p.grace = setTimeout(() => finalize(room, p), GRACE);
}

function finalize(room, p) {
  if (p.connected || !rooms.has(room.code)) return;
  if (p.spec) { room.spec = (room.spec || []).filter(x => x !== p); return; }
  if (room.phase === 'lobby') room.players = room.players.filter(x => x !== p);
  const alive = room.players.filter(x => x.connected);
  if (!alive.length) { clearTimeout(room.timer); if (room.g) clearG(room.g); rooms.delete(room.code); return; }
  if (room.hostId === p.id) { const nh = alive[Math.random() * alive.length | 0]; room.hostId = nh.id; io.to(room.code).emit('host', { id: nh.id, name: nh.name }); }
  if (room.phase === 'lobby') sendLobby(room);
  else if (room.phase === 'play' && alive.every(x => room.submitted.has(x.id))) endRound(room);
  else if (room.phase === 'guess') {
    const g = room.g;
    if (g.stage === 'draw' && (g.drawer === p.id || alive.filter(x => x.id !== g.drawer).every(x => g.guessed.has(x.id)))) endTurn(room);
    else if (g.stage === 'choose' && g.drawer === p.id) nextTurn(room);
  }
}

function leaveNow(socket) {
  const code = socket.data.code, room = rooms.get(code);
  if (code) socket.leave(code);
  socket.data.code = null;
  const p = room && findId(room, socket.id);
  if (p) { clearTimeout(p.grace); p.connected = false; finalize(room, p); }
}

function kickSocket(id, why) {
  const t = io.sockets.sockets.get(id);
  if (!t) return;
  leaveNow(t); t.emit('kicked', why);
}
setInterval(() => { const a = io.sockets.adapter.rooms.get('admins'); if (a && a.size) io.to('admins').emit('admin:snapshot', snapshot()); }, 3000);

io.on('connection', socket => {
  socket.on('create', (arg, cb) => {
    if (typeof cb !== 'function') return;
    const a = typeof arg === 'string' ? { name: arg } : (arg || {});
    const room = { code: makeCode(), hostId: socket.id, players: [], spec: [], phase: 'lobby',
                   round: 0, chains: [], submitted: new Set(), timer: null };
    rooms.set(room.code, room);
    addPlayer(socket, room, clean(a.name), sanitizeTok(a.pid));
    cb({ ok: true, code: room.code });
  });

  socket.on('join', (arg, cb) => {
    if (typeof cb !== 'function') return;
    const { name, code, pid } = arg || {};
    const room = rooms.get(String(code || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, ''));
    if (!room) return cb({ ok: false, error: 'الغرفة غير موجودة' });
    const tok = sanitizeTok(pid), nm0 = clean(name), nkey = x => String(x).trim().toLowerCase();
    // نفس اللاعب يرجع لمكانه: بنفس الهوية، أو بنفس الاسم لو مكانه القديم منقطع (نقاطه تنحفظ)
    const known = findTok(room, tok) || everyone(room).find(p => !p.connected && nkey(p.name) === nkey(nm0));
    if (known) { known.token = tok; return rejoin(socket, room, known, cb); }
    if (everyone(room).filter(p => p.connected).length >= 12) return cb({ ok: false, error: 'الغرفة ممتلئة' });
    let nm = nm0, i = 2;
    while (everyone(room).some(p => nkey(p.name) === nkey(nm))) nm = `${nm0} ${i++}`;
    if (room.phase === 'play' || room.phase === 'reveal') {      // تلفون مكسور شغّال: يتفرّج لين تخلص
      const p = addPlayer(socket, room, nm, tok, true); syncState(room, socket, p);
    } else {
      const p = addPlayer(socket, room, nm, tok);
      if (room.phase === 'guess') { room.g.scores[socket.id] = 0; io.to(room.code).emit('gboard', board(room)); }
      if (room.phase !== 'lobby') syncState(room, socket, p);
    }
    cb({ ok: true, code: room.code });
  });

  socket.on('sync', cb => {
    const room = rooms.get(socket.data.code), p = room && findId(room, socket.id);
    if (!p) return typeof cb === 'function' && cb({ ok: false });
    syncState(room, socket, p);
    if (typeof cb === 'function') cb({ ok: true });
  });

  socket.on('start', (opts, cb) => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    room.players = room.players.filter(p => p.connected);
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
    else { rv.done = true; return io.to(room.code).emit('end'); }
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
    if (!room || room.phase !== 'guess' || room.g.stage !== 'draw' || socket.id !== room.g.drawer || !st || !Array.isArray(st.a)) return;
    const g = room.g, ok = [], hex = /^#[0-9a-f]{6}$/i;
    for (const x of st.a.slice(0, 300)) {
      if (!x || typeof x !== 'object') continue;
      let o = null;
      if (x.t === 'c') { g.strokes = []; o = { t: 'c' }; }
      else if (x.t === 'l' && [x.x0, x.y0, x.x1, x.y1, x.w].every(Number.isFinite) && hex.test(x.c)) o = { t: 'l', x0: x.x0, y0: x.y0, x1: x.x1, y1: x.y1, w: x.w, c: x.c };
      else if (x.t === 'f' && [x.x, x.y].every(Number.isFinite) && hex.test(x.c)) o = { t: 'f', x: x.x, y: x.y, c: x.c };
      if (!o) continue;
      ok.push(o); if (o.t !== 'c' && g.strokes.length < 6000) g.strokes.push(o);
    }
    if (ok.length) socket.to(room.code).emit('gs', { a: ok });
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
    if (a === b || (ALIASES[g.word] || []).some(x => norm(x) === a)) {
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
    (room.spec || []).filter(p => p.connected).forEach(p => { delete p.spec; room.players.push(p); });
    room.spec = [];
    room.phase = 'lobby';
    sendLobby(room);
  });

  socket.on('disconnect', () => markDown(socket));

  // ---- أوامر المطوّر (كلها تتأكد إن الجلسة مسجّلة دخول كمطوّر) ----
  socket.on('admin:login', (code, cb) => {
    if (typeof cb !== 'function') return;
    if (ADMIN_CODE.length < 8) return cb({ ok: false, error: 'اللوحة غير مفعّلة على السيرفر' });
    const ip = ipOf(socket), f = fails.get(ip) || { n: 0, until: 0 };
    if (f.until > Date.now()) return cb({ ok: false, error: 'محاولات كثيرة، انتظر 5 دقايق وجرّب' });
    if (typeof code === 'string' && okCode(code)) {
      fails.delete(ip); socket.data.admin = true; socket.join('admins');
      cb({ ok: true }); return socket.emit('admin:snapshot', snapshot());
    }
    f.n++; if (f.n >= 5) { f.until = Date.now() + 5 * 60 * 1000; f.n = 0; }
    fails.set(ip, f); cb({ ok: false, error: 'الرمز غلط' });
  });
  socket.on('admin:refresh', () => { if (socket.data.admin) socket.emit('admin:snapshot', snapshot()); });
  socket.on('admin:kick', id => { if (socket.data.admin && typeof id === 'string') kickSocket(id, 'المطوّر أخرجك من الغرفة'); });
  socket.on('admin:close', code => {
    if (!socket.data.admin) return;
    const room = rooms.get(code); if (!room) return;
    everyone(room).forEach(p => kickSocket(p.id, 'المطوّر أغلق الغرفة'));
  });
  socket.on('admin:reset', code => {
    if (!socket.data.admin) return;
    const room = rooms.get(code); if (!room) return;
    clearTimeout(room.timer); if (room.g) clearG(room.g);
    room.players = room.players.filter(p => p.connected); room.phase = 'lobby'; sendLobby(room);
  });
  socket.on('admin:broadcast', ({ text, code } = {}) => {
    if (!socket.data.admin || typeof text !== 'string' || !text.trim()) return;
    (code ? io.to(String(code)) : io).emit('announce', text.trim().slice(0, 140));
  });
  socket.on('leave', () => leaveNow(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`http://localhost:${PORT}`));
