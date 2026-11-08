const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 2e6 });
app.use(express.static('public'));

const rooms = new Map();
const clean = s => String(s || '').trim().slice(0, 16) || 'لاعب';
const makeCode = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do { code = Array.from({ length: 4 }, () => c[Math.floor(Math.random() * c.length)]).join(''); }
  while (rooms.has(code));
  return code;
};

// اللاعب i في الجولة r يشتغل على سلسلة اللاعب (i - r)
const chainIdx = (room, i) => (i - room.round + room.players.length) % room.players.length;

function sendLobby(room) {
  io.to(room.code).emit('lobby', {
    code: room.code,
    hostId: room.hostId,
    players: room.players.map(p => p.name),
  });
}

function startRound(room) {
  const r = room.round, n = room.players.length;
  const isDraw = r % 2 === 1;
  const seconds = r === 0 ? 45 : isDraw ? 75 : 50;
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
  room.players.push({ id: socket.id, name, connected: true });
  socket.join(room.code);
  socket.data.code = room.code;
  sendLobby(room);
}

io.on('connection', socket => {
  socket.on('create', (name, cb) => {
    const room = { code: makeCode(), hostId: socket.id, players: [], phase: 'lobby',
                   round: 0, chains: [], submitted: new Set(), timer: null };
    rooms.set(room.code, room);
    addPlayer(socket, room, clean(name));
    cb({ ok: true });
  });

  socket.on('join', ({ name, code }, cb) => {
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return cb({ ok: false, error: 'الغرفة غير موجودة' });
    if (room.phase !== 'lobby') return cb({ ok: false, error: 'اللعبة بدأت' });
    if (room.players.length >= 12) return cb({ ok: false, error: 'الغرفة ممتلئة' });
    addPlayer(socket, room, clean(name));
    cb({ ok: true });
  });

  socket.on('start', cb => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    if (room.players.length < 2) return cb({ ok: false, error: 'تحتاج لاعبين على الأقل' });
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

  socket.on('restart', () => {
    const room = rooms.get(socket.data.code);
    if (!room || room.hostId !== socket.id || room.phase !== 'reveal') return;
    room.players = room.players.filter(p => p.connected);
    room.phase = 'lobby';
    sendLobby(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    const p = room.players.find(x => x.id === socket.id);
    if (!p) return;
    if (room.phase === 'lobby') room.players = room.players.filter(x => x !== p);
    else p.connected = false;
    const alive = room.players.filter(x => x.connected);
    if (!alive.length) { clearTimeout(room.timer); rooms.delete(room.code); return; }
    if (room.hostId === socket.id) { room.hostId = alive[0].id; io.to(room.code).emit('host', room.hostId); }
    if (room.phase === 'lobby') sendLobby(room);
    else if (room.phase === 'play' && alive.every(x => room.submitted.has(x.id))) endRound(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`http://localhost:${PORT}`));
