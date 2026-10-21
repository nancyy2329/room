import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import * as pdfjsLib from 'pdfjs-dist';
import gsap from 'gsap';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, CircleHelp,
  Copy, Expand, FileUp, Fingerprint, FileText, Link2, LoaderCircle, LockKeyhole,
  Maximize2, Monitor, MoveUpRight, Play, Plus, QrCode, ShieldCheck, Sparkles,
  Upload, Wifi, X, Minus, RotateCcw, Smartphone,
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const MAX_FILE_BYTES = 75 * 1024 * 1024;
// On Vercel, set these at build time to the public origin of the persistent
// Node/Socket.IO backend. Leave them blank for local same-origin development.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const SOCKET_BASE_URL = (import.meta.env.VITE_SOCKET_URL || API_BASE_URL).trim().replace(/\/+$/, '');
const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');

function apiUrl(path) {
  if (/^https?:\/\//i.test(String(path || ''))) return String(path);
  const suffix = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  return `${API_BASE_URL}${suffix}`;
}

function roomSocket() {
  const options = { transports: ['websocket', 'polling'] };
  return SOCKET_BASE_URL ? io(SOCKET_BASE_URL, options) : io(options);
}

function normalizeRoomPayload(payload) {
  if (!payload) return payload;
  const roomId = payload.roomId;
  return {
    ...payload,
    uploadUrl: PUBLIC_APP_URL && roomId ? `${PUBLIC_APP_URL}/upload/${roomId}` : payload.uploadUrl,
    presentUrl: PUBLIC_APP_URL && roomId ? `${PUBLIC_APP_URL}/present/${roomId}` : payload.presentUrl,
    deck: payload.deck ? {
      ...payload.deck,
      fileUrl: apiUrl(payload.deck.fileUrl || `/api/decks/${payload.deck.deckId}`),
    } : null,
  };
}

function Brand({ compact = false }) {
  return (
    <a className={`brand ${compact ? 'brand-compact' : ''}`} href="/" aria-label="Room home">
      <span className="brand-mark"><span /><span /><span /></span>
      {!compact && <span className="brand-word">room<span>.</span></span>}
    </a>
  );
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  return bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fileType(name = '') {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext === 'pdf' ? 'PDF' : 'POWERPOINT';
}

async function apiJson(url, options = {}) {
  let response;
  try {
    response = await fetch(apiUrl(url), { cache: 'no-store', ...options });
  } catch (error) {
    if (API_BASE_URL) {
      throw new Error(`Cannot reach the Room Presenter backend at ${API_BASE_URL}. Check that the backend is running and its CORS allowlist includes this Vercel domain.`);
    }
    throw error;
  }
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
  if (!response.ok) {
    if (!contentType.includes('application/json')) {
      if (!API_BASE_URL && /(^|\.)vercel\.app$/i.test(window.location.hostname)) {
        throw new Error('The Vercel frontend is running, but its Room Presenter API is not connected. Deploy server/index.js to a persistent Node host, then set VITE_API_BASE_URL and VITE_SOCKET_URL in Vercel and redeploy.');
      }
      throw new Error(`The Room Presenter API returned HTTP ${response.status} without JSON. Check VITE_API_BASE_URL and the backend deployment.`);
    }
    throw new Error(body.error || `The Room Presenter API returned HTTP ${response.status}. Please try again.`);
  }
  if (!contentType.includes('application/json')) {
    throw new Error('The Room Presenter backend did not return JSON. Check VITE_API_BASE_URL in your deployment settings.');
  }
  return body;
}

function useEnterAnimation(scopeRef, selector = '[data-animate]') {
  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return undefined;
    const ctx = gsap.context(() => {
      gsap.fromTo(selector, { y: 18, autoAlpha: 0 }, {
        y: 0, autoAlpha: 1, duration: 0.65, stagger: 0.075,
        ease: 'power3.out', clearProps: 'transform,opacity,visibility',
      });
    }, scope);
    return () => ctx.revert();
  }, [scopeRef, selector]);
}

function Home() {
  const rootRef = useRef(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  useEnterAnimation(rootRef);

  const startRoom = async () => {
    setCreating(true);
    setError('');
    try {
      const room = await apiJson('/api/rooms', { method: 'POST' });
      window.location.assign(`/present/${room.roomId}`);
    } catch (err) {
      setError(err.message || 'Could not open a room. Is the server running?');
      setCreating(false);
    }
  };

  return (
    <main className="home-shell" ref={rootRef}>
      <header className="site-header">
        <Brand />
        <div className="header-center"><span className="live-dot" /> NO ACCOUNT. NO FRICTION.</div>
        <a className="header-link" href="#how-it-works">How it works <MoveUpRight size={14} /></a>
      </header>

      <section className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow" data-animate><span className="eyebrow-line" /> BUILT FOR THE CLASSROOM</div>
          <h1 data-animate>Present the work.<br /><span>Skip the setup.</span></h1>
          <p className="hero-description" data-animate>
            One room for the whole class. Scan a QR code, send your deck, and present straight from the smart board — no sign-in, no editing tools, no fuss.
          </p>
          <div className="hero-actions" data-animate>
            <button type="button" className="button button-primary button-large" onClick={startRoom} disabled={creating}>
              {creating ? <LoaderCircle className="spin" size={18} /> : <Play size={16} fill="currentColor" />}
              {creating ? 'Opening room…' : 'Start a presentation'}
              {!creating && <ArrowRight size={16} />}
            </button>
            <a className="text-link" href="#how-it-works">See how it works <ArrowDown size={15} /></a>
          </div>
          {error && <p className="inline-error">{error}</p>}
          <div className="hero-proof" data-animate>
            <span><ShieldCheck size={15} /> No student accounts</span>
            <i />
            <span><LockKeyhole size={14} /> Temporary uploads</span>
            <i />
            <span><Monitor size={15} /> Board-first design</span>
          </div>
        </div>

        <div className="hero-visual" data-animate aria-label="A preview of the presentation room">
          <div className="visual-halo" />
          <div className="preview-topline"><span className="preview-pill"><span className="live-dot" /> ROOM READY</span><span className="preview-room">ROOM / 08A</span></div>
          <div className="presentation-mock">
            <div className="mock-content">
              <div className="mock-kicker">INTRO TO DESIGN SYSTEMS</div>
              <div className="mock-title">Ideas become<br /><em>interfaces.</em></div>
              <div className="mock-caption">A practical framework for turning<br />complexity into clarity.</div>
              <div className="mock-footer"><span>LECTURE 04 / 2026</span><span>01 — 18</span></div>
            </div>
            <div className="mock-orbit orbit-one" /><div className="mock-orbit orbit-two" /><div className="mock-orbit orbit-three" />
            <div className="mock-shape shape-a" /><div className="mock-shape shape-b" />
          </div>
          <div className="floating-upload">
            <div className="floating-icon"><QrCode size={17} /></div>
            <div><strong>Scan. Send. Present.</strong><span>Phone to smart board in seconds</span></div>
            <span className="floating-arrow"><ArrowUp size={15} /></span>
          </div>
          <div className="visual-index"><span>01</span><div /><span>04</span></div>
        </div>
      </section>

      <section className="workflow-section" id="how-it-works">
        <div className="section-heading" data-animate><span className="eyebrow">THREE STEPS, THAT'S IT</span><span className="section-aside">MADE FOR SHARED SCREENS</span></div>
        <div className="workflow-grid">
          <article className="workflow-card" data-animate><div className="workflow-number">01</div><div className="workflow-icon"><QrCode size={21} /></div><h3>Open a room</h3><p>Start on the smart board. Your room gets its own QR code and a shareable upload link.</p><span className="workflow-meta">THE BOARD IS READY</span></article>
          <article className="workflow-card" data-animate><div className="workflow-number">02</div><div className="workflow-icon"><Upload size={21} /></div><h3>Send the deck</h3><p>Scan with any phone or open the link. Upload a PowerPoint or PDF without creating an account.</p><span className="workflow-meta">NO APP REQUIRED</span></article>
          <article className="workflow-card" data-animate><div className="workflow-number">03</div><div className="workflow-icon"><Expand size={21} /></div><h3>Own the room</h3><p>Use smooth slide navigation, touch gestures, and zoom controls in a clean reader-only view.</p><span className="workflow-meta">READY TO PRESENT</span></article>
        </div>
      </section>

      <footer className="site-footer"><Brand /><span>Less setup. More presenting.</span><span className="footer-private"><span className="live-dot" /> PRIVATE BY DEFAULT</span></footer>
    </main>
  );
}

function UploadPage({ roomId }) {
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [remoteDeck, setRemoteDeck] = useState(null);
  const [mobilePanel, setMobilePanel] = useState('upload');
  const [slideState, setSlideState] = useState({ pageNumber: 1, pageCount: 0, zoom: 1 });
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef(null);
  const swipeStartRef = useRef(null);
  const remotePanelRef = useRef(null);
  useEnterAnimation(rootRef);

  useEffect(() => {
    let active = true;
    apiJson(`/api/rooms/${encodeURIComponent(roomId)}`).then((rawPayload) => {
      if (!active) return;
      const payload = normalizeRoomPayload(rawPayload);
      setRoom(payload);
      setRemoteDeck(payload.deck || null);
      if (payload.deck) setMobilePanel('remote');
    }).catch((err) => { if (active) setError(err.message); });

    const socket = roomSocket();
    socketRef.current = socket;
    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join-room', { roomId, role: 'controller' });
    });
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('room-state', (payload) => {
      setRemoteDeck(payload?.deck || null);
      if (payload?.slideState) setSlideState(payload.slideState);
    });
    socket.on('deck-ready', (payload) => {
      setRemoteDeck(payload);
      setSuccess(true);
      setFile(null);
      setProgress(100);
      setMobilePanel('remote');
    });
    socket.on('slide-state', (payload) => setSlideState(payload));
    socket.on('room-error', (payload) => setError(payload?.error || 'Room unavailable.'));
    return () => {
      active = false;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  const chooseFile = (nextFile) => {
    if (!nextFile) return;
    setSuccess(false); setError(''); setProgress(0);
    const ext = nextFile.name.split('.').pop()?.toLowerCase();
    if (!['ppt', 'pptx', 'pdf'].includes(ext)) { setFile(null); setError('Please choose a .ppt, .pptx, or .pdf file.'); return; }
    if (nextFile.size > MAX_FILE_BYTES) { setFile(null); setError('That file is larger than 75 MB. Choose a smaller presentation file.'); return; }
    setFile(nextFile);
  };

  const sendFile = () => {
    if (!file || uploading) return;
    setUploading(true); setProgress(0); setError(''); setSuccess(false);
    const formData = new FormData();
    formData.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(`/api/rooms/${encodeURIComponent(roomId)}/upload`));
    xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100)); };
    xhr.onload = () => {
      const body = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) {
        setSuccess(true); setProgress(100); setFile(null);
      } else {
        setError(body.error || 'Upload failed. Check your connection and try again.');
      }
      setUploading(false);
    };
    xhr.onerror = () => { setError(API_BASE_URL ? `Upload could not reach ${API_BASE_URL}. Check the backend URL and FRONTEND_ORIGINS/CORS settings.` : 'Connection lost. Make sure you are on the same network and try again.'); setUploading(false); };
    xhr.send(formData);
  };

  const sendRemoteControl = (action, page) => {
    if (!socketRef.current?.connected) { setError('Remote disconnected. Reconnect to the room to control the board.'); return; }
    socketRef.current.emit('remote-control', { action, page });
  };
  const remoteTouchStart = (event) => {
    const touch = event.changedTouches?.[0];
    if (touch) swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };
  const remoteTouchEnd = (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch || !swipeStartRef.current) return;
    const deltaX = touch.clientX - swipeStartRef.current.x;
    const deltaY = touch.clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 28) return;
    if (Math.abs(deltaX) > Math.abs(deltaY)) sendRemoteControl(deltaX < 0 ? 'next' : 'previous');
    else sendRemoteControl(deltaY < 0 ? 'next' : 'previous');
  };

  useEffect(() => {
    if (!success || !remoteDeck || !remotePanelRef.current || !window.matchMedia('(max-width: 820px)').matches) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    remotePanelRef.current.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }, [success, remoteDeck]);

  if (!room && !error) return <main className="upload-shell"><div className="loader-screen"><LoaderCircle className="spin" size={24} /> Connecting to room…</div></main>;
  if (!room && error) return <main className="upload-shell"><header className="upload-header"><Brand /></header><section className="expired-card"><div className="status-icon status-error"><CircleHelp size={22} /></div><h1>This room isn't available</h1><p>{error}</p><a href="/" className="button button-primary">Go to Room <ArrowRight size={16} /></a></section></main>;

  return (
    <main className="upload-shell" ref={rootRef}>
      <header className="upload-header"><Brand /><span className="upload-header-status"><span className="live-dot" /> CONNECTED TO ROOM <b>{roomId.slice(0, 5)}</b></span></header>
      <section className={`upload-layout ${mobilePanel === 'remote' ? 'mobile-mode-remote' : 'mobile-mode-upload'}`}>
        {remoteDeck && (
          <nav className="mobile-presenter-switch" aria-label="Presentation tools" role="group">
            <button
              type="button"
              className={mobilePanel === 'upload' ? 'is-active' : ''}
              aria-pressed={mobilePanel === 'upload'}
              onClick={() => { setMobilePanel('upload'); setSuccess(false); setFile(null); setError(''); setProgress(0); }}
            >
              <FileUp size={16} /> <span>Upload deck</span>
            </button>
            <button
              type="button"
              className={mobilePanel === 'remote' ? 'is-active' : ''}
              aria-pressed={mobilePanel === 'remote'}
              onClick={() => setMobilePanel('remote')}
            >
              <Smartphone size={16} /> <span>Remote control</span>
              <span className={`switch-live-dot ${socketConnected ? 'is-connected' : ''}`} aria-hidden="true" />
            </button>
          </nav>
        )}
        <div className="upload-copy" data-animate>
          <div className="eyebrow"><span className="eyebrow-line" /> CLASS PRESENTATION</div>
          <h1>Send your deck.<br /><span>Take the floor.</span></h1>
          <p>Upload your slides from this device. They'll appear on the presentation board as soon as they're ready.</p>
          <div className="upload-feature-list"><div><span className="feature-check"><Check size={13} /></span> No account or Google sign-in</div><div><span className="feature-check"><Check size={13} /></span> PowerPoint and PDF supported</div><div><span className="feature-check"><Check size={13} /></span> Reader mode — no editing</div></div>
          <div className="privacy-note"><LockKeyhole size={17} /><div><strong>Room-only transfer</strong><span>Your file is temporarily processed for this room, then removed when the room expires.</span></div></div>
        </div>

        <div className="upload-card" data-animate>
          {success ? (
            <div className="upload-success"><div className="success-mark"><Check size={25} /></div><span className="success-label">UPLOAD COMPLETE</span><h2>Your slides are on their way.</h2><p>Look at the smart board — the presentation will open there automatically.</p><div className="success-progress"><span /></div><button type="button" className="button button-secondary full-width" onClick={() => { setSuccess(false); setFile(null); setProgress(0); }}>Send another deck <RotateCcw size={15} /></button><span className="upload-card-foot"><Wifi size={13} /> Leave this page open until the board updates.</span></div>
          ) : (
            <>
              <div className="upload-card-heading"><div><span className="card-overline">ROOM {roomId.slice(0, 5)}</span><h2>Upload presentation</h2></div><span className="file-limit">MAX 75 MB</span></div>
              <div
                className={`drop-zone ${dragging ? 'drop-zone-active' : ''} ${file ? 'drop-zone-has-file' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files?.[0]); }}
                onClick={() => !uploading && inputRef.current?.click()}
                role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
              >
                <input ref={inputRef} type="file" accept=".ppt,.pptx,.pdf,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" hidden onChange={(e) => chooseFile(e.target.files?.[0])} />
                {file ? <><div className="drop-icon file-icon"><FileText size={23} /></div><strong className="file-name">{file.name}</strong><span className="drop-secondary">{formatBytes(file.size)} · {fileType(file.name)}</span><span className="change-file">Choose a different file</span></> : <><div className="drop-icon"><FileUp size={23} /></div><strong>Drop your presentation here</strong><span className="drop-secondary">or browse files on your device</span><span className="drop-types"><b>PPT</b><b>PPTX</b><b>PDF</b></span></>}
              </div>
              {error && <div className="upload-error"><CircleHelp size={15} /> {error}</div>}
              {uploading && <div className="progress-wrap"><div className="progress-label"><span>{progress >= 100 ? 'Preparing slides on board…' : 'Uploading presentation…'}</span><b>{progress}%</b></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
              <button type="button" className="button button-primary full-width upload-submit" onClick={sendFile} disabled={!file || uploading}>
                {uploading ? <LoaderCircle className="spin" size={17} /> : <Upload size={16} />}
                {uploading ? (progress >= 100 ? 'Preparing deck…' : 'Uploading…') : 'Send to presentation board'}
                {!uploading && <ArrowRight size={16} />}
              </button>
              <div className="secure-footer"><ShieldCheck size={14} /><span>Private room link</span><span className="secure-dot" /><span>Temporary file storage</span></div>
            </>
          )}
        </div>
        {remoteDeck && (
          <div className="mobile-remote-panel" data-animate ref={remotePanelRef}>
            <div className="remote-heading">
              <div className="remote-heading-icon"><Monitor size={18} /></div>
              <div className="remote-heading-copy"><span className="card-overline">BOARD REMOTE</span><strong>Control the presentation</strong><span className="remote-deck-title">{remoteDeck.title || remoteDeck.originalName || 'Presentation ready'}</span></div>
              <span className={`remote-connection ${socketConnected ? 'is-connected' : ''}`}><span />{socketConnected ? 'LIVE' : 'CONNECTING'}</span>
            </div>
            <div className="remote-slide-readout"><span>NOW SHOWING</span><strong>{String(slideState.pageNumber || 1).padStart(2, '0')}<i>/</i>{String(slideState.pageCount || '––').padStart(2, '0')}</strong><span>{Math.round((slideState.zoom || 1) * 100)}% ZOOM</span></div>
            <div className="remote-swipe-pad" onTouchStart={remoteTouchStart} onTouchEnd={remoteTouchEnd} role="group" aria-label="Swipe to change slide">
              <div className="swipe-pad-arrows"><ArrowLeft size={20} /><div className="swipe-pad-center"><ArrowUp size={18} /><span>SWIPE TO NAVIGATE</span><ArrowDown size={18} /></div><ArrowRight size={20} /></div>
              <span>Swipe left / up for next · right / down for previous</span>
            </div>
            <div className="remote-main-controls">
              <button type="button" className="remote-nav-button remote-prev" onClick={() => sendRemoteControl('previous')} disabled={!socketConnected || (slideState.pageNumber || 1) <= 1}><ArrowLeft size={18} /><span>Previous</span></button>
              <button type="button" className="remote-nav-button remote-next" onClick={() => sendRemoteControl('next')} disabled={!socketConnected || (slideState.pageCount > 0 && slideState.pageNumber >= slideState.pageCount)}><span>Next slide</span><ArrowRight size={20} /></button>
            </div>
            <div className="remote-scrubber">
              <div className="remote-scrubber-head"><label htmlFor="slide-scrubber">Jump to slide</label><span>{slideState.pageCount ? `${slideState.pageNumber} of ${slideState.pageCount}` : 'Waiting for slide count'}</span></div>
              <input id="slide-scrubber" type="range" min="1" max={Math.max(1, slideState.pageCount || 1)} value={Math.min(slideState.pageNumber || 1, Math.max(1, slideState.pageCount || 1))} disabled={!socketConnected || !slideState.pageCount} onChange={(event) => sendRemoteControl('goto', Number(event.target.value))} />
            </div>
            <div className="remote-utility-controls"><button type="button" onClick={() => sendRemoteControl('first')} disabled={!socketConnected || (slideState.pageNumber || 1) <= 1}><ArrowLeft size={14} /><ArrowLeft size={14} /> First</button><button type="button" onClick={() => sendRemoteControl('zoom-out')} disabled={!socketConnected || (slideState.zoom || 1) <= 0.5}><Minus size={14} /> Zoom out</button><button type="button" onClick={() => sendRemoteControl('zoom-in')} disabled={!socketConnected || (slideState.zoom || 1) >= 2.1}><Plus size={14} /> Zoom in</button><button type="button" onClick={() => sendRemoteControl('last')} disabled={!socketConnected || !slideState.pageCount || slideState.pageNumber >= slideState.pageCount}>Last <ArrowRight size={14} /><ArrowRight size={14} /></button></div>
            <p className="remote-privacy-note"><LockKeyhole size={13} /> Phone controls work only in this room. Keep this page open while presenting.</p>
          </div>
        )}
      </section>
      <footer className="upload-footer"><Brand compact /><span>ROOM / {roomId.slice(0, 5)}<span className="footer-separator">·</span> Built for shared screens</span><span className="footer-private"><span className="live-dot" /> NO LOGIN REQUIRED</span></footer>
    </main>
  );
}

function CopyButton({ text, compact = false }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea'); textarea.value = text; textarea.style.position = 'fixed'; textarea.style.opacity = '0'; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); textarea.remove();
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };
  return <button className={`copy-button ${compact ? 'copy-button-compact' : ''}`} type="button" onClick={copy} aria-label="Copy upload link">{copied ? <Check size={14} /> : <Copy size={14} />}{!compact && (copied ? 'Copied' : 'Copy link')}</button>;
}

function QrPanel({ uploadUrl, roomId, onClose, floating = false }) {
  return (
    <div className={`qr-panel ${floating ? 'qr-panel-floating' : ''}`}>
      <div className="qr-panel-header"><div><span className="card-overline">ROOM {roomId.slice(0, 5)}</span><strong>Invite a presenter</strong></div>{onClose && <button type="button" className="icon-button small-icon-button" onClick={onClose} aria-label="Close invite panel"><X size={15} /></button>}</div>
      <div className="qr-frame"><QRCodeSVG value={uploadUrl} size={150} level="M" includeMargin={false} bgColor="#ffffff" fgColor="#171b17" /></div>
      <div className="qr-instruction"><span className="scan-number">01</span><span>Open your camera and scan the code.</span></div>
      <div className="qr-instruction"><span className="scan-number">02</span><span>Choose a PPT, PPTX, or PDF to send.</span></div>
      <div className="upload-link-box"><div className="link-line"><Link2 size={14} /><span>{uploadUrl.replace(/^https?:\/\//, '')}</span></div><CopyButton text={uploadUrl} /></div>
      <div className="qr-panel-note"><LockKeyhole size={13} /> Anyone with this private link can upload to this room.</div>
    </div>
  );
}

function PresentationCanvas({ document: pdfDocument, pageNumber, zoom, areaRef, canvasRef, canvasWrapRef, pageDirection, onSize, stageSize }) {
  const lastPageRef = useRef(0);
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return undefined;
    const update = () => onSize({ width: area.clientWidth, height: area.clientHeight });
    const observer = new ResizeObserver(update);
    observer.observe(area); update();
    return () => observer.disconnect();
  }, [areaRef, onSize]);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current || !areaRef.current) return undefined;
    let cancelled = false;
    let renderTask = null;
    const draw = async () => {
      const canvas = canvasRef.current;
      const area = areaRef.current;
      if (!canvas || !area) return;
      const page = await pdfDocument.getPage(pageNumber);
      if (cancelled) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const usableW = Math.max(200, area.clientWidth - 82);
      const usableH = Math.max(180, area.clientHeight - 74);
      const fitScale = Math.min(usableW / baseViewport.width, usableH / baseViewport.height);
      const scale = Math.max(0.12, fitScale * zoom);
      const viewport = page.getViewport({ scale });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
      renderTask = page.render({ canvasContext: context, viewport, transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null, background: '#ffffff' });
      await renderTask.promise;
      if (cancelled) return;
      if (lastPageRef.current !== pageNumber && canvasWrapRef.current) {
        gsap.fromTo(canvasWrapRef.current, { y: pageDirection > 0 ? 25 : -25, autoAlpha: 0, scale: 0.988 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.38, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
        lastPageRef.current = pageNumber;
      }
    };
    draw().catch((error) => { if (!cancelled) console.error('Slide render failed:', error); });
    return () => { cancelled = true; if (renderTask) renderTask.cancel(); };
  }, [pdfDocument, pageNumber, zoom, areaRef, canvasRef, canvasWrapRef, pageDirection, stageSize]);

  return <div className="presentation-canvas-area" ref={areaRef}><div className="presentation-canvas-wrap" ref={canvasWrapRef}><canvas className="presentation-slide" ref={canvasRef} aria-label={`Slide ${pageNumber}`} /></div></div>;
}

function getSvgDimensions(markup) {
  const tag = markup.match(/<svg\b([^>]*)>/i)?.[1] || '';
  const viewBox = tag.match(/viewBox=[\"']([^\"']+)[\"']/i)?.[1]?.trim().split(/[ ,]+/).map(Number);
  if (viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) return { width: viewBox[2], height: viewBox[3] };
  const width = Number(tag.match(/\bwidth=[\"']([0-9.]+)/i)?.[1]) || 1280;
  const height = Number(tag.match(/\bheight=[\"']([0-9.]+)/i)?.[1]) || 720;
  return { width, height };
}

function sanitizeRenderedSvg(markup) {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  if (parsed.querySelector('parsererror') || parsed.documentElement?.tagName.toLowerCase() !== 'svg') {
    throw new Error('This PowerPoint slide could not be rendered safely. Try opening it in PowerPoint and saving it again.');
  }
  // Keep foreignObject: Web-PPT uses it for browser-native text layout. Removing it silently deletes all PowerPoint text.
  parsed.querySelectorAll('script, iframe, object, embed').forEach((node) => node.remove());
  parsed.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on')) node.removeAttribute(attribute.name);
      if (['href', 'xlink:href', 'src'].includes(name) && value && !/^(data:image\/|blob:|#)/.test(value)) {
        node.removeAttribute(attribute.name);
      }
      if ((name === 'style' || name === 'filter' || name === 'fill' || name === 'stroke') && /url\(\s*['\"]?(https?:|\/\/)/i.test(value)) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  parsed.querySelectorAll('style').forEach((style) => {
    if (/@import|url\(\s*['\"]?(?:https?:|\/\/)/i.test(style.textContent || '')) style.remove();
  });
  return new XMLSerializer().serializeToString(parsed.documentElement);
}

function PowerPointCanvas({ presentation, pageNumber, zoom, areaRef, canvasWrapRef, pageDirection, onSize, stageSize, onRenderError }) {
  const [svgMarkup, setSvgMarkup] = useState('');
  const [slideDimensions, setSlideDimensions] = useState({ width: 1280, height: 720 });
  const lastPageRef = useRef(0);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return undefined;
    const update = () => onSize({ width: area.clientWidth, height: area.clientHeight });
    const observer = new ResizeObserver(update);
    observer.observe(area); update();
    return () => observer.disconnect();
  }, [areaRef, onSize]);

  useEffect(() => {
    let cancelled = false;
    const draw = async () => {
      const slide = presentation?.slides?.[pageNumber - 1];
      if (!slide) throw new Error('This PowerPoint does not contain the selected slide.');
      const { renderSlideToSvg } = await import('@web-ppt/core');
      const rendered = await renderSlideToSvg(presentation, slide, { idPrefix: `room-slide-${pageNumber}-` });
      if (cancelled) return;
      const safeMarkup = sanitizeRenderedSvg(String(rendered));
      setSlideDimensions(getSvgDimensions(safeMarkup));
      setSvgMarkup(safeMarkup);
      onRenderError('');
      if (lastPageRef.current !== pageNumber && canvasWrapRef.current) {
        gsap.fromTo(canvasWrapRef.current, { y: pageDirection > 0 ? 25 : -25, autoAlpha: 0, scale: 0.988 }, { y: 0, autoAlpha: 1, scale: 1, duration: 0.38, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
        lastPageRef.current = pageNumber;
      }
    };
    draw().catch((error) => { if (!cancelled) onRenderError(error.message || 'Could not render this PowerPoint slide.'); });
    return () => { cancelled = true; };
  }, [presentation, pageNumber, areaRef, canvasWrapRef, pageDirection, onRenderError]);

  const usableW = Math.max(200, (stageSize.width || 0) - 82);
  const usableH = Math.max(180, (stageSize.height || 0) - 74);
  const fitScale = Math.min(usableW / slideDimensions.width, usableH / slideDimensions.height);
  const width = Math.max(1, Math.floor(slideDimensions.width * fitScale * zoom));
  const height = Math.max(1, Math.floor(slideDimensions.height * fitScale * zoom));

  return (
    <div className="presentation-canvas-area" ref={areaRef}>
      <div className="presentation-canvas-wrap presentation-svg-wrap" ref={canvasWrapRef} style={{ width, height }}>
        {svgMarkup && <div className="presentation-svg-content" aria-label={`Slide ${pageNumber}`} dangerouslySetInnerHTML={{ __html: svgMarkup }} />}
      </div>
    </div>
  );
}


function SlideThumbnail({ pdfDocument, presentation, pageNumber, active, onSelect }) {
  const canvasRef = useRef(null);
  const [svgMarkup, setSvgMarkup] = useState('');

  useEffect(() => {
    let cancelled = false;
    let renderTask = null;
    const render = async () => {
      if (pdfDocument) {
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(240 / baseViewport.width, 135 / baseViewport.height);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        renderTask = page.render({ canvasContext: context, viewport, background: '#ffffff' });
        await renderTask.promise;
      } else if (presentation) {
        const slide = presentation.slides?.[pageNumber - 1];
        if (!slide) return;
        const { renderSlideToSvg } = await import('@web-ppt/core');
        const rendered = renderSlideToSvg(presentation, slide, { idPrefix: `room-thumb-${pageNumber}-` });
        if (!cancelled) setSvgMarkup(sanitizeRenderedSvg(String(rendered)));
      }
    };
    render().catch((error) => { if (!cancelled) console.warn(`Thumbnail ${pageNumber} failed:`, error); });
    return () => { cancelled = true; if (renderTask) renderTask.cancel(); };
  }, [pdfDocument, presentation, pageNumber]);

  return (
    <button type="button" className={`chalk-slide-thumb ${active ? 'is-active' : ''}`} onClick={onSelect} aria-label={`Go to slide ${pageNumber}`} aria-current={active ? 'step' : undefined}>
      <span className="chalk-slide-preview">
        {pdfDocument ? <canvas ref={canvasRef} /> : svgMarkup && <div className="chalk-slide-svg" dangerouslySetInnerHTML={{ __html: svgMarkup }} />}
      </span>
      <span className="chalk-slide-number">{pageNumber}</span>
    </button>
  );
}

function SlideFilmstrip({ pdfDocument, presentation, pageCount, pageNumber, navigate }) {
  const visibleCount = Math.min(8, pageCount);
  const start = Math.max(1, Math.min(pageNumber - Math.floor(visibleCount / 2), pageCount - visibleCount + 1));
  const pages = Array.from({ length: visibleCount }, (_, index) => start + index);
  if (!pageCount) return null;
  return (
    <div className="chalk-filmstrip" aria-label="Slide thumbnails">
      <button type="button" className="chalk-filmstrip-arrow" aria-label="Scroll to previous slides" onClick={() => navigate(Math.max(1, start - visibleCount))} disabled={start === 1}><ArrowLeft size={20} /></button>
      <div className="chalk-filmstrip-track">
        {pages.map((number) => <SlideThumbnail key={number} pdfDocument={pdfDocument} presentation={presentation} pageNumber={number} active={number === pageNumber} onSelect={() => navigate(number)} />)}
      </div>
      <button type="button" className="chalk-filmstrip-arrow" aria-label="Scroll to next slides" onClick={() => navigate(Math.min(pageCount, start + visibleCount))} disabled={start + visibleCount - 1 >= pageCount}><ArrowRight size={20} /></button>
    </div>
  );
}

function ChalkRemoteRail({ pageNumber, pageCount, zoom, previousSlide, nextSlide, changeZoom, toggleFullscreen, onReset, onReplace }) {
  return (
    <aside className="chalkboard-right-rail">
      <div className="chalk-remote-heading"><span>Remote Control</span><small>FROM YOUR PHONE</small></div>
      <div className="chalk-remote-device">
        <div className="chalk-remote-readout">Slide {pageNumber} / {pageCount}</div>
        <button type="button" className="chalk-remote-round" onClick={previousSlide} disabled={pageNumber <= 1} aria-label="Previous slide"><ArrowUp size={30} /></button>
        <button type="button" className="chalk-remote-round" onClick={nextSlide} disabled={pageNumber >= pageCount} aria-label="Next slide"><ArrowDown size={30} /></button>
        <div className="chalk-remote-zoom">
          <button type="button" onClick={() => changeZoom(-0.1)} disabled={zoom <= 0.5} aria-label="Zoom out"><Minus size={20} /></button>
          <button type="button" onClick={() => changeZoom(0.1)} disabled={zoom >= 2.1} aria-label="Zoom in"><Plus size={20} /></button>
        </div>
        <button type="button" className="chalk-fit-button" onClick={toggleFullscreen}><Maximize2 size={17} /> Fit to Screen</button>
      </div>
      <p className="chalk-remote-caption">Use your phone to control slides wirelessly.</p>
      <div className="chalk-remote-status"><span className="live-dot" /> LIVE PRESENTATION</div>
      <div className="chalk-remote-actions" aria-label="Presentation actions">
        <button type="button" className="chalk-remote-action" onClick={onReset}><RotateCcw size={14} /> Reset presentation</button>
        <button type="button" className="chalk-remote-action chalk-remote-action-primary" onClick={onReplace}><FileUp size={14} /> Replace deck</button>
      </div>
    </aside>
  );
}

function Presenter({ roomId }) {
  const [room, setRoom] = useState(null);
  const [roomError, setRoomError] = useState('');
  const [deck, setDeck] = useState(null);
  const [pdfDocument, setPdfDocument] = useState(null);
  const [pptPresentation, setPptPresentation] = useState(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageDirection, setPageDirection] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loadingDeck, setLoadingDeck] = useState(false);
  const [deckError, setDeckError] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [stageSize, setStageSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [uploadProgress, setUploadProgress] = useState(0);
  const [localUploading, setLocalUploading] = useState(false);
  const fileInputRef = useRef(null);
  const stageAreaRef = useRef(null);
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const pdfRef = useRef(null);
  const socketRef = useRef(null);
  const deckLoadToken = useRef(0);
  const activeDeckIdRef = useRef(null);
  const lastWheelAt = useRef(0);
  const touchStartY = useRef(0);

  const setAreaSize = useCallback((size) => setStageSize((current) => current.width === size.width && current.height === size.height ? current : size), []);
  const hasDeck = Boolean(pdfDocument || pptPresentation);

  useEffect(() => {
    let active = true;
    apiJson(`/api/rooms/${encodeURIComponent(roomId)}`).then((rawPayload) => { if (active) setRoom(normalizeRoomPayload(rawPayload)); }).catch((error) => { if (active) setRoomError(error.message); });
    const socket = roomSocket();
    socketRef.current = socket;
    socket.on('connect', () => socket.emit('join-room', { roomId, role: 'presenter' }));
    socket.on('room-state', (payload) => { if (payload?.deck) loadDeck(payload.deck); });
    socket.on('deck-ready', (payload) => loadDeck(payload));
    socket.on('room-error', (payload) => setRoomError(payload.error || 'Room unavailable.'));
    const onFullscreenChange = () => setFullScreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => { active = false; socket.disconnect(); socketRef.current = null; document.removeEventListener('fullscreenchange', onFullscreenChange); };
    // loadDeck is intentionally declared below and stable through a ref-like callback pattern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const loadDeck = useCallback(async (payload) => {
    if (!payload?.deckId || activeDeckIdRef.current === payload.deckId) return;
    const token = ++deckLoadToken.current;
    activeDeckIdRef.current = payload.deckId;
    setLoadingDeck(true); setDeckError(''); setShowInvite(false);
    try {
      const fileUrl = apiUrl(payload.fileUrl || `/api/decks/${payload.deckId}`);
      const response = await fetch(fileUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('The uploaded file could not be opened. Send it again from your phone.');
      const data = new Uint8Array(await response.arrayBuffer());
      const extension = String(payload.fileType || payload.originalName?.split('.').pop() || 'pdf').toLowerCase();
      const previous = pdfRef.current;
      if (extension === 'pdf') {
        const documentTask = pdfjsLib.getDocument({ data });
        const document = await documentTask.promise;
        if (token !== deckLoadToken.current) { await document.destroy(); return; }
        pdfRef.current = document;
        setPdfDocument(document);
        setPptPresentation(null);
        setPageCount(document.numPages);
      } else if (['ppt', 'pptx'].includes(extension)) {
        const { parse } = await import('@web-ppt/core');
        const presentation = await parse(data);
        if (token !== deckLoadToken.current) return;
        if (!presentation?.slides?.length) throw new Error('No slides were found in this PowerPoint file.');
        pdfRef.current = null;
        setPdfDocument(null);
        setPptPresentation(presentation);
        setPageCount(presentation.slides.length);
      } else {
        throw new Error('Unsupported presentation format. Upload a PPT, PPTX, or PDF file.');
      }
      setPageNumber(1);
      setPageDirection(1);
      setZoom(1);
      setDeck({ ...payload, fileUrl, fileType: extension });
      setLoadingDeck(false);
      if (previous) await previous.destroy().catch(() => {});
    } catch (error) {
      if (token === deckLoadToken.current) { activeDeckIdRef.current = null; setDeckError(error.message || 'Could not render this presentation.'); setLoadingDeck(false); }
    }
  }, []);

  const navigate = useCallback((nextPage) => {
    setPageNumber((current) => {
      const next = Math.min(pageCount || 1, Math.max(1, nextPage));
      if (next === current) return current;
      setPageDirection(next > current ? 1 : -1);
      return next;
    });
  }, [pageCount]);

  const nextSlide = useCallback(() => navigate(pageNumber + 1), [navigate, pageNumber]);
  const previousSlide = useCallback(() => navigate(pageNumber - 1), [navigate, pageNumber]);
  const changeZoom = (amount) => setZoom((value) => Math.max(0.5, Math.min(2.1, Math.round((value + amount) * 10) / 10)));

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return undefined;
    const onRemoteControl = (command = {}) => {
      switch (command.action) {
        case 'next': nextSlide(); break;
        case 'previous': previousSlide(); break;
        case 'first': navigate(1); break;
        case 'last': navigate(pageCount); break;
        case 'goto': navigate(Number(command.page)); break;
        case 'zoom-in': changeZoom(0.1); break;
        case 'zoom-out': changeZoom(-0.1); break;
        case 'reset': setZoom(1); navigate(1); break;
        default: break;
      }
    };
    socket.on('remote-control', onRemoteControl);
    return () => socket.off('remote-control', onRemoteControl);
  }, [nextSlide, previousSlide, navigate, pageCount]);

  useEffect(() => {
    if (!hasDeck || !socketRef.current?.connected) return;
    socketRef.current.emit('slide-state', { pageNumber, pageCount, zoom });
  }, [hasDeck, deck?.deckId, pageNumber, pageCount, zoom]);

  useEffect(() => {
    if (!hasDeck) return undefined;
    const onKeyDown = (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); nextSlide(); }
      else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key)) { event.preventDefault(); previousSlide(); }
      else if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(0.1); }
      else if (event.key === '-') { event.preventDefault(); changeZoom(-0.1); }
      else if (event.key === 'Home') { event.preventDefault(); navigate(1); }
      else if (event.key === 'End') { event.preventDefault(); navigate(pageCount); }
      else if (event.key === 'Escape') setShowInvite(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasDeck, nextSlide, previousSlide, navigate, pageCount]);

  useEffect(() => () => { if (pdfRef.current) pdfRef.current.destroy().catch(() => {}); }, []);

  const handleWheel = (event) => {
    if (!hasDeck) return;
    const now = Date.now();
    if (Math.abs(event.deltaY) < 14 || now - lastWheelAt.current < 460) return;
    lastWheelAt.current = now;
    if (event.deltaY > 0) nextSlide(); else previousSlide();
  };
  const onTouchStart = (event) => { touchStartY.current = event.changedTouches[0]?.clientY || 0; };
  const onTouchEnd = (event) => {
    const endY = event.changedTouches[0]?.clientY || 0;
    const delta = touchStartY.current - endY;
    if (Math.abs(delta) > 55) { if (delta > 0) nextSlide(); else previousSlide(); }
  };

  const startLocalUpload = (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['ppt', 'pptx', 'pdf'].includes(ext)) { setDeckError('Choose a .ppt, .pptx, or .pdf file.'); return; }
    if (file.size > MAX_FILE_BYTES) { setDeckError('This file is larger than 75 MB.'); return; }
    setLocalUploading(true); setUploadProgress(0); setDeckError('');
    const formData = new FormData(); formData.append('file', file);
    const xhr = new XMLHttpRequest(); xhr.open('POST', apiUrl(`/api/rooms/${encodeURIComponent(roomId)}/upload`)); xhr.responseType = 'json';
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) setUploadProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) setUploadProgress(100);
      else setDeckError(xhr.response?.error || 'Upload failed.');
      setLocalUploading(false);
    };
    xhr.onerror = () => { setDeckError(API_BASE_URL ? `Upload could not reach ${API_BASE_URL}. Check the backend URL and CORS settings.` : 'Connection lost while uploading.'); setLocalUploading(false); };
    xhr.send(formData);
  };

  const toggleFullscreen = async () => {
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); }
    catch { setDeckError('Fullscreen is not available in this browser.'); }
  };

  if (!room && !roomError) return <main className="board-shell"><div className="loader-screen"><LoaderCircle className="spin" size={24} /> Opening presentation room…</div></main>;
  if (!room && roomError) return <main className="board-shell"><div className="board-fatal"><Brand /><div className="fatal-card"><div className="status-icon status-error"><CircleHelp size={22} /></div><h1>This room has expired</h1><p>{roomError}</p><a href="/" className="button button-primary">Create a new room <ArrowRight size={15} /></a></div></div></main>;

  return (
    <main className={`board-shell ${hasDeck ? 'board-has-deck' : 'board-idle'} ${fullScreen ? 'board-fullscreen' : ''}`}>
      <header className="board-topbar">
        <div className="board-brand-group"><Brand compact /><span className="board-divider" /><div className="board-room-label"><span className="topbar-eyebrow">PPT PRESENTER · ROOM {roomId.slice(0, 5)}</span><strong>{deck?.title || 'Waiting for a presentation'}</strong></div></div>
        <div className="board-top-actions"><span className="board-live-status"><span className="live-dot" /> {hasDeck ? 'PRESENTING' : 'ROOM READY'}</span><span className="board-room-code">{roomId.slice(0, 5)}</span><button type="button" className="button button-outline button-small" onClick={() => setShowInvite(true)}><QrCode size={15} /> Invite presenter</button><button type="button" className="board-icon-button" onClick={toggleFullscreen} aria-label="Toggle fullscreen"><Maximize2 size={17} /></button></div>
      </header>

      {!hasDeck ? (
        <section className="board-waiting-layout chalkboard-waiting-layout">
          <div className="waiting-stage">
            <div className="waiting-label"><span className="live-dot" /> ROOM OPEN</div>
            <div className="waiting-art">
              <div className="waiting-art-back" />
              <div className="waiting-art-screen"><div className="waiting-screen-line short" /><div className="waiting-screen-line" /><div className="waiting-screen-line mid" /><div className="waiting-screen-orb" /><span className="waiting-screen-number">01</span></div>
              <div className="waiting-art-base" />
            </div>
            <div className="waiting-copy"><span className="eyebrow">READY WHEN YOU ARE</span><h1>Your presentation<br /><em>starts here.</em></h1><p>Scan the code or open the link to send a presentation. It will appear on this screen automatically.</p></div>
            <div className="stage-footer-line"><span>ROOM / {roomId.slice(0, 5)}</span><span>WAITING FOR YOUR DECK <span className="waiting-pulse">•••</span></span></div>
          </div>
          <aside className="board-invite-column"><QrPanel uploadUrl={room.uploadUrl} roomId={roomId} /><div className="local-upload-note"><div className="local-upload-icon"><FileUp size={17} /></div><div><strong>Already on this device?</strong><span>Upload directly from the board.</span></div><button type="button" className="icon-button" onClick={() => fileInputRef.current?.click()} aria-label="Upload from this device"><ArrowRight size={16} /></button></div></aside>
        </section>
      ) : (
        <section className="board-presentation-layout chalkboard-presentation-layout">
          <div className="chalkboard-center-column">
            <div className="presentation-stage" onWheel={handleWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              <div className="stage-top-meta"><span className="stage-chip"><span className="live-dot" /> LIVE PRESENTATION</span><span className="stage-resolution">{Math.round(stageSize.width)} × {Math.round(stageSize.height)}</span></div>
              {loadingDeck && <div className="stage-loading"><LoaderCircle className="spin" size={24} /><span>Preparing slides…</span></div>}
              {pdfDocument ? (
                <PresentationCanvas document={pdfDocument} pageNumber={pageNumber} zoom={zoom} areaRef={stageAreaRef} canvasRef={canvasRef} canvasWrapRef={canvasWrapRef} pageDirection={pageDirection} onSize={setAreaSize} stageSize={stageSize} />
              ) : (
                <PowerPointCanvas presentation={pptPresentation} pageNumber={pageNumber} zoom={zoom} areaRef={stageAreaRef} canvasWrapRef={canvasWrapRef} pageDirection={pageDirection} onSize={setAreaSize} stageSize={stageSize} onRenderError={setDeckError} />
              )}
              {deckError && <div className="stage-error"><CircleHelp size={16} /> {deckError}<button type="button" onClick={() => setDeckError('')} aria-label="Dismiss error"><X size={14} /></button></div>}
              <div className="slide-corner-index"><span>{String(pageNumber).padStart(2, '0')}</span><i />{String(pageCount).padStart(2, '0')}</div>
            </div>
          </div>

          <ChalkRemoteRail pageNumber={pageNumber} pageCount={pageCount} zoom={zoom} previousSlide={previousSlide} nextSlide={nextSlide} changeZoom={changeZoom} toggleFullscreen={toggleFullscreen} onReset={() => { setZoom(1); navigate(1); }} onReplace={() => fileInputRef.current?.click()} />
        </section>
      )}

      <input ref={fileInputRef} type="file" accept=".ppt,.pptx,.pdf" hidden onChange={(event) => { startLocalUpload(event.target.files?.[0]); event.target.value = ''; }} />
      {localUploading && <div className="board-upload-toast"><LoaderCircle className="spin" size={16} /><span>{uploadProgress >= 100 ? 'Loading presentation on board…' : `Uploading from this device · ${uploadProgress}%`}</span><div className="progress-track"><span style={{ width: `${uploadProgress}%` }} /></div></div>}
      {showInvite && <div className="modal-scrim" onClick={() => setShowInvite(false)}><div className="invite-modal" onClick={(e) => e.stopPropagation()}><QrPanel uploadUrl={room.uploadUrl} roomId={roomId} onClose={() => setShowInvite(false)} floating /><p className="modal-footnote">The current deck stays on screen while someone uploads the next one.</p></div></div>}
      <div className="board-bottom-note"><span><Fingerprint size={13} /> NO STUDENT ACCOUNTS</span><i /><span><LockKeyhole size={12} /> TEMPORARY SESSION</span></div>
    </main>
  );
}

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  const uploadMatch = pathname.match(/^\/upload\/([A-Z0-9]+)$/i);
  const presentMatch = pathname.match(/^\/present\/([A-Z0-9]+)$/i);
  if (uploadMatch) return <UploadPage roomId={uploadMatch[1].toUpperCase()} />;
  if (presentMatch) return <Presenter roomId={presentMatch[1].toUpperCase()} />;
  return <Home />;
}
