import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://sign-sync-ai-2.onrender.com';
const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands';

/* ─────────────────────────────────────────────────────────────
   CANVAS BACKGROUND – grid + particles + scan line
───────────────────────────────────────────────────────────── */
const CyberBackground = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.5,
      a: Math.random(),
    }));
    let scan = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = 'rgba(0,245,255,0.04)';
      ctx.lineWidth = 1;
      const gSize = 48;
      for (let x = 0; x < W; x += gSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += gSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // Scan line
      scan = (scan + 1) % H;
      const sg = ctx.createLinearGradient(0, scan - 60, 0, scan + 60);
      sg.addColorStop(0, 'transparent');
      sg.addColorStop(0.5, 'rgba(0,245,255,0.06)');
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.fillRect(0, scan - 60, W, 120);

      // Particles
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,245,255,${p.a * 0.5})`;
        ctx.fill();
      });

      // Corner HUD lines — forEach gives (element, index), so use index to look up dirs
      const corners = [[30, 30], [W - 30, 30], [30, H - 30], [W - 30, H - 30]];
      const dirs = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
      corners.forEach(([cx, cy], i) => {
        const [dx, dy] = dirs[i];
        ctx.strokeStyle = 'rgba(0,245,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * 40, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + dy * 40); ctx.stroke();
      });

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { window.removeEventListener('resize', resize); cancelAnimationFrame(raf); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />;
};

/* ─────────────────────────────────────────────────────────────
   CONFIDENCE RING
───────────────────────────────────────────────────────────── */
const ConfidenceRing = ({ value = 0 }) => {
  const R = 44;
  const circ = 2 * Math.PI * R;
  const pct = value * circ;
  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      {/* Track */}
      <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(0,245,255,0.1)" strokeWidth="6" />
      {/* Purple back ring */}
      <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(124,58,237,0.2)" strokeWidth="3" />
      {/* Animated arc */}
      <motion.circle
        cx="50" cy="50" r={R}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={circ}
        animate={{ strokeDashoffset: circ - pct }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{
          transform: 'rotate(-90deg)', transformOrigin: '50% 50%',
          filter: 'drop-shadow(0 0 6px #00F5FF)'
        }}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00F5FF" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      {/* Centre label */}
      <text x="50" y="54" textAnchor="middle" fill="#00F5FF"
        fontSize="13" fontWeight="900" fontFamily="monospace">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
};

/* ─────────────────────────────────────────────────────────────
   WAVEFORM (canvas)
───────────────────────────────────────────────────────────── */
const Waveform = ({ active }) => {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    let raf, t = 0;
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      const bars = 40;
      const bw = c.width / bars;
      for (let i = 0; i < bars; i++) {
        const h = active
          ? Math.abs(Math.sin(t * 3 + i * 0.4)) * 28 + 4
          : 4;
        const x = i * bw + bw * 0.2;
        const y = (c.height - h) / 2;
        ctx.fillStyle = `rgba(0,245,255,${0.4 + Math.sin(t + i) * 0.3})`;
        ctx.beginPath();
        ctx.roundRect(x, y, bw * 0.6, h, 2);
        ctx.fill();
      }
      t += 0.07;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return <canvas ref={ref} width={200} height={44} style={{ display: 'block' }} />;
};

/* ─────────────────────────────────────────────────────────────
   HUD PANEL wrapper
───────────────────────────────────────────────────────────── */
const Panel = ({ children, style = {}, className = '' }) => (
  <div className={className} style={{
    background: 'rgba(11,15,26,0.75)',
    border: '1px solid rgba(0,245,255,0.2)',
    backdropFilter: 'blur(20px)',
    boxShadow: '0 0 24px rgba(0,245,255,0.08), inset 0 0 24px rgba(0,245,255,0.02)',
    ...style,
  }}>
    {children}
  </div>
);

/* ─────────────────────────────────────────────────────────────
   NEON TEXT
───────────────────────────────────────────────────────────── */
const Neon = ({ children, color = '#00F5FF', size = 14, weight = 700, style = {} }) => (
  <span style={{
    color,
    fontWeight: weight,
    fontSize: size,
    textShadow: `0 0 8px ${color}, 0 0 20px ${color}50`,
    fontFamily: 'monospace',
    ...style,
  }}>
    {children}
  </span>
);

/* ─────────────────────────────────────────────────────────────
   SIGN GUIDE — what finger combo = what gesture
───────────────────────────────────────────────────────────── */
const SIGN_GUIDE = [
  { gesture: 'HELLO', emoji: '👋', desc: 'All 5 fingers open', fingers: '🖐️' },
  { gesture: 'STOP', emoji: '✋', desc: '4 fingers up, thumb in', fingers: '🤚' },
  { gesture: 'YES', emoji: '✊', desc: 'Closed fist', fingers: '✊' },
  { gesture: 'NO', emoji: '✌️', desc: 'Index + Middle up', fingers: '✌️' },
  { gesture: 'I LOVE YOU', emoji: '🤟', desc: 'Index + Pinky up', fingers: '🤟' },
  { gesture: 'THANK YOU', emoji: '🙏', desc: 'Index + Middle + Ring up', fingers: '🤘' },
  { gesture: 'HELP', emoji: '👍', desc: 'Thumb up only', fingers: '👍' },
  { gesture: 'ONE', emoji: '☝️', desc: 'Only Index finger up', fingers: '☝️' },
  { gesture: 'GOOD', emoji: '👌', desc: 'Thumb + Index up', fingers: '👌' },
  { gesture: 'PERFECT', emoji: '🤙', desc: 'Thumb + Middle up', fingers: '🤙' },
  { gesture: 'WAIT', emoji: '⏳', desc: 'Middle + Ring + Pinky up', fingers: '🖖' },
  { gesture: 'PLEASE', emoji: '🙌', desc: 'Index + Ring + Pinky up', fingers: '🤞' },
  { gesture: 'SORRY', emoji: '😔', desc: 'Middle + Pinky up', fingers: '🤞' },
  { gesture: 'LITTLE', emoji: '🤏', desc: 'Only Pinky finger up', fingers: '🤏' },
  { gesture: 'WATER', emoji: '💧', desc: 'Thumb + Ring + Pinky up', fingers: '🤙' },
];

/* ─────────────────────────────────────────────────────────────
   MAIN APP
───────────────────────────────────────────────────────────── */
export default function App() {

  const [isStreaming, setIsStreaming] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [engineType, setEngineType] = useState('—');
  const [gesture, setGesture] = useState('STANDBY');
  const [confidence, setConfidence] = useState(0);
  const [sentence, setSentence] = useState('');
  const [history, setHistory] = useState([]);
  const [fps, setFps] = useState(0);
  const [isTamil, setIsTamil] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mpReady, setMpReady] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
  const [trainingLabel, setTrainingLabel] = useState('');
  const [captureActive, setCaptureActive] = useState(false);
  const [samplesCollected, setSamplesCollected] = useState(0);
  const captureRef = useRef(null);
  const SAMPLES_TARGET = 30;

  const [handBoxes, setHandBoxes] = useState([]);
  const [handGestures, setHandGestures] = useState([]);

  const videoRef = useRef(null);
  const handsRef = useRef(null);
  const rafRef = useRef(null);
  const fpsT = useRef(performance.now());
  const fpsF = useRef(0);



  // Health check
  useEffect(() => {
    const check = async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/health`);
        setIsConnected(true);
        setEngineType(data.engine || 'Rule-Based');
      } catch { setIsConnected(false); }
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  // MediaPipe load — try jsdelivr first, fallback to unpkg
  useEffect(() => {
    if (window.Hands) { initMp(); return; }
    const CDNS = [
      'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
      'https://unpkg.com/@mediapipe/hands',
    ];
    let tried = 0;
    const tryLoad = (cdnBase) => {
      const s = document.createElement('script');
      s.src = `${cdnBase}/hands.js`;
      s.crossOrigin = 'anonymous';
      s.async = true;
      s.onload = () => { window._mpBase = cdnBase; initMp(cdnBase); };
      s.onerror = () => {
        tried++;
        if (tried < CDNS.length) tryLoad(CDNS[tried]);
        else setMpReady('error');
      };
      document.head.appendChild(s);
    };
    tryLoad(CDNS[0]);
  }, []);

  const initMp = (cdnBase = MP_BASE) => {
    try {
      const h = new window.Hands({ locateFile: f => `${cdnBase}/${f}` });
      h.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5 });
      h.onResults(handleResults);
      handsRef.current = h;
      setMpReady(true);
    } catch (e) {
      console.error('MediaPipe init failed:', e);
      setMpReady('error');
    }
  };

  const handleResults = useCallback(async (res) => {
    if (!res.multiHandLandmarks?.length) {
      setGesture('NO HAND'); setConfidence(0); setHandBoxes([]); return;
    }

    const allLandmarks = res.multiHandLandmarks;
    const newBoxes = [];

    allLandmarks.forEach(hands => {
      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      hands.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });

      const padding = 0.05;
      newBoxes.push({
        x: Math.max(0, minX - padding),
        y: Math.max(0, minY - padding),
        w: Math.min(1, maxX + padding) - Math.max(0, minX - padding),
        h: Math.min(1, maxY + padding) - Math.max(0, minY - padding)
      });
    });
    setHandBoxes(newBoxes);

    const multi_lm = allLandmarks.map(hands => hands.map(p => [p.x, p.y, p.z]));

    try {
      const { data } = await axios.post(`${API_BASE}/predict`, {
        multi_landmarks: multi_lm, lang: isTamil ? 'ta' : 'en'
      });
      setGesture(data.gesture || 'UNKNOWN');
      setConfidence(data.confidence ?? 0);
      setHandGestures(data.detections || []);
      setSentence(data.sentence || '');
      if (data.history) setHistory(data.history);
    } catch (err) {
      console.error('Prediction error:', err);
    }
  }, [isTamil]);

  const processLoop = useCallback(async () => {
    if (!videoRef.current || !handsRef.current) return;
    if (videoRef.current.readyState >= 2) {
      await handsRef.current.send({ image: videoRef.current });
      fpsF.current++;
      const now = performance.now();
      if (now - fpsT.current >= 1000) {
        setFps(Math.round(fpsF.current * 1000 / (now - fpsT.current)));
        fpsF.current = 0; fpsT.current = now;
      }
    }
    rafRef.current = requestAnimationFrame(processLoop);
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, frameRate: 30 } });
      videoRef.current.srcObject = stream;
      setIsStreaming(true);
      rafRef.current = requestAnimationFrame(processLoop);
    } catch { alert('Camera access denied.'); }
  };

  const stopCamera = () => {
    videoRef.current?.srcObject?.getTracks().forEach(t => t.stop());
    cancelAnimationFrame(rafRef.current);
    setIsStreaming(false);
    setGesture('STANDBY');
    setConfidence(0);
    setHandBoxes([]);
    setHandGestures([]);
  };

  // ── Training Capture ──
  const startCapture = () => {
    const lbl = trainingLabel.trim().toUpperCase();
    if (!lbl) return alert('Please enter a gesture label first.');
    if (!isStreaming) return alert('Please start the camera first.');
    setCaptureActive(true);
    setSamplesCollected(0);

    captureRef.current = setInterval(async () => {
      const hands = handsRef.current?._multiHandLandmarks;
      if (!hands?.length) return;
      const lm = hands[0].map(p => [p.x, p.y, p.z]);
      try {
        const { data } = await axios.post(`${API_BASE}/capture`, { label: lbl, landmarks: lm });
        setSamplesCollected(data.total);
        if (data.total >= SAMPLES_TARGET) stopCapture();
      } catch (e) { console.error('Capture error', e); }
    }, 200);  // 5 samples/sec
  };

  const stopCapture = () => {
    clearInterval(captureRef.current);
    setCaptureActive(false);
  };

  const handleTrainingClose = () => {
    stopCapture();
    setTrainingOpen(false);
    setSamplesCollected(0);
    setTrainingLabel('');
  };

  const speak = () => {
    if (!sentence) return;
    setSpeaking(true);
    const u = new SpeechSynthesisUtterance(sentence);
    u.lang = isTamil ? 'ta-IN' : 'en-US';
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
    axios.post(`${API_BASE}/speak`, { text: sentence }).catch(() => { });
  };

  const reset = async () => {
    try { await axios.post(`${API_BASE}/reset`); } catch { }
    setSentence(''); setHistory([]); setGesture('STANDBY');
  };

  const exportLog = () => {
    const blob = new Blob([history.map(h => h.text).join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'signsync_log.txt';
    a.click();
  };

  /* ── RENDER ─────────────────────────────────────────────── */
  const S = {
    root: {
      minHeight: '100vh',
      background: '#0B0F1A',
      color: '#fff',
      fontFamily: "'Inter', 'Orbitron', monospace",
      position: 'relative',
      overflow: 'hidden',
    },
    content: { position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  };

  const gestureLabelColor = confidence > 0.85 ? '#00F5FF' : confidence > 0.5 ? '#a78bfa' : '#ef4444';

  return (
    <div style={S.root}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@400;600;700;900&display=swap" rel="stylesheet" />

      {/* Canvas background */}
      <CyberBackground />

      {/* Ambient glows */}
      <div style={{
        position: 'fixed', top: '-20%', left: '-10%', width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none', zIndex: 0
      }} />
      <div style={{
        position: 'fixed', bottom: '-20%', right: '-10%', width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(0,245,255,0.08) 0%, transparent 70%)',
        borderRadius: '50%', pointerEvents: 'none', zIndex: 0
      }} />

      <div style={S.content}>

        {/* ══════════ TOP NAV ══════════ */}
        <nav style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 28px', height: 68,
          background: 'rgba(11,15,26,0.9)',
          borderBottom: '1px solid rgba(0,245,255,0.15)',
          backdropFilter: 'blur(16px)',
          position: 'sticky', top: 0, zIndex: 50,
          boxShadow: '0 0 30px rgba(0,245,255,0.06)',
        }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Icon */}
            <div style={{
              width: 42, height: 42, borderRadius: 10,
              background: 'linear-gradient(135deg,#00F5FF22,#7C3AED44)',
              border: '1px solid rgba(0,245,255,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 16px rgba(0,245,255,0.3)',
            }}>
              {/* Hex icon */}
              <svg width="22" height="22" viewBox="0 0 22 22">
                <polygon points="11,2 20,7 20,17 11,22 2,17 2,7"
                  fill="none" stroke="#00F5FF" strokeWidth="1.5"
                  style={{ filter: 'drop-shadow(0 0 4px #00F5FF)' }} />
                <polygon points="11,6 16,9 16,15 11,18 6,15 6,9"
                  fill="rgba(0,245,255,0.1)" stroke="#7C3AED" strokeWidth="1" />
              </svg>
            </div>
            <div>
              <div style={{
                fontFamily: 'Orbitron,monospace', fontSize: 17, fontWeight: 900,
                letterSpacing: 3,
                background: 'linear-gradient(90deg,#00F5FF,#7C3AED)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
              }}>
                SIGN SYNC AI
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: isConnected ? '#00F5FF' : '#ef4444',
                  boxShadow: isConnected ? '0 0 6px #00F5FF' : '0 0 6px #ef4444',
                  display: 'inline-block',
                  animation: isConnected ? 'pulse 2s infinite' : 'none'
                }} />
                <span style={{
                  fontSize: 9, fontFamily: 'monospace', letterSpacing: 2,
                  color: isConnected ? '#00F5FF99' : '#ef444499', textTransform: 'uppercase'
                }}>
                  {isConnected ? `ENGINE: ${engineType}` : 'ENGINE OFFLINE'}
                </span>
              </div>
            </div>
          </div>

          {/* Center stats */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: '#ffffff40', textTransform: 'uppercase', fontFamily: 'monospace' }}>FRAME RATE</div>
              <Neon size={20} weight={900}>{fps}</Neon>
              <span style={{ fontSize: 9, color: '#00F5FF80', marginLeft: 3, fontFamily: 'monospace' }}>FPS</span>
            </div>
            <div style={{ width: 1, height: 32, background: 'rgba(0,245,255,0.15)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: '#ffffff40', textTransform: 'uppercase', fontFamily: 'monospace' }}>CONFIDENCE</div>
              <Neon size={20} weight={900}>{Math.round(confidence * 100)}</Neon>
              <span style={{ fontSize: 9, color: '#7C3AED80', marginLeft: 3, fontFamily: 'monospace' }}>%</span>
            </div>
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Language toggle */}
            <button onClick={() => setIsTamil(v => !v)} style={{
              padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
              background: isTamil ? 'rgba(124,58,237,0.25)' : 'rgba(0,245,255,0.08)',
              border: `1px solid ${isTamil ? '#7C3AED88' : 'rgba(0,245,255,0.25)'}`,
              color: isTamil ? '#a78bfa' : '#00F5FF',
              fontSize: 12, fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1,
              transition: 'all 0.2s',
              boxShadow: isTamil ? '0 0 12px rgba(124,58,237,0.3)' : '0 0 12px rgba(0,245,255,0.1)',
            }}>
              {isTamil ? '🇮🇳 தமிழ்' : '🌐 ENG'}
            </button>
            {/* Settings */}
            <button style={{
              width: 38, height: 38, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,245,255,0.05)', border: '1px solid rgba(0,245,255,0.15)', cursor: 'pointer',
              color: '#00F5FF80',
            }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          </div>
        </nav>

        {/* ══════════ MAIN GRID ══════════ */}
        <main style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gridTemplateRows: '1fr auto',
          gap: 16, padding: '16px 20px 20px',
          maxWidth: 1480, width: '100%', margin: '0 auto',
        }}>

          {/* ── LEFT COLUMN ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* WEBCAM CARD */}
            <Panel style={{
              borderRadius: 24, flex: 1, overflow: 'hidden', position: 'relative',
              minHeight: 380, display: 'flex', flexDirection: 'column'
            }}>
              {/* Card header */}
              <div style={{
                padding: '12px 20px', borderBottom: '1px solid rgba(0,245,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', background: '#00F5FF',
                    boxShadow: '0 0 8px #00F5FF', animation: 'pulse 1.5s infinite'
                  }} />
                  <span style={{
                    fontFamily: 'Orbitron,monospace', fontSize: 11, letterSpacing: 2,
                    color: '#00F5FFBB', fontWeight: 700
                  }}>VISUAL INPUT CHANNEL</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {isStreaming && (
                    <span style={{
                      padding: '3px 10px', borderRadius: 6,
                      background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                      fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#ef4444',
                      animation: 'pulse 1.5s infinite'
                    }}>● REC</span>
                  )}
                  <span style={{
                    padding: '3px 10px', borderRadius: 6,
                    background: 'rgba(0,245,255,0.08)', border: '1px solid rgba(0,245,255,0.2)',
                    fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#00F5FFBB'
                  }}>
                    HD 720p
                  </span>
                </div>
              </div>

              {/* Video area */}
              <div style={{
                flex: 1, position: 'relative', background: '#050810', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 340
              }}>
                <video ref={videoRef} autoPlay playsInline muted
                  style={{
                    width: '100%', height: '100%', objectFit: 'cover',
                    transform: 'scaleX(-1)', display: isStreaming ? 'block' : 'none'
                  }} />

                {/* Idle screen */}
                {!isStreaming && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: 40 }}>


                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        fontFamily: 'Orbitron,monospace', fontSize: 9, letterSpacing: 3,
                        color: '#00F5FF80', marginBottom: 8, textTransform: 'uppercase'
                      }}>
                        Visual Capture System
                      </div>
                      <div style={{
                        fontFamily: 'Orbitron,monospace', fontSize: 26, fontWeight: 900,
                        background: 'linear-gradient(135deg,#00F5FF,#7C3AED)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        marginBottom: 8, letterSpacing: 2
                      }}>
                        INITIALIZE CAMERA
                      </div>
                      <p style={{ color: '#ffffff40', fontSize: 13, maxWidth: 380, lineHeight: 1.6 }}>
                        Activate the holographic vision engine. Hold a sign gesture for 1 second to translate.
                      </p>
                    </div>

                    <button onClick={startCamera} disabled={!mpReady}
                      style={{
                        padding: '14px 48px', borderRadius: 12, cursor: 'pointer',
                        background: mpReady ? 'linear-gradient(135deg,rgba(0,245,255,0.15),rgba(124,58,237,0.25))' : 'rgba(255,255,255,0.05)',
                        border: mpReady ? '1px solid rgba(0,245,255,0.5)' : '1px solid rgba(255,255,255,0.1)',
                        color: mpReady ? '#00F5FF' : '#ffffff40',
                        fontFamily: 'Orbitron,monospace', fontSize: 13, fontWeight: 700, letterSpacing: 3,
                        boxShadow: mpReady ? '0 0 30px rgba(0,245,255,0.2), inset 0 0 20px rgba(0,245,255,0.05)' : 'none',
                        transition: 'all 0.3s',
                      }}>
                      {mpReady ? '▶ ENGAGE VISION ENGINE' : '⟳ LOADING AI ENGINE…'}
                    </button>
                  </div>
                )}

                {/* Holographic overlay when streaming */}
                {isStreaming && (
                  <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                    {/* Corner brackets */}
                    {[
                      { top: 16, left: 16, borderTop: '2px solid #00F5FF', borderLeft: '2px solid #00F5FF' },
                      { top: 16, right: 16, borderTop: '2px solid #00F5FF', borderRight: '2px solid #00F5FF' },
                      { bottom: 16, left: 16, borderBottom: '2px solid #00F5FF', borderLeft: '2px solid #00F5FF' },
                      { bottom: 16, right: 16, borderBottom: '2px solid #00F5FF', borderRight: '2px solid #00F5FF' },
                    ].map((s, i) => (
                      <div key={i} style={{
                        position: 'absolute', width: 40, height: 40,
                        boxShadow: '0 0 8px rgba(0,245,255,0.5)', ...s
                      }} />
                    ))}

                    {/* Bounding Box Overlay */}
                    <AnimatePresence>
                      {handBoxes.map((box, idx) => (
                        <motion.div
                          key={`hand-box-${idx}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          style={{
                            position: 'absolute',
                            left: `${(1 - box.x - box.w) * 100}%`, // Mirrored for video
                            top: `${box.y * 100}%`,
                            width: `${box.w * 100}%`,
                            height: `${box.h * 100}%`,
                            border: '2px solid #10b981',
                            borderRadius: 12,
                            boxShadow: '0 0 15px rgba(16,185,129,0.4), inset 0 0 10px rgba(16,185,129,0.2)',
                            pointerEvents: 'none',
                            zIndex: 10
                          }}
                        >
                          {/* Box Corners */}
                          <div style={{ position: 'absolute', top: -4, left: -4, width: 14, height: 14, borderLeft: '3px solid #10b981', borderTop: '3px solid #10b981' }} />
                          <div style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRight: '3px solid #10b981', borderTop: '3px solid #10b981' }} />
                          <div style={{ position: 'absolute', bottom: -4, left: -4, width: 14, height: 14, borderLeft: '3px solid #10b981', borderBottom: '3px solid #10b981' }} />
                          <div style={{ position: 'absolute', bottom: -4, right: -4, width: 14, height: 14, borderRight: '3px solid #10b981', borderBottom: '3px solid #10b981' }} />

                          {/* Label */}
                          <div style={{
                            position: 'absolute', top: -25, left: 0,
                            background: handGestures[idx]?.gesture === 'Unknown' ? '#ffffff20' : '#10b981',
                            color: handGestures[idx]?.gesture === 'Unknown' ? '#ffffff' : '#000',
                            padding: '2px 8px', borderRadius: 4,
                            fontSize: 10, fontWeight: 900, fontFamily: 'monospace',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 0 10px rgba(16,185,129,0.3)',
                            border: '1px solid rgba(16,185,129,0.5)'
                          }}>
                            {handGestures[idx]?.gesture?.toUpperCase() || 'SCANNING...'}
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>

                    {/* Center crosshair */}
                    <div style={{
                      position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                      width: 60, height: 60
                    }}>
                      <div style={{
                        position: 'absolute', top: '50%', left: 0, right: 0, height: 1,
                        background: 'rgba(0,245,255,0.4)', boxShadow: '0 0 4px #00F5FF'
                      }} />
                      <div style={{
                        position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1,
                        background: 'rgba(0,245,255,0.4)', boxShadow: '0 0 4px #00F5FF'
                      }} />
                      <div style={{
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                        width: 8, height: 8, borderRadius: '50%',
                        background: 'rgba(0,245,255,0.8)', boxShadow: '0 0 12px #00F5FF'
                      }} />
                    </div>

                    {/* Gesture label floating */}
                    <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)' }}>
                      <motion.div
                        key={gesture}
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        style={{
                          padding: '6px 20px', borderRadius: 8,
                          background: 'rgba(11,15,26,0.8)', backdropFilter: 'blur(12px)',
                          border: '1px solid rgba(0,245,255,0.3)',
                          boxShadow: '0 0 20px rgba(0,245,255,0.15)',
                          textAlign: 'center', whiteSpace: 'nowrap',
                        }}>
                        <div style={{ fontSize: 9, letterSpacing: 3, color: '#00F5FF80', fontFamily: 'monospace', textTransform: 'uppercase' }}>
                          GESTURE TOKEN
                        </div>
                        <div style={{
                          fontFamily: 'Orbitron,monospace', fontSize: 18, fontWeight: 900,
                          color: gestureLabelColor,
                          textShadow: `0 0 12px ${gestureLabelColor}`
                        }}>
                          {gesture}
                        </div>
                      </motion.div>
                    </div>

                    {/* Stop button overlay */}
                    <button onClick={stopCamera} style={{
                      position: 'absolute', top: 16, right: 16, pointerEvents: 'all',
                      padding: '10px 20px', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                      background: 'rgba(239,68,68,0.25)', border: '1px solid rgba(239,68,68,0.5)',
                      backdropFilter: 'blur(10px)',
                      color: '#ef4444', fontSize: 13, fontWeight: 700, fontFamily: 'Orbitron, monospace',
                      boxShadow: '0 0 20px rgba(239,68,68,0.2)',
                      transition: 'all 0.2s',
                    }}>
                      <span style={{ fontSize: 18 }}>✕</span>
                      STOP CAMERA
                    </button>
                  </div>
                )}
              </div>
            </Panel>

            {/* SUBTITLE STRIP */}
            <Panel style={{ borderRadius: 20, padding: '20px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Waveform icon */}
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                    <path d="M12 1v22M8 5v14M4 9v6M16 5v14M20 9v6" stroke="#00F5FF" strokeWidth="1.5" strokeLinecap="round"
                      style={{ filter: 'drop-shadow(0 0 3px #00F5FF)' }} />
                  </svg>
                  <span style={{
                    fontFamily: 'Orbitron,monospace', fontSize: 10, letterSpacing: 3,
                    color: '#00F5FF80', textTransform: 'uppercase'
                  }}>
                    Neural Translation Output
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {/* Speak */}
                  <button onClick={speak} disabled={!sentence}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, cursor: sentence ? 'pointer' : 'not-allowed',
                      background: speaking ? 'rgba(0,245,255,0.2)' : 'rgba(0,245,255,0.07)',
                      border: `1px solid ${speaking ? 'rgba(0,245,255,0.6)' : 'rgba(0,245,255,0.2)'}`,
                      color: sentence ? '#00F5FF' : '#ffffff30',
                      fontSize: 11, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1,
                      boxShadow: speaking ? '0 0 16px rgba(0,245,255,0.4)' : 'none',
                      transition: 'all 0.2s'
                    }}>
                    <svg width="13" height="13" fill="#00F5FF" viewBox="0 0 24 24">
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      {speaking && <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" stroke="#00F5FF" fill="none" strokeWidth="2" />}
                    </svg>
                    {speaking ? 'SPEAKING…' : 'VOICE OUTPUT'}
                  </button>
                  {/* Reset */}
                  <button onClick={reset}
                    style={{
                      padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
                      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                      color: '#ef444499', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1,
                      transition: 'all 0.2s'
                    }}>
                    ↺ CLEAR
                  </button>
                </div>
              </div>

              {/* Sentence display */}
              <div style={{ minHeight: 80, display: 'flex', alignItems: 'center', marginBottom: 14 }}>
                {sentence ? (
                  <motion.p
                    key={sentence}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    style={{
                      fontFamily: 'Orbitron,monospace', fontSize: 'clamp(22px,3.5vw,42px)',
                      fontWeight: 900, letterSpacing: 2, lineHeight: 1.2,
                      background: 'linear-gradient(90deg,#00F5FF,#a78bfa,#00F5FF)',
                      backgroundSize: '200%',
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                      animation: 'shimmer 3s linear infinite'
                    }}>
                    {sentence}
                  </motion.p>
                ) : (
                  <p style={{
                    color: 'rgba(255,255,255,0.12)', fontFamily: 'Orbitron,monospace',
                    fontSize: 22, fontWeight: 700, animation: 'pulse 2s infinite'
                  }}>
                    AWAITING GESTURE INPUT…
                  </p>
                )}
              </div>

              {/* Waveform + info row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 20,
                paddingTop: 14, borderTop: '1px solid rgba(0,245,255,0.08)'
              }}>
                <Waveform active={speaking} />
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#ffffff30', letterSpacing: 1 }}>
                  LANG: {isTamil ? 'TAMIL' : 'ENGLISH'} · TOKENS: {history.length}
                </span>
              </div>
            </Panel>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Confidence + Gesture Panel */}
            <Panel style={{ borderRadius: 20, padding: '20px 20px 18px', textAlign: 'center' }}>
              <div style={{
                fontSize: 9, fontFamily: 'Orbitron,monospace', letterSpacing: 3,
                color: '#00F5FF60', textTransform: 'uppercase', marginBottom: 12
              }}>
                Active Token Analysis
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
                <ConfidenceRing value={confidence} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#ffffff40', letterSpacing: 2, marginBottom: 4 }}>GESTURE</div>
                  <div style={{
                    fontFamily: 'Orbitron,monospace', fontSize: 16, fontWeight: 900,
                    color: gestureLabelColor,
                    textShadow: `0 0 10px ${gestureLabelColor}`, letterSpacing: 1
                  }}>
                    {gesture}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {[
                      { label: 'ENGINE', val: engineType },
                      {
                        label: 'STATUS', val: isStreaming ? 'ACTIVE' : 'IDLE',
                        color: isStreaming ? '#00F5FF' : '#ffffff40'
                      },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 8, fontFamily: 'monospace', color: '#ffffff30', letterSpacing: 2 }}>{label}</span>
                        <span style={{
                          fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: color || '#7C3AED',
                          textShadow: color ? `0 0 6px ${color}` : '0 0 6px #7C3AED'
                        }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>

            {/* Sign Guide — what finger combo = what sign */}
            <Panel style={{ borderRadius: 20, padding: '16px 18px', maxHeight: 340, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{
                fontSize: 9, fontFamily: 'Orbitron,monospace', letterSpacing: 3,
                color: '#7C3AED', textTransform: 'uppercase', marginBottom: 10, flexShrink: 0
              }}>
                ◈ Sign Guide — How to Sign
              </div>
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }} className="custom-scroll">
                {SIGN_GUIDE.map(({ gesture: g, emoji, desc }) => {
                  const isActive = gesture === g;
                  return (
                    <div key={g} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', borderRadius: 8,
                      background: isActive ? 'rgba(0,245,255,0.12)' : 'rgba(0,245,255,0.02)',
                      border: `1px solid ${isActive ? 'rgba(0,245,255,0.45)' : 'rgba(0,245,255,0.08)'}`,
                      boxShadow: isActive ? '0 0 12px rgba(0,245,255,0.15)' : 'none',
                      transition: 'all 0.2s',
                    }}>
                      <span style={{ fontSize: 18, minWidth: 26, textAlign: 'center' }}>{emoji}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: 'monospace', fontSize: 10, fontWeight: 700, letterSpacing: 1,
                          color: isActive ? '#00F5FF' : '#ffffff80',
                          textShadow: isActive ? '0 0 8px #00F5FF' : 'none',
                        }}>{g}</div>
                        <div style={{ fontSize: 9, color: '#ffffff35', fontFamily: 'monospace', marginTop: 1 }}>{desc}</div>
                      </div>
                      {isActive && (
                        <span style={{
                          fontSize: 8, fontFamily: 'monospace', letterSpacing: 1,
                          color: '#00F5FF', background: 'rgba(0,245,255,0.15)',
                          padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(0,245,255,0.3)',
                          flexShrink: 0
                        }}>● LIVE</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>


            {/* History Panel */}
            <Panel style={{ borderRadius: 20, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{
                padding: '14px 18px', borderBottom: '1px solid rgba(0,245,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div style={{
                  fontSize: 9, fontFamily: 'Orbitron,monospace', letterSpacing: 3,
                  color: '#7C3AED', textTransform: 'uppercase'
                }}>
                  ◈ Conversation Log
                </div>
                <button onClick={exportLog} style={{
                  padding: '4px 12px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)',
                  color: '#a78bfa', fontSize: 10, fontFamily: 'monospace', fontWeight: 700,
                }}>⬇ EXPORT</button>
              </div>

              <div style={{
                flex: 1, overflowY: 'auto', padding: '12px 16px',
                display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280
              }}
                className="custom-scroll">
                <AnimatePresence initial={false}>
                  {history.length > 0 ? [...history].reverse().map((item, i) => (
                    <motion.div key={i}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      style={{
                        padding: '10px 14px', borderRadius: 10,
                        background: 'rgba(0,245,255,0.03)',
                        border: '1px solid rgba(0,245,255,0.08)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                      <div>
                        <div style={{
                          fontSize: 8, fontFamily: 'monospace', letterSpacing: 2,
                          color: '#00F5FF50', marginBottom: 3
                        }}>SIGN TOKEN</div>
                        <div style={{
                          fontFamily: 'Orbitron,monospace', fontSize: 13, fontWeight: 700,
                          color: '#00F5FFCC'
                        }}>{item.text}</div>
                      </div>
                      <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#ffffff20' }}>
                        {item.time}
                      </div>
                    </motion.div>
                  )) : (
                    <div style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                      justifyContent: 'center', padding: 30, opacity: 0.25
                    }}>
                      <svg width="36" height="36" fill="none" viewBox="0 0 24 24" style={{ marginBottom: 12 }}>
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"
                          fill="#00F5FF" opacity="0.5" />
                      </svg>
                      <p style={{ fontSize: 11, fontFamily: 'monospace', color: '#ffffff50', textAlign: 'center' }}>
                        No signs detected yet.<br />Start camera to translate.
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              </div>

              <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(0,245,255,0.08)' }}>
                <button onClick={() => setTrainingOpen(true)} style={{
                  width: '100%', padding: '12px', borderRadius: 10, cursor: 'pointer',
                  background: 'linear-gradient(135deg,rgba(0,245,255,0.1),rgba(124,58,237,0.2))',
                  border: '1px solid rgba(0,245,255,0.3)',
                  color: '#00F5FF', fontFamily: 'Orbitron,monospace', fontSize: 11, fontWeight: 700,
                  letterSpacing: 2, boxShadow: '0 0 20px rgba(0,245,255,0.1)',
                  transition: 'all 0.2s',
                }}>
                  + TRAIN NEW GESTURE
                </button>
              </div>
            </Panel>
          </div>
        </main>

        {/* Footer */}
        <footer style={{
          textAlign: 'center', padding: '14px', borderTop: '1px solid rgba(0,245,255,0.06)',
          fontSize: 9, fontFamily: 'Orbitron,monospace', letterSpacing: 3,
          color: 'rgba(0,245,255,0.2)'
        }}>
          SIGNSYNC AI — QUANTUM VISION SYSTEM v2.0 © 2026
        </footer>
      </div>

      {/* ══════════ TRAINING MODAL ══════════ */}
      <AnimatePresence>
        {trainingOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setTrainingOpen(false)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(16px)' }} />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                width: '100%', maxWidth: 480, position: 'relative', zIndex: 1,
                background: 'rgba(11,15,26,0.97)', borderRadius: 24,
                border: '1px solid rgba(0,245,255,0.3)',
                boxShadow: '0 0 60px rgba(0,245,255,0.15), inset 0 0 40px rgba(0,245,255,0.03)',
                padding: 36,
              }}>
              <button onClick={handleTrainingClose}
                style={{
                  position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#ffffff60', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>✕</button>
              <div style={{
                fontFamily: 'Orbitron,monospace', fontSize: 20, fontWeight: 900,
                background: 'linear-gradient(90deg,#00F5FF,#7C3AED)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                marginBottom: 6
              }}>NEURAL TRAINING LAB</div>
              <p style={{ color: '#ffffff40', fontSize: 12, marginBottom: 28, lineHeight: 1.6 }}>
                Expand the AI vocabulary with custom hand signs.
              </p>
              <div style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, color: '#00F5FF80',
                  textTransform: 'uppercase', marginBottom: 8
                }}>Gesture Label</div>
                <input
                  type="text"
                  placeholder="e.g.  NAMASTE, WATER, MORE…"
                  value={trainingLabel}
                  onChange={e => setTrainingLabel(e.target.value)}
                  disabled={captureActive}
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '12px 16px', borderRadius: 10,
                    background: 'rgba(0,245,255,0.04)', border: '1px solid rgba(0,245,255,0.2)',
                    color: '#fff', fontFamily: 'Orbitron,monospace', fontSize: 13, outline: 'none'
                  }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  ['Samples Collected', `${samplesCollected} / ${SAMPLES_TARGET}`, '#00F5FF'],
                  ['Status', captureActive ? 'CAPTURING...' : samplesCollected >= SAMPLES_TARGET ? 'DONE ✓' : 'READY', captureActive ? '#10b981' : '#7C3AED']
                ].map(([label, val, c]) => (
                  <div key={label} style={{
                    padding: '14px', borderRadius: 12,
                    background: 'rgba(0,245,255,0.03)', border: '1px solid rgba(0,245,255,0.1)'
                  }}>
                    <div style={{ fontSize: 8, fontFamily: 'monospace', letterSpacing: 2, color: '#ffffff40', marginBottom: 4 }}>{label.toUpperCase()}</div>
                    <div style={{ fontFamily: 'Orbitron,monospace', fontSize: 20, fontWeight: 900, color: c, textShadow: `0 0 8px ${c}` }}>{val}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 10, fontFamily: 'monospace', color: '#ffffff30', marginBottom: 20, lineHeight: 1.8 }}>
                {!isStreaming
                  ? <span style={{ color: '#ef4444' }}>⚠ Start the camera first before capturing!</span>
                  : captureActive
                    ? `Hold your hand in the "${trainingLabel.toUpperCase()}" gesture...`
                    : samplesCollected >= SAMPLES_TARGET
                      ? '✓ Capture complete! Saved to dataset folder.'
                      : 'Enter a label and click INITIALIZE CAPTURE.'}
              </p>
              <button
                onClick={captureActive ? stopCapture : startCapture}
                style={{
                  width: '100%', padding: '15px', borderRadius: 12, cursor: 'pointer',
                  background: captureActive
                    ? 'linear-gradient(135deg,rgba(239,68,68,0.3),rgba(239,68,68,0.15))'
                    : 'linear-gradient(135deg,rgba(0,245,255,0.15),rgba(124,58,237,0.3))',
                  border: captureActive ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(0,245,255,0.4)',
                  color: captureActive ? '#ef4444' : '#00F5FF',
                  fontFamily: 'Orbitron,monospace', fontSize: 13, fontWeight: 900,
                  letterSpacing: 3, boxShadow: captureActive ? '0 0 30px rgba(239,68,68,0.2)' : '0 0 30px rgba(0,245,255,0.2)',
                  transition: 'all 0.3s'
                }}>
                {captureActive ? '⏹ STOP CAPTURE' : samplesCollected >= SAMPLES_TARGET ? '✓ COMPLETE - CAPTURE AGAIN' : '▶ INITIALIZE CAPTURE'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@400;600;700;900&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:#0B0F1A; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes shimmer { 0%{background-position:0%} 100%{background-position:200%} }
        .custom-scroll::-webkit-scrollbar { width:4px; }
        .custom-scroll::-webkit-scrollbar-track { background:transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background:rgba(0,245,255,0.15); border-radius:99px; }
        input::placeholder { color:rgba(255,255,255,0.2); }
        button:active { transform:scale(0.97); }
      `}</style>
    </div>
  );
}
