import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ================= ÁUDIO (Web Audio API, síntese sem arquivos externos) ================= */
const AUDIO_CTOR = window.AudioContext || window.webkitAudioContext;
let ctx = null;
function audio() {
  if (!ctx && AUDIO_CTOR) {
    try { ctx = new AUDIO_CTOR(); } catch (e) { ctx = null; }
  }
  return ctx;
}
function osc(c, when, f, type, dur, v) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, when);
  g.gain.setValueAtTime(v, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  o.connect(g); g.connect(c.destination);
  o.start(when); o.stop(when + dur);
}
let nbuf = null;
function nse(c, when, dur, v) {
  if (!nbuf) {
    const sr = c.sampleRate, len = sr * 2;
    nbuf = c.createBuffer(1, len, sr);
    const d = nbuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  const b = c.createBufferSource(), g = c.createGain();
  b.buffer = nbuf; b.loop = true;
  g.gain.setValueAtTime(v, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  b.connect(g); g.connect(c.destination);
  const st = Math.max(when, c.currentTime);
  b.start(st); b.stop(st + dur);
}
const SND = {
  tone(f, type = 'sine', d = 0.2, v = 0.1, w = 0) {
    const c = audio(); if (!c) return; osc(c, c.currentTime + w, f, type, d, v);
  },
  stat(d = 0.4, v = 0.06, w = 0) {
    const c = audio(); if (!c) return; nse(c, c.currentTime + w, d, v);
  },
  creak() {
    this.tone(110, 'sawtooth', 0.7, 0.09);
    this.tone(85, 'sawtooth', 0.7, 0.05, 0.15);
    this.stat(0.7, 0.035);
  },
  step() { this.tone(55, 'sine', 0.1, 0.12); },
  scream() {
    const c = audio(); if (!c) return;
    for (let i = 0; i < 7; i++) this.tone(250 + Math.random() * 900, 'square', 0.13, 0.18, i * 0.09);
    this.stat(1.4, 0.4);
  },
  sixam() { [523, 659, 784, 1047, 1318].forEach((f, i) => this.tone(f, 'square', 0.4, 0.15, i * 0.13)); },
  droneStart() {
    const c = audio(); if (!c || this._drone) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(92, c.currentTime);
    g.gain.setValueAtTime(0.015, c.currentTime);
    o.connect(g); g.connect(c.destination);
    o.start(); this._drone = { o, g };
  },
  droneStop() {
    if (this._drone) { try { this._drone.o.stop(); } catch (e) {} this._drone = null; }
  }
};

/* ================= CONFIG ================= */
const CFG = {
  NIGHT_SEC: 100,
  MAX_NIGHTS: 5,
  ROT_LIMIT: Math.PI / 4,
  COOLDOWN_MS: 2500,
  LINGER_MS: 5000,
  BASE_DRAIN: 0.6,
  USAGE_DRAIN: 0.5,
};

/* ================= DOM ================= */
function $(id) { return document.getElementById(id); }
const els = {
  loading: $('screen-loading'), loadBtn: $('load-btn'), loadBar: $('load-bar'), loadPct: $('load-pct'),
  menu: $('screen-menu'), menuBtn: $('menu-btn'),
  paper: $('screen-paper'), paperBtn: $('paper-btn'),
  hud: $('hud'), battPct: $('batt-pct'), battBars: $('batt-bars'), usage: $('usage'), warn: $('warn'),
  clock: $('clock'), ctrls: $('ctrls'),
  flashlightBtn: $('btn-flashlight'), doorBtn: $('btn-door'), curtainBtn: $('btn-curtain'),
  monitor: $('monitor'), monCam: $('mon-cam'), monName: $('mon-name'), monRec: $('mon-rec'),
  monFlash: $('mon-flashlight'), monClose: $('mon-close'), monThumbs: $('mon-thumbs'),
  jump: $('screen-jump'), jumpText: $('jump-text'),
  gameover: $('screen-gameover'), goText: $('go-text'), goRetry: $('go-retry'),
  night: $('screen-night'), nightNum: $('night-num'), nightNext: $('night-next'),
  mobile: $('mobile-ui'), mbFlash: $('mb-flashlight'), mbDoor: $('mb-door'), mbCurtain: $('mb-curtain'), mbClose: $('mb-close')
};

/* ================= THREE ================= */
let renderer, camOffice, sceneOffice, camMenu, sceneMenu;
let rooms = [], roomCams = [];
let momoGltf = null, momoClipByName = {};
let momo = null, momoMixer = null, momoHost = null; // 'office' | number | null
let flashLight = null;
let officeLights = [];
let bladesGroup = null;
let doorMesh = null, curtainMesh = null, doorAngle = 0, curtainScale = 1;
let laptopMesh = null, fanMesh = null;
let textures = {};

let night = 1, running = false, nightT = 0, battery = 100;
let mode = 'menu'; // menu | paper | loading | office | monitor | jumpscare | night
let loadMsgEl = null;
let monCamIdx = 0, monFlash = false;
let flashOn = false, yaw = 0;
let lastTime = performance.now();
let blackout = false;
let lastDoor = 0, lastCurtain = 0;
let warn = { text: '', until: 0 };
let jumpLunge = false, jumpTarget = null;
let keys = {};
let dragStartX = 0, isDragging = false;

const ROOM_NAMES = ['Sala', 'Cozinha', 'Quarto dos Pais', 'Corredor A', 'Corredor B', 'Banheiro'];
const CAM_KEYS = ['CAM_01', 'CAM_02', 'CAM_03', 'CAM_04', 'CAM_05', 'CAM_06'];
const AI_GRAPH = {
  0: [1], 1: [0, 2], 2: [1, 3], 3: [2, 4], 4: [3, 5], 5: [4],
  L: [0], R: [5]
};
let ai = {
  loc: 0, state: 'wander', target: null,
  moveProg: 0, moveDur: 0, dwell: 0, dwellLimit: 8000,
  linger: 0, frozen: 0
};

/* ================= TEXTURES ================= */
const texLoader = new THREE.TextureLoader();
function loadTex(url) {
  return new Promise((res, rej) => texLoader.load(url, res, undefined, rej));
}
function canvasNoise(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const d = c.getContext('2d').createImageData(w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const v = Math.random() * 255;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
    d.data[i + 3] = 255;
  }
  c.getContext('2d').putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function cementTexture() { return canvasNoise(512, 512); }
function tileTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e8ecef'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#b9c4c9'; g.lineWidth = 4;
  for (let i = 64; i < 256; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4);
  return t;
}

/* Carrega textura com timeout (ms). Rejeita se demorar mais que o timeout. */
function loadTexWithTimeout(url, timeout = 1500) {
  return Promise.race([
    loadTex(url),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout ' + url)), timeout))
  ]);
}

/* ================= MOMO PROCEDURAL (fallback quando o GLB falha) ================= */
function createProceduralMomo() {
  const root = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffe0d0, roughness: 0.8 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

  // Cabeça grande e pálida
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 24), skinMat);
  head.position.y = 1.4;
  head.scale.set(1, 0.9, 0.85);
  root.add(head);

  // Olhos grandes e esbugalhados
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), whiteMat);
  eyeL.position.set(-0.22, 1.45, 0.5); root.add(eyeL);
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), eyeMat);
  pupilL.position.set(-0.22, 1.45, 0.56); root.add(pupilL);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), whiteMat);
  eyeR.position.set(0.22, 1.45, 0.5); root.add(eyeR);
  const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), eyeMat);
  pupilR.position.set(0.22, 1.45, 0.56); root.add(pupilR);

  // Boca pequena
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.04), blackMat);
  mouth.position.set(0, 1.25, 0.55); root.add(mouth);

  // Cabelo preto e desalinhado
  const hair = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.3), blackMat);
  hair.position.set(0, 1.7, 0.05); root.add(hair);
  const hairL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.3), blackMat);
  hairL.position.set(-0.55, 1.55, 0.1); root.add(hairL);
  const hairR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.3), blackMat);
  hairR.position.set(0.55, 1.55, 0.1); root.add(hairR);

  // Corpo fino
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.35), skinMat);
  body.position.y = 0.7; root.add(body);

  // Braços e pernas
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), skinMat);
  armL.position.set(-0.3, 0.95, 0); armL.rotation.z = -0.3; root.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), skinMat);
  armR.position.set(0.3, 0.95, 0); armR.rotation.z = 0.3; root.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.75, 0.14), skinMat);
  legL.position.set(-0.12, 0.1, 0); root.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.75, 0.14), skinMat);
  legR.position.set(0.12, 0.1, 0); root.add(legR);

  root.position.y = 0;
  root.rotation.y = Math.PI; // virada para frente
  return root;
}

/* ================= MOMO (modelo oficial momo_3d_model.glb ou fallback procedural) ================= */
function ensureMomo() {
  if (momo) return momo;

  if (momoGltf) {
    const root = momoGltf.scene.clone(true);
    root.traverse((o) => {
      if (o.isSkinnedMesh || (o.isMesh && o.name === 'MomoMesh')) { /* mesh achada na travessia */ }
    });
    let mesh = null;
    root.traverse((o) => { if (o.isMesh) mesh = o; });
    // BoundingBox automática: escala para altura ~1.75 e pés tocam o chão (y=0)
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const s = 1.75 / Math.max(size.y, 0.01);
    root.scale.set(s, s, s);
    const box2 = new THREE.Box3().setFromObject(root);
    root.position.y = -box2.min.y;
    root.rotation.y = Math.PI; // anda virada para frente
    momo = root;
    momoMixer = new THREE.AnimationMixer(root);
    momoClipByName = {};
    (momoGltf.animations || []).forEach((c) => { momoClipByName[c.name] = c; });
    playAnim('Idle');
    return momo;
  }

  // Fallback procedural imediato quando o GLB falha ou expira o timeout
  momo = createProceduralMomo();
  momoMixer = null;
  momoClipByName = {};
  return momo;
}
function playAnim(name) {
  if (!momoMixer || !momoClipByName[name]) return;
  momoMixer.stopAllAction();
  momoMixer.clipAction(momoClipByName[name]).reset().play();
  momoMixer.update(0);
}
function placeMomo() {
  const m = ensureMomo();
  if (momoHost === 'office' && sceneOffice) sceneOffice.remove(m);
  else if (typeof momoHost === 'number' && rooms[momoHost]) rooms[momoHost].remove(m);
  momoHost = null;
  if (ai.loc === 'L' || ai.loc === 'R') {
    m.position.set(ai.loc === 'L' ? -3.95 : 3.95, 0, -1.5);
    m.lookAt(0, 1.45, 0);
    sceneOffice.add(m); momoHost = 'office';
    playAnim('Idle');
  } else if (typeof ai.loc === 'number') {
    const sc = rooms[ai.loc]; const cam = roomCams[ai.loc];
    m.position.set(0, 0, -2.2);
    m.lookAt(cam.position);
    sc.add(m); momoHost = ai.loc;
    playAnim('Idle');
  }
}

/* ================= CÂMERAS DOS COMODOS (CAM_01..CAM_06) ================= */
function buildRoom(idx) {
  const s = new THREE.Scene();
  s.fog = new THREE.Fog(0x111111, 1, 9);
  const amb = new THREE.AmbientLight(0xffffff, 0.2); s.add(amb);
  const light = new THREE.PointLight(0xffffff, 0.35, 8);
  light.position.set(0, 2.6, -1); s.add(light);
  s.userData._roomLight = light;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshStandardMaterial({ map: tileTexture(), color: 0x222222 }));
  floor.rotation.x = -Math.PI / 2; s.add(floor);
  const wallMat = new THREE.MeshStandardMaterial({ map: cementTexture(), color: 0x2a2a2a });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(7, 4), wallMat); back.position.set(0, 2, -3.5); s.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(5, 4), wallMat); left.position.set(-3.5, 2, 0); left.rotation.y = Math.PI / 2; s.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(5, 4), wallMat); right.position.set(3.5, 2, 0); right.rotation.y = -Math.PI / 2; s.add(right);

  const boxMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
  const add = (geo, mat, pos) => {
    const o = new THREE.Mesh(geo, mat); o.position.copy(pos); s.add(o);
  };
  if (idx === 0) { // Sala: sofá + TV
    add(new THREE.BoxGeometry(2.2, 0.5, 1), boxMat, new THREE.Vector3(0, 0.25, 1.2));
    add(new THREE.BoxGeometry(1.4, 0.9, 0.15), boxMat, new THREE.Vector3(0, 1.2, -3.35));
  } else if (idx === 1) { // Cozinha: balcão + geladeira
    add(new THREE.BoxGeometry(2.6, 0.9, 0.7), boxMat, new THREE.Vector3(0, 0.45, 1.0));
    add(new THREE.BoxGeometry(0.8, 1.4, 0.7), boxMat, new THREE.Vector3(-2.2, 0.7, -1.4));
  } else if (idx === 2) { // Quarto dos Pais: cama
    add(new THREE.BoxGeometry(2.2, 0.35, 1.6), boxMat, new THREE.Vector3(0, 0.17, 1.0));
    add(new THREE.BoxGeometry(2.0, 0.9, 0.3), boxMat, new THREE.Vector3(0, 0.75, -1.6));
  } else if (idx === 3 || idx === 4) { // Corredores: armários
    add(new THREE.BoxGeometry(0.7, 1.2, 0.7), boxMat, new THREE.Vector3(-2.4, 0.6, 0.6));
    add(new THREE.BoxGeometry(0.7, 1.2, 0.7), boxMat, new THREE.Vector3(2.4, 0.6, -1.0));
  } else { // Banheiro: vaso + pia
    add(new THREE.BoxGeometry(0.5, 0.7, 0.6), boxMat, new THREE.Vector3(-1.8, 0.35, 1.2));
    add(new THREE.BoxGeometry(0.9, 0.85, 0.5), boxMat, new THREE.Vector3(1.2, 0.42, -0.9));
  }
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 40);
  cam.position.set(0, 1.5, 0.4); cam.lookAt(0, 1.5, -2.8);
  rooms.push(s); roomCams.push(cam);
  return s;
}

/* ================= ESCRITÓRIO (recriação da Imagem 3) ================= */
function buildOffice() {
  const s = new THREE.Scene();
  s.fog = new THREE.Fog(0xffffff, 1.5, 16);
  const amb = new THREE.AmbientLight(0xffffff, 0.5); s.add(amb);
  const lL = new THREE.PointLight(0xfff3e0, 0.75, 12); lL.position.set(-3.1, 2.3, -1.6); s.add(lL);
  const lR = new THREE.PointLight(0xfff3e0, 0.75, 12); lR.position.set(3.6, 2.0, -1.1); s.add(lR);
  officeLights.push(lL, lR);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ map: tileTexture() }));
  floor.rotation.x = -Math.PI / 2; s.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ map: cementTexture() });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.2), wallMat); back.position.set(0, 2.1, -4); s.add(back);
  const l1 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.2), wallMat); l1.position.set(-4, 2.1, -3.05); l1.rotation.y = Math.PI / 2; s.add(l1);
  const l2 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.2), wallMat); l2.position.set(-4, 2.1, 0.55); l2.rotation.y = Math.PI / 2; s.add(l2);
  const lintelL = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), wallMat); lintelL.position.set(-4, 3.35, -1.25); lintelL.rotation.y = Math.PI / 2; s.add(lintelL);
  const r1 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.2), wallMat); r1.position.set(4, 2.1, -3.05); r1.rotation.y = -Math.PI / 2; s.add(r1);
  const r2 = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.2), wallMat); r2.position.set(4, 2.1, 0.55); r2.rotation.y = -Math.PI / 2; s.add(r2);
  const lintelR = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.7), wallMat); lintelR.position.set(4, 3.35, -1.25); lintelR.rotation.y = -Math.PI / 2; s.add(lintelR);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.2), wallMat); front.position.set(0, 2.1, 1.6); s.add(front);

  // Varanda escura visível pelas aberturas
  const outsideMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  const porchL = new THREE.Mesh(new THREE.PlaneGeometry(3, 4.2), outsideMat); porchL.position.set(-5.35, 2.1, -1.25); porchL.rotation.y = Math.PI / 2; s.add(porchL);
  const porchFL = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), outsideMat); porchFL.position.set(-5.35, 0, -1.25); porchFL.rotation.x = -Math.PI / 2; s.add(porchFL);
  const porchR = new THREE.Mesh(new THREE.PlaneGeometry(3, 4.2), outsideMat); porchR.position.set(5.35, 2.1, -1.25); porchR.rotation.y = -Math.PI / 2; s.add(porchR);
  const porchFR = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), outsideMat); porchFR.position.set(5.35, 0, -1.25); porchFR.rotation.x = -Math.PI / 2; s.add(porchFR);
  const loL = new THREE.PointLight(0xffd699, 0.35, 6); loL.position.set(-5.35, 2.2, -1.25); s.add(loL);
  const loR = new THREE.PointLight(0xffd699, 0.35, 6); loR.position.set(5.35, 2.2, -1.25); s.add(loR);

  // Pôster da Imagem 1 na parede
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.35), new THREE.MeshBasicMaterial({ map: textures.poster }));
  poster.position.set(-1.7, 1.75, -3.99); s.add(poster);

  // Tomada com fios descendo
  const outlet = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.06), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  outlet.position.set(-4.005, 0.85, -2.9); s.add(outlet);
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
  const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-4.005, 0.78, -2.9), new THREE.Vector3(-4.005, 0.05, -2.9)
  ]), wireMat);
  s.add(wire);
  const wire2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-4.005, 0.78, -2.9), new THREE.Vector3(-4.005, 0.78, -3.5), new THREE.Vector3(-4.005, 0.05, -3.5)
  ]), wireMat);
  s.add(wire2);

  // PORTA (esquerda) — fecha cobrindo a abertura, abre girando para dentro do quarto
  doorMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.3), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.3, roughness: 0.4 }));
  doorMesh.position.set(-4.005, 1.15, -1.25);
  doorMesh.userData = { type: 'door' };
  s.add(doorMesh);

  // CORTINA (direita)
  curtainMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.3), new THREE.MeshStandardMaterial({ color: 0x3a3a4a, roughness: 1 }));
  curtainMesh.position.set(4.005, 1.15, -1.25);
  curtainMesh.userData = { type: 'curtain' };
  s.add(curtainMesh);

  // Ventilador preto e dourado girando sobre banquinho plástico branco (centro)
  const fanGroup = new THREE.Group();
  fanGroup.position.set(-1.5, 0, -1.1);
  const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0xf0f0f0 }));
  stool.position.y = 0.25; fanGroup.add(stool);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0xb8860b }));
  hub.position.y = 0.62; fanGroup.add(hub);
  bladesGroup = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0b });
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.22), bladeMat);
    blade.position.y = 0.62; blade.rotation.z = (i * Math.PI * 2) / 3;
    bladesGroup.add(blade);
  }
  fanGroup.add(bladesGroup);
  s.add(fanGroup); fanMesh = fanGroup;

  // Mesa branca suspensa (direita) com notebook aberto, copo amarelo e mouse
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.9), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  desk.position.set(2.5, 0.9, -0.5); s.add(desk);
  const supp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.85, 0.16), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  supp.position.set(1.68, 0.475, -0.92); s.add(supp);
  const laptopBase = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.55), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  laptopBase.position.set(2.5, 0.96, -0.5); s.add(laptopBase);
  laptopMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.52), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  laptopMesh.position.set(2.5, 1.23, -0.5); laptopMesh.rotation.x = -0.45;
  laptopMesh.userData = { type: 'monitor' };
  s.add(laptopMesh);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.34, 16), new THREE.MeshStandardMaterial({ color: 0xffcc00 }));
  cup.position.set(2.05, 1.13, -0.15); s.add(cup);
  const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.18), new THREE.MeshStandardMaterial({ color: 0x666666 }));
  mouse.position.set(2.95, 0.99, 0.1); s.add(mouse);

  // Cadeira preta giratória
  const chair = new THREE.Group(); chair.position.set(3.5, 0, -0.25);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
  seat.position.y = 0.48; chair.add(seat);
  const backr = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.08), new THREE.MeshStandardMaterial({ color: 0x0a0a0a }));
  backr.position.set(0, 0.83, -0.24); chair.add(backr);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  base.position.y = 0.22; chair.add(base);
  s.add(chair);

  // Prateleira branca acima da mesa com projetor, bolinhas verdes e monitor pequeno
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.5), new THREE.MeshStandardMaterial({ color: 0xf0f0f0 }));
  shelf.position.set(3.55, 3.1, -1.15); s.add(shelf);
  const proj = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.22), new THREE.MeshStandardMaterial({ color: 0x888888 }));
  proj.position.set(3.3, 3.26, -1.32); s.add(proj);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), new THREE.MeshStandardMaterial({ color: 0x000000 }));
  lens.rotation.x = Math.PI / 2; lens.position.set(3.3, 3.26, -1.46); s.add(lens);
  for (let i = 0; i < 3; i++) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), new THREE.MeshStandardMaterial({ color: 0x2ecc71 }));
    ball.position.set(3.75 + i * 0.22, 3.26, -1.15); s.add(ball);
  }
  const monBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.12), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
  monBox.position.set(3.05, 3.26, -1.28); s.add(monBox);
  const monScr = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.36), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
  monScr.position.set(3.05, 3.26, -1.36); s.add(monScr);

  // Lanterna do player (spotlight da câmera)
  flashLight = new THREE.SpotLight(0xffffff, 2.5, 14, Math.PI / 5, 0.5, 1);
  flashLight.visible = false;
  s.add(flashLight);
  const flTarget = new THREE.Object3D(); s.add(flTarget);
  flashLight.target = flTarget;

  return s;
}

/* ================= MENU 3D (Momo no escuro) ================= */
function buildMenu() {
  sceneMenu = new THREE.Scene();
  sceneMenu.background = new THREE.Color(0x020205);
  camMenu = new THREE.PerspectiveCamera(55, 1, 0.1, 40);
  const amb = new THREE.AmbientLight(0xffffff, 0.08); sceneMenu.add(amb);
  const spot = new THREE.SpotLight(0x4400ff, 1.2, 10, Math.PI / 4, 0.5, 1);
  spot.position.set(1.5, 2.5, 1.5); spot.lookAt(0, 0, 0); sceneMenu.add(spot);
  const m = ensureMomo();
  m.position.set(0, 0, -3); m.lookAt(camMenu.position);
  sceneMenu.add(m); momoHost = 'menu';
  playAnim('Idle');
  camMenu.position.set(0, 1.6, 3.5); camMenu.lookAt(0, 0, -3);
}

/* ================= INICIALIZAÇÃO / CARREGAMENTO ================= */
let loadReady = false;
function init() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.getElementById('world').appendChild(renderer.domElement);

  camOffice = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 40);
  // Câmera posicionada no centro do quarto, olhando para a mesa e monitor (frente do jogador)
  camOffice.position.set(0, 1.45, 2.6);
  sceneOffice = buildOffice();
  for (let i = 0; i < 6; i++) buildRoom(i);
  buildMenu();

  loadMsgEl = $('load-msg');

  // Inicia direto no MENU (sem loading inicial)
  mode = 'menu';
  els.menu.classList.remove('hidden');
  SND.droneStart();
}

/* Sequência de loading: só começa APÓS o jornal, com mensagens dinâmicas */
function startLoadingSequence() {
  mode = 'loading';
  els.paper.classList.add('hidden');
  els.loading.classList.remove('hidden');
  els.loadBtn.classList.add('hidden');
  els.loadBar.style.width = '0%';
  els.loadPct.textContent = '0%';

  const TOTAL = 3;
  let loadedCount = 0;
  let done = [false, false, false];
  let loadTarget = 0;
  let loadCurrent = 0;
  let loadReadyLocal = false;

  const msgs = [
    'Carregando quarto 3D...',
    'Preparando câmeras...',
    'Iniciando Noite 1...'
  ];
  let msgIdx = 0;
  function setMsg(m) {
    if (loadMsgEl) loadMsgEl.textContent = m;
  }
  setMsg(msgs[0]);

  function animateBar() {
    if (loadReadyLocal) {
      loadCurrent = 100;
      els.loadBar.style.width = '100%';
      els.loadPct.textContent = '100%';
      return;
    }
    loadCurrent += (loadTarget - loadCurrent) * 0.18;
    if (Math.abs(loadTarget - loadCurrent) < 0.6) loadCurrent = loadTarget;
    els.loadBar.style.width = loadCurrent.toFixed(0) + '%';
    els.loadPct.textContent = Math.round(loadCurrent) + '%';
    requestAnimationFrame(animateBar);
  }
  animateBar();

  function markDone(idx) {
    if (done[idx]) return;
    done[idx] = true;
    loadedCount++;
    loadTarget = Math.round((loadedCount / TOTAL) * 100);
    if (msgIdx < msgs.length - 1 && loadedCount >= msgIdx + 1) {
      msgIdx++;
      setMsg(msgs[msgIdx]);
    }
    if (loadedCount >= TOTAL) finishLoadingLocal();
  }

  function finishLoadingLocal() {
    if (loadReadyLocal) return;
    loadReadyLocal = true;
    loadReady = true;
    loadTarget = 100;
    setMsg('Iniciando Noite 1...');
    setTimeout(() => {
      els.loadBar.style.width = '100%';
      els.loadPct.textContent = '100%';
      els.loadBtn.classList.remove('hidden');
    }, 300);
    setTimeout(() => {
      els.loading.classList.add('hidden');
      startNight(1);
    }, 900);
  }

  // Força conclusão em menos de 2 segundos (nunca trava)
  setTimeout(() => {
    if (!loadReadyLocal) {
      for (let i = 0; i < TOTAL; i++) if (!done[i]) markDone(i);
    }
  }, 1800);

  // 1) Modelo 3D oficial (timeout 1,5s -> fallback procedural)
  let glbResolved = false;
  const glbTimeout = setTimeout(() => {
    if (!glbResolved) {
      glbResolved = true;
      console.warn('GLB timeout — fallback procedural da Momo');
      markDone(0);
    }
  }, 1500);
  new GLTFLoader().load('momo_3d_model.glb', (gltf) => {
    clearTimeout(glbTimeout);
    if (!glbResolved) {
      glbResolved = true;
      momoGltf = gltf;
      markDone(0);
    }
  }, undefined, (err) => {
    clearTimeout(glbTimeout);
    if (!glbResolved) {
      glbResolved = true;
      console.warn('GLB erro — fallback procedural da Momo', err);
      markDone(0);
    }
  });

  // 2) Textura pôster JoJo (timeout 1,5s)
  loadTexWithTimeout('assets/img/jojo-poster.png', 1500)
    .then(t => { textures.poster = t; markDone(1); })
    .catch(() => markDone(1));

  // 3) Ícone/favicon (timeout 1,5s)
  loadTexWithTimeout('assets/img/favicon.png', 1500)
    .then(t => { textures.favicon = t; markDone(2); })
    .catch(() => markDone(2));
}

function startMenu() {
  mode = 'menu';
  els.menu.classList.remove('hidden');
  SND.droneStart();
}

function startPaper() {
  mode = 'paper';
  els.menu.classList.add('hidden');
  els.paper.classList.remove('hidden');
}

function startNight(n) {
  night = n;
  running = true;
  nightT = 0;
  battery = 100;
  // Câmera começa olhando para a mesa e monitor (frente do jogador, não para a parede/ventilador)
  yaw = 0.68;
  blackout = false;
  flashOn = false; monFlash = false; monCamIdx = 0;
  doorOpen = true; curtainOpen = true; doorAngle = 0; curtainScale = 1;
  lastDoor = 0; lastCurtain = 0;
  ai.loc = 0; ai.state = 'wander'; ai.target = null;
  ai.moveProg = 0; ai.dwell = 0; ai.dwellLimit = 7000;
  ai.linger = 0; ai.frozen = 0;
  placeMomo();
  updateHUD();
  updateUsage();
  els.hud.classList.remove('hidden');
  els.paper.classList.add('hidden');
  els.gameover.classList.add('hidden');
  els.night.classList.add('hidden');
  mode = 'office';
  SND.droneStop();
}

/* ================= LÓGICA DO JOGO ================= */
function showWarn(text, ms) {
  els.warn.textContent = text;
  els.warn.style.opacity = 1;
  warn.until = performance.now() + ms;
}
function updateHUD() {
  els.battPct.textContent = Math.round(battery) + '%';
  const bars = els.battBars.children;
  for (let i = 0; i < 4; i++) {
    const fill = Math.max(0, Math.min(1, (battery - i * 25) / 25));
    bars[i].className = 'batt-bar' + (fill >= 0.98 ? ' full' : (battery <= 25 && i === 3 ? ' low' : ''));
    bars[i].style.opacity = String(0.35 + fill * 0.65);
  }
}
function updateUsage() {
  const items = [
    { label: 'LANTERNA', on: flashOn },
    { label: 'PORTA', on: !doorOpen },
    { label: 'CORTINA', on: !curtainOpen },
    { label: 'MONITOR', on: mode === 'monitor' }
  ];
  els.usage.innerHTML = items.map(it =>
    `<span class="usage-item"><span class="dot ${it.on ? '' : 'off'}"></span>${it.label}</span>`
  ).join('');
}
function updateNightUI() {
  const frac = Math.min(1, nightT / CFG.NIGHT_SEC);
  const h = els.clock;
  let hour = h.querySelector('.hand');
  let min = h.querySelector('.hand.min');
  if (!hour) {
    hour = document.createElement('div'); hour.className = 'hand';
    h.appendChild(hour);
  }
  if (!min) {
    min = document.createElement('div'); min.className = 'hand min';
    h.appendChild(min);
  }
  hour.style.transform = `translateX(-50%) rotate(${frac * 180}deg)`;
  min.style.transform = `translateX(-50%) rotate(${(nightT % 60) / 60 * 360}deg)`;
}
function updateDoorCurtain(dt) {
  // porta: fechada = colada na parede (rot 0), aberta = gira para dentro (rot PI/2)
  const targetDoor = doorOpen ? Math.PI / 2 : 0;
  doorAngle += (targetDoor - doorAngle) * dt * 3;
  doorMesh.rotation.y = doorAngle;
  const hingeZ = -2.35;
  const half = 1.05;
  const cx = -4.005 + Math.sin(doorAngle) * half;
  const cz = hingeZ - Math.cos(doorAngle) * half;
  doorMesh.position.set(cx, 1.15, cz);
  if (!doorOpen) doorMesh.position.set(-4.005, 1.15, -1.25);

  const targetCurtain = curtainOpen ? 0.05 : 1;
  curtainScale += (targetCurtain - curtainScale) * dt * 2.5;
  curtainMesh.scale.set(curtainScale, 1, 1);
  curtainMesh.visible = curtainScale > 0.06;
}
function toggleDoor() {
  const now = performance.now();
  if (now - lastDoor < CFG.COOLDOWN_MS) return;
  lastDoor = now;
  doorOpen = !doorOpen;
  SND.creak();
  showWarn(doorOpen ? 'PORTA ABERTA' : 'PORTA FECHADA', 1200);
  updateUsage();
  els.doorBtn.textContent = doorOpen ? 'FECHAR PORTA' : 'ABRIR PORTA';
  if (!doorOpen && ai.loc === 'L') { ai.state = 'retreat'; ai.target = 0; ai.moveProg = 0; ai.moveDur = 0.9; }
}
function toggleCurtain() {
  const now = performance.now();
  if (now - lastCurtain < CFG.COOLDOWN_MS) return;
  lastCurtain = now;
  curtainOpen = !curtainOpen;
  SND.creak();
  showWarn(curtainOpen ? 'CORTINA ABERTA' : 'CORTINA FECHADA', 1200);
  updateUsage();
  els.curtainBtn.textContent = curtainOpen ? 'FECHAR CORTINA' : 'ABRIR CORTINA';
  if (!curtainOpen && ai.loc === 'R') { ai.state = 'retreat'; ai.target = 5; ai.moveProg = 0; ai.moveDur = 0.9; }
}
function toggleFlashlight() {
  if (blackout) return;
  flashOn = !flashOn;
  SND.tone(400, 'square', 0.05, 0.1);
  els.flashlightBtn.classList.toggle('active', flashOn);
  updateUsage();
}
function openMonitor() {
  if (blackout || mode !== 'office') return;
  mode = 'monitor';
  els.monitor.classList.remove('hidden');
  els.hud.classList.add('hidden');
  setMobileUI(false);
  buildThumbs();
  updateMonitorUI();
  SND.tone(300, 'sine', 0.1, 0.08);
}
function closeMonitor() {
  mode = 'office';
  els.monitor.classList.add('hidden');
  els.hud.classList.remove('hidden');
  setMobileUI(true);
  monFlash = false;
}
function buildThumbs() {
  els.monThumbs.innerHTML = '';
  for (let i = 0; i < 6; i++) {
    const t = document.createElement('div');
    t.className = 'thumb' + (i === monCamIdx ? ' active' : '');
    t.textContent = CAM_KEYS[i] + (typeof ai.loc === 'number' && ai.loc === i ? ' ●' : '');
    t.onclick = () => { monCamIdx = i; buildThumbs(); updateMonitorUI(); };
    els.monThumbs.appendChild(t);
  }
}
function updateMonitorUI() {
  els.monCam.textContent = CAM_KEYS[monCamIdx];
  els.monName.textContent = ROOM_NAMES[monCamIdx];
  els.monFlash.textContent = monFlash ? 'LANTERNA CÂM: LIGADA' : 'LANTERNA CÂMERA';
  els.monFlash.classList.toggle('active', monFlash);
}
function triggerJumpscare() {
  ai.state = 'jumpscare';
  running = false;
  SND.droneStop();
  SND.scream();
  const m = ensureMomo();
  const dir = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  jumpTarget = new THREE.Vector3(camOffice.position.x + dir.x * 0.85, camOffice.position.y, camOffice.position.z + dir.z * 0.85);
  m.position.copy(camOffice.position).add(new THREE.Vector3(dir.x * 0.4, 0, dir.z * 0.4));
  m.lookAt(camOffice.position);
  sceneOffice.add(m); momoHost = 'office';
  playAnim('Attack');
  jumpLunge = true;
  els.jump.classList.remove('hidden');
  setTimeout(() => {
    els.jump.classList.add('hidden');
    els.gameover.classList.remove('hidden');
    els.goText.textContent = 'A Momo te pegou na Noite ' + night + '.';
  }, 2200);
}
function updateAI(dt) {
  if (ai.state === 'jumpscare') return;
  const watching = (mode === 'monitor' && typeof ai.loc === 'number' && ai.loc === monCamIdx);
  if (watching) { ai.frozen += dt; return; }
  ai.frozen = 0;

  if (ai.state === 'wander') {
    ai.dwell += dt;
    if (ai.dwell * 1000 > ai.dwellLimit) {
      ai.state = 'move';
      const opts = AI_GRAPH[ai.loc];
      ai.target = opts[Math.floor(Math.random() * opts.length)];
      ai.moveProg = 0; ai.moveDur = 0.7 + Math.random() * 0.7;
      ai.dwell = 0;
      ai.dwellLimit = Math.max(2200, 7000 + Math.random() * 5000 - night * 900);
    }
  }
  if (ai.state === 'move') {
    ai.moveProg += dt / ai.moveDur;
    if (ai.moveProg >= 1) {
      ai.loc = ai.target; ai.state = 'wander'; ai.dwell = 0;
      placeMomo();
      if (ai.loc === 'L' || ai.loc === 'R') { ai.state = 'linger'; ai.linger = 0; }
    }
  }
  if (ai.state === 'linger') {
    ai.linger += dt;
    const closed = (ai.loc === 'L' ? !doorOpen : !curtainOpen);
    if (closed) {
      ai.state = 'retreat'; ai.target = (ai.loc === 'L' ? 0 : 5);
      ai.moveProg = 0; ai.moveDur = 1.0;
      SND.creak();
    } else if (ai.linger * 1000 >= CFG.LINGER_MS) {
      triggerJumpscare();
    } else {
      const side = ai.loc === 'L' ? 'PORTA' : 'CORTINA';
      showWarn('MOMO NA ' + side + '!', 600);
    }
  }
  if (ai.state === 'retreat') {
    ai.moveProg += dt / ai.moveDur;
    if (ai.moveProg >= 1) {
      ai.loc = ai.target; ai.state = 'wander'; ai.dwell = 0;
      placeMomo();
    }
  }
}
function updateBattery(dt) {
  if (!running) return;
  let active = 0;
  if (flashOn) active++;
  if (!doorOpen) active++;
  if (!curtainOpen) active++;
  if (mode === 'monitor') active++;
  const drain = (CFG.BASE_DRAIN + active * CFG.USAGE_DRAIN) * dt;
  battery = Math.max(0, battery - drain);
  blackout = battery <= 0;
  if (blackout) {
    flashOn = false;
    els.flashlightBtn.classList.remove('active');
  }
  updateHUD();
  updateUsage();
}
function nightComplete() {
  running = false;
  mode = 'night';
  SND.sixam();
  els.hud.classList.add('hidden');
  els.monitor.classList.add('hidden');
  els.nightNum.textContent = night;
  els.night.classList.remove('hidden');
}

function placeMomoInView() {
  if (mode === 'monitor') {
    if (typeof ai.loc === 'number' && ai.loc === monCamIdx) {
      if (momoHost !== monCamIdx) placeMomo();
    } else {
      if (momoHost === monCamIdx) { rooms[monCamIdx].remove(momo); momoHost = null; }
    }
  } else {
    if ((ai.loc === 'L' || ai.loc === 'R') && momoHost !== 'office') placeMomo();
    else if (momoHost !== null && momoHost !== 'office') {
      if (typeof momoHost === 'number' && rooms[momoHost]) rooms[momoHost].remove(momo);
      momoHost = null;
    }
  }
}

/* ================= CÂMERAS / INPUT ================= */
function updateOfficeCamera() {
  const dir = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
  camOffice.position.set(0, 1.45, 2.6);
  camOffice.lookAt(new THREE.Vector3(Math.sin(yaw), 1.45, 2.6 - Math.cos(yaw)));
  flashLight.position.copy(camOffice.position);
  flashLight.target.position.set(camOffice.position.x + dir.x * 10, camOffice.position.y, camOffice.position.z + dir.z * 10);
  flashLight.target.updateMatrixWorld();
}
function updateMonitorCamera() {
  const cam = roomCams[monCamIdx];
  const shake = Math.sin(performance.now() / 60) * 0.005;
  cam.position.set(0.02 + shake, 1.5, 0.4);
  cam.lookAt(0, 1.5, -2.8);
  const light = rooms[monCamIdx].userData._roomLight;
  if (light) light.intensity = 0.35 + Math.sin(performance.now() / 400 + monCamIdx) * 0.05;
}

function onResize() {
  const ar = window.innerWidth / window.innerHeight;
  camOffice.aspect = ar; camOffice.updateProjectionMatrix();
  for (const c of roomCams) { c.aspect = ar; c.updateProjectionMatrix(); }
  camMenu.aspect = ar; camMenu.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

/* Interação por raio no centro da tela */
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
function tryInteract() {
  if (mode !== 'office') return;
  raycaster.setFromCamera(center, camOffice);
  const hits = [doorMesh, curtainMesh, laptopMesh].filter(Boolean);
  const inters = raycaster.intersectObjects(hits);
  if (inters.length === 0) return;
  const t = inters[0].object.userData.type;
  if (t === 'door') toggleDoor();
  else if (t === 'curtain') toggleCurtain();
  else if (t === 'monitor') openMonitor();
}

/* Controles */
function setupInput() {
  const canvas = renderer.domElement;
  let touchId = null, lastTx = 0;
  const isSmall = window.innerWidth <= 900;
  function setMobileUI(show) {
    els.mobile.style.display = (isSmall && show) ? 'flex' : 'none';
  }
  setMobileUI(true);

  canvas.addEventListener('mousedown', (e) => {
    if (mode === 'office' || mode === 'monitor') {
      isDragging = true; dragStartX = e.clientX; lastTx = e.clientX;
    }
  });
  window.addEventListener('mousemove', (e) => {
    if (!isDragging || (mode !== 'office' && mode !== 'monitor')) return;
    const dx = e.clientX - lastTx; lastTx = e.clientX;
    yaw -= dx * 0.0015;
    yaw = Math.max(-CFG.ROT_LIMIT, Math.min(CFG.ROT_LIMIT, yaw));
  });
  window.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    if (Math.abs(e.clientX - dragStartX) < 6 && (mode === 'office' || mode === 'monitor')) tryInteract();
  });
  canvas.addEventListener('touchstart', (e) => {
    touchId = e.changedTouches[0].identifier;
    lastTx = e.changedTouches[0].clientX;
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const t = e.changedTouches.find(t => t.identifier === touchId);
    if (!t || (mode !== 'office' && mode !== 'monitor')) return;
    const dx = t.clientX - lastTx; lastTx = t.clientX;
    yaw -= dx * 0.0015;
    yaw = Math.max(-CFG.ROT_LIMIT, Math.min(CFG.ROT_LIMIT, yaw));
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    if (e.changedTouches.find(t => t.identifier === touchId)) {
      if (mode === 'office') tryInteract();
      touchId = null;
    }
  });

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyF') { toggleFlashlight(); e.preventDefault(); }
    if (e.code === 'KeyM') { mode === 'office' ? openMonitor() : closeMonitor(); }
    if (mode === 'office') {
      if (e.code === 'Digit1') toggleDoor();
      if (e.code === 'Digit2') toggleCurtain();
    }
    if (e.code === 'Escape') { if (mode === 'monitor') closeMonitor(); }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  els.flashlightBtn.onclick = toggleFlashlight;
  els.doorBtn.onclick = toggleDoor;
  els.curtainBtn.onclick = toggleCurtain;
  els.monFlash.onclick = () => { monFlash = !monFlash; updateMonitorUI(); };
  els.monClose.onclick = closeMonitor;
  els.mbFlash.onclick = toggleFlashlight;
  els.mbDoor.onclick = toggleDoor;
  els.mbCurtain.onclick = toggleCurtain;
  els.mbClose.onclick = closeMonitor;

  /* Fluxo de telas: Menu -> PLAY -> Jornal -> Loading -> Jogo */
  els.loadBtn.onclick = () => { SND.droneStart(); startNight(1); };
  els.menuBtn.onclick = () => { startPaper(); };
  els.paperBtn.onclick = () => { startLoadingSequence(); };
  els.goRetry.onclick = () => {
    els.gameover.classList.add('hidden');
    startNight(1);
  };
  els.nightNext.onclick = () => {
    els.night.classList.add('hidden');
    const n = night + 1;
    if (n > CFG.MAX_NIGHTS) {
      els.goText.textContent = 'Você sobreviveu a todas as noites!';
      els.gameover.classList.remove('hidden');
    } else {
      startNight(n);
    }
  };
}

/* ================= LOOP PRINCIPAL ================= */
function animate(t) {
  requestAnimationFrame(animate);
  const dt = Math.min((t - lastTime) / 1000, 0.05);
  lastTime = t;

  if (momoMixer) momoMixer.update(dt);
  if (bladesGroup) bladesGroup.rotation.z += dt * 8; // ventilador girando

  if (mode === 'office' && running) {
    if (keys['ArrowLeft'] || keys['KeyA']) yaw -= dt * 1.4;
    if (keys['ArrowRight'] || keys['KeyD']) yaw += dt * 1.4;
    yaw = Math.max(-CFG.ROT_LIMIT, Math.min(CFG.ROT_LIMIT, yaw));
    updateOfficeCamera();
    updateDoorCurtain(dt);
    updateAI(dt);
    updateBattery(dt);
    updateNightUI();
    placeMomoInView();
    officeLights.forEach(l => { l.intensity = blackout ? 0 : 0.75; });
    if (flashLight) flashLight.visible = flashOn && !blackout;
  } else if (mode === 'monitor') {
    updateMonitorCamera();
    updateAI(dt);
    updateBattery(dt);
    updateNightUI();
    placeMomoInView();
    officeLights.forEach(l => { l.intensity = blackout ? 0 : 0.75; });
    if (flashLight) flashLight.visible = false;
    if (rooms[monCamIdx].userData._roomLight && monFlash) {
      // lanterna da câmera: ilumina o cômodo visto
      rooms[monCamIdx].userData._roomLight.intensity = 0.9;
    }
  }

  const scene = (mode === 'monitor') ? rooms[monCamIdx] :
                (mode === 'menu') ? sceneMenu : sceneOffice;
  const camera = (mode === 'monitor') ? roomCams[monCamIdx] :
                 (mode === 'menu') ? camMenu : camOffice;
  renderer.render(scene, camera);

  if (warn.until && performance.now() > warn.until) {
    els.warn.style.opacity = 0;
  }

  if (jumpLunge && momo) {
    const step = dt * 2.2;
    momo.position.lerp(jumpTarget, step);
    momo.lookAt(camOffice.position);
    momo.scale.setScalar(1 + step * 0.6);
    if (momo.position.distanceTo(jumpTarget) < 0.15) jumpLunge = false;
  }
}

init();
setupInput();
animate(performance.now());
