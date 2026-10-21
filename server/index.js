import express from 'express';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { Server as SocketServer } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4173);
const MAX_UPLOAD_MB = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 75));
const ROOM_TTL_HOURS = Math.max(1, Number(process.env.ROOM_TTL_HOURS || 3));
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(PROJECT_DIR, '.runtime'));
const ALLOWED_EXTENSIONS = new Set(['.ppt', '.pptx', '.pdf']);
const FRONTEND_ORIGINS = String(process.env.FRONTEND_ORIGINS || process.env.PUBLIC_APP_URL || '')
  .split(',').map((value) => value.trim().replace(/\/+$/, '')).filter(Boolean);

function originIsAllowed(origin) {
  return !origin || FRONTEND_ORIGINS.length === 0 || FRONTEND_ORIGINS.includes(origin.replace(/\/+$/, ''));
}
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomToken(length = 10) {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i += 1) result += ALPHABET[bytes[i] % ALPHABET.length];
  return result;
}

function getLanAddress() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const [name, items] of Object.entries(interfaces)) {
    for (const item of items || []) {
      if (item.family !== 'IPv4' || item.internal || item.address.startsWith('169.254.')) continue;
      const preferred = /wi-?fi|wireless|wlan|ethernet|en0|en1/i.test(name) ? 0 : 1;
      addresses.push({ address: item.address, preferred });
    }
  }
  addresses.sort((a, b) => a.preferred - b.preferred);
  return addresses[0]?.address || '127.0.0.1';
}

function baseUrlForRequest(req) {
  if (process.env.PUBLIC_BASE_URL?.trim()) return process.env.PUBLIC_BASE_URL.trim().replace(/\/$/, '');
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto = forwardedProto || req.protocol || 'http';
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host') || `localhost:${PORT}`;
  const parsed = new URL(`${proto}://${host}`);
  if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(parsed.hostname)) {
    const address = getLanAddress();
    const hintedPort = parsed.port || String(PORT);
    return `http://${address}:${hintedPort}`;
  }
  return `${proto}://${host}`;
}

function roomPayload(room, req) {
  const apiBaseUrl = baseUrlForRequest(req);
  const appBaseUrl = (process.env.PUBLIC_APP_URL || apiBaseUrl).trim().replace(/\/+$/, '');
  return {
    roomId: room.id,
    createdAt: room.createdAt,
    expiresAt: room.expiresAt,
    uploadUrl: `${appBaseUrl}/upload/${room.id}`,
    presentUrl: `${appBaseUrl}/present/${room.id}`,
    deck: room.deck ? {
      deckId: room.deck.deckId,
      title: room.deck.title,
      originalName: room.deck.originalName,
      uploadedAt: room.deck.uploadedAt,
      fileUrl: `${apiBaseUrl}/api/decks/${room.deck.deckId}`,
      fileType: room.deck.fileType,
    } : null,
  };
}

function cleanTitle(name) {
  const title = path.basename(name || 'Presentation').replace(/\.[^.]+$/, '').replace(/[<>"']/g, '').trim();
  return title.slice(0, 100) || 'Untitled presentation';
}

async function validateFileSignature(file) {
  const extension = path.extname(file.originalname).toLowerCase();
  const handle = await fsp.open(file.path, 'r');
  const header = Buffer.alloc(1024);
  let headerLength = 0;
  try { headerLength = (await handle.read(header, 0, header.length, 0)).bytesRead; } finally { await handle.close(); }
  const beginning = header.subarray(0, headerLength);
  const pdf = beginning.indexOf(Buffer.from('%PDF-')) >= 0 && beginning.indexOf(Buffer.from('%PDF-')) < 1024;
  const zip = beginning[0] === 0x50 && beginning[1] === 0x4b && [0x03, 0x05, 0x07].includes(beginning[2]) && [0x04, 0x06, 0x08].includes(beginning[3]);
  const oldPowerPoint = beginning.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  const valid = extension === '.pdf' ? pdf : extension === '.pptx' ? zip : oldPowerPoint;
  if (!valid) {
    const error = new Error('The file contents do not match the selected format. Please export the deck again and retry.');
    error.status = 415;
    throw error;
  }
}

async function removeDir(dirPath) {
  await fsp.rm(dirPath, { recursive: true, force: true }).catch(() => {});
}

export function createRuntime({ dataDir = DATA_DIR, serveClient = true } = {}) {
  fs.mkdirSync(path.join(dataDir, 'tmp'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'decks'), { recursive: true });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    const origin = req.headers.origin;
    if (origin && originIsAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    if (req.method === 'OPTIONS') {
      if (!originIsAllowed(origin)) return res.status(403).end();
      return res.status(204).end();
    }
    if (origin && !originIsAllowed(origin)) {
      return res.status(403).json({ error: 'This frontend origin is not allowed. Add it to FRONTEND_ORIGINS on the backend.' });
    }
    next();
  });

  const server = http.createServer(app);
  const io = new SocketServer(server, {
    maxHttpBufferSize: 1e6,
    cors: { origin: FRONTEND_ORIGINS.length ? FRONTEND_ORIGINS : true, methods: ['GET', 'POST'] },
  });
  const rooms = new Map();
  const decks = new Map();
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, path.join(dataDir, 'tmp')),
      filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
    }),
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) return cb(new Error('Please choose a .ppt, .pptx, or .pdf file.'));
      cb(null, true);
    },
  });

  function getRoom(id) {
    if (typeof id !== 'string' || !/^[A-Z2-9]{8,12}$/i.test(id)) return null;
    const room = rooms.get(id.toUpperCase());
    if (!room || room.expiresAt <= Date.now()) return null;
    return room;
  }

  app.get('/api/health', (_req, res) => res.json({ ok: true, name: 'room-presenter', maxUploadMb: MAX_UPLOAD_MB }));

  app.post('/api/rooms', (req, res) => {
    let id = randomToken();
    while (rooms.has(id)) id = randomToken();
    const createdAt = Date.now();
    const room = { id, createdAt, expiresAt: createdAt + ROOM_TTL_HOURS * 60 * 60 * 1000, deck: null, slideState: { pageNumber: 1, pageCount: 0, zoom: 1 }, busy: false, lastUploadAt: 0 };
    rooms.set(id, room);
    res.status(201).json(roomPayload(room, req));
  });

  app.get('/api/rooms/:roomId', (req, res) => {
    const room = getRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'This room has expired or does not exist. Create a new room on the board.' });
    res.setHeader('Cache-Control', 'no-store');
    res.json(roomPayload(room, req));
  });

  app.post('/api/rooms/:roomId/upload', (req, res, next) => {
    const room = getRoom(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'This room has expired or does not exist. Ask the presenter to create a new room.' });
    if (room.busy) return res.status(409).json({ error: 'A presentation is being prepared. Please wait a moment and try again.' });
    if (Date.now() - room.lastUploadAt < 1800) return res.status(429).json({ error: 'Please wait a second before sending another file.' });
    room.busy = true;
    room.lastUploadAt = Date.now();
    upload.single('file')(req, res, async (uploadError) => {
      if (uploadError) {
        room.busy = false;
        const status = uploadError.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ error: uploadError.code === 'LIMIT_FILE_SIZE' ? `This file is larger than ${MAX_UPLOAD_MB} MB.` : uploadError.message });
      }
      if (!req.file) { room.busy = false; return res.status(400).json({ error: 'Choose a PowerPoint or PDF file first.' }); }
      const deckId = crypto.randomBytes(18).toString('hex');
      const deckDir = path.join(dataDir, 'decks', deckId);
      try {
        await fsp.mkdir(deckDir, { recursive: true });
        await validateFileSignature(req.file);
        const extension = path.extname(req.file.originalname).toLowerCase();
        const storedPath = path.join(deckDir, `source${extension}`);
        await fsp.rename(req.file.path, storedPath);
        const deck = {
          deckId,
          title: cleanTitle(req.file.originalname),
          originalName: path.basename(req.file.originalname).slice(0, 160),
          uploadedAt: Date.now(),
          filePath: storedPath,
          fileType: extension.slice(1),
        };
        const oldDeck = room.deck;
        room.deck = deck;
        decks.set(deckId, deck);
        if (oldDeck) {
          decks.delete(oldDeck.deckId);
          await removeDir(path.join(dataDir, 'decks', oldDeck.deckId));
        }
        const publicDeck = { deckId, title: deck.title, originalName: deck.originalName, uploadedAt: deck.uploadedAt, fileUrl: `${baseUrlForRequest(req)}/api/decks/${deckId}`, fileType: deck.fileType };
        io.to(room.id).emit('deck-ready', publicDeck);
        res.status(201).json({ ok: true, deck: publicDeck, message: 'Your deck is ready on the presentation board.' });
      } catch (error) {
        await removeDir(deckDir);
        res.status(error.status || 500).json({ error: error.message || 'Upload failed. Please try again.' });
      } finally {
        await fsp.unlink(req.file.path).catch(() => {});
        room.busy = false;
      }
    });
  });

  app.get('/api/decks/:deckId', (req, res) => {
    const deckId = String(req.params.deckId || '');
    if (!/^[a-f0-9]{36}$/i.test(deckId)) return res.status(404).end();
    const deck = decks.get(deckId);
    if (!deck || !fs.existsSync(deck.filePath)) return res.status(404).json({ error: 'This presentation is no longer available.' });
    const contentTypes = {
      pdf: 'application/pdf',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    res.setHeader('Content-Type', contentTypes[deck.fileType] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(deck.originalName).replace(/[\"\\]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.sendFile(deck.filePath);
  });

  io.on('connection', (socket) => {
    socket.on('join-room', (input) => {
      const rawId = typeof input === 'string' ? input : input?.roomId;
      const role = typeof input === 'object' && input?.role === 'presenter' ? 'presenter' : 'controller';
      const room = getRoom(String(rawId || '').toUpperCase());
      if (!room) {
        socket.emit('room-error', { error: 'This room has expired or does not exist.' });
        return;
      }
      if (socket.data.roomId && socket.data.roomId !== room.id) socket.leave(socket.data.roomId);
      socket.data.roomId = room.id;
      socket.data.role = role;
      socket.join(room.id);
      const deck = room.deck ? {
        deckId: room.deck.deckId,
        title: room.deck.title,
        originalName: room.deck.originalName,
        uploadedAt: room.deck.uploadedAt,
        fileUrl: `/api/decks/${room.deck.deckId}`,
        fileType: room.deck.fileType,
      } : null;
      socket.emit('room-state', { deck, slideState: room.slideState });
    });

    socket.on('remote-control', (input = {}) => {
      if (socket.data.role !== 'controller') return;
      const room = getRoom(socket.data.roomId);
      if (!room) return socket.emit('room-error', { error: 'This room has expired or does not exist.' });
      const allowedActions = new Set(['next', 'previous', 'first', 'last', 'zoom-in', 'zoom-out', 'reset', 'goto']);
      const action = String(input.action || '');
      if (!allowedActions.has(action)) return;
      const command = { action };
      if (action === 'goto') {
        const target = Number(input.page);
        if (!Number.isInteger(target) || target < 1 || target > Math.max(1, Number(room.slideState?.pageCount || 1))) return;
        command.page = target;
      }
      socket.to(room.id).emit('remote-control', command);
    });

    socket.on('slide-state', (input = {}) => {
      if (socket.data.role !== 'presenter') return;
      const room = getRoom(socket.data.roomId);
      if (!room) return;
      const pageCount = Math.max(0, Math.min(10000, Math.floor(Number(input.pageCount) || 0)));
      const pageNumber = Math.max(1, Math.min(Math.max(1, pageCount), Math.floor(Number(input.pageNumber) || 1)));
      const zoom = Math.max(0.5, Math.min(2.1, Number(input.zoom) || 1));
      room.slideState = { pageNumber, pageCount, zoom };
      io.to(room.id).emit('slide-state', room.slideState);
    });
  });

  const cleanupTimer = setInterval(async () => {
    const now = Date.now();
    for (const [id, room] of rooms.entries()) {
      if (room.expiresAt > now || room.busy) continue;
      rooms.delete(id);
      if (room.deck) {
        decks.delete(room.deck.deckId);
        await removeDir(path.join(dataDir, 'decks', room.deck.deckId));
      }
    }
    const deckRoot = path.join(dataDir, 'decks');
    for (const name of await fsp.readdir(deckRoot).catch(() => [])) {
      if (!decks.has(name)) await removeDir(path.join(deckRoot, name));
    }
    const tmpRoot = path.join(dataDir, 'tmp');
    for (const name of await fsp.readdir(tmpRoot).catch(() => [])) {
      const tempPath = path.join(tmpRoot, name);
      const info = await fsp.stat(tempPath).catch(() => null);
      if (info && now - info.mtimeMs > 60 * 60 * 1000) await fsp.unlink(tempPath).catch(() => {});
    }
  }, 60_000);
  cleanupTimer.unref?.();

  if (serveClient) {
    const distDir = path.join(PROJECT_DIR, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir, { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, index: false }));
      app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
        return res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.use((error, _req, res, _next) => {
    res.status(error.status || 500).json({ error: error.message || 'Unexpected server error.' });
  });

  return {
    app, server, io, rooms, decks,
    listen(port = PORT, host = '0.0.0.0') {
      return new Promise((resolve) => server.listen(port, host, () => resolve(server.address())));
    },
    async close() {
      clearInterval(cleanupTimer);
      await new Promise((resolve) => io.close(() => resolve()));
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const runtime = createRuntime();
  runtime.listen(PORT, '0.0.0.0').then((address) => {
    console.log(`Room Presenter listening on http://0.0.0.0:${address.port}`);
    console.log(`Original presentation files live temporarily in ${DATA_DIR} and are cleaned up when rooms expire.`);
  });
}
