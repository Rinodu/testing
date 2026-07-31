/* Blocky World - a minimal Minecraft-like voxel game built with three.js */

// ---------- Config ----------
const CHUNK_SIZE = 16;        // chunk width/depth in blocks
const WORLD_HEIGHT = 28;      // max height (blocks)
const RENDER_DISTANCE = 4;    // chunks kept meshed/visible around the player
const UNLOAD_DISTANCE = 6;    // chunks farther than this get their mesh disposed
const CHUNK_UPDATE_INTERVAL = 0.3; // seconds between chunk stream checks
const REACH = 6;              // block interaction reach distance
const GRAVITY = 20;
const JUMP_SPEED = 8;
const MOVE_SPEED = 6;
const SPRINT_MULTIPLIER = 1.6;
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.3;
const DAY_LENGTH_SECONDS = 600; // one full day/night cycle
const MAX_HEALTH = 20;
const MAX_HUNGER = 20;
const HUNGER_DRAIN_INTERVAL = 25; // seconds per -1 hunger point
const MAX_MOBS = 60;
const SAVE_KEY = 'blockyworld_save_v1';

const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  LEAVES: 5,
  SAND: 6,
  COAL_ORE: 7,
  IRON_ORE: 8,
  SNOW: 9,
  WATER: 10,
  TORCH: 11,
};

const BLOCK_NAMES = {
  [BLOCK.GRASS]: 'Rumput',
  [BLOCK.DIRT]: 'Tanah',
  [BLOCK.STONE]: 'Batu',
  [BLOCK.WOOD]: 'Kayu',
  [BLOCK.LEAVES]: 'Daun',
  [BLOCK.SAND]: 'Pasir',
  [BLOCK.COAL_ORE]: 'Bijih Batu Bara',
  [BLOCK.IRON_ORE]: 'Bijih Besi',
  [BLOCK.SNOW]: 'Salju',
  [BLOCK.WATER]: 'Air',
  [BLOCK.TORCH]: 'Obor',
};

const HOTBAR_BLOCKS = [BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.WOOD, BLOCK.LEAVES, BLOCK.SAND, BLOCK.SNOW, BLOCK.TORCH];

// Non-block items (crafted goods / food / raw ore). IDs are offset well past
// BLOCK ids so they can share the same `inventory` dictionary without colliding.
const ITEM = {
  MEAT: 100,
  STICK: 101,
  STONE_PICKAXE: 102,
  WOOD_AXE: 103,
  COAL: 104,
  IRON: 105,
  IRON_PICKAXE: 106,
};

const ITEM_META = {
  [ITEM.MEAT]: { label: 'Daging', color: 0xaa4433 },
  [ITEM.STICK]: { label: 'Stick', color: 0xc9a066 },
  [ITEM.STONE_PICKAXE]: { label: 'Pickaxe Batu', color: 0x999999 },
  [ITEM.WOOD_AXE]: { label: 'Kapak Kayu', color: 0x8b5a2b },
  [ITEM.COAL]: { label: 'Batu Bara', color: 0x2b2b2b },
  [ITEM.IRON]: { label: 'Besi Mentah', color: 0xd8c8b8 },
  [ITEM.IRON_PICKAXE]: { label: 'Pickaxe Besi', color: 0xdedede },
};

function itemLabel(id) {
  return BLOCK_NAMES[id] || (ITEM_META[id] && ITEM_META[id].label) || ('Item ' + id);
}

// Simple recipes: shapeless (no fixed grid pattern, just totals of each input)
const RECIPES = [
  { inputs: { [BLOCK.WOOD]: 1 }, output: ITEM.STICK, outputCount: 4 },
  { inputs: { [BLOCK.STONE]: 3, [ITEM.STICK]: 2 }, output: ITEM.STONE_PICKAXE, outputCount: 1 },
  { inputs: { [BLOCK.WOOD]: 3, [ITEM.STICK]: 2 }, output: ITEM.WOOD_AXE, outputCount: 1 },
  { inputs: { [ITEM.IRON]: 3, [ITEM.STICK]: 2 }, output: ITEM.IRON_PICKAXE, outputCount: 1 },
  { inputs: { [ITEM.COAL]: 1, [ITEM.STICK]: 1 }, output: BLOCK.TORCH, outputCount: 4 },
];

// Blocks that a pickaxe (stone/iron) speeds up mining for; iron ore additionally
// requires owning at least a stone pickaxe to drop anything, like Minecraft's
// tool-tier gating.
const PICKAXE_BLOCKS = new Set([BLOCK.STONE, BLOCK.COAL_ORE, BLOCK.IRON_ORE]);

// Seconds needed to fully mine a block (before tool speed multipliers)
const BLOCK_HARDNESS = {
  [BLOCK.GRASS]: 0.5,
  [BLOCK.DIRT]: 0.45,
  [BLOCK.STONE]: 1.3,
  [BLOCK.WOOD]: 0.7,
  [BLOCK.LEAVES]: 0.25,
  [BLOCK.SAND]: 0.4,
  [BLOCK.COAL_ORE]: 1.4,
  [BLOCK.IRON_ORE]: 1.8,
  [BLOCK.SNOW]: 0.35,
  [BLOCK.TORCH]: 0.1,
};

// What a block drops when mined (grass drops dirt, like Minecraft). Ores are
// handled separately in getMiningDrop() since their drop depends on tools.
const BLOCK_DROP = {
  [BLOCK.GRASS]: BLOCK.DIRT,
  [BLOCK.DIRT]: BLOCK.DIRT,
  [BLOCK.STONE]: BLOCK.STONE,
  [BLOCK.WOOD]: BLOCK.WOOD,
  [BLOCK.LEAVES]: BLOCK.LEAVES,
  [BLOCK.SAND]: BLOCK.SAND,
  [BLOCK.SNOW]: BLOCK.SNOW,
  [BLOCK.TORCH]: BLOCK.TORCH,
};

// Ore/tool-aware version of BLOCK_DROP. Returns null when nothing should drop
// (mining iron ore bare-handed/wood tools, like vanilla Minecraft).
function getMiningDrop(blockType) {
  if (blockType === BLOCK.COAL_ORE) return ITEM.COAL;
  if (blockType === BLOCK.IRON_ORE) {
    const hasPickaxe = inventory[ITEM.STONE_PICKAXE] > 0 || inventory[ITEM.IRON_PICKAXE] > 0;
    if (!hasPickaxe) {
      showToast('Butuh Pickaxe Batu untuk menambang bijih besi!');
      return null;
    }
    return ITEM.IRON;
  }
  return BLOCK_DROP[blockType] ?? null;
}

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
  COAL_ORE: [0, 2],
  IRON_ORE: [1, 2],
  SNOW: [2, 2],
  TORCH: [3, 2],
};

const BLOCK_FACE_CELLS = {
  [BLOCK.GRASS]: { top: TEX_CELL.GRASS_TOP, bottom: TEX_CELL.DIRT, side: TEX_CELL.GRASS_SIDE },
  [BLOCK.DIRT]: { top: TEX_CELL.DIRT, bottom: TEX_CELL.DIRT, side: TEX_CELL.DIRT },
  [BLOCK.STONE]: { top: TEX_CELL.STONE, bottom: TEX_CELL.STONE, side: TEX_CELL.STONE },
  [BLOCK.WOOD]: { top: TEX_CELL.WOOD_TOP, bottom: TEX_CELL.WOOD_TOP, side: TEX_CELL.WOOD_SIDE },
  [BLOCK.LEAVES]: { top: TEX_CELL.LEAVES, bottom: TEX_CELL.LEAVES, side: TEX_CELL.LEAVES },
  [BLOCK.SAND]: { top: TEX_CELL.SAND, bottom: TEX_CELL.SAND, side: TEX_CELL.SAND },
  [BLOCK.COAL_ORE]: { top: TEX_CELL.COAL_ORE, bottom: TEX_CELL.COAL_ORE, side: TEX_CELL.COAL_ORE },
  [BLOCK.IRON_ORE]: { top: TEX_CELL.IRON_ORE, bottom: TEX_CELL.IRON_ORE, side: TEX_CELL.IRON_ORE },
  [BLOCK.SNOW]: { top: TEX_CELL.SNOW, bottom: TEX_CELL.DIRT, side: TEX_CELL.SNOW },
  // Torch isn't a real cube in the world (see buildChunkMesh/isTransparentBlock),
  // this entry only exists so its hotbar icon and dropped-item cube can use the atlas.
  [BLOCK.TORCH]: { top: TEX_CELL.TORCH, bottom: TEX_CELL.TORCH, side: TEX_CELL.TORCH },
};

function seededRandomFn(seed) {
  let s = seed >>> 0;
  return function () {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967295;
  };
}

// Deterministic hash-based pseudo-random value for a given (x,z) column plus a
// salt channel. Unlike a running RNG this doesn't depend on generation order,
// which matters once terrain is generated chunk-by-chunk on demand instead of
// in one raster pass (see World/generateChunkTerrain below).
function hash2D(x, z, salt) {
  let h = (x * 374761393 + z * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 1000000) / 1000000;
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

  // COAL_ORE: stone base with black coal flecks
  {
    const [x0, y0] = cellOrigin(TEX_CELL.COAL_ORE);
    noiseFill(x0, y0, [130, 130, 130], 16, 1414);
    speckle(x0, y0, 1415, 16, () => 'rgba(20,20,20,0.9)');
  }

  // IRON_ORE: stone base with warm tan/orange flecks
  {
    const [x0, y0] = cellOrigin(TEX_CELL.IRON_ORE);
    noiseFill(x0, y0, [130, 130, 130], 16, 1416);
    speckle(x0, y0, 1417, 14, (rnd) => (rnd() < 0.5 ? 'rgba(200,150,100,0.85)' : 'rgba(180,120,80,0.7)'));
  }

  // SNOW: bright white with faint blue-grey shading
  {
    const [x0, y0] = cellOrigin(TEX_CELL.SNOW);
    noiseFill(x0, y0, [240, 244, 250], 8, 1418);
    speckle(x0, y0, 1419, 6, () => 'rgba(200,210,225,0.4)');
  }

  // TORCH: brown handle with an orange/yellow flame tip (only used for the
  // hotbar icon and dropped-item cube -- the in-world torch is its own mesh)
  {
    const [x0, y0] = cellOrigin(TEX_CELL.TORCH);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(x0, y0, CELL_PX, CELL_PX);
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(x0 + 6, y0 + 6, 4, 10);
    ctx.fillStyle = '#ffcc44';
    ctx.fillRect(x0 + 5, y0 + 2, 6, 5);
    ctx.fillStyle = '#ff9922';
    ctx.fillRect(x0 + 6, y0 + 3, 4, 3);
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

// Rewrites a BoxGeometry's UVs so every face samples a single atlas cell
// (used for the small item-drop cubes and mob body parts, which don't need
// per-face texturing). cellW/cellH default to the block atlas's cell
// fractions but any atlas (e.g. the mob atlas) can pass its own.
function applyAtlasCellToBox(geometry, cell, cellW = CELL_U, cellH = CELL_V) {
  const u0 = cell[0] * cellW, v0 = cell[1] * cellH;
  const uvAttr = geometry.getAttribute('uv');
  for (let i = 0; i < uvAttr.count; i++) {
    const lu = uvAttr.getX(i), lv = uvAttr.getY(i);
    uvAttr.setXY(i, u0 + lu * cellW, v0 + lv * cellH);
  }
  uvAttr.needsUpdate = true;
}

// Generic helpers for painting a procedural pixel-art atlas onto any canvas
// context (used by both the block atlas and the mob atlas below).
function noiseFillOn(ctx, x0, y0, w, h, base, variance, seed) {
  const rnd = seededRandomFn(seed);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const n = (rnd() - 0.5) * 2 * variance;
      ctx.fillStyle = `rgb(${clamp255(base[0] + n)},${clamp255(base[1] + n)},${clamp255(base[2] + n)})`;
      ctx.fillRect(x0 + px, y0 + py, 1, 1);
    }
  }
}
function blotchesOn(ctx, x0, y0, w, h, seed, count, color) {
  const rnd = seededRandomFn(seed);
  for (let i = 0; i < count; i++) {
    const bx = x0 + rnd() * w, by = y0 + rnd() * h;
    const r = 1.5 + rnd() * 2.5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(bx, by, r, r * 0.75, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
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

// 3D Perlin noise (classic Ken Perlin permutation-table form), used to carve
// underground caves -- a 2D field can't describe tunnels that wind through Y.
function makeNoise3D(seed) {
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
  function grad(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  return function noise3D(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(
      lerp(
        lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
        lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u),
        v
      ),
      lerp(
        lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u),
        v
      ),
      w
    );
  };
}

const noise2D = makeNoise2D(1337);
const tempNoise2D = makeNoise2D(9911); // separate seed/field so biomes aren't correlated with terrain height
const caveNoise3D = makeNoise3D(4242);
const CAVE_THRESHOLD = 0.62; // higher = rarer/smaller caves

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

const SEA_LEVEL = 7; // columns whose surface is at/below this get flooded up to here

// Broad, slow-varying temperature field used to pick a simple biome per column.
function temperatureAt(x, z) {
  let total = 0, amp = 1, freq = 1, maxAmp = 0;
  for (let i = 0; i < 3; i++) {
    total += tempNoise2D(x * 0.008 * freq, z * 0.008 * freq) * amp;
    maxAmp += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return total / maxAmp; // roughly -1..1
}
const DESERT_THRESHOLD = 0.35;
const SNOW_THRESHOLD = -0.35;

// ---------- World data (chunk-based, generated on demand around the player) ----------
class World {
  constructor(height) {
    this.height = height;
    this.chunks = new Map(); // "cx,cz" -> { data, cx, cz, dirty, modified, mobsSpawned }
  }
  chunkKey(cx, cz) { return cx + ',' + cz; }
  getChunkIfLoaded(cx, cz) { return this.chunks.get(this.chunkKey(cx, cz)); }
  getOrCreateChunk(cx, cz) {
    const key = this.chunkKey(cx, cz);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = {
        cx, cz,
        data: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * this.height),
        dirty: true,
        modified: false,
        mobsSpawned: false,
      };
      this.chunks.set(key, chunk); // register before filling, so cross-chunk writes during
                                    // generation (e.g. tree leaves) can't recurse forever
      generateChunkTerrain(this, chunk);
      applySavedChunkOverride(chunk);
    }
    return chunk;
  }
  localIndex(lx, y, lz) { return (lx * CHUNK_SIZE + lz) * this.height + y; }
  get(x, y, z) {
    if (y < 0 || y >= this.height) return BLOCK.AIR;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getOrCreateChunk(cx, cz);
    const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
    return chunk.data[this.localIndex(lx, y, lz)];
  }
  set(x, y, z, val) {
    if (y < 0 || y >= this.height) return;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getOrCreateChunk(cx, cz);
    const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
    chunk.data[this.localIndex(lx, y, lz)] = val;
    chunk.dirty = true;
    // a block on the chunk border affects the neighbor's face culling/AO too
    if (lx === 0) this.markDirtyIfLoaded(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirtyIfLoaded(cx + 1, cz);
    if (lz === 0) this.markDirtyIfLoaded(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirtyIfLoaded(cx, cz + 1);
  }
  markDirtyIfLoaded(cx, cz) {
    const c = this.chunks.get(this.chunkKey(cx, cz));
    if (c) c.dirty = true;
  }
  heightAt(x, z) {
    for (let y = this.height - 1; y >= 0; y--) {
      if (this.get(x, y, z) !== BLOCK.AIR) return y;
    }
    return -1;
  }
}

// Called by the player-facing edit functions (mining/placing) so those edits
// get flagged for save/load, separately from the one-time procedural fill.
function markPlayerEdit(x, z) {
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
  const chunk = world.getChunkIfLoaded(cx, cz);
  if (chunk) chunk.modified = true;
}

function generateChunkTerrain(world, chunk) {
  const baseHeight = 10;
  const x0 = chunk.cx * CHUNK_SIZE, z0 = chunk.cz * CHUNK_SIZE;
  for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
    for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
      const n = fractalNoise(x, z);
      const h = Math.max(2, Math.min(world.height - 4, Math.floor(baseHeight + n * 8)));
      const temp = temperatureAt(x, z);
      const isDesert = temp > DESERT_THRESHOLD;
      const isSnowy = temp < SNOW_THRESHOLD;
      for (let y = 0; y <= h; y++) {
        // Caves: only carve deep stone (never the surface/dirt crust, and
        // never y<=1 so there's always a solid floor under the world).
        if (y > 1 && y < h - 3 && caveNoise3D(x * 0.09, y * 0.12, z * 0.09) > CAVE_THRESHOLD) {
          world.set(x, y, z, BLOCK.AIR);
          continue;
        }
        let type;
        if (y === h) {
          if (h <= SEA_LEVEL || isDesert) type = BLOCK.SAND;
          else if (isSnowy) type = BLOCK.SNOW;
          else type = BLOCK.GRASS;
        } else if (y >= h - 3) {
          type = isDesert ? BLOCK.SAND : BLOCK.DIRT;
        } else {
          // ore pockets: coal fairly common, iron rarer and only deeper down
          const oreRoll = hash2D(x, z, 5000 + y * 131);
          if (oreRoll < 0.02) type = BLOCK.COAL_ORE;
          else if (oreRoll < 0.032 && y < baseHeight - 6) type = BLOCK.IRON_ORE;
          else type = BLOCK.STONE;
        }
        world.set(x, y, z, type);
      }
      if (h < SEA_LEVEL) {
        for (let y = h + 1; y <= SEA_LEVEL; y++) world.set(x, y, z, BLOCK.WATER);
      }
    }
  }
  // scatter trees: placement/shape driven entirely by hash2D(x,z,salt) so it's
  // identical no matter what order chunks happen to load in. Deserts stay bare.
  const TREE_SEED = 42;
  for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
    for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
      const h = world.heightAt(x, z);
      const surfaceIsGrassy = world.get(x, h, z) === BLOCK.GRASS || world.get(x, h, z) === BLOCK.SNOW;
      if (h > 0 && surfaceIsGrassy && temperatureAt(x, z) <= DESERT_THRESHOLD && hash2D(x, z, TREE_SEED) < 0.01) {
        const trunkHeight = 3 + Math.floor(hash2D(x, z, TREE_SEED + 1) * 2);
        for (let t = 1; t <= trunkHeight; t++) world.set(x, h + t, z, BLOCK.WOOD);
        const topY = h + trunkHeight;
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
              if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) <= 3 && hash2D(x + dx * 7, z + dz * 13, TREE_SEED + 2 + dy) < 0.9) {
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

// Air and water are both "see-through" for face culling purposes (a solid
// block face touching either of them should render), but only air itself
// gets skipped when iterating blocks to draw.
function isTransparentBlock(block) {
  return block === BLOCK.AIR || block === BLOCK.WATER || block === BLOCK.TORCH;
}

// Builds a mesh for a single chunk's blocks (bounded region instead of the
// whole world), so editing one chunk only ever re-generates that chunk.
function buildChunkMesh(world, chunk) {
  const x0 = chunk.cx * CHUNK_SIZE, z0 = chunk.cz * CHUNK_SIZE;
  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  let vertCount = 0;

  const color = new THREE.Color();

  for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
    for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
      for (let y = 0; y < world.height; y++) {
        const block = world.get(x, y, z);
        // Water is opaque-looking but rendered as its own transparent mesh
        // (see buildChunkWaterMesh), and torches are their own small
        // mesh+light entity (see syncTorchesForChunk) -- neither belongs
        // in this per-chunk solid-cube pass.
        if (block === BLOCK.AIR || block === BLOCK.WATER || block === BLOCK.TORCH) continue;
        const faceCells = BLOCK_FACE_CELLS[block];
        for (const face of FACES) {
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          if (!isTransparentBlock(world.get(nx, ny, nz))) continue;

          const cell = faceCells[face.which];
          const u0 = cell[0] * CELL_U, v0 = cell[1] * CELL_V;

          const aoValues = [];
          for (const corner of face.corners) {
            const tb = corner[face.tangents[0]] === 1 ? 1 : -1;
            const tc = corner[face.tangents[1]] === 1 ? 1 : -1;
            const off1 = [0, 0, 0]; off1[face.tangents[0]] = tb;
            const off2 = [0, 0, 0]; off2[face.tangents[1]] = tc;
            const s1 = !isTransparentBlock(world.get(nx + off1[0], ny + off1[1], nz + off1[2]));
            const s2 = !isTransparentBlock(world.get(nx + off2[0], ny + off2[1], nz + off2[2]));
            const cn = !isTransparentBlock(world.get(nx + off1[0] + off2[0], ny + off1[1] + off2[1], nz + off1[2] + off2[2]));
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
  return mesh;
}

// Water needs its own transparent, non-shadow-casting mesh (mixing it into
// the opaque chunk material would make solid blocks transparent too). Only
// faces touching true air are emitted -- water-to-water and water-to-ground
// faces are never visible. Returns null when the chunk has no water.
function buildChunkWaterMesh(world, chunk) {
  const x0 = chunk.cx * CHUNK_SIZE, z0 = chunk.cz * CHUNK_SIZE;
  const positions = [];
  const normals = [];
  const indices = [];
  let vertCount = 0;

  for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
    for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
      for (let y = 0; y < world.height; y++) {
        if (world.get(x, y, z) !== BLOCK.WATER) continue;
        for (const face of FACES) {
          const nx = x + face.dir[0], ny = y + face.dir[1], nz = z + face.dir[2];
          if (world.get(nx, ny, nz) !== BLOCK.AIR) continue;
          const baseVert = vertCount;
          for (const corner of face.corners) {
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            normals.push(...face.dir);
          }
          indices.push(baseVert, baseVert + 1, baseVert + 2, baseVert, baseVert + 2, baseVert + 3);
          vertCount += 4;
        }
      }
    }
  }

  if (vertCount === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);

  const material = new THREE.MeshLambertMaterial({
    color: 0x2a6fd6, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  return mesh;
}

// ---------- Three.js setup ----------
const scene = new THREE.Scene();
const SKY_TOP_DAY = new THREE.Color(0x4a90d9);
const SKY_HORIZON_DAY = new THREE.Color(0xcfeeff);
const SKY_TOP_NIGHT = new THREE.Color(0x02030c);
const SKY_HORIZON_NIGHT = new THREE.Color(0x0c1230);
scene.fog = new THREE.Fog(0xcfeeff, 45, 130);

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
    topColor: { value: new THREE.Color(SKY_TOP_DAY) },
    bottomColor: { value: new THREE.Color(SKY_HORIZON_DAY) },
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
const skyMesh = new THREE.Mesh(skyGeo, skyMat);
scene.add(skyMesh);

// Sun & moon glow sprites
function buildGlowTexture(colorStops) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  colorStops.forEach(([stop, color]) => g.addColorStop(stop, color));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: buildGlowTexture([[0, 'rgba(255,250,220,1)'], [0.2, 'rgba(255,240,180,0.9)'], [1, 'rgba(255,240,180,0)']]),
  transparent: true, depthWrite: false,
}));
sunSprite.scale.set(90, 90, 1);
scene.add(sunSprite);

const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: buildGlowTexture([[0, 'rgba(230,235,255,1)'], [0.3, 'rgba(200,210,240,0.8)'], [1, 'rgba(200,210,240,0)']]),
  transparent: true, depthWrite: false,
}));
moonSprite.scale.set(55, 55, 1);
scene.add(moonSprite);

const hemiLight = new THREE.HemisphereLight(0xbde0ff, 0x6b5a42, 0.85);
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff3d6, 1.05);
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
scene.add(sunTarget);
sunLight.target = sunTarget;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Day/night cycle ----------
// dayTime is a 0..1 fraction of a full cycle; 0 = sunrise, 0.5 = sunset.
let dayTime = 0.25;
let isNight = false;
const dayColor = new THREE.Color();
const nightColor = new THREE.Color();

function updateDayNightCycle(dt) {
  dayTime = (dayTime + dt / DAY_LENGTH_SECONDS) % 1;
  const angle = dayTime * Math.PI * 2;
  const sunHeight = Math.sin(angle);
  const daylight = Math.max(0, sunHeight); // 0 at night, 1 at noon
  isNight = sunHeight < 0.05;

  const R = 300;
  sunLight.position.set(Math.cos(angle) * R, sunHeight * R, Math.sin(angle) * 0.3 * R + player.pos.z);
  sunTarget.position.set(player.pos.x, 0, player.pos.z);
  sunSprite.position.copy(sunLight.position).add(new THREE.Vector3(0, 0, 0));
  moonSprite.position.set(-sunLight.position.x, -sunHeight * R, -sunLight.position.z + player.pos.z * 2);
  sunSprite.visible = sunHeight > -0.05;
  moonSprite.visible = sunHeight < 0.15;

  sunLight.intensity = Math.max(0, daylight) * 1.05;
  hemiLight.intensity = 0.15 + daylight * 0.7;
  ambientLight.intensity = 0.08 + daylight * 0.12;

  const mix = Math.max(0, Math.min(1, daylight + 0.15));
  dayColor.copy(SKY_TOP_DAY);
  nightColor.copy(SKY_TOP_NIGHT);
  skyMat.uniforms.topColor.value.copy(nightColor).lerp(dayColor, mix);
  dayColor.copy(SKY_HORIZON_DAY);
  nightColor.copy(SKY_HORIZON_NIGHT);
  skyMat.uniforms.bottomColor.value.copy(nightColor).lerp(dayColor, mix);
  scene.fog.color.copy(skyMat.uniforms.bottomColor.value);
}

// ---------- Save / Load (localStorage; chunks store only player-modified data,
// unmodified terrain is always regenerated deterministically from the seed) ----------
let pendingSave = null;
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) pendingSave = JSON.parse(raw);
} catch (e) { /* corrupted/unavailable storage: just start fresh */ }

function serializeChunkData(data) {
  let bin = '';
  for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i]);
  return btoa(bin);
}
function deserializeChunkData(str) {
  const bin = atob(str);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// Applied right after a chunk's procedural terrain is generated, so any saved
// player edits for that chunk overwrite the freshly-generated base data.
function applySavedChunkOverride(chunk) {
  if (!pendingSave || !pendingSave.chunks) return;
  const found = pendingSave.chunks.find((c) => c.cx === chunk.cx && c.cz === chunk.cz);
  if (found) {
    chunk.data.set(deserializeChunkData(found.data));
    chunk.modified = true;
  }
}

function saveGame() {
  const modifiedChunks = [];
  for (const chunk of world.chunks.values()) {
    if (chunk.modified) modifiedChunks.push({ cx: chunk.cx, cz: chunk.cz, data: serializeChunkData(chunk.data) });
  }
  const save = {
    version: 1,
    player: {
      x: player.pos.x, y: player.pos.y, z: player.pos.z,
      yaw: player.yaw, pitch: player.pitch,
      health: player.health, hunger: player.hunger,
    },
    inventory,
    dayTime,
    chunks: modifiedChunks,
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    showToast('Game disimpan');
  } catch (e) {
    console.warn('Save failed', e);
  }
}

// ---------- Toast (small ephemeral on-screen message) ----------
let toastTimer = null;
function showToast(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 2000);
}

// ---------- Sound effects (synthesized with Web Audio, no external audio files) ----------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, duration, type = 'sine', volume = 0.2) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function playNoiseBurst(duration, volume = 0.15, filterFreq = 2000) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}

function playFootstepSound() { playNoiseBurst(0.08, 0.08, 900); }
function playMineTickSound() { playTone(220, 0.07, 'square', 0.08); }
function playBlockBreakSound() { playNoiseBurst(0.15, 0.22, 1200); }
function playPlaceSound() { playTone(300, 0.06, 'square', 0.12); }
function playPunchSound() { playTone(520, 0.05, 'triangle', 0.15); }
function playMobDeathSound() { playTone(160, 0.2, 'sawtooth', 0.15); }
function playHurtSound() { playTone(100, 0.15, 'sawtooth', 0.2); }
function playEatSound() { playTone(600, 0.1, 'sine', 0.1); }
function playSplashSound() { playNoiseBurst(0.2, 0.15, 1800); }
function playJumpSound() { playTone(440, 0.08, 'sine', 0.08); }

// ---------- World init ----------
const atlasTexture = buildTextureAtlas();

// Crops a block's "top" atlas cell into its own tiny image so HUD icons
// (hotbar/inventory) show the same pixel-art texture as the in-world block
// instead of a flat color swatch.
const blockIconCache = {};
function getBlockIconURL(blockType) {
  if (blockIconCache[blockType]) return blockIconCache[blockType];
  const cell = BLOCK_FACE_CELLS[blockType].top;
  const c = document.createElement('canvas');
  c.width = CELL_PX; c.height = CELL_PX;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlasTexture.image, cell[0] * CELL_PX, cell[1] * CELL_PX, CELL_PX, CELL_PX, 0, 0, CELL_PX, CELL_PX);
  const url = c.toDataURL();
  blockIconCache[blockType] = url;
  return url;
}

const world = new World(WORLD_HEIGHT);
const chunkMeshes = new Map(); // "cx,cz" -> THREE.Mesh (opaque blocks)
const chunkWaterMeshes = new Map(); // "cx,cz" -> THREE.Mesh (transparent water), absent if chunk has none

// ---------- Torches (placeable light source) ----------
// A torch is a real block in the voxel grid (mineable, placeable, saved with
// its chunk like any other block) but it isn't a full cube, so it's skipped
// in buildChunkMesh and instead gets its own small mesh + light entity here.
const torchEntities = new Map(); // "x,y,z" -> { group, light: THREE.PointLight|null }
const MAX_ACTIVE_TORCH_LIGHTS = 20;

function createTorchVisual(x, y, z) {
  const group = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), new THREE.MeshLambertMaterial({ color: 0x6b4423 }));
  handle.position.y = 0.15;
  group.add(handle);
  const flame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), new THREE.MeshBasicMaterial({ color: 0xffcc44 }));
  flame.position.y = 0.38;
  group.add(flame);
  group.position.set(x + 0.5, y, z + 0.5);
  scene.add(group);
  return group;
}

function removeTorchEntity(key) {
  const t = torchEntities.get(key);
  if (!t) return;
  scene.remove(t.group);
  if (t.light) scene.remove(t.light);
  torchEntities.delete(key);
}

// Ensures torch entities exist exactly where the chunk's block data has a
// TORCH block, and nowhere else. Called whenever a chunk is (re)meshed, so
// placing/breaking a torch or reloading a saved chunk both pick it up.
function syncTorchesForChunk(chunk) {
  const x0 = chunk.cx * CHUNK_SIZE, z0 = chunk.cz * CHUNK_SIZE;
  for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
    for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
      for (let y = 0; y < world.height; y++) {
        const key = x + ',' + y + ',' + z;
        const isTorch = world.get(x, y, z) === BLOCK.TORCH;
        const has = torchEntities.has(key);
        if (isTorch && !has) torchEntities.set(key, { group: createTorchVisual(x, y, z), light: null });
        else if (!isTorch && has) removeTorchEntity(key);
      }
    }
  }
}

// Real-time point lights are expensive, so only the torches nearest the
// player actually get one; farther torches still show their lit-up flame
// mesh, they just don't cast dynamic light until the player gets close.
function rebalanceTorchLights() {
  const entries = Array.from(torchEntities.entries());
  entries.sort((a, b) => {
    const da = a[1].group.position.distanceToSquared(player.pos);
    const db = b[1].group.position.distanceToSquared(player.pos);
    return da - db;
  });
  entries.forEach(([, entity], i) => {
    if (i < MAX_ACTIVE_TORCH_LIGHTS) {
      if (!entity.light) {
        const light = new THREE.PointLight(0xffaa55, 1.1, 9, 2);
        light.position.copy(entity.group.position).add(new THREE.Vector3(0, 0.4, 0));
        scene.add(light);
        entity.light = light;
      }
    } else if (entity.light) {
      scene.remove(entity.light);
      entity.light = null;
    }
  });
}

function remeshChunk(cx, cz) {
  const key = world.chunkKey(cx, cz);
  const chunk = world.getChunkIfLoaded(cx, cz);
  if (!chunk) return;
  const old = chunkMeshes.get(key);
  if (old) { scene.remove(old); old.geometry.dispose(); old.material.dispose(); }
  const mesh = buildChunkMesh(world, chunk);
  scene.add(mesh);
  chunkMeshes.set(key, mesh);

  const oldWater = chunkWaterMeshes.get(key);
  if (oldWater) { scene.remove(oldWater); oldWater.geometry.dispose(); oldWater.material.dispose(); chunkWaterMeshes.delete(key); }
  const waterMesh = buildChunkWaterMesh(world, chunk);
  if (waterMesh) { scene.add(waterMesh); chunkWaterMeshes.set(key, waterMesh); }

  syncTorchesForChunk(chunk);

  chunk.dirty = false;
}

function removeTorchesInChunk(cx, cz) {
  const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
  for (const key of Array.from(torchEntities.keys())) {
    const [tx, , tz] = key.split(',').map(Number);
    if (tx >= x0 && tx < x0 + CHUNK_SIZE && tz >= z0 && tz < z0 + CHUNK_SIZE) removeTorchEntity(key);
  }
}

// Re-meshes the chunk containing (x,z) plus any dirty already-loaded
// neighbors (a block placed/broken on a border affects neighboring meshes).
function remeshAround(x, z) {
  const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const ncx = cx + dx, ncz = cz + dz;
      const chunk = world.getChunkIfLoaded(ncx, ncz);
      if (chunk && chunk.dirty && chunkMeshes.has(world.chunkKey(ncx, ncz))) remeshChunk(ncx, ncz);
    }
  }
}

let chunkUpdateAccumulator = 0;
function updateChunkStreaming(dt) {
  chunkUpdateAccumulator += dt;
  if (chunkUpdateAccumulator < CHUNK_UPDATE_INTERVAL) return;
  chunkUpdateAccumulator = 0;

  const pcx = Math.floor(player.pos.x / CHUNK_SIZE);
  const pcz = Math.floor(player.pos.z / CHUNK_SIZE);

  for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
    for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
      if (dx * dx + dz * dz > RENDER_DISTANCE * RENDER_DISTANCE) continue;
      const cx = pcx + dx, cz = pcz + dz;
      const key = world.chunkKey(cx, cz);
      const chunk = world.getOrCreateChunk(cx, cz);
      const isNewMesh = !chunkMeshes.has(key);
      if (chunk.dirty || isNewMesh) remeshChunk(cx, cz);
      if (!chunk.mobsSpawned) {
        chunk.mobsSpawned = true;
        maybeSpawnMobsInChunk(chunk);
      }
    }
  }

  for (const [key, mesh] of chunkMeshes) {
    const [cx, cz] = key.split(',').map(Number);
    if (Math.hypot(cx - pcx, cz - pcz) > UNLOAD_DISTANCE) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      chunkMeshes.delete(key);
      const waterMesh = chunkWaterMeshes.get(key);
      if (waterMesh) {
        scene.remove(waterMesh);
        waterMesh.geometry.dispose();
        waterMesh.material.dispose();
        chunkWaterMeshes.delete(key);
      }
      removeTorchesInChunk(cx, cz);
    }
  }

  rebalanceTorchLights();
  despawnFarMobs();
}

// ---------- Player ----------
const spawnX = 0, spawnZ = 0;
const savedPlayer = pendingSave && pendingSave.player;
const spawnY = savedPlayer ? savedPlayer.y : world.heightAt(spawnX, spawnZ) + 1 + PLAYER_HEIGHT;

const player = {
  pos: new THREE.Vector3(savedPlayer ? savedPlayer.x : spawnX + 0.5, spawnY, savedPlayer ? savedPlayer.z : spawnZ + 0.5),
  vel: new THREE.Vector3(0, 0, 0),
  yaw: savedPlayer ? savedPlayer.yaw : 0,
  pitch: savedPlayer ? savedPlayer.pitch : 0,
  onGround: false,
  health: savedPlayer ? savedPlayer.health : MAX_HEALTH,
  hunger: savedPlayer ? savedPlayer.hunger : MAX_HUNGER,
  sprinting: false,
  inWater: false,
};
if (pendingSave && typeof pendingSave.dayTime === 'number') dayTime = pendingSave.dayTime;

camera.position.copy(player.pos);

// ---------- Health & Hunger HUD ----------
const healthEl = document.getElementById('health');
function renderHealth() {
  healthEl.innerHTML = '';
  for (let i = 0; i < MAX_HEALTH / 2; i++) {
    const heart = document.createElement('div');
    const filled = player.health >= (i + 1) * 2;
    const half = !filled && player.health > i * 2;
    heart.className = 'heart ' + (filled || half ? 'full' : 'empty');
    heart.textContent = '♥';
    heart.style.opacity = half ? '0.5' : '1';
    healthEl.appendChild(heart);
  }
}
renderHealth();

const hungerEl = document.getElementById('hunger');
function renderHunger() {
  hungerEl.innerHTML = '';
  for (let i = 0; i < MAX_HUNGER / 2; i++) {
    const icon = document.createElement('div');
    const filled = player.hunger >= (i + 1) * 2;
    const half = !filled && player.hunger > i * 2;
    icon.className = 'drumstick ' + (filled || half ? 'full' : 'empty');
    icon.textContent = '🍗';
    icon.style.opacity = half ? '0.5' : '1';
    hungerEl.appendChild(icon);
  }
}
renderHunger();

let lastDamageTime = -Infinity;
function damagePlayer(amount) {
  const now = performance.now() / 1000;
  if (now - lastDamageTime < 0.5) return;
  lastDamageTime = now;
  player.health = Math.max(0, player.health - amount);
  renderHealth();
  playHurtSound();
  if (player.health <= 0) {
    player.pos.set(spawnX + 0.5, world.heightAt(spawnX, spawnZ) + 1 + PLAYER_HEIGHT, spawnZ + 0.5);
    player.vel.set(0, 0, 0);
    player.health = MAX_HEALTH;
    player.hunger = MAX_HUNGER;
    renderHealth();
    renderHunger();
  }
}

let hungerAccumulator = 0;
let lastStarveDamageTime = -Infinity;
function updateHunger(dt) {
  hungerAccumulator += player.sprinting ? dt * 2.5 : dt; // sprinting burns hunger faster
  if (hungerAccumulator >= HUNGER_DRAIN_INTERVAL) {
    hungerAccumulator = 0;
    if (player.hunger > 0) {
      player.hunger -= 1;
      renderHunger();
    }
  }
  const now = performance.now() / 1000;
  if (player.hunger <= 0 && player.health > 0 && now - lastStarveDamageTime > 3) {
    lastStarveDamageTime = now;
    player.health = Math.max(0, player.health - 1);
    renderHealth();
  } else if (player.hunger >= 18 && player.health < MAX_HEALTH && now - lastStarveDamageTime > 4) {
    lastStarveDamageTime = now;
    player.health = Math.min(MAX_HEALTH, player.health + 1);
    renderHealth();
  }
}

function eatMeat() {
  if (inventory[ITEM.MEAT] > 0 && player.hunger < MAX_HUNGER) {
    inventory[ITEM.MEAT]--;
    player.hunger = Math.min(MAX_HUNGER, player.hunger + 4);
    renderHunger();
    renderInventoryPanel();
    playEatSound();
    showToast('Makan daging (+4 hunger)');
  }
}

// ---------- Item drops ----------
const itemDrops = [];
const DROP_LIFETIME = 60;

function spawnItemDrop(x, y, z, itemType) {
  const geo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
  let mat;
  if (BLOCK_FACE_CELLS[itemType]) {
    applyAtlasCellToBox(geo, BLOCK_FACE_CELLS[itemType].top);
    mat = new THREE.MeshLambertMaterial({ map: atlasTexture });
  } else {
    const meta = ITEM_META[itemType];
    mat = new THREE.MeshLambertMaterial({ color: (meta && meta.color) || 0xffffff });
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  scene.add(mesh);
  itemDrops.push({
    mesh,
    itemType,
    vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 3, (Math.random() - 0.5) * 1.5),
    spawnTime: performance.now() / 1000,
    bobSeed: Math.random() * Math.PI * 2,
  });
}

function updateItemDrops(dt) {
  const now = performance.now() / 1000;
  for (let i = itemDrops.length - 1; i >= 0; i--) {
    const drop = itemDrops[i];

    // simple gravity + ground collision (drops don't need full player-style collision)
    drop.vel.y -= GRAVITY * dt;
    const next = drop.mesh.position.clone();
    next.x += drop.vel.x * dt;
    next.y += drop.vel.y * dt;
    next.z += drop.vel.z * dt;
    if (isSolid(next.x, next.y - 0.15, next.z)) {
      next.y = Math.floor(next.y) + 1.15;
      drop.vel.y = 0;
      drop.vel.x *= 0.8;
      drop.vel.z *= 0.8;
    }
    drop.mesh.position.copy(next);
    drop.mesh.rotation.y += dt * 1.5;
    drop.mesh.position.y += Math.sin(now * 3 + drop.bobSeed) * 0.05 * dt;

    // pickup
    const dx = player.pos.x - drop.mesh.position.x;
    const dz = player.pos.z - drop.mesh.position.z;
    const dy = (player.pos.y - PLAYER_HEIGHT * 0.5) - drop.mesh.position.y;
    if (dx * dx + dy * dy + dz * dz < 1.2 * 1.2) {
      addToInventory(drop.itemType, 1);
      scene.remove(drop.mesh);
      drop.mesh.geometry.dispose();
      drop.mesh.material.dispose();
      itemDrops.splice(i, 1);
      continue;
    }

    if (now - drop.spawnTime > DROP_LIFETIME) {
      scene.remove(drop.mesh);
      drop.mesh.geometry.dispose();
      drop.mesh.material.dispose();
      itemDrops.splice(i, 1);
    }
  }
}

// ---------- Mining crack overlay ----------
function buildCrackTexture(stage) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 32, 32);
  if (stage > 0) {
    const rnd = seededRandomFn(9999 + stage);
    ctx.strokeStyle = 'rgba(20,20,20,0.85)';
    ctx.lineWidth = 1.5;
    const lines = 3 + stage * 2;
    for (let i = 0; i < lines; i++) {
      ctx.beginPath();
      let x = rnd() * 32, y = rnd() * 32;
      ctx.moveTo(x, y);
      const segs = 2 + Math.floor(rnd() * 2);
      for (let s = 0; s < segs; s++) {
        x += (rnd() - 0.5) * 14;
        y += (rnd() - 0.5) * 14;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

const CRACK_STAGES = 8;
const crackTextures = [];
for (let s = 0; s < CRACK_STAGES; s++) crackTextures.push(buildCrackTexture(s));

const crackMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1.01, 1.01, 1.01),
  new THREE.MeshBasicMaterial({ map: crackTextures[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })
);
crackMesh.visible = false;
scene.add(crackMesh);

// ---------- Block highlight (outline on whatever block the player is looking at) ----------
const highlightMesh = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
  new THREE.LineBasicMaterial({ color: 0x0a0a0a })
);
highlightMesh.visible = false;
scene.add(highlightMesh);

function updateBlockHighlight() {
  if (!gameStarted || inventoryOpen) { highlightMesh.visible = false; return; }
  const hit = raycastBlock();
  if (hit) {
    highlightMesh.visible = true;
    highlightMesh.position.set(hit.hit.x + 0.5, hit.hit.y + 0.5, hit.hit.z + 0.5);
  } else {
    highlightMesh.visible = false;
  }
}

let lastCrackStage = -1;
function updateCrackMesh() {
  if (!miningTarget) { crackMesh.visible = false; return; }
  crackMesh.visible = true;
  crackMesh.position.set(miningTarget.x + 0.5, miningTarget.y + 0.5, miningTarget.z + 0.5);
  const stage = Math.min(CRACK_STAGES - 1, Math.floor(miningProgress * CRACK_STAGES));
  if (stage !== lastCrackStage) {
    crackMesh.material.map = crackTextures[stage];
    crackMesh.material.needsUpdate = true;
    lastCrackStage = stage;
    playMineTickSound();
  }
}

// ---------- Mobs (cow, goat, zombie) ----------
const MOB_TYPES = {
  COW: 'cow',
  GOAT: 'goat',
  ZOMBIE: 'zombie',
};

// ---------- Procedural mob texture atlas ----------
// Same technique as the block atlas: original pixel-art painted by code, not
// a copy of Mojang's actual mob textures (those are copyrighted assets).
const MOB_ATLAS_COLS = 4;
const MOB_ATLAS_ROWS = 3;
const MOB_CELL_PX = 16;
const MOB_CELL_U = 1 / MOB_ATLAS_COLS;
const MOB_CELL_V = 1 / MOB_ATLAS_ROWS;

const MOB_TEX_CELL = {
  COW_BODY: [0, 0], COW_HEAD: [1, 0], COW_LEG: [2, 0], COW_PATCH: [3, 0],
  GOAT_BODY: [0, 1], GOAT_HEAD: [1, 1], GOAT_HORN: [2, 1], GOAT_LEG: [3, 1],
  ZOMBIE_BODY: [0, 2], ZOMBIE_HEAD: [1, 2], ZOMBIE_ARM: [2, 2], ZOMBIE_LEG: [3, 2],
};

function buildMobTextureAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = MOB_ATLAS_COLS * MOB_CELL_PX;
  canvas.height = MOB_ATLAS_ROWS * MOB_CELL_PX;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const P = MOB_CELL_PX;
  const origin = (cell) => [cell[0] * P, cell[1] * P];

  function eyeDots(x0, y0) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x0 + 4, y0 + 6, 2, 2);
    ctx.fillRect(x0 + 10, y0 + 6, 2, 2);
  }

  // COW_BODY: white hide with black Holstein-style blotches
  {
    const [x0, y0] = origin(MOB_TEX_CELL.COW_BODY);
    noiseFillOn(ctx, x0, y0, P, P, [238, 238, 235], 8, 2101);
    blotchesOn(ctx, x0, y0, P, P, 2102, 5, '#2a2622');
  }
  // COW_HEAD: brown with a pale snout and eyes
  {
    const [x0, y0] = origin(MOB_TEX_CELL.COW_HEAD);
    noiseFillOn(ctx, x0, y0, P, P, [96, 62, 40], 14, 2103);
    ctx.fillStyle = '#e7d7c2';
    ctx.fillRect(x0 + 4, y0 + 10, 8, 5);
    eyeDots(x0, y0);
  }
  // COW_LEG: cream with a dark hoof tip
  {
    const [x0, y0] = origin(MOB_TEX_CELL.COW_LEG);
    noiseFillOn(ctx, x0, y0, P, P, [220, 210, 190], 8, 2104);
    ctx.fillStyle = '#2a2622';
    ctx.fillRect(x0, y0 + P - 3, P, 3);
  }
  // COW_PATCH: solid dark patch (used for the small spot decal on the body)
  {
    const [x0, y0] = origin(MOB_TEX_CELL.COW_PATCH);
    noiseFillOn(ctx, x0, y0, P, P, [42, 38, 34], 6, 2105);
  }

  // GOAT_BODY: grey-white fur with fine vertical strokes
  {
    const [x0, y0] = origin(MOB_TEX_CELL.GOAT_BODY);
    noiseFillOn(ctx, x0, y0, P, P, [205, 205, 200], 10, 2201);
    const rnd = seededRandomFn(2202);
    ctx.strokeStyle = 'rgba(160,160,155,0.5)';
    for (let i = 0; i < 14; i++) {
      const x = x0 + rnd() * P, y = y0 + rnd() * P;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 2 + rnd() * 2); ctx.stroke();
    }
  }
  // GOAT_HEAD: cream face with eyes and a dark nose
  {
    const [x0, y0] = origin(MOB_TEX_CELL.GOAT_HEAD);
    noiseFillOn(ctx, x0, y0, P, P, [222, 216, 200], 10, 2203);
    ctx.fillStyle = '#4a4038';
    ctx.fillRect(x0 + 6, y0 + 11, 4, 3);
    eyeDots(x0, y0);
  }
  // GOAT_HORN: dark curved-looking gradient
  {
    const [x0, y0] = origin(MOB_TEX_CELL.GOAT_HORN);
    noiseFillOn(ctx, x0, y0, P, P, [58, 54, 50], 10, 2204);
  }
  // GOAT_LEG: grey with dark hoof tip
  {
    const [x0, y0] = origin(MOB_TEX_CELL.GOAT_LEG);
    noiseFillOn(ctx, x0, y0, P, P, [170, 170, 165], 8, 2205);
    ctx.fillStyle = '#3a3632';
    ctx.fillRect(x0, y0 + P - 3, P, 3);
  }

  // ZOMBIE_BODY: torn teal shirt over green skin
  {
    const [x0, y0] = origin(MOB_TEX_CELL.ZOMBIE_BODY);
    noiseFillOn(ctx, x0, y0, P, P, [45, 110, 96], 12, 2301);
    blotchesOn(ctx, x0, y0, P, P, 2302, 4, 'rgba(30,70,60,0.7)');
  }
  // ZOMBIE_HEAD: rotten green skin with sunken eyes and a mouth line
  {
    const [x0, y0] = origin(MOB_TEX_CELL.ZOMBIE_HEAD);
    noiseFillOn(ctx, x0, y0, P, P, [84, 138, 72], 14, 2303);
    ctx.fillStyle = '#111';
    ctx.fillRect(x0 + 4, y0 + 6, 3, 2);
    ctx.fillRect(x0 + 10, y0 + 6, 3, 2);
    ctx.fillStyle = 'rgba(20,20,20,0.7)';
    ctx.fillRect(x0 + 5, y0 + 11, 6, 1);
  }
  // ZOMBIE_ARM: green skin, slightly darker variant
  {
    const [x0, y0] = origin(MOB_TEX_CELL.ZOMBIE_ARM);
    noiseFillOn(ctx, x0, y0, P, P, [76, 128, 66], 14, 2304);
  }
  // ZOMBIE_LEG: dark tattered trousers
  {
    const [x0, y0] = origin(MOB_TEX_CELL.ZOMBIE_LEG);
    noiseFillOn(ctx, x0, y0, P, P, [52, 58, 88], 10, 2305);
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

const mobAtlasTexture = buildMobTextureAtlas();

function boxPart(w, h, d, cell) {
  const geo = new THREE.BoxGeometry(w, h, d);
  applyAtlasCellToBox(geo, cell, MOB_CELL_U, MOB_CELL_V);
  const mat = new THREE.MeshLambertMaterial({ map: mobAtlasTexture });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.userData.baseColor = mat.color.clone(); // white; hurt-flash tints this over the texture
  return mesh;
}

function createCow() {
  const group = new THREE.Group();
  const body = boxPart(0.55, 0.5, 0.9, MOB_TEX_CELL.COW_BODY);
  body.position.set(0, 0.55, 0);
  group.add(body);
  const patch = boxPart(0.3, 0.2, 0.4, MOB_TEX_CELL.COW_PATCH);
  patch.position.set(0.1, 0.62, 0.15);
  group.add(patch);
  const head = boxPart(0.35, 0.35, 0.35, MOB_TEX_CELL.COW_HEAD);
  head.position.set(0, 0.6, 0.6);
  group.add(head);
  const legGeo = () => boxPart(0.15, 0.45, 0.15, MOB_TEX_CELL.COW_LEG);
  const legOffsets = [[-0.18, 0.22, 0.3], [0.18, 0.22, 0.3], [-0.18, 0.22, -0.3], [0.18, 0.22, -0.3]];
  const legs = legOffsets.map((o) => { const l = legGeo(); l.position.set(...o); group.add(l); return l; });
  return { group, legs, eyeHeight: 0.9, hitRadius: 0.55 };
}

function createGoat() {
  const group = new THREE.Group();
  const body = boxPart(0.4, 0.4, 0.7, MOB_TEX_CELL.GOAT_BODY);
  body.position.set(0, 0.45, 0);
  group.add(body);
  const head = boxPart(0.28, 0.28, 0.28, MOB_TEX_CELL.GOAT_HEAD);
  head.position.set(0, 0.55, 0.45);
  group.add(head);
  const hornGeo = () => boxPart(0.05, 0.15, 0.05, MOB_TEX_CELL.GOAT_HORN);
  const hornL = hornGeo(); hornL.position.set(-0.08, 0.72, 0.5); group.add(hornL);
  const hornR = hornGeo(); hornR.position.set(0.08, 0.72, 0.5); group.add(hornR);
  const legGeo = () => boxPart(0.12, 0.35, 0.12, MOB_TEX_CELL.GOAT_LEG);
  const legOffsets = [[-0.14, 0.18, 0.22], [0.14, 0.18, 0.22], [-0.14, 0.18, -0.22], [0.14, 0.18, -0.22]];
  const legs = legOffsets.map((o) => { const l = legGeo(); l.position.set(...o); group.add(l); return l; });
  return { group, legs, eyeHeight: 0.75, hitRadius: 0.45 };
}

function createZombie() {
  const group = new THREE.Group();
  const body = boxPart(0.4, 0.6, 0.25, MOB_TEX_CELL.ZOMBIE_BODY);
  body.position.set(0, 0.9, 0);
  group.add(body);
  const head = boxPart(0.32, 0.32, 0.32, MOB_TEX_CELL.ZOMBIE_HEAD);
  head.position.set(0, 1.35, 0);
  group.add(head);
  const armGeo = () => boxPart(0.14, 0.55, 0.14, MOB_TEX_CELL.ZOMBIE_ARM);
  const armL = armGeo(); armL.position.set(-0.27, 0.9, 0); group.add(armL);
  const armR = armGeo(); armR.position.set(0.27, 0.9, 0); group.add(armR);
  const legGeo = () => boxPart(0.16, 0.55, 0.16, MOB_TEX_CELL.ZOMBIE_LEG);
  const legOffsets = [[-0.11, 0.3, 0], [0.11, 0.3, 0]];
  const legs = legOffsets.map((o) => { const l = legGeo(); l.position.set(...o); group.add(l); return l; });
  return { group, legs, eyeHeight: 1.6, hitRadius: 0.5 };
}

const MOB_FACTORY = { [MOB_TYPES.COW]: createCow, [MOB_TYPES.GOAT]: createGoat, [MOB_TYPES.ZOMBIE]: createZombie };
const MOB_HEALTH = { [MOB_TYPES.COW]: 6, [MOB_TYPES.GOAT]: 6, [MOB_TYPES.ZOMBIE]: 10 };
const MOB_SPEED = { [MOB_TYPES.COW]: 1.2, [MOB_TYPES.GOAT]: 1.6, [MOB_TYPES.ZOMBIE]: 2.1 };

const mobs = [];

function spawnMob(type, x, z) {
  if (mobs.length >= MAX_MOBS) return;
  const built = MOB_FACTORY[type]();
  const y = world.heightAt(Math.floor(x), Math.floor(z)) + 1;
  built.group.position.set(x, y, z);
  scene.add(built.group);
  mobs.push({
    type,
    group: built.group,
    legs: built.legs,
    pos: new THREE.Vector3(x, y, z),
    eyeHeight: built.eyeHeight,
    hitRadius: built.hitRadius,
    health: MOB_HEALTH[type],
    maxHealth: MOB_HEALTH[type],
    wanderDir: Math.random() * Math.PI * 2,
    wanderTimer: 1 + Math.random() * 2,
    hurtFlashTimer: 0,
    animT: Math.random() * Math.PI * 2,
    facing: 0,
  });
}

// Spawns a handful of mobs the first time a chunk becomes visible, instead of
// an upfront fixed count -- scales naturally with how much world is explored.
// Zombie odds go up at night as a simplified stand-in for full light-level
// based spawning (see blueprint section 7 for the "real" version of this).
function maybeSpawnMobsInChunk(chunk) {
  const x0 = chunk.cx * CHUNK_SIZE, z0 = chunk.cz * CHUNK_SIZE;
  const randomSpotInChunk = () => ({
    x: x0 + Math.floor(Math.random() * CHUNK_SIZE),
    z: z0 + Math.floor(Math.random() * CHUNK_SIZE),
  });

  if (Math.random() < 0.35) {
    const p = randomSpotInChunk();
    const h = world.heightAt(p.x, p.z);
    if (h > 0 && world.get(p.x, h, p.z) === BLOCK.GRASS) spawnMob(MOB_TYPES.COW, p.x + 0.5, p.z + 0.5);
  }
  if (Math.random() < 0.2) {
    const p = randomSpotInChunk();
    const h = world.heightAt(p.x, p.z);
    if (h > 0 && world.get(p.x, h, p.z) === BLOCK.GRASS) spawnMob(MOB_TYPES.GOAT, p.x + 0.5, p.z + 0.5);
  }
  const zombieChance = isNight ? 0.18 : 0.05;
  if (Math.random() < zombieChance) {
    const p = randomSpotInChunk();
    const h = world.heightAt(p.x, p.z);
    if (h > 0) spawnMob(MOB_TYPES.ZOMBIE, p.x + 0.5, p.z + 0.5);
  }
}

function despawnFarMobs() {
  for (let i = mobs.length - 1; i >= 0; i--) {
    const m = mobs[i];
    const dist = Math.hypot(m.pos.x - player.pos.x, m.pos.z - player.pos.z);
    if (dist > UNLOAD_DISTANCE * CHUNK_SIZE) {
      scene.remove(m.group);
      mobs.splice(i, 1);
    }
  }
}

function punchMob(mob) {
  mob.health -= 4;
  mob.hurtFlashTimer = 0.15;
  playPunchSound();
  const dx = mob.pos.x - player.pos.x, dz = mob.pos.z - player.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  mob.pos.x += (dx / len) * 0.4;
  mob.pos.z += (dz / len) * 0.4;
  if (mob.health <= 0) {
    if (mob.type === MOB_TYPES.COW || mob.type === MOB_TYPES.GOAT) {
      spawnItemDrop(mob.pos.x, mob.pos.y + 0.5, mob.pos.z, ITEM.MEAT);
    }
    playMobDeathSound();
    scene.remove(mob.group);
    const idx = mobs.indexOf(mob);
    if (idx !== -1) mobs.splice(idx, 1);
  }
}

// Tries to move a mob to (nx, nz); rejects steps that fall/climb more than one
// block so mobs don't wander off cliffs or teleport onto tall walls.
function tryMobMove(mob, nx, nz, dt) {
  const curH = world.heightAt(Math.floor(mob.pos.x), Math.floor(mob.pos.z));
  const nextH = world.heightAt(Math.floor(nx), Math.floor(nz));
  if (nextH < 0 || Math.abs(nextH - curH) > 1) return false;
  mob.pos.x = nx;
  mob.pos.z = nz;
  mob.pos.y = nextH + 1;
  return true;
}

function updateMobs(dt) {
  for (const mob of mobs) {
    if (mob.hurtFlashTimer > 0) mob.hurtFlashTimer -= dt;
    const isZombie = mob.type === MOB_TYPES.ZOMBIE;
    const dxp = player.pos.x - mob.pos.x, dzp = player.pos.z - mob.pos.z;
    const distToPlayer = Math.hypot(dxp, dzp);

    let dirX, dirZ;
    if (isZombie && distToPlayer < 12) {
      dirX = dxp / (distToPlayer || 1);
      dirZ = dzp / (distToPlayer || 1);
      mob.facing = Math.atan2(dirX, dirZ);
      if (distToPlayer < 1.1) {
        damagePlayer(2);
      }
    } else {
      mob.wanderTimer -= dt;
      if (mob.wanderTimer <= 0) {
        mob.wanderDir = Math.random() * Math.PI * 2;
        mob.wanderTimer = 1.5 + Math.random() * 2.5;
        if (Math.random() < 0.3) mob.wanderDir = null; // pause
      }
      if (mob.wanderDir === null) {
        dirX = 0; dirZ = 0;
      } else {
        dirX = Math.sin(mob.wanderDir);
        dirZ = Math.cos(mob.wanderDir);
        mob.facing = mob.wanderDir;
      }
    }

    const speed = MOB_SPEED[mob.type];
    if (dirX || dirZ) {
      const nx = mob.pos.x + dirX * speed * dt;
      const nz = mob.pos.z + dirZ * speed * dt;
      if (!tryMobMove(mob, nx, nz, dt)) {
        mob.wanderDir = Math.random() * Math.PI * 2;
      }
      mob.animT += dt * 8;
    }

    mob.group.position.set(mob.pos.x, mob.pos.y, mob.pos.z);
    mob.group.rotation.y = mob.facing;
    const swing = (dirX || dirZ) ? Math.sin(mob.animT) * 0.5 : 0;
    mob.legs.forEach((leg, i) => { leg.rotation.x = (i % 2 === 0 ? swing : -swing); });
    mob.group.traverse((obj) => {
      if (!obj.isMesh) return;
      if (mob.hurtFlashTimer > 0) obj.material.color.setRGB(1, 0.25, 0.25);
      else obj.material.color.copy(obj.userData.baseColor);
    });
  }
}

// Pointer lock + mouse look
const domElement = renderer.domElement;
let isLocked = false;
// gameStarted controls WASD/jump; it does NOT require pointer lock to
// succeed, since some browsers/embeds (http, iframes, mobile) block the
// Pointer Lock API entirely. Without this split, a blocked pointer lock
// would silently freeze all movement forever.
let gameStarted = false;

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');

function startGame() {
  gameStarted = true;
  overlay.classList.add('hidden');
  if (!isMobile) domElement.requestPointerLock(); // pointer lock is a desktop-only concept
  ensureAudio(); // browsers require a user gesture before audio can play
  if (pendingSave) showToast('Progres dimuat dari save sebelumnya');
}

startBtn.addEventListener('click', startGame);
domElement.addEventListener('click', () => {
  if (!gameStarted) startGame();
  else if (!isLocked && !isMobile) domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  isLocked = document.pointerLockElement === domElement;
});

document.addEventListener('pointerlockerror', () => {
  // Pointer lock unsupported/blocked in this context: keep the game
  // playable via keyboard even though mouse-look won't work.
  isLocked = false;
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
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ---------- Inventory ----------
// Counts per block/item type; the hotbar (slots 1-6) is a view onto the
// placeable-block subset of this.
const inventory = {};
HOTBAR_BLOCKS.forEach((b) => { inventory[b] = 0; });
Object.keys(ITEM_META).forEach((id) => { inventory[id] = 0; });
if (pendingSave && pendingSave.inventory) Object.assign(inventory, pendingSave.inventory);

let selectedBlock = HOTBAR_BLOCKS[0];
const hotbarEl = document.getElementById('hotbar');
const inventoryPanel = document.getElementById('inventoryPanel');
const inventoryGrid = document.getElementById('inventoryGrid');
const craftingListEl = document.getElementById('craftingList');

function addToInventory(itemType, amount = 1) {
  inventory[itemType] = (inventory[itemType] || 0) + amount;
  renderHotbar();
  renderInventoryPanel();
}

function renderHotbar() {
  hotbarEl.innerHTML = '';
  HOTBAR_BLOCKS.forEach((blockType, i) => {
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot' + (blockType === selectedBlock ? ' active' : '');
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.backgroundImage = `url(${getBlockIconURL(blockType)})`;
    if (inventory[blockType] <= 0) swatch.style.opacity = '0.35';
    slot.appendChild(swatch);
    const count = document.createElement('span');
    count.textContent = inventory[blockType] > 0 ? inventory[blockType] : '';
    count.style.position = 'absolute';
    count.style.bottom = '2px';
    count.style.right = '4px';
    slot.appendChild(count);
    const label = document.createElement('span');
    label.textContent = i + 1;
    label.style.position = 'absolute';
    label.style.top = '2px';
    label.style.left = '4px';
    label.style.fontSize = '9px';
    label.style.opacity = '0.8';
    slot.appendChild(label);
    hotbarEl.appendChild(slot);
  });
}
renderHotbar();

function renderInventoryPanel() {
  inventoryGrid.innerHTML = '';
  const allIds = [...HOTBAR_BLOCKS, ...Object.keys(ITEM_META).map(Number)];
  allIds.forEach((id) => {
    const slot = document.createElement('div');
    slot.className = 'inv-slot';
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    if (BLOCK_FACE_CELLS[id]) {
      swatch.style.backgroundImage = `url(${getBlockIconURL(id)})`;
    } else {
      swatch.style.background = '#' + ITEM_META[id].color.toString(16).padStart(6, '0');
    }
    if ((inventory[id] || 0) <= 0) swatch.style.opacity = '0.35';
    slot.appendChild(swatch);
    const count = document.createElement('span');
    count.textContent = inventory[id] > 0 ? inventory[id] : '';
    slot.appendChild(count);
    slot.title = itemLabel(id);
    inventoryGrid.appendChild(slot);
  });
  renderCrafting();
}
renderInventoryPanel();

function craftRecipe(idx) {
  const recipe = RECIPES[idx];
  const canCraft = Object.entries(recipe.inputs).every(([id, need]) => (inventory[id] || 0) >= need);
  if (!canCraft) return;
  Object.entries(recipe.inputs).forEach(([id, need]) => { inventory[id] -= need; });
  addToInventory(recipe.output, recipe.outputCount);
  showToast('Berhasil craft ' + itemLabel(recipe.output));
}

function renderCrafting() {
  craftingListEl.innerHTML = '';
  RECIPES.forEach((recipe, idx) => {
    const row = document.createElement('div');
    row.className = 'craft-row';
    const canCraft = Object.entries(recipe.inputs).every(([id, need]) => (inventory[id] || 0) >= need);
    const reqText = Object.entries(recipe.inputs).map(([id, need]) => `${itemLabel(id)} x${need}`).join(' + ');
    const label = document.createElement('span');
    label.textContent = `${reqText} → ${itemLabel(recipe.output)} x${recipe.outputCount}`;
    row.appendChild(label);
    const btn = document.createElement('button');
    btn.textContent = 'Craft';
    btn.disabled = !canCraft;
    btn.addEventListener('click', () => craftRecipe(idx));
    row.appendChild(btn);
    craftingListEl.appendChild(row);
  });
}

let inventoryOpen = false;
function toggleInventory() {
  inventoryOpen = !inventoryOpen;
  inventoryPanel.classList.toggle('hidden', !inventoryOpen);
  if (inventoryOpen) {
    renderInventoryPanel();
    if (isLocked) document.exitPointerLock();
  } else if (!isMobile) {
    domElement.requestPointerLock();
  }
}

document.addEventListener('keydown', (e) => {
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= HOTBAR_BLOCKS.length) {
    selectedBlock = HOTBAR_BLOCKS[num - 1];
    renderHotbar();
  }
  if (e.code === 'KeyE' && gameStarted) toggleInventory();
  if (e.code === 'KeyF' && gameStarted && !inventoryOpen) eatMeat();
  if (e.code === 'KeyO' && gameStarted) saveGame();
});

let hotbarIndex = 0;
document.addEventListener('wheel', (e) => {
  if (!gameStarted) return;
  hotbarIndex = (hotbarIndex + (e.deltaY > 0 ? 1 : -1) + HOTBAR_BLOCKS.length) % HOTBAR_BLOCKS.length;
  selectedBlock = HOTBAR_BLOCKS[hotbarIndex];
  renderHotbar();
});

// Mouse buttons: mine (hold) / punch mobs / place
let mouseDown0 = false;
domElement.addEventListener('mousedown', (e) => {
  if (!gameStarted || inventoryOpen) return;
  if (e.button === 0) {
    mouseDown0 = true;
    startMiningOrPunch();
  } else if (e.button === 2) {
    placeBlock();
  }
});
domElement.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    mouseDown0 = false;
    stopMining();
  }
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
      return { hit: { x: bx, y: by, z: bz }, before: prevBlockPos, distance: t };
    }
    prevBlockPos = { x: bx, y: by, z: bz };
  }
  return null;
}

// Ray-vs-mob test: walk the view ray and check distance to each mob's center.
function raycastMob() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = camera.position.clone();
  const step = 0.1;
  for (let t = 0; t < REACH; t += step) {
    const p = origin.clone().addScaledVector(dir, t);
    for (const mob of mobs) {
      const dy = p.y - (mob.pos.y + mob.eyeHeight * 0.6);
      const dx = p.x - mob.pos.x, dz = p.z - mob.pos.z;
      if (dx * dx + dy * dy + dz * dz < mob.hitRadius * mob.hitRadius) {
        return { mob, distance: t };
      }
    }
  }
  return null;
}

// ---------- Mining (hold left click to break, with Minecraft-style crack progress) ----------
let miningTarget = null; // {x,y,z}
let miningProgress = 0;
let miningBlockType = BLOCK.AIR;

function startMiningOrPunch() {
  const mobHit = raycastMob();
  const blockHit = raycastBlock();
  if (mobHit && (!blockHit || mobHit.distance < blockHit.distance)) {
    punchMob(mobHit.mob);
    return;
  }
  if (blockHit) {
    miningTarget = blockHit.hit;
    miningBlockType = world.get(blockHit.hit.x, blockHit.hit.y, blockHit.hit.z);
    miningProgress = 0;
    updateCrackMesh();
  }
}

function stopMining() {
  miningTarget = null;
  miningProgress = 0;
  crackMesh.visible = false;
}

// Tools (crafted via the recipes above) speed up mining their matching block.
function getEffectiveHardness(blockType) {
  let hardness = BLOCK_HARDNESS[blockType] || 0.5;
  if (PICKAXE_BLOCKS.has(blockType)) {
    if (inventory[ITEM.IRON_PICKAXE] > 0) hardness *= 0.22;
    else if (inventory[ITEM.STONE_PICKAXE] > 0) hardness *= 0.4;
  }
  if (blockType === BLOCK.WOOD && inventory[ITEM.WOOD_AXE] > 0) hardness *= 0.4;
  return hardness;
}

function updateMining(dt) {
  if (!mouseDown0 || !miningTarget) return;
  const blockHit = raycastBlock();
  if (!blockHit || blockHit.hit.x !== miningTarget.x || blockHit.hit.y !== miningTarget.y || blockHit.hit.z !== miningTarget.z) {
    // player looked away from the block being mined: restart on the new target
    startMiningOrPunch();
    return;
  }
  miningProgress += dt / getEffectiveHardness(miningBlockType);
  if (miningProgress >= 1) {
    const drop = getMiningDrop(miningBlockType);
    world.set(miningTarget.x, miningTarget.y, miningTarget.z, BLOCK.AIR);
    markPlayerEdit(miningTarget.x, miningTarget.z);
    if (drop !== null) spawnItemDrop(miningTarget.x + 0.5, miningTarget.y + 0.5, miningTarget.z + 0.5, drop);
    playBlockBreakSound();
    remeshAround(miningTarget.x, miningTarget.z);
    stopMining();
    if (mouseDown0) startMiningOrPunch();
  } else {
    updateCrackMesh();
  }
}

function placeBlock() {
  if (inventory[selectedBlock] <= 0) return;
  const result = raycastBlock();
  if (result && result.before) {
    const { x, y, z } = result.before;
    // don't place inside the player
    const px = Math.floor(player.pos.x), py0 = Math.floor(player.pos.y - PLAYER_HEIGHT + 0.1), py1 = Math.floor(player.pos.y - 0.1), pz = Math.floor(player.pos.z);
    if ((x === px && z === pz) && (y === py0 || y === py1)) return;
    world.set(x, y, z, selectedBlock);
    markPlayerEdit(x, z);
    inventory[selectedBlock]--;
    renderHotbar();
    renderInventoryPanel();
    remeshAround(x, z);
    playPlaceSound();
  }
}

// ---------- Physics / collision ----------
function isSolid(x, y, z) {
  const block = world.get(Math.floor(x), Math.floor(y), Math.floor(z));
  return block !== BLOCK.AIR && block !== BLOCK.WATER && block !== BLOCK.TORCH;
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

let footstepAccumulator = 0;
function updatePhysics(dt) {
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.sin(player.yaw + Math.PI / 2), 0, Math.cos(player.yaw + Math.PI / 2));

  let moveX = 0, moveZ = 0;
  if (keys['KeyW']) { moveX -= forward.x; moveZ -= forward.z; }
  if (keys['KeyS']) { moveX += forward.x; moveZ += forward.z; }
  if (keys['KeyA']) { moveX -= right.x; moveZ -= right.z; }
  if (keys['KeyD']) { moveX += right.x; moveZ += right.z; }
  if (touchJoystick.active) {
    // dy is negative when the knob is pushed up (forward), matching KeyW's sign
    moveX += touchJoystick.dy * forward.x + touchJoystick.dx * right.x;
    moveZ += touchJoystick.dy * forward.z + touchJoystick.dx * right.z;
  }

  // joystick gives analog speed control (partial tilt = slower); keyboard is always full speed
  const joyMag = touchJoystick.active ? Math.min(1, Math.hypot(touchJoystick.dx, touchJoystick.dy)) : 1;
  const len = Math.hypot(moveX, moveZ);
  if (len > 0) { moveX = (moveX / len) * joyMag; moveZ = (moveZ / len) * joyMag; }

  const feetInWater = world.get(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.3), Math.floor(player.pos.z)) === BLOCK.WATER;
  if (feetInWater && !player.inWater) playSplashSound();
  player.inWater = feetInWater;

  const wantsSprint = (keys['ShiftLeft'] || keys['ShiftRight']) && (moveX || moveZ) && player.hunger > 0;
  player.sprinting = wantsSprint && !feetInWater;
  const speedMul = feetInWater ? 0.6 : (player.sprinting ? SPRINT_MULTIPLIER : 1);

  player.vel.x = moveX * MOVE_SPEED * speedMul;
  player.vel.z = moveZ * MOVE_SPEED * speedMul;

  if (keys['Space']) {
    if (player.onGround) {
      player.vel.y = JUMP_SPEED;
      player.onGround = false;
      playJumpSound();
    } else if (feetInWater) {
      player.vel.y = Math.min(player.vel.y + 14 * dt, 3.2); // gentle swim-up while holding space
    }
  }

  const gravityNow = feetInWater ? GRAVITY * 0.25 : GRAVITY;
  player.vel.y -= gravityNow * dt;
  if (feetInWater) { if (player.vel.y < -2.5) player.vel.y = -2.5; }
  else if (player.vel.y < -30) player.vel.y = -30;

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

  if (player.onGround && (moveX || moveZ)) {
    footstepAccumulator += dt * (player.sprinting ? 1.5 : 1);
    if (footstepAccumulator > 0.35) {
      footstepAccumulator = 0;
      playFootstepSound();
    }
  } else {
    footstepAccumulator = 0.2; // next step plays almost immediately once moving resumes
  }
}

// ---------- Mobile touch controls (joystick + buttons; hidden entirely on desktop) ----------
// Detected via touch support + a coarse pointer, not screen width, so a
// touch-capable laptop with a mouse still gets the desktop (keyboard/mouse)
// controls instead of an unwanted on-screen joystick.
const isMobile = ('ontouchstart' in window || navigator.maxTouchPoints > 0) && window.matchMedia('(pointer: coarse)').matches;

const touchJoystick = { active: false, dx: 0, dy: 0 };

if (isMobile) {
  document.getElementById('mobileControls').classList.remove('hidden');
  const startHint = document.getElementById('startHint');
  if (startHint) startHint.textContent = 'Ketuk layar untuk mulai menjelajah.';
  const infoEl = document.getElementById('info');
  if (infoEl) infoEl.style.display = 'none'; // controls hint is meaningless once there's no keyboard

  const joyBase = document.getElementById('joystickBase');
  const joyKnob = document.getElementById('joystickKnob');
  const JOY_RADIUS = 45; // px; matches #joystickBase size in style.css
  let joyTouchId = null;

  function updateJoyFromTouch(t) {
    const rect = joyBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const clamped = Math.min(dist, JOY_RADIUS);
    if (dist > 0) { dx = (dx / dist) * clamped; dy = (dy / dist) * clamped; }
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    touchJoystick.dx = dx / JOY_RADIUS;
    touchJoystick.dy = dy / JOY_RADIUS;
  }
  function resetJoystick() {
    touchJoystick.active = false;
    touchJoystick.dx = 0;
    touchJoystick.dy = 0;
    joyKnob.style.transform = 'translate(0px, 0px)';
  }
  joyBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    joyTouchId = e.changedTouches[0].identifier;
    touchJoystick.active = true;
    updateJoyFromTouch(e.changedTouches[0]);
  });
  joyBase.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === joyTouchId) updateJoyFromTouch(t);
  });
  function endJoyTouch(e) {
    for (const t of e.changedTouches) if (t.identifier === joyTouchId) { joyTouchId = null; resetJoystick(); }
  }
  joyBase.addEventListener('touchend', endJoyTouch);
  joyBase.addEventListener('touchcancel', endJoyTouch);

  // Hold-buttons: press-and-hold sets a state, release clears it.
  function bindHoldButton(id, onStart, onEnd) {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(); });
    el.addEventListener('touchend', (e) => { e.preventDefault(); if (onEnd) onEnd(); });
    el.addEventListener('touchcancel', () => { if (onEnd) onEnd(); });
  }
  bindHoldButton('btnJump', () => { keys['Space'] = true; }, () => { keys['Space'] = false; });
  bindHoldButton('btnMine', () => { if (gameStarted && !inventoryOpen) { mouseDown0 = true; startMiningOrPunch(); } }, () => { mouseDown0 = false; stopMining(); });
  bindHoldButton('btnSprint', () => { keys['ShiftLeft'] = true; }, () => { keys['ShiftLeft'] = false; });
  document.getElementById('btnPlace').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameStarted && !inventoryOpen) placeBlock();
  });
  document.getElementById('btnInventory').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameStarted) toggleInventory();
    else startGame();
  });

  // Camera look: drag anywhere on screen that isn't the joystick/buttons.
  let lookTouchId = null, lastLookX = 0, lastLookY = 0;
  function isOnMobileControls(target) {
    return !!(target.closest && target.closest('#mobileControls'));
  }
  document.addEventListener('touchstart', (e) => {
    if (!gameStarted) return;
    for (const t of e.changedTouches) {
      if (lookTouchId === null && !isOnMobileControls(t.target)) {
        lookTouchId = t.identifier;
        lastLookX = t.clientX;
        lastLookY = t.clientY;
      }
    }
  });
  document.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier !== lookTouchId) continue;
      const dx = t.clientX - lastLookX, dy = t.clientY - lastLookY;
      lastLookX = t.clientX;
      lastLookY = t.clientY;
      const sensitivity = 0.006;
      player.yaw -= dx * sensitivity;
      player.pitch -= dy * sensitivity;
      const limit = Math.PI / 2 - 0.05;
      player.pitch = Math.max(-limit, Math.min(limit, player.pitch));
    }
  });
  function endLookTouch(e) {
    for (const t of e.changedTouches) if (t.identifier === lookTouchId) lookTouchId = null;
  }
  document.addEventListener('touchend', endLookTouch);
  document.addEventListener('touchcancel', endLookTouch);
}

// ---------- Fullscreen toggle (both desktop and mobile: hides the browser
// chrome so the page reads like a standalone app/game) ----------
const btnFullscreen = document.getElementById('btnFullscreen');
function isFullscreenActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
function updateFullscreenIcon() {
  btnFullscreen.textContent = isFullscreenActive() ? '⤢' : '⛶';
}
function toggleFullscreen() {
  const el = document.documentElement;
  // Fullscreen can be denied (e.g. an embedding iframe without allow="fullscreen"),
  // so swallow the rejection instead of leaving an unhandled promise around.
  const request = !isFullscreenActive()
    ? (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)
    : (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  request?.catch(() => {});
}
btnFullscreen.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', updateFullscreenIcon);
document.addEventListener('webkitfullscreenchange', updateFullscreenIcon);

// ---------- Inventory close button (a "Tekan E" hint is unreachable on
// touch devices with the panel covering the mobile buttons underneath) ----------
document.getElementById('btnCloseInventory').addEventListener('click', () => {
  if (inventoryOpen) toggleInventory();
});

// ---------- Main loop ----------
let lastTime = performance.now();
let autosaveAccumulator = 0;
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  updateDayNightCycle(dt);

  if (gameStarted && !inventoryOpen) {
    updatePhysics(dt);
    updateMining(dt);
    updateBlockHighlight();
    updateItemDrops(dt);
    updateMobs(dt);
    updateHunger(dt);
    updateChunkStreaming(dt);

    autosaveAccumulator += dt;
    if (autosaveAccumulator > 30) {
      autosaveAccumulator = 0;
      saveGame();
    }
  }

  // Sky dome is a fixed-radius sphere; it must stay centered on the camera or
  // it gets left behind once the player wanders far from world origin (the
  // chunk-streamed world has no real boundary), exposing black void past its edge.
  skyMesh.position.copy(camera.position);

  renderer.render(scene, camera);
}
animate();

window.addEventListener('beforeunload', () => {
  if (gameStarted) saveGame();
});
