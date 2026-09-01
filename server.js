const http = require('http');
const fs   = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

// Static files served from __dirname
const STATIC = ['index.html', 'manifest.json', 'sw.js', 'logo.jpg'];

const server = http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }

  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filename = urlPath.slice(1); // strip leading /

  if (STATIC.includes(filename)) {
    const ext  = path.extname(filename);
    const mime = MIME[ext] || 'application/octet-stream';
    fs.readFile(path.join(__dirname, filename), (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': filename === 'sw.js' ? 'no-cache' : 'public, max-age=3600',
      });
      res.end(data);
    });
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 2e6, // 2MB for base64 images
});

// rooms: { code: { players: [socketId, ...], data: {socketId: {...}} } }
const rooms = {};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? generateCode() : code;
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ── Create Room ──────────────────────────────────────────
  socket.on('createRoom', ({ name, avatar }, cb) => {
    const code = generateCode();
    rooms[code] = {
      players: [socket.id],
      data: {
        [socket.id]: { name, avatar, x: 0, y: 0, score: 0, currentQ: 0 }
      }
    };
    socket.join(code);
    socket.roomCode = code;
    console.log(`[Room] ${code} created by ${name}`);
    cb({ ok: true, code });
  });

  // ── Join Room ─────────────────────────────────────────────
  socket.on('joinRoom', ({ code, name, avatar }, cb) => {
    const room = rooms[code];
    if (!room) { cb({ ok: false, error: 'Room code does not exist.' }); return; }
    if (room.players.length >= 2) { cb({ ok: false, error: 'Room is full.' }); return; }

    room.players.push(socket.id);
    room.data[socket.id] = { name, avatar, x: 0, y: 0, score: 0, currentQ: 0 };
    socket.join(code);
    socket.roomCode = code;

    // Send opponent data to joiner
    const opponentId = room.players[0];
    const opponentData = room.data[opponentId];
    cb({ ok: true, code, opponent: opponentData });

    // Notify host that opponent joined
    socket.to(code).emit('opponentJoined', { name, avatar });
    console.log(`[Room] ${code} joined by ${name}`);
  });

  // ── Player Data Update (name + avatar) ───────────────────
  socket.on('playerDataUpdate', ({ name, avatar }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    rooms[code].data[socket.id] = { ...rooms[code].data[socket.id], name, avatar };
    socket.to(code).emit('opponentDataUpdate', { name, avatar });
  });

  // ── Position Update ───────────────────────────────────────
  socket.on('positionUpdate', ({ x, y, vx, vy, rot }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    if (rooms[code].data[socket.id]) {
      rooms[code].data[socket.id].x = x;
      rooms[code].data[socket.id].y = y;
    }
    socket.to(code).emit('opponentPosition', { x, y, vx, vy, rot });
  });

  // ── Score/Progress Update ─────────────────────────────────
  socket.on('scoreUpdate', ({ score, currentQ, hearts }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    if (rooms[code].data[socket.id]) {
      Object.assign(rooms[code].data[socket.id], { score, currentQ, hearts });
    }
    socket.to(code).emit('opponentScore', { score, currentQ, hearts });
  });

  // ── Level Start (sync both players) ──────────────────────
  socket.on('levelReady', ({ levelKey }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    socket.to(code).emit('opponentReady', { levelKey });
  });

  // ── Win ───────────────────────────────────────────────────
  socket.on('playerWon', ({ name, score, stars }) => {
    const code = socket.roomCode;
    if (!code || !rooms[code]) return;
    io.to(code).emit('raceResult', { winner: name, score, stars });
  });

  // ── Disconnect ────────────────────────────────────────────
  socket.on('disconnect', () => {
    const code = socket.roomCode;
    if (code && rooms[code]) {
      socket.to(code).emit('opponentLeft');
      rooms[code].players = rooms[code].players.filter(id => id !== socket.id);
      delete rooms[code].data[socket.id];
      if (rooms[code].players.length === 0) {
        delete rooms[code];
        console.log(`[Room] ${code} closed`);
      }
    }
    console.log(`[-] Disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => console.log(`Grammar Roll Multiplayer listening on port ${PORT}`));
