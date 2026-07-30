/* Blocky World - a minimal Minecraft-like voxel game built with three.js */

// ---------- Config ----------
const WORLD_SIZE = 48;      // width/depth of the world (blocks)
const WORLD_HEIGHT = 28;    // max height (blocks)
const REACH = 6;            // block interaction reach distance
const GRAVITY = 20;
const JUMP_SPEED = 8;
const MOVE_SPEED = 6;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;

const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  LEAVES: 5,
  SAND: 6,
};

const BLOCK_COLORS = {
  [BLOCK.GRASS]: 0x5fb347,
  [BLOCK.DIRT]: 0x8b5a2b,
  [BLOCK.STONE]: 0x8a8a8a,
  [BLOCK.WOOD]: 0x6b4423,
  [BLOCK.LEAVES]: 0x3a8f3a,
  [BLOCK.SAND]: 0xdccb8a,
};

const HOTBAR_BLOCKS = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.WOOD, BLOCK.LEAVES, BLOCK.SAND];

// ---------- Procedural pixel-art texture atlas ----------
const ATLAS_COLS = 4;
const ATLAS_ROWS = 4;
const CELL_PX = 16;

const TEX_CELL = {
  GRASS_TOP: [0, 0],
  GRASS_SIDE: [1, 0],
  DIRT: [2, 0],
  STONE: [3, 0],
  WOOD_TOP: [0, 1],
  WOOD_SIDE: [1, 1],
  LEAVES: [2, 1],
  SAND: [3, 1],
};

const BLOCK_FACE_CELLS = {
  [BLOCK.GRASS]: { top: TEX_CELL.GRASS_TOP, bottom: TEX_CELL.DIRT, side: TEX_CELL.GRASS_SIDE },
  [BLOCK.DIRT]: { top: TEX_CELL.DIRT, bottom: TEX_CELL.DIRT, side: TEX_CELL.DIRT },
  [BLOCK.STONE]: { top: TEX_CELL.STONE, bottom: TEX_CELL.STONE, side: TEX_CELL.STONE },
  [BLOCK.WOOD]: { top: TEX_CELL.WOOD_TOP, bottom: TEX_CELL.WOOD_TOP, side: TEX_CELL.WOOD_SIDE },
  [BLOCK.LEAVES]: { top: TEX_CELL.LEAVES, bottom: TEX_CELL.LEAVES, side: TEX_CELL.LEAVES },
  [BLOCK.SAND]: { top: TEX_CELL.SAND, bottom: TEX_CELL.SAND, side: TEX_CELL.SAND },
};

function seededRandomFn(seed) {
  let s = seed >>> 0;
  return function () {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967295;
  };
}

function clamp255(v) { return Math.max(0, Math.min(255, Math.round(v))); }

function buildTextureAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * CELL_PX;
  canvas.height = ATLAS_ROWS * CELL_PX;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  function cellOrigin(cell) { return [cell[0] * CELL_PX, cell[1] * CELL_PX]; }

  function noiseFill(x0, y0, base, variance, seed) {
    const rnd = seededRandomFn(seed);
    for (let py = 0; py < CELL_PX; py++) {
      for (let px = 0; px < CELL_PX; px++) {
        const n = (rnd() - 0.5) * 2 * variance;
        ctx.fillStyle = `rgb(${clamp255(base[0] + n)},${clamp255(base[1] + n)},${clamp255(base[2] + n)})`;
        ctx.fillRect(x0 + px, y0 + py, 1, 1);
      }
    }
  }

  function speckle(x0, y0, seed, count, colorFn) {
    const rnd = seededRandomFn(seed);
    for (let i = 0; i < count; i++) {
      const px = Math.floor(rnd() * CELL_PX), py = Math.floor(rnd() * CELL_PX);
      ctx.fillStyle = colorFn(rnd);
      ctx.fillRect(x0 + px, y0 + py, 1, 1);
    }
  }

  // DIRT
  {
    const [x0, y0] = cellOrigin(TEX_CELL.DIRT);
    noiseFill(x0, y0, [120, 80, 45], 22, 101);
    speckle(x0, y0, 202, 10, () => 'rgba(90,60,35,0.6)');
  }

  // STONE
  {
    const [x0, y0] = cellOrigin(TEX_CELL.STONE);
    noiseFill(x0, y0, [130, 130, 130], 18, 303);
    speckle(x0, y0, 404, 14, (rnd) => (rnd() < 0.5 ? 'rgba(90,90,90,0.5)' : 'rgba(175,175,175,0.5)'));
  }

  // SAND
  {
    const [x0, y0] = cellOrigin(TEX_CELL.SAND);
    noiseFill(x0, y0, [222, 203, 148], 14, 505);
  }

  // GRASS_TOP
  {
    const [x0, y0] = cellOrigin(TEX_CELL.GRASS_TOP);
    noiseFill(x0, y0, [95, 175, 70], 20, 606);
    speckle(x0, y0, 707, 8, () => 'rgba(70,140,50,0.6)');
  }

  // GRASS_SIDE: dirt body with a jagged grass strip along the top edge
  {
    const [x0, y0] = cellOrigin(TEX_CELL.GRASS_SIDE);
    noiseFill(x0, y0, [120, 80, 45], 20, 808);
    const grassHeight = 5;
    const rnd = seededRandomFn(909);
    for (let py = 0; py < grassHeight; py++) {
      for (let px = 0; px < CELL_PX; px++) {
        if (py === grassHeight - 1 && rnd() < 0.5) continue;
        const n = (rnd() - 0.5) * 2 * 18;
        ctx.fillStyle = `rgb(${clamp255(95 + n)},${clamp255(175 + n)},${clamp255(70 + n)})`;
        ctx.fillRect(x0 + px, y0 + py, 1, 1);
      }
    }
  }

  // WOOD_TOP: concentric growth rings
  {
    const [x0, y0] = cellOrigin(TEX_CELL.WOOD_TOP);
    const cx = CELL_PX / 2, cy = CELL_PX / 2;
    const rnd = seededRandomFn(1010);
    for (let py = 0; py < CELL_PX; py++) {
      for (let px = 0; px < CELL_PX; px++) {
        const d = Math.hypot(px - cx + 0.5, py - cy + 0.5);
        const ring = Math.floor(d) % 3;
        const n = (rnd() - 0.5) * 10;
        const base = ring === 0 ? [150, 105, 60] : ring === 1 ? [130, 90, 50] : [110, 75, 40];
        ctx.fillStyle = `rgb(${clamp255(base[0] + n)},${clamp255(base[1] + n)},${clamp255(base[2] + n)})`;
        ctx.fillRect(x0 + px, y0 + py, 1, 1);
      }
    }
  }

  // WOOD_SIDE: vertical bark stripes
  {
    const [x0, y0] = cellOrigin(TEX_CELL.WOOD_SIDE);
    const rnd = seededRandomFn(1111);
    const stripe = [];
    for (let px = 0; px < CELL_PX; px++) stripe.push(rnd() < 0.35 ? -18 : rnd() < 0.5 ? 10 : 0);
    for (let py = 0; py < CELL_PX; py++) {
      for (let px = 0; px < CELL_PX; px++) {
        const n = stripe[px] + (rnd() - 0.5) * 6;
        ctx.fillStyle = `rgb(${clamp255(120 + n)},${clamp255(85 + n * 0.8)},${clamp255(48 + n * 0.6)})`;
        ctx.fillRect(x0 + px, y0 + py, 1, 1);
      }
    }
  }

  // LEAVES
  {
    const [x0, y0] = cellOrigin(TEX_CELL.LEAVES);
    noiseFill(x0, y0, [55, 120, 45], 26, 1212);
    speckle(x0, y0, 1313, 10, (rnd) => (rnd() < 0.5 ? 'rgba(30,80,30,0.6)' : 'rgba(90,160,70,0.5)'));
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

// ---------- Simple seeded value noise ----------
function makeNoise2D(seed) {
  const perm = new Uint8Array(256);
  let s = seed >>> 0;
  function rand() {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    s >>>= 0;
    return s / 4294967295;
  }
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  function grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  return function noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const a = p[X] + Y, aa = p[a], ab = p[a + 1];
    const b = p[X + 1] + Y, ba = p[b], bb = p[b + 1];
    return lerp(
      lerp(grad(p[aa], x, y), grad(p[ba], x - 1, y), u),
      lerp(grad(p[ab], x, y - 1), grad(p[bb], x - 1, y - 1), u),
      v
    );
  };
}

const noise2D = makeNoise2D(1337);

function fractalNoise(x, z, octaves = 4, persistence = 0.5, scale = 0.05) {
  let total = 0, amp = 1, freq = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    total += noise2D(x * scale * freq, z * scale * freq) * amp;
    maxAmp += amp;
    amp *= persistence;
    freq *= 2;
  }
  return total / maxAmp;
}

// ---------- World data ----------
class World {
  constructor(size, height) {
    this.size = size;
    this.height = height;
    this.data = new Uint8Array(size * size * height);
  }
  inBounds(x, y, z) {
    return x >= 0 && x < this.size && z >= 0 && z < this.size && y >= 0 && y < this.height;
  }
  index(x, y, z) {
    return (x * this.size + z) * this.height + y;
  }
  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return BLOCK.AIR;
    return this.data[this.index(x, y, z)];
  }
  set(x, y, z, val) {
    if (!this.inBounds(x, y, z)) return;
    this.data[this.index(x, y, z)] = val;
  }
  heightAt(x, z) {
    for (let y = this.height - 1; y >= 0; y--) {
      if (this.get(x, y, z) !== BLOCK.AIR) return y;
    }
    return -1;
  }
}

function generateWorld(world) {
  const baseHeight = 10;
  for (let x = 0; x < world.size; x++) {
    for (let z = 0; z < world.size; z++) {
      const n = fractalNoise(x, z);
      const h = Math.max(2, Math.min(world.height - 4, Math.floor(baseHeight + n * 8)));
      for (let y = 0; y <= h; y++) {
        let type;
        if (y === h) type = h <= baseHeight - 3 ? BLOCK.SAND : BLOCK.GRASS;
        else if (y >= h - 3) type = BLOCK.DIRT;
        else type = BLOCK.STONE;
        world.set(x, y, z, type);
      }
    }
  }
  // scatter trees
  let treeSeed = 42;
  function rnd() { treeSeed ^= treeSeed << 13; treeSeed ^= treeSeed >>> 17; treeSeed ^= treeSeed << 5; treeSeed >>>= 0; return treeSeed / 4294967295; }
  for (let x = 2; x < world.size - 2; x++) {
    for (let z = 2; z < world.size - 2; z++) {
      const h = world.heightAt(x, z);
      if (h > 0 && world.get(x, h, z) === BLOCK.GRASS && rnd() < 0.01) {
        const trunkHeight = 3 + Math.floor(rnd() * 2);
        for (let t = 1; t <= trunkHeight; t++) world.set(x, h + t, z, BLOCK.WOOD);
        const topY = h + trunkHeight;
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
              if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) <= 3 && rnd() < 0.9) {
                if (world.get(x + dx, topY + dy, z + dz) === BLOCK.AIR) {
                  world.set(x + dx, topY + dy, z + dz, BLOCK.LEAVES);
                }
              }
            }
          }
        }
      }
    }
  }
}

// ---------- Mesh building (face culling, textured, per-vertex ambient occlusion) ----------
const FACES = [
  // dir, corners (x,y,z offsets), normal, which texture (top/bottom/side)
  { dir: [1, 0, 0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], shade: 0.75, which: 'side' },
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], shade: 0.75, which: 'side' },
  { dir: [0, 1, 0], corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], shade: 1.0, which: 'top' },
  { dir: [0, -1, 0], corners: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]], shade: 0.5, which: 'bottom' },
  { dir: [0, 0, 1], corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]], shade: 0.85, which: 'side' },
  { dir: [0, 0, -1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], shade: 0.6, which: 'side' },
];

for (const face of FACES) {
  face.axis = face.dir.findIndex((v) => v !== 0);
  face.tangents = [0, 1, 2].filter((i) => i !== face.axis);
}

function vertexAOLevel(side1, side2, corner) {
  if (side1 && side2) return 0;
  return 3 - (side1 ? 1 : 0) - (side2 ? 1 : 0) - (corner ? 1 : 0);
}
const AO_LEVELS = [0.45, 0.65, 0.82, 1.0];

const UV_LOCAL = [[0, 0], [0, 1], [1, 1], [1, 0]];
const CELL_U = 1 / ATLAS_COLS;
const CELL_V = 1 / ATLAS_ROWS;

function buildWorldMesh(world, scene, existingMesh) {
  if (existingMesh) {
    scene.remove(existingMesh);
    existingMesh.geometry.dispose();
    existingMesh.material.dispose();
  }

  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  let vertCount = 0;

  const color = new THREE.Color();

  for (let x = 0; x < world.size; x++) {
    for (let z = 0; z < world.size; z++) {
      for (let y = 0; y < world.height; y++) {
        const block = world.get(x, y, z);
        if (block === BLOCK.AIR) continue;
        const faceCells = BLOCK_FACE_CELLS[block];
        for (const face of FACES) {
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          if (world.get(nx, ny, nz) !== BLOCK.AIR) continue;

          const cell = faceCells[face.which];
          const u0 = cell[0] * CELL_U, v0 = cell[1] * CELL_V;

          const aoValues = [];
          for (const corner of face.corners) {
            const tb = corner[face.tangents[0]] === 1 ? 1 : -1;
            const tc = corner[face.tangents[1]] === 1 ? 1 : -1;
            const off1 = [0, 0, 0]; off1[face.tangents[0]] = tb;
            const off2 = [0, 0, 0]; off2[face.tangents[1]] = tc;
            const s1 = world.get(nx + off1[0], ny + off1[1], nz + off1[2]) !== BLOCK.AIR;
            const s2 = world.get(nx + off2[0], ny + off2[1], nz + off2[2]) !== BLOCK.AIR;
            const cn = world.get(nx + off1[0] + off2[0], ny + off1[1] + off2[1], nz + off1[2] + off2[2]) !== BLOCK.AIR;
            aoValues.push(vertexAOLevel(s1, s2, cn));
          }

          const baseVert = vertCount;
          for (let ci = 0; ci < 4; ci++) {
            const corner = face.corners[ci];
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            normals.push(...face.dir);
            const brightness = AO_LEVELS[aoValues[ci]];
            color.setRGB(brightness, brightness, brightness);
            colors.push(color.r, color.g, color.b);
            const [lu, lv] = UV_LOCAL[ci];
            uvs.push(u0 + lu * CELL_U, v0 + lv * CELL_V);
          }

          if (aoValues[0] + aoValues[2] > aoValues[1] + aoValues[3]) {
            indices.push(baseVert, baseVert + 1, baseVert + 2, baseVert, baseVert + 2, baseVert + 3);
          } else {
            indices.push(baseVert, baseVert + 1, baseVert + 3, baseVert + 1, baseVert + 2, baseVert + 3);
          }
          vertCount += 4;
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  const material = new THREE.MeshLambertMaterial({ map: atlasTexture, vertexColors: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ---------- Three.js setup ----------
const scene = new THREE.Scene();
const SKY_TOP = 0x4a90d9;
const SKY_HORIZON = 0xcfeeff;
scene.fog = new THREE.Fog(SKY_HORIZON, 45, 130);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Gradient sky dome
const skyGeo = new THREE.SphereGeometry(400, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    topColor: { value: new THREE.Color(SKY_TOP) },
    bottomColor: { value: new THREE.Color(SKY_HORIZON) },
    offset: { value: 20 },
    exponent: { value: 0.6 },
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  fragmentShader: `
    varying vec3 vWorldPosition;
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    void main() {
      float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
    }
  `,
  side: THREE.BackSide,
  depthWrite: false,
});
scene.add(new THREE.Mesh(skyGeo, skyMat));

// Sun glow sprite
function buildSunGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.2, 'rgba(255,240,180,0.9)');
  g.addColorStop(1, 'rgba(255,240,180,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: buildSunGlowTexture(), transparent: true, depthWrite: false }));
sunSprite.scale.set(90, 90, 1);
scene.add(sunSprite);

const hemiLight = new THREE.HemisphereLight(0xbde0ff, 0x6b5a42, 0.85);
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff3d6, 1.05);
sunLight.position.set(WORLD_SIZE * 1.3, 45, WORLD_SIZE * 0.15);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -60;
sunLight.shadow.camera.right = 60;
sunLight.shadow.camera.top = 60;
sunLight.shadow.camera.bottom = -60;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 220;
sunLight.shadow.bias = -0.0015;
scene.add(sunLight);

const sunTarget = new THREE.Object3D();
sunTarget.position.set(WORLD_SIZE / 2, 0, WORLD_SIZE / 2);
scene.add(sunTarget);
sunLight.target = sunTarget;

sunSprite.position.copy(sunLight.position).normalize().multiplyScalar(350);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- World init ----------
const atlasTexture = buildTextureAtlas();
const world = new World(WORLD_SIZE, WORLD_HEIGHT);
generateWorld(world);
let worldMesh = buildWorldMesh(world, scene, null);

function rebuildMesh() {
  worldMesh = buildWorldMesh(world, scene, worldMesh);
}

// ---------- Player ----------
const spawnX = Math.floor(WORLD_SIZE / 2);
const spawnZ = Math.floor(WORLD_SIZE / 2);
const spawnY = world.heightAt(spawnX, spawnZ) + 1 + PLAYER_HEIGHT;

const player = {
  pos: new THREE.Vector3(spawnX + 0.5, spawnY, spawnZ + 0.5),
  vel: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  pitch: 0,
  onGround: false,
};

camera.position.copy(player.pos);

// Pointer lock + mouse look
const domElement = renderer.domElement;
let isLocked = false;

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');

startBtn.addEventListener('click', () => {
  domElement.requestPointerLock();
});
domElement.addEventListener('click', () => {
  if (!isLocked) domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  isLocked = document.pointerLockElement === domElement;
  overlay.classList.toggle('hidden', isLocked);
});

document.addEventListener('mousemove', (e) => {
  if (!isLocked) return;
  const sensitivity = 0.0022;
  player.yaw -= e.movementX * sensitivity;
  player.pitch -= e.movementY * sensitivity;
  const limit = Math.PI / 2 - 0.05;
  player.pitch = Math.max(-limit, Math.min(limit, player.pitch));
});

// Keyboard
const keys = {};
document.addEventListener('keydown', (e) => { keys[e.code] = true; });
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

// Hotbar / selected block
let selectedBlock = HOTBAR_BLOCKS[0];
const hotbarEl = document.getElementById('hotbar');
function renderHotbar() {
  hotbarEl.innerHTML = '';
  HOTBAR_BLOCKS.forEach((blockType, i) => {
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot' + (blockType === selectedBlock ? ' active' : '');
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.background = '#' + BLOCK_COLORS[blockType].toString(16).padStart(6, '0');
    slot.appendChild(swatch);
    const label = document.createElement('span');
    label.textContent = i + 1;
    slot.appendChild(label);
    hotbarEl.appendChild(slot);
  });
}
renderHotbar();

document.addEventListener('keydown', (e) => {
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= HOTBAR_BLOCKS.length) {
    selectedBlock = HOTBAR_BLOCKS[num - 1];
    renderHotbar();
  }
});

let hotbarIndex = 0;
document.addEventListener('wheel', (e) => {
  if (!isLocked) return;
  hotbarIndex = (hotbarIndex + (e.deltaY > 0 ? 1 : -1) + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
  selectedBlock = HOTBAR_BLOCKS[hotbarIndex];
  renderHotbar();
});

// Mouse buttons: break / place
domElement.addEventListener('mousedown', (e) => {
  if (!isLocked) return;
  if (e.button === 0) breakBlock();
  else if (e.button === 2) placeBlock();
});
domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- Raycast voxel traversal ----------
function raycastBlock() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone();

  const step = 0.05;
  let prevBlockPos = null;
  for (let t = 0; t < REACH; t += step) {
    const p = origin.clone().addScaledVector(dir, t);
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    if (world.get(bx, by, bz) !== BLOCK.AIR) {
      return { hit: { x: bx, y: by, z: bz }, before: prevBlockPos };
    }
    prevBlockPos = { x: bx, y: by, z: bz };
  }
  return null;
}

function breakBlock() {
  const result = raycastBlock();
  if (result && result.hit) {
    world.set(result.hit.x, result.hit.y, result.hit.z, BLOCK.AIR);
    rebuildMesh();
  }
}

function placeBlock() {
  const result = raycastBlock();
  if (result && result.before) {
    const { x, y, z } = result.before;
    // don't place inside the player
    const px = Math.floor(player.pos.x), py0 = Math.floor(player.pos.y - PLAYER_HEIGHT + 0.1), py1 = Math.floor(player.pos.y - 0.1), pz = Math.floor(player.pos.z);
    if ((x === px && z === pz) && (y === py0 || y === py1)) return;
    world.set(x, y, z, selectedBlock);
    rebuildMesh();
  }
}

// ---------- Physics / collision ----------
function isSolid(x, y, z) {
  return world.get(Math.floor(x), Math.floor(y), Math.floor(z)) !== BLOCK.AIR;
}

function collidesAt(pos) {
  const minX = pos.x - PLAYER_RADIUS, maxX = pos.x + PLAYER_RADIUS;
  const minZ = pos.z - PLAYER_RADIUS, maxZ = pos.z + PLAYER_RADIUS;
  const minY = pos.y - PLAYER_HEIGHT, maxY = pos.y;
  const points = [
    [minX, minY, minZ], [maxX, minY, minZ], [minX, minY, maxZ], [maxX, minY, maxZ],
    [minX, maxY, minZ], [maxX, maxY, minZ], [minX, maxY, maxZ], [maxX, maxY, maxZ],
    [minX, (minY+maxY)/2, minZ], [maxX, (minY+maxY)/2, maxZ],
  ];
  for (const [x, y, z] of points) {
    if (isSolid(x, y, z)) return true;
  }
  return false;
}

function updatePhysics(dt) {
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.sin(player.yaw + Math.PI / 2), 0, Math.cos(player.yaw + Math.PI / 2));

  let moveX = 0, moveZ = 0;
  if (keys['KeyW']) { moveX -= forward.x; moveZ -= forward.z; }
  if (keys['KeyS']) { moveX += forward.x; moveZ += forward.z; }
  if (keys['KeyA']) { moveX -= right.x; moveZ -= right.z; }
  if (keys['KeyD']) { moveX += right.x; moveZ += right.z; }

  const len = Math.hypot(moveX, moveZ);
  if (len > 0) { moveX /= len; moveZ /= len; }

  player.vel.x = moveX * MOVE_SPEED;
  player.vel.z = moveZ * MOVE_SPEED;

  if (keys['Space'] && player.onGround) {
    player.vel.y = JUMP_SPEED;
    player.onGround = false;
  }

  player.vel.y -= GRAVITY * dt;
  if (player.vel.y < -30) player.vel.y = -30;

  // move + collide per axis
  const next = player.pos.clone();

  next.x += player.vel.x * dt;
  if (collidesAt(next)) next.x = player.pos.x;
  player.pos.x = next.x;

  next.z = player.pos.z;
  next.z += player.vel.z * dt;
  if (collidesAt(new THREE.Vector3(player.pos.x, player.pos.y, next.z))) next.z = player.pos.z;
  player.pos.z = next.z;

  let newY = player.pos.y + player.vel.y * dt;
  const testPos = new THREE.Vector3(player.pos.x, newY, player.pos.z);
  if (collidesAt(testPos)) {
    if (player.vel.y < 0) player.onGround = true;
    player.vel.y = 0;
  } else {
    player.pos.y = newY;
    player.onGround = false;
  }

  // fallback: prevent falling out of world
  if (player.pos.y < -10) {
    player.pos.set(spawnX + 0.5, world.heightAt(spawnX, spawnZ) + 3, spawnZ + 0.5);
    player.vel.set(0, 0, 0);
  }

  camera.position.copy(player.pos);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

// ---------- Main loop ----------
let lastTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (isLocked) {
    updatePhysics(dt);
  }

  renderer.render(scene, camera);
}
animate();
