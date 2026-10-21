import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { createRuntime } from '../server/index.js';
import { io as createSocket } from 'socket.io-client';

function waitFor(socket, event, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });
}

function makePdf() {
  const stream = 'BT /F1 20 Tf 40 100 Td (Room Presenter smoke test) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 180] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}


test('PowerPoint uploads are stored and served unchanged without server conversion', async (t) => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'room-presenter-pptx-test-'));
  const runtime = createRuntime({ dataDir, serveClient: false });
  t.after(async () => {
    await runtime.close();
    await fsp.rm(dataDir, { recursive: true, force: true });
  });
  const address = await runtime.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${address.port}`;
  const room = await fetch(`${base}/api/rooms`, { method: 'POST' }).then((r) => r.json());
  const bytes = await fsp.readFile(new URL('./fixtures/browser-render-smoke.pptx', import.meta.url));
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), 'browser-render-smoke.pptx');
  const uploadResponse = await fetch(`${base}/api/rooms/${room.roomId}/upload`, { method: 'POST', body: form });
  assert.equal(uploadResponse.status, 201);
  const uploaded = await uploadResponse.json();
  assert.equal(uploaded.deck.fileType, 'pptx');
  assert.match(uploaded.deck.fileUrl, /^\/api\/decks\//);
  const download = await fetch(`${base}${uploaded.deck.fileUrl}`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-type'), /presentationml\.presentation/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes, 'the upload route must preserve the original PPTX bytes');
});

test('room creation and original PDF upload/download work end-to-end without conversion', async (t) => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'room-presenter-test-'));
  const runtime = createRuntime({ dataDir, serveClient: false });
  t.after(async () => {
    await runtime.close();
    await fsp.rm(dataDir, { recursive: true, force: true });
  });
  const address = await runtime.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${base}/api/health`).then((r) => r.json());
  assert.equal(health.ok, true);

  const createdResponse = await fetch(`${base}/api/rooms`, { method: 'POST' });
  assert.equal(createdResponse.status, 201);
  const room = await createdResponse.json();
  assert.match(room.roomId, /^[A-Z2-9]{8,12}$/);
  assert.match(room.uploadUrl, /\/upload\//);

  const form = new FormData();
  form.append('file', new Blob([makePdf()], { type: 'application/pdf' }), 'smoke-test.pdf');
  const uploadResponse = await fetch(`${base}/api/rooms/${room.roomId}/upload`, { method: 'POST', body: form });
  assert.equal(uploadResponse.status, 201);
  const uploaded = await uploadResponse.json();
  assert.equal(uploaded.ok, true);
  assert.equal(uploaded.deck.title, 'smoke-test');

  assert.equal(uploaded.deck.fileType, 'pdf');
  const pdfResponse = await fetch(`${base}${uploaded.deck.fileUrl}`);
  assert.equal(pdfResponse.status, 200);
  assert.match(pdfResponse.headers.get('content-type'), /application\/pdf/);
  const bytes = Buffer.from(await pdfResponse.arrayBuffer());
  assert.equal(bytes.subarray(0, 8).toString(), '%PDF-1.4');

  const roomDetails = await fetch(`${base}/api/rooms/${room.roomId}`).then((r) => r.json());
  assert.equal(roomDetails.deck.deckId, uploaded.deck.deckId);
  assert.equal(roomDetails.deck.fileUrl, uploaded.deck.fileUrl);
  assert.equal(Object.hasOwn(roomDetails.deck, 'filePath'), false, 'server filesystem paths must not be exposed');

  const presenter = createSocket(base, { transports: ['websocket'] });
  const controller = createSocket(base, { transports: ['websocket'] });
  t.after(() => { presenter.disconnect(); controller.disconnect(); });
  await Promise.all([waitFor(presenter, 'connect'), waitFor(controller, 'connect')]);
  const presenterStatePromise = waitFor(presenter, 'room-state');
  presenter.emit('join-room', { roomId: room.roomId, role: 'presenter' });
  const presenterState = await presenterStatePromise;
  assert.equal(presenterState.deck.deckId, uploaded.deck.deckId);

  const controllerStatePromise = waitFor(controller, 'room-state');
  controller.emit('join-room', { roomId: room.roomId, role: 'controller' });
  const controllerState = await controllerStatePromise;
  assert.equal(controllerState.deck.deckId, uploaded.deck.deckId);

  const commandPromise = waitFor(presenter, 'remote-control');
  controller.emit('remote-control', { action: 'next' });
  assert.deepEqual(await commandPromise, { action: 'next' });

  const slideStatePromise = waitFor(controller, 'slide-state');
  presenter.emit('slide-state', { pageNumber: 2, pageCount: 4, zoom: 1.2 });
  assert.deepEqual(await slideStatePromise, { pageNumber: 2, pageCount: 4, zoom: 1.2 });

  const spoofRoom = await fetch(`${base}/api/rooms`, { method: 'POST' }).then((r) => r.json());
  const spoofForm = new FormData();
  spoofForm.append('file', new Blob(['this is not actually a pdf'], { type: 'application/pdf' }), 'spoof.pdf');
  const spoofResponse = await fetch(`${base}/api/rooms/${spoofRoom.roomId}/upload`, { method: 'POST', body: spoofForm });
  assert.equal(spoofResponse.status, 415, 'file signature validation must reject extension-only spoofing');

  const unknownRoom = await fetch(`${base}/api/rooms/NOPE1234/upload`, { method: 'POST' });
  assert.equal(unknownRoom.status, 404);
});
