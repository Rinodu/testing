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

// ---------- Mesh building (face culling, per-block-type merged geometry) ----------
const FACES = [
  // dir, corners (x,y,z offsets), normal
  { dir: [1, 0, 0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], shade: 0.75 },
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], shade: 0.75 },
  { dir: [0, 1, 0], corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], shade: 1.0 },
  { dir: [0, -1, 0], corners: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]], shade: 0.5 },
  { dir: [0, 0, 1], corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]], shade: 0.85 },
  { dir: [0, 0, -1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], shade: 0.6 },
];

function buildWorldMesh(world, scene, existingMesh) {
  if (existingMesh) {
    scene.remove(existingMesh);
    existingMesh.geometry.dispose();
    existingMesh.material.dispose();
  }

  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let vertCount = 0;

  const color = new THREE.Color();

  for (let x = 0; x < world.size; x++) {
    for (let z = 0; z < world.size; z++) {
      for (let y = 0; y < world.height; y++) {
        const block = world.get(x, y, z);
        if (block === BLOCK.AIR) continue;
        const baseColor = BLOCK_COLORS[block] || 0xffffff;
        for (const face of FACES) {
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          if (world.get(nx, ny, nz) !== BLOCK.AIR) continue;
          color.set(baseColor);
          color.multiplyScalar(face.shade);
          for (const corner of face.corners) {
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            normals.push(...face.dir);
            colors.push(color.r, color.g, color.b);
          }
          indices.push(vertCount, vertCount + 1, vertCount + 2, vertCount, vertCount + 2, vertCount + 3);
          vertCount += 4;
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);

  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
  return mesh;
}

// ---------- Three.js setup ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 40, 110);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.9);
scene.add(hemiLight);
const sunLight = new THREE.DirectionalLight(0xffffff, 0.7);
sunLight.position.set(50, 80, 30);
scene.add(sunLight);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- World init ----------
const world = new World(WORLD_SIZE, WORLD_HEIGHT);
generateWorld(world);
let worldMesh = buildWorldMesh(world, scene, null);

function rebuildMesh() {
  worldMesh = buildWorldMesh(world, scene, worldMesh);
}

// ---------- Player ----------
const spawnX = Math.floor(WORLD_SIZE / 2);
const spawnZ = Math.floor(WORLD_SIZE / 2);
const spawnY = world.heightAt(spawnX, spawnZ) + 2;

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
