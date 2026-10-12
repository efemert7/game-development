/*
 * Meadowbrook Ranch - VERSION 1
 * A small first-person farming game built with plain JavaScript + Three.js (r128, global build).
 *
 * Code layout (each section is self-contained so features can be added one at a time):
 *   1. Config & data tables      (items, crops, shop, fence levels, world layout)
 *   2. Game state                (everything that gets saved)
 *   3. Mesh helpers              (box / cylinder / sphere / prism builders)
 *   4. World building            (ground, house, barn, shop, sell box, well, trees, fence, sky)
 *   5. Crops                     (plots, growth stages, crop meshes)
 *   6. Animals                   (chickens, cows, wandering AI, eggs, milk)
 *   7. Player                    (first-person movement, collisions, energy)
 *   8. Interaction               (raycast target -> context action)
 *   9. Day / night cycle
 *  10. Economy                   (shop + sell box menus)
 *  11. HUD / UI                  (hotbar, inventory, toasts, menus)
 *  12. Save / load               (localStorage, autosave)
 *  13. Input & main loop
 */
(function () {
  'use strict';

  // =====================================================================
  // 1. CONFIG & DATA TABLES
  // =====================================================================

  const SAVE_KEY = 'meadowbrook_ranch_save_v1';
  const SAVE_VERSION = 1;
  const AUTOSAVE_SECONDS = 30;
  const SECONDS_PER_GAME_HOUR = 15;     // 24 game hours = 6 real minutes
  const WAKE_UP_HOUR = 6;
  const INTERACT_DISTANCE = 4.5;
  const WORLD_LIMIT = 58;               // player can't walk beyond +/- this
  const PLAYER_RADIUS = 0.35;
  const EYE_HEIGHT = 1.6;
  const WALK_SPEED = 4.5;
  const RUN_SPEED = 8;
  const MAX_ENERGY = 100;

  /** Energy cost of every action. */
  const ENERGY_COST = { dig: 5, plant: 1, water: 2, harvest: 1, chop: 6, feed: 1, milk: 2, runPerSecond: 1.2 };

  /** Every item that can be stored in the inventory. `sell` = sell price (0 = not sellable). */
  const ITEMS = {
    wheat_seed:  { name: 'Wheat Seeds',  icon: '🌱', sell: 0 },
    carrot_seed: { name: 'Carrot Seeds', icon: '🌱', sell: 0 },
    corn_seed:   { name: 'Corn Seeds',   icon: '🌱', sell: 0 },
    feed:        { name: 'Animal Feed',  icon: '🧺', sell: 0 },
    wheat:       { name: 'Wheat',        icon: '🌾', sell: 8 },
    carrot:      { name: 'Carrot',       icon: '🥕', sell: 14 },
    corn:        { name: 'Corn',         icon: '🌽', sell: 22 },
    egg:         { name: 'Egg',          icon: '🥚', sell: 12 },
    milk:        { name: 'Milk',         icon: '🥛', sell: 30 },
    wood:        { name: 'Wood',         icon: '🪵', sell: 5 }
  };

  /** Crop types. Each needs water once per stage; stageTime is real seconds per stage. */
  const CROPS = {
    wheat:  { name: 'Wheat',  seed: 'wheat_seed',  item: 'wheat',  stageTime: 40, yield: [2, 3] },
    carrot: { name: 'Carrot', seed: 'carrot_seed', item: 'carrot', stageTime: 55, yield: [1, 3] },
    corn:   { name: 'Corn',   seed: 'corn_seed',   item: 'corn',   stageTime: 70, yield: [1, 3] }
  };
  const SEED_TYPES = ['wheat', 'carrot', 'corn'];
  const MATURE_STAGE = 3; // 0 = seeds, 1 = sprout, 2 = growing, 3 = ready to harvest

  /** Hotbar tools (keys 1-5). */
  const TOOLS = [
    { id: 'shovel', name: 'Shovel',       icon: '⛏️' },
    { id: 'can',    name: 'Watering Can', icon: '💧' },
    { id: 'seeds',  name: 'Seeds',        icon: '🌱' },
    { id: 'bucket', name: 'Bucket',       icon: '🪣' },
    { id: 'axe',    name: 'Axe',          icon: '🪓' }
  ];
  const CAN_CAPACITY = 10;

  /** Animals: produce timer in seconds after being fed. */
  const ANIMALS = {
    chicken: { name: 'Chicken', speed: 1.1, produceTime: 45, price: 60 },
    cow:     { name: 'Cow',     speed: 0.7, produceTime: 60, price: 200 }
  };

  /** Fence levels: capacity = max number of animals in the pen. */
  const FENCE_LEVELS = [
    { name: 'Wooden Fence',  capacity: 6,  cost: 0,   wood: 0,  postColor: 0x8b5a2b, railColor: 0x9c6b3a, rails: [0.45, 0.9],       postH: 1.2 },
    { name: 'Painted Fence', capacity: 10, cost: 150, wood: 10, postColor: 0xf2efe6, railColor: 0xf2efe6, rails: [0.35, 0.7, 1.05], postH: 1.3 },
    { name: 'Stone Fence',   capacity: 16, cost: 400, wood: 25, postColor: 0x8d8d8d, railColor: 0x6e4a2a, rails: [0.35, 0.75, 1.15], postH: 1.5 }
  ];

  /** Shop catalogue. `give` adds items, `animal` spawns an animal, `fence` upgrades the pen. */
  const SHOP_ITEMS = [
    { id: 'wheat_seed',  label: 'Wheat Seeds',  icon: '🌾', price: 3,  give: 'wheat_seed', desc: 'Fast growing, cheap.' },
    { id: 'carrot_seed', label: 'Carrot Seeds', icon: '🥕', price: 5,  give: 'carrot_seed', desc: 'Medium growth time.' },
    { id: 'corn_seed',   label: 'Corn Seeds',   icon: '🌽', price: 8,  give: 'corn_seed', desc: 'Slow, but sells well.' },
    { id: 'feed',        label: 'Animal Feed',  icon: '🧺', price: 2,  give: 'feed', desc: 'Feed chickens and cows (wheat works too).' },
    { id: 'chicken',     label: 'Chicken',      icon: '🐔', price: ANIMALS.chicken.price, animal: 'chicken', desc: 'Lays an egg after being fed.' },
    { id: 'cow',         label: 'Cow',          icon: '🐄', price: ANIMALS.cow.price, animal: 'cow', desc: 'Gives milk after being fed (use bucket).' },
    { id: 'fence',       label: 'Fence Upgrade', icon: '🧱', fence: true, desc: 'Bigger pen capacity.' }
  ];

  /** World layout (x/z in metres, y is up). */
  const LAYOUT = {
    playerStart: { x: -6, z: 4, yaw: 0 },
    house:   { x: -14, z: -8, w: 8, h: 4.2, d: 7 },
    barn:    { x: 14, z: -15, w: 10, h: 5.5, d: 8 },
    shop:    { x: -4, z: -3 },
    sellBox: { x: -9, z: -1.5 },
    well:    { x: -1, z: 6 },
    pen:     { minX: 4, maxX: 24, minZ: -8, maxZ: 10, gateZ0: 0, gateZ1: 3 },
    field:   { minX: -19, minZ: 9, cols: 12, rows: 10, cell: 1.3 }
  };

  // =====================================================================
  // 2. GAME STATE (everything that is saved)
  // =====================================================================

  function defaultState() {
    return {
      version: SAVE_VERSION,
      coins: 50,
      day: 1,
      time: 7,                       // hour of day, 0-24
      energy: MAX_ENERGY,
      inventory: {
        wheat_seed: 6, carrot_seed: 3, corn_seed: 0, feed: 6,
        wheat: 0, carrot: 0, corn: 0, egg: 0, milk: 0, wood: 0
      },
      selectedSlot: 0,
      seedType: 'wheat',
      canWater: CAN_CAPACITY,
      fenceLevel: 1,
      player: { x: LAYOUT.playerStart.x, z: LAYOUT.playerStart.z, yaw: LAYOUT.playerStart.yaw, pitch: 0 },
      // The arrays below are filled from the live world when saving.
      plots: [],
      animals: [],
      eggs: [],
      trees: []
    };
  }

  let state = defaultState();

  // =====================================================================
  // Three.js globals & runtime world data
  // =====================================================================

  let renderer, scene, camera, clock, raycaster;
  let sunLight, moonLight, hemiLight, sunMesh, moonMesh, stars, cloudMaterial, clouds = [];
  let viewModel, viewModelTools = {}, swingTimer = 0;

  /** Live world objects (not saved directly; serialized in getSaveData()). */
  const world = {
    colliders: [],          // axis-aligned boxes: {minX,maxX,minZ,maxZ,tag}
    circles: [],            // round colliders: {x,z,r}
    interactables: [],      // Object3Ds with userData.interact = {type, ref}
    plots: new Map(),       // "i,j" -> plot
    animals: [],
    eggs: [],
    trees: [],
    fenceGroup: null,
    windowMaterial: null
  };

  const player = { pos: null, yaw: 0, pitch: 0, bobPhase: 0, moving: false };
  const input = { keys: {}, locked: false, dragging: false, lastX: 0, lastY: 0 };

  /** UI state machine: start | playing | paused | shop | sell | sleeping */
  let uiState = 'start';
  let pausedAt = 0;
  let autosaveTimer = 0;
  let currentTarget = null;  // {info, point, object}
  let currentAction = null;  // {prompt, run}

  // =====================================================================
  // 3. MESH HELPERS (all models are built from basic shapes)
  // =====================================================================

  const materialCache = {};

  /** Shared Lambert material per colour (+ options). */
  function mat(color, opts) {
    const key = color + (opts ? JSON.stringify(opts) : '');
    if (!materialCache[key]) {
      materialCache[key] = new THREE.MeshLambertMaterial(Object.assign({ color: color }, opts || {}));
    }
    return materialCache[key];
  }

  function finishMesh(mesh, x, y, z, parent) {
    mesh.position.set(x || 0, y || 0, z || 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (parent) parent.add(mesh);
    return mesh;
  }

  function box(w, h, d, color, x, y, z, parent) {
    return finishMesh(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)), x, y, z, parent);
  }

  function cyl(rTop, rBottom, h, color, x, y, z, parent, segments) {
    return finishMesh(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments || 8), mat(color)), x, y, z, parent);
  }

  function sphere(r, color, x, y, z, parent, segments) {
    const s = segments || 8;
    return finishMesh(new THREE.Mesh(new THREE.SphereGeometry(r, s, Math.max(4, s - 2)), mat(color)), x, y, z, parent);
  }

  function cone(r, h, color, x, y, z, parent, segments) {
    return finishMesh(new THREE.Mesh(new THREE.ConeGeometry(r, h, segments || 8), mat(color)), x, y, z, parent);
  }

  /**
   * Triangular prism (for gable roofs). Base sits at y=0, ridge runs along the Z axis.
   * width = base width (X), height = ridge height (Y), length = along Z.
   */
  function prism(width, height, length, color, x, y, z, parent) {
    let geo = new THREE.CylinderGeometry(1, 1, length, 3);
    geo.rotateX(-Math.PI / 2);           // lay it down, apex pointing up
    geo.translate(0, 0.5, 0);            // base at y = 0
    geo = geo.toNonIndexed();
    geo.computeVertexNormals();          // flat faces
    const mesh = new THREE.Mesh(geo, mat(color));
    mesh.scale.set(width / Math.sqrt(3), height / 1.5, 1);
    return finishMesh(mesh, x, y, z, parent);
  }

  /** Mark an object as something the player can interact with. */
  function makeInteractable(obj, type, ref) {
    obj.userData.interact = { type: type, ref: ref };
    world.interactables.push(obj);
  }

  function removeInteractable(obj) {
    const i = world.interactables.indexOf(obj);
    if (i >= 0) world.interactables.splice(i, 1);
  }

  /** Remove an object from the scene and free its geometry (materials are shared). */
  function disposeObject(obj) {
    if (!obj) return;
    if (obj.parent) obj.parent.remove(obj);
    obj.traverse(function (child) { if (child.geometry) child.geometry.dispose(); });
  }

  function addBoxCollider(minX, maxX, minZ, maxZ, tag) {
    world.colliders.push({ minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ, tag: tag || '' });
  }

  /** Deterministic random numbers so trees are always in the same place (needed for saves). */
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randRange(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(randRange(a, b + 1)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // =====================================================================
  // 4. WORLD BUILDING
  // =====================================================================

  function initRenderer() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-container').appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 50, 170);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 400);
    camera.rotation.order = 'YXZ';
    scene.add(camera); // camera must be in the scene so the held tool (child) renders

    raycaster = new THREE.Raycaster();
    raycaster.far = INTERACT_DISTANCE;
    clock = new THREE.Clock();
    player.pos = new THREE.Vector3();
  }

  function buildLights() {
    hemiLight = new THREE.HemisphereLight(0xdfefff, 0x4a6b2a, 0.6);
    scene.add(hemiLight);

    sunLight = new THREE.DirectionalLight(0xfff2d6, 0.9);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    const sc = sunLight.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 160;
    sunLight.shadow.bias = -0.0008;
    scene.add(sunLight);
    scene.add(sunLight.target);

    moonLight = new THREE.DirectionalLight(0x8899ff, 0.0);
    scene.add(moonLight);
    scene.add(moonLight.target);

    sunMesh = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3b0, fog: false }));
    moonMesh = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe8ecff, fog: false }));
    scene.add(sunMesh, moonMesh);

    // Stars: points on a big dome that fade in at night.
    const starPositions = [];
    const rng = mulberry32(99);
    for (let i = 0; i < 500; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = rng() * Math.PI * 0.45;
      const r = 250;
      starPositions.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, transparent: true, opacity: 0, fog: false }));
    scene.add(stars);
  }

  function buildGround() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), mat(0x6aa84f));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    makeInteractable(ground, 'ground', null);

    // Farm field patch (only place where digging is allowed).
    const f = LAYOUT.field;
    const fw = f.cols * f.cell, fd = f.rows * f.cell;
    const field = new THREE.Mesh(new THREE.PlaneGeometry(fw + 0.4, fd + 0.4), mat(0x9a8a55));
    field.rotation.x = -Math.PI / 2;
    field.position.set(f.minX + fw / 2, 0.01, f.minZ + fd / 2);
    field.receiveShadow = true;
    scene.add(field);
    makeInteractable(field, 'ground', null);

    // Dirt paths connecting the house, shop and pen gate.
    const pathMat = mat(0xb59b6a);
    function path(x, z, w, d) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pathMat);
      p.rotation.x = -Math.PI / 2;
      p.position.set(x, 0.008, z);
      p.receiveShadow = true;
      scene.add(p);
    }
    path(-4.5, 1.5, 17, 2.2);      // house area -> pen gate
    path(-14, -2.5, 2, 4);         // house door
    path(-9, 5.5, 2, 7);           // down to the field

    // Small decorative bushes and flowers scattered around.
    const rng = mulberry32(7);
    for (let i = 0; i < 70; i++) {
      const x = (rng() - 0.5) * 110, z = (rng() - 0.5) * 110;
      if (isInBuildZone(x, z, 2)) continue;
      if (rng() < 0.5) {
        sphere(0.35 + rng() * 0.3, 0x4f8a3a, x, 0.2, z, scene, 6);
      } else {
        const color = [0xffffff, 0xf4d35e, 0xe05a90, 0x9b6dff][Math.floor(rng() * 4)];
        cyl(0.02, 0.02, 0.3, 0x3c7a2c, x, 0.15, z, scene, 4);
        sphere(0.07, color, x, 0.32, z, scene, 5);
      }
    }
  }

  /** True if (x,z) is inside an area that must stay free of trees and decorations. */
  function isInBuildZone(x, z, margin) {
    const m = margin || 0;
    const zones = [
      [-20, -6, -14, 0],    // house + sell box
      [-21, 1, 7, 24],      // farm field
      [2, 26, -10, 12],     // pen
      [7, 21, -21, -8],     // barn
      [-9, 3, -7, 9],       // shop, well, start area
      [-8, 4, 0, 3]         // path to gate
    ];
    return zones.some(function (zn) {
      return x > zn[0] - m && x < zn[1] + m && z > zn[2] - m && z < zn[3] + m;
    });
  }

  function buildHouse() {
    const h = LAYOUT.house;
    const g = new THREE.Group();
    g.position.set(h.x, 0, h.z);
    scene.add(g);

    box(h.w + 0.4, 0.3, h.d + 0.4, 0x7d7d7d, 0, 0.15, 0, g);           // stone foundation
    box(h.w, h.h, h.d, 0xe8d8b0, 0, 0.3 + h.h / 2, 0, g);               // walls
    const roof = prism(h.d + 1.0, 2.6, h.w + 1.2, 0x8a3b2e, 0, 0.3 + h.h, 0, g);
    roof.rotation.y = Math.PI / 2;                                      // ridge runs along X
    box(0.8, 2.2, 0.8, 0x6e6e6e, 2, h.h + 2.2, -1.2, g);                // chimney

    // Corner beams
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) {
      box(0.25, h.h, 0.25, 0x7a5230, c[0] * h.w / 2, 0.3 + h.h / 2, c[1] * h.d / 2, g);
    });

    // Windows glow at night (shared emissive material).
    world.windowMaterial = new THREE.MeshLambertMaterial({ color: 0x9fc9e8, emissive: 0x000000 });
    [-2.5, 2.5].forEach(function (wx) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 0.08), world.windowMaterial);
      win.position.set(wx, 2.4, h.d / 2 + 0.02);
      g.add(win);
      box(1.5, 0.12, 0.15, 0x7a5230, wx, 1.8, h.d / 2 + 0.05, g);     // sill
    });

    // Door = bed interaction (sleep).
    const door = box(1.3, 2.3, 0.12, 0x6b3f1f, 0, 1.45, h.d / 2 + 0.04, g);
    sphere(0.07, 0xd4af37, 0.45, 1.45, h.d / 2 + 0.14, door.parent);
    makeInteractable(door, 'bed', null);
    box(2.2, 0.15, 1.2, 0x8d8d8d, 0, 0.08, h.d / 2 + 0.6, g);          // doorstep

    addBoxCollider(h.x - h.w / 2 - 0.2, h.x + h.w / 2 + 0.2, h.z - h.d / 2 - 0.2, h.z + h.d / 2 + 0.2, 'house');
  }

  function buildBarn() {
    const b = LAYOUT.barn;
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    scene.add(g);

    box(b.w, b.h, b.d, 0xa63a2b, 0, b.h / 2, 0, g);
    const roof = prism(b.d + 0.8, 3.5, b.w + 1, 0x4a4a4a, 0, b.h, 0, g);
    roof.rotation.y = Math.PI / 2;

    // Front (facing +z, towards the pen): big door with white trim and cross boards.
    const fz = b.d / 2 + 0.05;
    box(3.6, 4, 0.1, 0x8a2f22, 0, 2, fz, g);
    box(3.8, 0.2, 0.15, 0xffffff, 0, 4.05, fz + 0.02, g);
    box(0.2, 4, 0.15, 0xffffff, -1.85, 2, fz + 0.02, g);
    box(0.2, 4, 0.15, 0xffffff, 1.85, 2, fz + 0.02, g);
    const diag = Math.atan2(4, 3.6);
    const c1 = box(5.2, 0.18, 0.12, 0xffffff, 0, 2, fz + 0.05, g); c1.rotation.z = diag;
    const c2 = box(5.2, 0.18, 0.12, 0xffffff, 0, 2, fz + 0.05, g); c2.rotation.z = -diag;
    box(1.2, 1, 0.1, 0xffffff, 0, b.h - 0.1, fz, g);                   // hay loft window frame
    box(1, 0.8, 0.12, 0x3a2a1a, 0, b.h - 0.1, fz + 0.01, g);

    // Hay bales beside the barn: a row of three with one on top.
    [1.5, 2.4, 3.3].forEach(function (z) { box(1.2, 0.7, 0.8, 0xe3c565, -6.8, 0.35, z, g); });
    box(1.2, 0.7, 0.8, 0xe3c565, -6.8, 1.05, 1.95, g);

    addBoxCollider(b.x - b.w / 2, b.x + b.w / 2, b.z - b.d / 2, b.z + b.d / 2, 'barn');
    addBoxCollider(b.x - 7.4, b.x - 6.2, b.z + 1.1, b.z + 3.7, 'hay');
  }

  function buildShopStall() {
    const s = LAYOUT.shop;
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    scene.add(g);

    box(3, 1.1, 1, 0x9c6b3a, 0, 0.55, 0, g);                            // counter
    box(3.2, 0.1, 1.2, 0x7a5230, 0, 1.15, 0, g);
    [[-1.45, -0.45], [1.45, -0.45], [-1.45, 0.45], [1.45, 0.45]].forEach(function (p) {
      box(0.12, 2.6, 0.12, 0x7a5230, p[0], 1.3, p[1], g);
    });
    // Striped awning
    for (let i = 0; i < 6; i++) {
      const a = box(0.55, 0.08, 1.6, i % 2 ? 0xffffff : 0x3a7bd5, -1.375 + i * 0.55, 2.65, 0.15, g);
      a.rotation.x = 0.25;
    }
    // Goods on the counter
    box(0.4, 0.3, 0.4, 0xc49a5a, -0.9, 1.35, 0, g);
    sphere(0.12, 0xe07a2a, -0.3, 1.3, 0.1, g);
    sphere(0.12, 0xe07a2a, -0.1, 1.3, -0.05, g);
    cyl(0.15, 0.15, 0.35, 0x6b8f4e, 0.6, 1.37, 0, g);
    // Sign
    box(1.6, 0.5, 0.08, 0xf4d35e, 0, 3.15, 0.6, g);

    makeInteractable(g, 'shop', null);
    addBoxCollider(s.x - 1.6, s.x + 1.6, s.z - 0.6, s.z + 0.6, 'shop');
  }

  function buildSellBox() {
    const s = LAYOUT.sellBox;
    const g = new THREE.Group();
    g.position.set(s.x, 0, s.z);
    scene.add(g);

    box(1.4, 0.8, 1, 0x9c6b3a, 0, 0.4, 0, g);
    box(1.5, 0.1, 1.1, 0x7a5230, 0, 0.85, 0, g);                       // lid
    box(1.42, 0.08, 0.06, 0x5a3a1a, 0, 0.6, 0.51, g);                  // plank lines
    box(1.42, 0.08, 0.06, 0x5a3a1a, 0, 0.25, 0.51, g);
    box(0.1, 1.6, 0.1, 0x7a5230, 0.9, 0.8, 0, g);                      // sign post
    box(0.8, 0.45, 0.06, 0x3a7bd5, 0.9, 1.6, 0.05, g);                 // blue sign
    sphere(0.12, 0xf4d35e, 0.9, 1.6, 0.11, g);                         // coin on sign

    makeInteractable(g, 'sellbox', null);
    addBoxCollider(s.x - 0.8, s.x + 1.0, s.z - 0.6, s.z + 0.6, 'sellbox');
  }

  function buildWell() {
    const w = LAYOUT.well;
    const g = new THREE.Group();
    g.position.set(w.x, 0, w.z);
    scene.add(g);

    cyl(0.9, 1, 0.9, 0x8d8d8d, 0, 0.45, 0, g, 12);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12), mat(0x3a7bd5));
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.75;
    g.add(water);
    box(0.12, 2, 0.12, 0x7a5230, -0.85, 1.4, 0, g);
    box(0.12, 2, 0.12, 0x7a5230, 0.85, 1.4, 0, g);
    const roof = prism(1.4, 0.8, 2.4, 0x8a3b2e, 0, 2.35, 0, g);
    roof.rotation.y = Math.PI / 2;
    const crank = cyl(0.06, 0.06, 1.8, 0x5a3a1a, 0, 1.9, 0, g, 6);
    crank.rotation.z = Math.PI / 2;
    cyl(0.18, 0.15, 0.25, 0x9c6b3a, 0, 1.4, 0, g, 8);                  // little bucket

    makeInteractable(g, 'well', null);
    world.circles.push({ x: w.x, z: w.z, r: 1.0 });
  }

  /** Feed trough inside the pen (decoration + collider). */
  function buildTrough() {
    const p = LAYOUT.pen;
    const x = p.maxX - 3, z = p.minZ + 2;
    box(2.4, 0.5, 0.8, 0x7a5230, x, 0.25, z, scene);
    box(2.2, 0.05, 0.6, 0xe3c565, x, 0.48, z, scene);
    addBoxCollider(x - 1.2, x + 1.2, z - 0.4, z + 0.4, 'trough');
  }

  /** Builds (or rebuilds after an upgrade) the pen fence for the given level. */
  function buildFence(level) {
    if (world.fenceGroup) disposeObject(world.fenceGroup);
    world.colliders = world.colliders.filter(function (c) { return c.tag !== 'fence'; });

    const style = FENCE_LEVELS[level - 1];
    const p = LAYOUT.pen;
    const g = new THREE.Group();
    world.fenceGroup = g;
    scene.add(g);

    // Segments around the pen with a gate gap on the west side.
    const segs = [
      [p.minX, p.minZ, p.maxX, p.minZ],
      [p.maxX, p.minZ, p.maxX, p.maxZ],
      [p.minX, p.maxZ, p.maxX, p.maxZ],
      [p.minX, p.gateZ1, p.minX, p.maxZ],
      [p.minX, p.minZ, p.minX, p.gateZ0]
    ];
    segs.forEach(function (s) {
      const dx = s[2] - s[0], dz = s[3] - s[1];
      const len = Math.hypot(dx, dz);
      const n = Math.max(1, Math.ceil(len / 2));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const px = s[0] + dx * t, pz = s[1] + dz * t;
        if (level === 3) box(0.35, style.postH, 0.35, style.postColor, px, style.postH / 2, pz, g);
        else box(0.15, style.postH, 0.15, style.postColor, px, style.postH / 2, pz, g);
      }
      style.rails.forEach(function (ry) {
        const rail = box(len, 0.1, 0.06, style.railColor, s[0] + dx / 2, ry, s[1] + dz / 2, g);
        rail.rotation.y = -Math.atan2(dz, dx);
      });
      addBoxCollider(Math.min(s[0], s[2]) - 0.15, Math.max(s[0], s[2]) + 0.15,
        Math.min(s[1], s[3]) - 0.15, Math.max(s[1], s[3]) + 0.15, 'fence');
    });
    // Taller gate posts
    box(0.25, style.postH + 0.4, 0.25, style.postColor, p.minX, (style.postH + 0.4) / 2, p.gateZ0, g);
    box(0.25, style.postH + 0.4, 0.25, style.postColor, p.minX, (style.postH + 0.4) / 2, p.gateZ1, g);
  }

  /** Tree positions are generated from a fixed seed, so saves can store tree state by index. */
  function buildTrees() {
    const rng = mulberry32(12345);
    const positions = [];
    let guard = 0;
    while (positions.length < 55 && guard++ < 5000) {
      const x = (rng() - 0.5) * 110, z = (rng() - 0.5) * 110;
      if (isInBuildZone(x, z, 3)) continue;
      if (Math.hypot(x + 6, z - 4) < 6) continue;
      if (positions.some(function (p) { return Math.hypot(p.x - x, p.z - z) < 4; })) continue;
      positions.push({ x: x, z: z, kind: rng() < 0.5 ? 'pine' : 'oak', scale: 0.8 + rng() * 0.5 });
    }
    positions.forEach(function (p, index) { createTree(p, index); });

    // Decorative ring of trees outside the walkable area (no interaction).
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2 + rng() * 0.05;
      const r = 66 + rng() * 10;
      const group = new THREE.Group();
      buildTreeShape(group, rng() < 0.5 ? 'pine' : 'oak', 1 + rng() * 0.6);
      group.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      scene.add(group);
    }
  }

  function buildTreeShape(group, kind, s) {
    const trunk = cyl(0.2 * s, 0.3 * s, 2.2 * s, 0x6b4a2a, 0, 1.1 * s, 0, group, 7);
    const crown = new THREE.Group();
    group.add(crown);
    if (kind === 'pine') {
      cone(1.6 * s, 2.4 * s, 0x2f6b3a, 0, 2.6 * s, 0, crown, 8);
      cone(1.2 * s, 2.0 * s, 0x357a42, 0, 3.6 * s, 0, crown, 8);
      cone(0.8 * s, 1.6 * s, 0x3d8a4a, 0, 4.5 * s, 0, crown, 8);
    } else {
      sphere(1.5 * s, 0x4f8a3a, 0, 3.2 * s, 0, crown, 8);
      sphere(1.1 * s, 0x5a9a44, 0.8 * s, 3.7 * s, 0.3 * s, crown, 8);
      sphere(1.0 * s, 0x468032, -0.7 * s, 3.5 * s, -0.4 * s, crown, 8);
    }
    return { trunk: trunk, crown: crown };
  }

  function createTree(p, index) {
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);
    const parts = buildTreeShape(group, p.kind, p.scale);
    const stump = cyl(0.3 * p.scale, 0.35 * p.scale, 0.4, 0x6b4a2a, 0, 0.2, 0, group, 7);
    stump.visible = false;
    scene.add(group);

    const tree = { index: index, x: p.x, z: p.z, group: group, trunk: parts.trunk, crown: parts.crown, stump: stump,
      hp: 3, isStump: false, regrowDay: 0, shake: 0 };
    world.trees.push(tree);
    makeInteractable(group, 'tree', tree);
    world.circles.push({ x: p.x, z: p.z, r: 0.45 * p.scale });
  }

  function setTreeStump(tree, isStump) {
    tree.isStump = isStump;
    tree.trunk.visible = !isStump;
    tree.crown.visible = !isStump;
    tree.stump.visible = isStump;
    if (!isStump) tree.hp = 3;
  }

  function buildClouds() {
    const rng = mulberry32(42);
    // Unlit material; its colour is tinted by the time of day in updateSky().
    cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    for (let i = 0; i < 10; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(rng() * 3);
      for (let j = 0; j < n; j++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(6 + rng() * 6, 2 + rng() * 1.5, 4 + rng() * 4), cloudMaterial);
        c.position.set(j * 4 - n * 2, rng() * 1.5, (rng() - 0.5) * 3);
        g.add(c);
      }
      g.position.set((rng() - 0.5) * 300, 45 + rng() * 15, (rng() - 0.5) * 300);
      scene.add(g);
      clouds.push(g);
    }
  }

  function buildWorld() {
    buildLights();
    buildGround();
    buildHouse();
    buildBarn();
    buildShopStall();
    buildSellBox();
    buildWell();
    buildTrough();
    buildTrees();
    buildClouds();
    buildViewModel();
  }

  // =====================================================================
  // 5. CROPS
  // =====================================================================

  /** Converts a world point into a field grid cell (or null if outside the field). */
  function fieldCellAt(point) {
    const f = LAYOUT.field;
    const i = Math.floor((point.x - f.minX) / f.cell);
    const j = Math.floor((point.z - f.minZ) / f.cell);
    if (i < 0 || j < 0 || i >= f.cols || j >= f.rows) return null;
    return { i: i, j: j, key: i + ',' + j, x: f.minX + (i + 0.5) * f.cell, z: f.minZ + (j + 0.5) * f.cell };
  }

  /** Creates a dug plot at a grid cell. `data` restores a saved plot. */
  function createPlot(cell, data) {
    const group = new THREE.Group();
    group.position.set(cell.x, 0, cell.z);
    const soil = box(1.1, 0.12, 1.1, 0x7a5230, 0, 0.06, 0, group);
    scene.add(group);

    const plot = {
      i: cell.i, j: cell.j, key: cell.key, group: group, soil: soil, cropMesh: null,
      crop: data ? data.crop : null,
      stage: data ? data.stage : 0,
      progress: data ? data.progress : 0,
      watered: data ? !!data.watered : false
    };
    world.plots.set(cell.key, plot);
    makeInteractable(group, 'plot', plot);
    refreshPlotMesh(plot);
    return plot;
  }

  function removePlot(plot) {
    removeInteractable(plot.group);
    disposeObject(plot.group);
    world.plots.delete(plot.key);
  }

  /** Updates the soil colour and the crop model to match the plot's state. */
  function refreshPlotMesh(plot) {
    plot.soil.material = mat(plot.watered ? 0x4a3020 : 0x7a5230);
    if (plot.cropMesh) disposeObject(plot.cropMesh);
    plot.cropMesh = null;
    if (plot.crop) {
      plot.cropMesh = buildCropMesh(plot.crop, plot.stage);
      plot.cropMesh.position.y = 0.12;
      plot.group.add(plot.cropMesh);
    }
  }

  /** Builds the model for a crop at a growth stage (0-3) from simple shapes. */
  function buildCropMesh(type, stage) {
    const g = new THREE.Group();
    const spots = [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]];

    if (stage === 0) {
      spots.forEach(function (s) { sphere(0.05, 0x3a2412, s[0], 0.02, s[1], g, 5); });
      return g;
    }
    if (stage === 1) {
      spots.forEach(function (s) { cone(0.06, 0.2, 0x6cc24a, s[0], 0.1, s[1], g, 5); });
      return g;
    }

    const mature = stage >= MATURE_STAGE;
    if (type === 'wheat') {
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          const h = mature ? 0.8 : 0.45;
          const color = mature ? 0xd9b44a : 0x7cbf4a;
          cyl(0.02, 0.02, h, color, x * 0.3, h / 2, z * 0.3, g, 4);
          if (mature) cyl(0.05, 0.04, 0.2, 0xc99a2e, x * 0.3, h + 0.08, z * 0.3, g, 5);
        }
      }
    } else if (type === 'carrot') {
      spots.forEach(function (s) {
        const h = mature ? 0.4 : 0.28;
        cone(0.1, h, 0x4fa83a, s[0], h / 2, s[1], g, 5);
        if (mature) {
          const root = cone(0.08, 0.22, 0xf08a24, s[0], 0.04, s[1], g, 6);
          root.rotation.x = Math.PI; // pointing down, top peeks out of the soil
        }
      });
    } else if (type === 'corn') {
      [[-0.25, 0], [0.25, -0.2], [0.1, 0.28]].forEach(function (s) {
        const h = mature ? 1.6 : 0.9;
        cyl(0.04, 0.05, h, 0x4f9a3a, s[0], h / 2, s[1], g, 5);
        const leaf = box(0.5, 0.03, 0.1, 0x5aab44, s[0] + 0.15, h * 0.5, s[1], g);
        leaf.rotation.z = 0.5;
        const leaf2 = box(0.5, 0.03, 0.1, 0x5aab44, s[0] - 0.15, h * 0.7, s[1], g);
        leaf2.rotation.z = -0.5;
        if (mature) {
          const cob = cyl(0.06, 0.06, 0.28, 0xf4d35e, s[0] + 0.08, h * 0.6, s[1], g, 6);
          cob.rotation.z = -0.3;
          cone(0.06, 0.18, 0xc99a2e, s[0], h + 0.08, s[1], g, 4);   // tassel
        }
      });
    }
    return g;
  }

  /** Advances growth for one plot. Each stage needs water; water is used up when a stage completes. */
  function growPlot(plot, dt) {
    if (!plot.crop || plot.stage >= MATURE_STAGE || !plot.watered) return;
    plot.progress += dt;
    if (plot.progress >= CROPS[plot.crop].stageTime) {
      plot.progress = 0;
      plot.stage++;
      plot.watered = false;
      refreshPlotMesh(plot);
    }
  }

  function updateCrops(dt) {
    world.plots.forEach(function (plot) { growPlot(plot, dt); });
  }

  function digPlot(cell) {
    if (!useEnergy(ENERGY_COST.dig)) return;
    createPlot(cell, null);
    swingTool();
    showToast('Dug a new plot');
  }

  function plantSeed(plot) {
    const type = state.seedType;
    const seedItem = CROPS[type].seed;
    if (!state.inventory[seedItem]) { showToast('No ' + ITEMS[seedItem].name + ' left — buy more at the shop'); return; }
    if (!useEnergy(ENERGY_COST.plant)) return;
    state.inventory[seedItem]--;
    plot.crop = type;
    plot.stage = 0;
    plot.progress = 0;
    refreshPlotMesh(plot);
    swingTool();
    renderInventory();
    renderHotbar();
    showToast('Planted ' + CROPS[type].name);
  }

  function waterPlot(plot) {
    if (state.canWater <= 0) { showToast('Watering can is empty — refill it at the well'); return; }
    if (!useEnergy(ENERGY_COST.water)) return;
    state.canWater--;
    plot.watered = true;
    refreshPlotMesh(plot);
    swingTool();
    renderHotbar();
  }

  function harvestPlot(plot) {
    if (!useEnergy(ENERGY_COST.harvest)) return;
    const crop = CROPS[plot.crop];
    const amount = randInt(crop.yield[0], crop.yield[1]);
    addItem(crop.item, amount);
    plot.crop = null;
    plot.stage = 0;
    plot.progress = 0;
    plot.watered = false;
    refreshPlotMesh(plot);
    swingTool();
    showToast('Harvested ' + amount + ' ' + crop.name);
  }

  // =====================================================================
  // 6. ANIMALS
  // =====================================================================

  /** Leg pivot: a group at hip height with the leg hanging below, so it can swing. */
  function makeLeg(parent, x, hipY, z, length, thickness, color) {
    const pivot = new THREE.Group();
    pivot.position.set(x, hipY, z);
    parent.add(pivot);
    box(thickness, length, thickness, color, 0, -length / 2, 0, pivot);
    return pivot;
  }

  function buildChickenModel() {
    const g = new THREE.Group();
    const body = sphere(0.22, 0xffffff, 0, 0.36, 0, g, 8);
    body.scale.set(1, 0.9, 1.25);
    sphere(0.12, 0xffffff, 0, 0.6, 0.2, g, 8);                       // head
    box(0.04, 0.09, 0.12, 0xd62828, 0, 0.74, 0.2, g);                // comb
    const beak = cone(0.04, 0.1, 0xf4a261, 0, 0.58, 0.34, g, 5);
    beak.rotation.x = Math.PI / 2;
    box(0.02, 0.02, 0.02, 0x111111, 0.08, 0.63, 0.27, g);            // eyes
    box(0.02, 0.02, 0.02, 0x111111, -0.08, 0.63, 0.27, g);
    const tail = box(0.16, 0.18, 0.08, 0xf0f0f0, 0, 0.48, -0.28, g);
    tail.rotation.x = -0.5;
    const legs = [
      makeLeg(g, 0.07, 0.18, 0, 0.18, 0.03, 0xf4a261),
      makeLeg(g, -0.07, 0.18, 0, 0.18, 0.03, 0xf4a261)
    ];
    return { group: g, legs: legs, markerY: 1.0 };
  }

  function buildCowModel() {
    const g = new THREE.Group();
    box(0.9, 0.8, 1.6, 0xf5f5f0, 0, 1.0, 0, g);                       // body
    box(0.92, 0.4, 0.5, 0x222222, 0, 1.15, 0.2, g);                   // black patches
    box(0.5, 0.5, 0.4, 0x222222, 0.21, 0.9, -0.5, g);
    box(0.5, 0.6, 0.6, 0xf5f5f0, 0, 1.3, 0.95, g);                    // head
    box(0.52, 0.25, 0.2, 0xe8a0a0, 0, 1.12, 1.25, g);                 // muzzle
    box(0.05, 0.05, 0.05, 0x111111, 0.15, 1.42, 1.25, g);             // eyes
    box(0.05, 0.05, 0.05, 0x111111, -0.15, 1.42, 1.25, g);
    cone(0.04, 0.2, 0xeeeedd, 0.2, 1.68, 0.95, g, 5);                 // horns
    cone(0.04, 0.2, 0xeeeedd, -0.2, 1.68, 0.95, g, 5);
    box(0.2, 0.08, 0.12, 0xf5f5f0, 0.33, 1.48, 0.9, g);               // ears
    box(0.2, 0.08, 0.12, 0xf5f5f0, -0.33, 1.48, 0.9, g);
    sphere(0.16, 0xe8a0a0, 0, 0.6, -0.2, g, 8);                       // udder
    const tail = box(0.05, 0.6, 0.05, 0xf5f5f0, 0, 1.0, -0.82, g);
    tail.rotation.x = 0.25;
    const legs = [
      makeLeg(g, 0.3, 0.65, 0.6, 0.65, 0.18, 0xf5f5f0),
      makeLeg(g, -0.3, 0.65, 0.6, 0.65, 0.18, 0xf5f5f0),
      makeLeg(g, 0.3, 0.65, -0.6, 0.65, 0.18, 0xf5f5f0),
      makeLeg(g, -0.3, 0.65, -0.6, 0.65, 0.18, 0xf5f5f0)
    ];
    return { group: g, legs: legs, markerY: 2.0 };
  }

  /** Random point inside the pen, away from the fence. */
  function randomPenPoint() {
    const p = LAYOUT.pen;
    return { x: randRange(p.minX + 1.2, p.maxX - 1.2), z: randRange(p.minZ + 1.2, p.maxZ - 1.2) };
  }

  /**
   * Spawns an animal. status: hungry -> producing (after feeding) -> (cow only) ready -> hungry.
   * `data` restores a saved animal.
   */
  function spawnAnimal(type, data) {
    const model = type === 'cow' ? buildCowModel() : buildChickenModel();
    const pos = data ? { x: data.x, z: data.z } : randomPenPoint();
    model.group.position.set(pos.x, 0, pos.z);
    model.group.rotation.y = Math.random() * Math.PI * 2;
    scene.add(model.group);

    // Floating status marker above the head.
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: 0xffa62b }));
    marker.position.y = model.markerY;
    model.group.add(marker);

    const animal = {
      type: type, group: model.group, legs: model.legs, marker: marker, markerY: model.markerY,
      x: pos.x, z: pos.z, target: randomPenPoint(), wait: Math.random() * 3, walkPhase: 0,
      status: data ? data.status : 'hungry',
      timer: data ? data.timer : 0
    };
    world.animals.push(animal);
    makeInteractable(model.group, 'animal', animal);
    return animal;
  }

  function removeAllAnimals() {
    world.animals.forEach(function (a) { removeInteractable(a.group); disposeObject(a.group); });
    world.animals = [];
  }

  /** Wandering AI + walk animation. */
  function updateAnimalMovement(a, dt) {
    const def = ANIMALS[a.type];
    let moving = false;
    if (a.wait > 0) {
      a.wait -= dt;
    } else {
      const dx = a.target.x - a.x, dz = a.target.z - a.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.2) {
        a.wait = randRange(1.5, 5);
        a.target = randomPenPoint();
      } else {
        const step = Math.min(dist, def.speed * dt);
        a.x += (dx / dist) * step;
        a.z += (dz / dist) * step;
        // Smoothly turn towards the walking direction.
        const targetYaw = Math.atan2(dx, dz);
        let diff = targetYaw - a.group.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        a.group.rotation.y += diff * Math.min(1, dt * 5);
        moving = true;
      }
    }
    const p = LAYOUT.pen;
    a.x = clamp(a.x, p.minX + 0.8, p.maxX - 0.8);
    a.z = clamp(a.z, p.minZ + 0.8, p.maxZ - 0.8);
    a.group.position.set(a.x, 0, a.z);

    if (moving) a.walkPhase += dt * (a.type === 'cow' ? 6 : 14);
    const swing = moving ? Math.sin(a.walkPhase) * 0.5 : 0;
    a.legs.forEach(function (leg, i) { leg.rotation.x = (i % 2 === 0 ? swing : -swing) * (i >= 2 ? -1 : 1); });
    if (a.type === 'chicken') a.group.position.y = moving ? Math.abs(Math.sin(a.walkPhase)) * 0.04 : 0;
  }

  /** Feeding & produce timers (also used when time is skipped by sleeping). */
  function updateAnimalProduction(a, dt) {
    if (a.status !== 'producing') return;
    a.timer -= dt;
    if (a.timer > 0) return;
    if (a.type === 'chicken') {
      spawnEgg(a.x + randRange(-0.3, 0.3), a.z + randRange(-0.3, 0.3));
      a.status = 'hungry';
    } else {
      a.status = 'ready';
    }
  }

  function updateAnimalMarker(a, t) {
    a.marker.visible = a.status !== 'producing';
    if (a.marker.visible) {
      a.marker.material.color.setHex(a.status === 'ready' ? 0xffffff : 0xffa62b);
      a.marker.position.y = a.markerY + Math.sin(t * 3 + a.x) * 0.06;
      a.marker.rotation.y = t * 2;
    }
  }

  function updateAnimals(dt, t) {
    world.animals.forEach(function (a) {
      updateAnimalMovement(a, dt);
      updateAnimalProduction(a, dt);
      updateAnimalMarker(a, t);
    });
    world.eggs.forEach(function (e) { e.mesh.rotation.y += dt; });
  }

  function feedAnimal(a) {
    const food = state.inventory.feed > 0 ? 'feed' : (state.inventory.wheat > 0 ? 'wheat' : null);
    if (!food) { showToast('You need Animal Feed or Wheat'); return; }
    if (!useEnergy(ENERGY_COST.feed)) return;
    state.inventory[food]--;
    a.status = 'producing';
    a.timer = ANIMALS[a.type].produceTime;
    renderInventory();
    swingTool();
    showToast('Fed the ' + ANIMALS[a.type].name.toLowerCase() + (food === 'wheat' ? ' some wheat' : ''));
  }

  function milkCow(a) {
    if (!useEnergy(ENERGY_COST.milk)) return;
    a.status = 'hungry';
    addItem('milk', 1);
    swingTool();
    showToast('Collected 1 Milk');
  }

  function spawnEgg(x, z) {
    if (world.eggs.length >= 40) return;
    const p = LAYOUT.pen;
    x = clamp(x, p.minX + 0.5, p.maxX - 0.5);
    z = clamp(z, p.minZ + 0.5, p.maxZ - 0.5);
    const mesh = sphere(0.09, 0xf7ecd2, x, 0.1, z, scene, 8);
    mesh.scale.set(1, 1.3, 1);
    const egg = { x: x, z: z, mesh: mesh };
    world.eggs.push(egg);
    makeInteractable(mesh, 'egg', egg);
  }

  function collectEgg(egg) {
    removeInteractable(egg.mesh);
    disposeObject(egg.mesh);
    world.eggs.splice(world.eggs.indexOf(egg), 1);
    addItem('egg', 1);
    showToast('Collected 1 Egg');
  }

  function removeAllEggs() {
    world.eggs.forEach(function (e) { removeInteractable(e.mesh); disposeObject(e.mesh); });
    world.eggs = [];
  }

  // =====================================================================
  // 7. PLAYER (movement, collisions, energy, held tool)
  // =====================================================================

  function updatePlayer(dt) {
    const k = input.keys;
    let fx = 0, fz = 0;
    if (k.KeyW || k.ArrowUp) fz += 1;
    if (k.KeyS || k.ArrowDown) fz -= 1;
    if (k.KeyD || k.ArrowRight) fx += 1;
    if (k.KeyA || k.ArrowLeft) fx -= 1;

    player.moving = fx !== 0 || fz !== 0;
    if (player.moving) {
      const len = Math.hypot(fx, fz);
      fx /= len; fz /= len;
      const wantsRun = (k.ShiftLeft || k.ShiftRight) && state.energy > 0;
      let speed = wantsRun ? RUN_SPEED : WALK_SPEED;
      if (state.energy <= 0) speed *= 0.6; // exhausted
      if (wantsRun) state.energy = Math.max(0, state.energy - ENERGY_COST.runPerSecond * dt);

      // Forward is -Z rotated by yaw; right is +X rotated by yaw.
      const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
      const mx = (fx * cos - fz * sin) * speed * dt;
      const mz = (-fx * sin - fz * cos) * speed * dt;
      // Move axis by axis so the player slides along walls.
      player.pos.x += mx;
      resolveCollisions();
      player.pos.z += mz;
      resolveCollisions();
      player.bobPhase += dt * (wantsRun ? 13 : 9);
    }
    player.pos.x = clamp(player.pos.x, -WORLD_LIMIT, WORLD_LIMIT);
    player.pos.z = clamp(player.pos.z, -WORLD_LIMIT, WORLD_LIMIT);

    camera.position.set(player.pos.x, EYE_HEIGHT + (player.moving ? Math.sin(player.bobPhase) * 0.04 : 0), player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
  }

  /** Pushes the player's circle out of all box and circle colliders. */
  function resolveCollisions() {
    const p = player.pos;
    world.colliders.forEach(function (c) {
      const cx = clamp(p.x, c.minX, c.maxX), cz = clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - cx, dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= PLAYER_RADIUS * PLAYER_RADIUS) return;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * PLAYER_RADIUS;
        p.z = cz + (dz / d) * PLAYER_RADIUS;
      } else {
        // Centre is inside the box: push out along the shortest axis.
        const pushes = [
          [c.minX - PLAYER_RADIUS - p.x, 0], [c.maxX + PLAYER_RADIUS - p.x, 0],
          [0, c.minZ - PLAYER_RADIUS - p.z], [0, c.maxZ + PLAYER_RADIUS - p.z]
        ];
        pushes.sort(function (a, b) { return Math.abs(a[0] + a[1]) - Math.abs(b[0] + b[1]); });
        p.x += pushes[0][0];
        p.z += pushes[0][1];
      }
    });
    world.circles.forEach(function (c) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const min = c.r + PLAYER_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    });
  }

  /** Spends energy; returns false (and tells the player) if there isn't enough. */
  function useEnergy(amount) {
    if (state.energy < amount) {
      showToast('Too tired! Sleep in the farmhouse to restore energy.');
      return false;
    }
    state.energy = Math.max(0, state.energy - amount);
    return true;
  }

  function currentTool() { return TOOLS[state.selectedSlot].id; }

  /** Builds a small model for each tool, held in the bottom-right of the view. */
  function buildViewModel() {
    viewModel = new THREE.Group();
    viewModel.position.set(0.38, -0.36, -0.7);
    camera.add(viewModel);

    function holder() { const g = new THREE.Group(); viewModel.add(g); return g; }

    const shovel = holder();
    cyl(0.025, 0.025, 0.7, 0x8b5a2b, 0, 0.1, 0, shovel, 6);
    box(0.16, 0.2, 0.03, 0x9aa0a6, 0, -0.33, 0, shovel);
    shovel.rotation.set(0.3, 0, 0.2);

    const can = holder();
    cyl(0.1, 0.1, 0.2, 0x4f9a5a, 0, 0, 0, can, 10);
    const spout = cyl(0.02, 0.025, 0.25, 0x4f9a5a, 0, 0.05, -0.18, can, 6);
    spout.rotation.x = -1.1;
    box(0.03, 0.03, 0.18, 0x3d7a48, 0, 0.13, 0.03, can);

    const seeds = holder();
    box(0.18, 0.22, 0.1, 0xd9c9a0, 0, 0, 0, seeds);
    box(0.08, 0.04, 0.06, 0x8b5a2b, 0, 0.13, 0, seeds);

    const bucket = holder();
    cyl(0.12, 0.09, 0.2, 0x9aa0a6, 0, 0, 0, bucket, 10);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.01, 4, 10, Math.PI), mat(0x555555));
    handle.position.y = 0.08;
    bucket.add(handle);

    const axe = holder();
    cyl(0.025, 0.025, 0.6, 0x8b5a2b, 0, 0, 0, axe, 6);
    box(0.04, 0.14, 0.2, 0x9aa0a6, 0, 0.24, -0.08, axe);
    axe.rotation.set(0.2, 0, 0.25);

    viewModelTools = { shovel: shovel, can: can, seeds: seeds, bucket: bucket, axe: axe };
    viewModel.traverse(function (o) { o.castShadow = false; o.receiveShadow = false; });
    updateViewModelVisibility();
  }

  function updateViewModelVisibility() {
    const tool = currentTool();
    Object.keys(viewModelTools).forEach(function (id) { viewModelTools[id].visible = id === tool; });
  }

  function swingTool() { swingTimer = 0.3; }

  function updateViewModel(dt) {
    if (!viewModel) return;
    swingTimer = Math.max(0, swingTimer - dt);
    const swing = swingTimer > 0 ? Math.sin((1 - swingTimer / 0.3) * Math.PI) : 0;
    const bob = player.moving ? Math.sin(player.bobPhase) * 0.015 : 0;
    viewModel.rotation.x = -swing * 0.9;
    viewModel.position.y = -0.36 + bob;
  }

  // =====================================================================
  // 8. INTERACTION (raycast -> context action)
  // =====================================================================

  function isVisibleInWorld(obj) {
    while (obj) { if (!obj.visible) return false; obj = obj.parent; }
    return true;
  }

  function findInteractInfo(obj) {
    while (obj) {
      if (obj.userData && obj.userData.interact) return obj.userData.interact;
      obj = obj.parent;
    }
    return null;
  }

  /** Finds what the player is looking at (centre of the screen). */
  function updateTarget() {
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = raycaster.intersectObjects(world.interactables, true);
    currentTarget = null;
    for (let i = 0; i < hits.length; i++) {
      if (!isVisibleInWorld(hits[i].object)) continue;
      const info = findInteractInfo(hits[i].object);
      if (info) { currentTarget = { info: info, point: hits[i].point, object: hits[i].object }; break; }
    }
    currentAction = getAction(currentTarget);
    setPrompt(currentAction ? currentAction.prompt : '');
  }

  /** Decides what pressing E would do for the current target and tool. */
  function getAction(target) {
    if (!target) return null;
    const tool = currentTool();
    const ref = target.info.ref;

    switch (target.info.type) {
      case 'ground': {
        const cell = fieldCellAt(target.point);
        if (!cell || world.plots.has(cell.key)) return null;
        if (tool !== 'shovel') return { prompt: 'Farm field — select the Shovel [1] to dig' };
        return { prompt: '[E] Dig a plot', run: function () { digPlot(cell); } };
      }
      case 'plot': return getPlotAction(ref, tool);
      case 'well':
        if (tool !== 'can') return { prompt: 'Well — select the Watering Can [2] to refill' };
        return { prompt: '[E] Refill watering can (' + state.canWater + '/' + CAN_CAPACITY + ')', run: function () {
          state.canWater = CAN_CAPACITY; renderHotbar(); showToast('Watering can refilled');
        } };
      case 'tree':
        if (ref.isStump) return { prompt: 'Tree stump — regrows in a few days' };
        if (tool !== 'axe') return { prompt: 'Tree — select the Axe [5] to chop' };
        return { prompt: '[E] Chop tree (' + ref.hp + ' hits left)', run: function () { chopTree(ref); } };
      case 'animal': return getAnimalAction(ref, tool);
      case 'egg': return { prompt: '[E] Pick up egg', run: function () { collectEgg(ref); } };
      case 'sellbox': return { prompt: '[E] Open sell box', run: function () { openMenu('sell'); } };
      case 'shop': return { prompt: '[E] Open shop', run: function () { openMenu('shop'); } };
      case 'bed': return { prompt: '[E] Sleep until morning', run: sleep };
    }
    return null;
  }

  function getPlotAction(plot, tool) {
    if (!plot.crop) {
      if (tool === 'seeds') {
        const seed = CROPS[state.seedType].seed;
        return { prompt: '[E] Plant ' + CROPS[state.seedType].name + ' (' + (state.inventory[seed] || 0) + ' seeds) · [R] change seed',
          run: function () { plantSeed(plot); } };
      }
      if (tool === 'shovel') return { prompt: '[E] Fill in plot', run: function () { removePlot(plot); swingTool(); } };
      return { prompt: 'Empty plot — select Seeds [3] to plant' };
    }
    const name = CROPS[plot.crop].name;
    if (plot.stage >= MATURE_STAGE) {
      return { prompt: '[E] Harvest ' + name, run: function () { harvestPlot(plot); } };
    }
    const info = name + ' — stage ' + plot.stage + '/' + MATURE_STAGE;
    if (plot.watered) {
      const pct = Math.floor((plot.progress / CROPS[plot.crop].stageTime) * 100);
      return { prompt: info + ' · watered, growing ' + pct + '%' };
    }
    if (tool === 'can') return { prompt: '[E] Water ' + name + ' (' + state.canWater + ' water left)', run: function () { waterPlot(plot); } };
    return { prompt: info + ' · needs water (Watering Can [2])' };
  }

  function getAnimalAction(a, tool) {
    const name = ANIMALS[a.type].name;
    if (a.status === 'hungry') {
      const food = state.inventory.feed > 0 ? 'Feed' : (state.inventory.wheat > 0 ? 'Wheat' : null);
      if (!food) return { prompt: name + ' is hungry — buy Animal Feed at the shop' };
      return { prompt: '[E] Feed ' + name + ' (' + food + ')', run: function () { feedAnimal(a); } };
    }
    if (a.status === 'ready') {
      if (tool !== 'bucket') return { prompt: name + ' is ready — select the Bucket [4] to milk' };
      return { prompt: '[E] Milk ' + name, run: function () { milkCow(a); } };
    }
    return { prompt: name + ' is content (' + (a.type === 'cow' ? 'milk' : 'egg') + ' in ' + Math.ceil(a.timer) + 's)' };
  }

  function interact() {
    if (uiState !== 'playing') return;
    updateTarget(); // always act on what is under the crosshair right now
    if (currentAction && currentAction.run) currentAction.run();
    updateTarget();
  }

  function chopTree(tree) {
    if (!useEnergy(ENERGY_COST.chop)) return;
    tree.hp--;
    tree.shake = 0.3;
    swingTool();
    if (tree.hp <= 0) {
      setTreeStump(tree, true);
      tree.regrowDay = state.day + 3;
      addItem('wood', 3);
      showToast('Timber! +3 Wood');
    }
  }

  function updateTrees(dt) {
    world.trees.forEach(function (tree) {
      if (tree.shake > 0) {
        tree.shake = Math.max(0, tree.shake - dt);
        tree.group.rotation.z = Math.sin(tree.shake * 60) * 0.03;
      }
    });
  }

  // =====================================================================
  // 9. DAY / NIGHT CYCLE
  // =====================================================================

  /** Sky colours, created on first use (THREE is only guaranteed to exist after init). */
  let sky = null;

  function updateTime(dt) {
    advanceTime(dt / SECONDS_PER_GAME_HOUR);
  }

  /** Moves the clock forward; handles the day counter at midnight. */
  function advanceTime(hours) {
    state.time += hours;
    while (state.time >= 24) {
      state.time -= 24;
      state.day++;
      onNewDay();
    }
  }

  function onNewDay() {
    world.trees.forEach(function (tree) {
      if (tree.isStump && state.day >= tree.regrowDay) setTreeStump(tree, false);
    });
  }

  /** Sun/moon position, light intensity and sky colour from the current hour. */
  function updateSky() {
    if (!sky) {
      sky = { day: new THREE.Color(0x87ceeb), night: new THREE.Color(0x0b1026), dusk: new THREE.Color(0xf08a5d),
        current: new THREE.Color(), sunDir: new THREE.Vector3(), cloudNight: new THREE.Color(0x2a3048), white: new THREE.Color(0xffffff) };
    }
    const angle = ((state.time - 6) / 12) * Math.PI;      // 0 at 6:00, PI at 18:00
    const sunHeight = Math.sin(angle);
    const dayFactor = clamp((sunHeight + 0.1) / 0.35, 0, 1);
    const duskFactor = clamp(1 - Math.abs(sunHeight) / 0.3, 0, 1);

    sky.current.copy(sky.night).lerp(sky.day, dayFactor).lerp(sky.dusk, duskFactor * 0.55);
    scene.background.copy(sky.current);
    scene.fog.color.copy(sky.current);

    const center = player.pos;
    const sunDir = sky.sunDir.set(Math.cos(angle), Math.sin(angle), 0.35).normalize();
    sunLight.position.set(center.x + sunDir.x * 70, sunDir.y * 70, center.z + sunDir.z * 70);
    sunLight.target.position.set(center.x, 0, center.z);
    sunLight.intensity = 0.95 * dayFactor;
    moonLight.position.set(center.x - sunDir.x * 70, -sunDir.y * 70, center.z - sunDir.z * 70);
    moonLight.target.position.set(center.x, 0, center.z);
    moonLight.intensity = 0.25 * (1 - dayFactor);
    hemiLight.intensity = 0.2 + 0.45 * dayFactor;

    sunMesh.position.set(center.x + sunDir.x * 200, sunDir.y * 200, center.z + sunDir.z * 200);
    moonMesh.position.set(center.x - sunDir.x * 200, -sunDir.y * 200, center.z - sunDir.z * 200);
    sunMesh.visible = sunDir.y > -0.1;
    moonMesh.visible = sunDir.y < 0.1;

    cloudMaterial.color.copy(sky.cloudNight).lerp(sky.dusk, duskFactor * 0.4).lerp(sky.white, dayFactor);
    stars.position.set(center.x, 0, center.z);
    stars.material.opacity = 1 - dayFactor;
    if (world.windowMaterial) world.windowMaterial.emissive.setHex(dayFactor < 0.5 ? 0xffc24d : 0x000000);
  }

  function updateClouds(dt) {
    clouds.forEach(function (c) {
      c.position.x += dt * 1.5;
      if (c.position.x > 160) c.position.x = -160;
    });
  }

  /** Sleep: fade out, skip to the next morning, restore energy, autosave. */
  function sleep() {
    if (uiState !== 'playing') return;
    uiState = 'sleeping';
    const fade = document.getElementById('fade');
    fade.textContent = 'Zzz...';
    fade.classList.add('on');

    setTimeout(function () {
      const hours = state.time < WAKE_UP_HOUR ? WAKE_UP_HOUR - state.time : 24 - state.time + WAKE_UP_HOUR;
      simulateSkippedTime(hours * SECONDS_PER_GAME_HOUR);
      advanceTime(hours);
      state.time = WAKE_UP_HOUR;
      state.energy = MAX_ENERGY;
      saveGame(true);
      fade.textContent = 'Day ' + state.day;
      setTimeout(function () {
        fade.classList.remove('on');
        uiState = 'playing';
        showToast('Good morning! Day ' + state.day + ' — energy restored');
      }, 900);
    }, 1000);
  }

  /** Runs crop growth and animal timers for time that passed while sleeping. */
  function simulateSkippedTime(seconds) {
    world.plots.forEach(function (plot) { growPlot(plot, seconds); });
    world.animals.forEach(function (a) { updateAnimalProduction(a, seconds); });
  }

  // =====================================================================
  // 10. ECONOMY (inventory, shop, sell box)
  // =====================================================================

  function addItem(id, amount) {
    state.inventory[id] = (state.inventory[id] || 0) + amount;
    renderInventory();
    renderHotbar();
  }

  function sellItem(id, amount) {
    const have = state.inventory[id] || 0;
    const n = Math.min(have, amount);
    if (n <= 0) return 0;
    state.inventory[id] -= n;
    const earned = n * ITEMS[id].sell;
    state.coins += earned;
    return earned;
  }

  function sellEverything() {
    let total = 0;
    Object.keys(ITEMS).forEach(function (id) {
      if (ITEMS[id].sell > 0) total += sellItem(id, state.inventory[id] || 0);
    });
    if (total > 0) showToast('Sold everything for ' + total + ' coins');
    afterTransaction();
  }

  function fenceUpgradeInfo() {
    return FENCE_LEVELS[state.fenceLevel] || null; // next level (index = current level)
  }

  /** Buys `qty` of a shop entry. Returns true on success. */
  function buyShopItem(entry, qty) {
    if (entry.fence) {
      const next = fenceUpgradeInfo();
      if (!next) return false;
      if (state.coins < next.cost) { showToast('Not enough coins'); return false; }
      if ((state.inventory.wood || 0) < next.wood) { showToast('Need ' + next.wood + ' wood — chop some trees'); return false; }
      state.coins -= next.cost;
      state.inventory.wood -= next.wood;
      state.fenceLevel++;
      buildFence(state.fenceLevel);
      showToast('Fence upgraded to ' + next.name + '!');
      afterTransaction();
      return true;
    }
    const cost = entry.price * qty;
    if (state.coins < cost) { showToast('Not enough coins'); return false; }
    if (entry.animal) {
      const cap = FENCE_LEVELS[state.fenceLevel - 1].capacity;
      if (world.animals.length >= cap) { showToast('Pen is full (' + cap + ' animals) — upgrade the fence'); return false; }
      spawnAnimal(entry.animal, null);
      showToast('A new ' + entry.label.toLowerCase() + ' arrived in the pen!');
    } else {
      state.inventory[entry.give] = (state.inventory[entry.give] || 0) + qty;
    }
    state.coins -= cost;
    afterTransaction();
    return true;
  }

  function afterTransaction() {
    renderInventory();
    renderHotbar();
    if (uiState === 'shop') renderShop();
    if (uiState === 'sell') renderSell();
  }

  // =====================================================================
  // 11. HUD / UI
  // =====================================================================

  const $ = function (id) { return document.getElementById(id); };

  const CONTROLS_HTML =
    '<div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move &nbsp; <kbd>Mouse</kbd> Look &nbsp; <kbd>Shift</kbd> Run</div>' +
    '<div><kbd>E</kbd> or <kbd>Click</kbd> Interact / use tool &nbsp; <kbd>1</kbd>-<kbd>5</kbd> or <kbd>Wheel</kbd> Select tool</div>' +
    '<div><kbd>R</kbd> (or <kbd>3</kbd> again) Change seed type &nbsp; <kbd>Esc</kbd> Pause</div>' +
    '<div style="margin-top:8px;opacity:.85">Farming: dig a plot in the field with the shovel, plant seeds, water each growth stage, harvest when ripe. ' +
    'Refill the watering can at the well. Feed animals (feed or wheat) for eggs and milk — use the bucket on a cow. ' +
    'Chop trees for wood (needed for fence upgrades). Sell produce at the blue-sign box, buy supplies at the striped stall, ' +
    'and sleep by using the farmhouse door.</div>';

  function setPrompt(text) {
    const el = $('prompt');
    if (el.textContent !== text) el.textContent = text;
  }

  function showToast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }

  function formatClock(time) {
    const h = Math.floor(time), m = Math.floor((time - h) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  /** Cheap per-frame HUD values. */
  function updateHUD() {
    $('coins').textContent = state.coins;
    $('day').textContent = state.day;
    $('clock').textContent = formatClock(state.time);
    const pct = (state.energy / MAX_ENERGY) * 100;
    const fill = $('energy-fill');
    fill.style.width = pct + '%';
    fill.classList.toggle('low', pct < 25);
    $('energy-text').textContent = Math.ceil(state.energy);
    $('click-hint').classList.toggle('hidden', !(uiState === 'playing' && !input.locked));
  }

  function renderHotbar() {
    const bar = $('hotbar');
    bar.innerHTML = '';
    TOOLS.forEach(function (tool, i) {
      let label = tool.name;
      if (tool.id === 'seeds') {
        const seed = CROPS[state.seedType].seed;
        label = CROPS[state.seedType].name + ' ×' + (state.inventory[seed] || 0);
      } else if (tool.id === 'can') {
        label = 'Water ' + state.canWater + '/' + CAN_CAPACITY;
      }
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === state.selectedSlot ? ' active' : '');
      slot.innerHTML = '<span class="key">' + (i + 1) + '</span><span class="icon">' + tool.icon + '</span><span class="label"></span>';
      slot.querySelector('.label').textContent = label;
      bar.appendChild(slot);
    });
  }

  function renderInventory() {
    const panel = $('inventory-panel');
    let html = '<div class="title">Inventory</div>';
    let any = false;
    Object.keys(ITEMS).forEach(function (id) {
      const n = state.inventory[id] || 0;
      if (n <= 0) return;
      any = true;
      html += '<div class="row"><span>' + ITEMS[id].icon + ' ' + ITEMS[id].name + '</span><span>' + n + '</span></div>';
    });
    if (!any) html += '<div class="row">Empty</div>';
    panel.innerHTML = html;
  }

  function selectSlot(i) {
    if (i === state.selectedSlot && TOOLS[i].id === 'seeds') cycleSeed();
    state.selectedSlot = i;
    updateViewModelVisibility();
    renderHotbar();
  }

  function cycleSeed() {
    const idx = SEED_TYPES.indexOf(state.seedType);
    state.seedType = SEED_TYPES[(idx + 1) % SEED_TYPES.length];
    renderHotbar();
    showToast('Seed type: ' + CROPS[state.seedType].name);
  }

  function makeRow(icon, name, desc, price, buttons) {
    const row = document.createElement('div');
    row.className = 'item-row';
    row.innerHTML = '<span class="icon">' + icon + '</span><div class="info"><div class="name"></div><div class="desc"></div></div><span class="price"></span>';
    row.querySelector('.name').textContent = name;
    row.querySelector('.desc').textContent = desc;
    row.querySelector('.price').textContent = price;
    buttons.forEach(function (b) {
      const btn = document.createElement('button');
      btn.className = 'small';
      btn.textContent = b.label;
      btn.disabled = !!b.disabled;
      btn.addEventListener('click', b.onClick);
      row.appendChild(btn);
    });
    return row;
  }

  function renderShop() {
    const list = $('shop-list');
    list.innerHTML = '';
    document.querySelectorAll('.menu-coins').forEach(function (el) { el.textContent = state.coins; });
    SHOP_ITEMS.forEach(function (entry) {
      if (entry.fence) {
        const next = fenceUpgradeInfo();
        const current = FENCE_LEVELS[state.fenceLevel - 1];
        if (!next) {
          list.appendChild(makeRow(entry.icon, entry.label, current.name + ' — max level (' + current.capacity + ' animals)', '—', []));
          return;
        }
        list.appendChild(makeRow(entry.icon, entry.label + ': ' + next.name,
          'Capacity ' + current.capacity + ' → ' + next.capacity + ' animals. Needs ' + next.wood + ' wood (you have ' + (state.inventory.wood || 0) + ').',
          next.cost + ' 🪙',
          [{ label: 'Upgrade', disabled: state.coins < next.cost || (state.inventory.wood || 0) < next.wood,
            onClick: function () { buyShopItem(entry, 1); } }]));
        return;
      }
      let desc = entry.desc;
      if (entry.animal) {
        const cap = FENCE_LEVELS[state.fenceLevel - 1].capacity;
        desc += ' Pen: ' + world.animals.length + '/' + cap + '.';
      } else {
        desc += ' Owned: ' + (state.inventory[entry.give] || 0) + '.';
      }
      const buttons = [{ label: 'Buy', disabled: state.coins < entry.price, onClick: function () { buyShopItem(entry, 1); } }];
      if (!entry.animal) {
        buttons.push({ label: '×5', disabled: state.coins < entry.price * 5, onClick: function () { buyShopItem(entry, 5); } });
      }
      list.appendChild(makeRow(entry.icon, entry.label, desc, entry.price + ' 🪙', buttons));
    });
  }

  function renderSell() {
    const list = $('sell-list');
    list.innerHTML = '';
    document.querySelectorAll('.menu-coins').forEach(function (el) { el.textContent = state.coins; });
    let any = false;
    Object.keys(ITEMS).forEach(function (id) {
      const item = ITEMS[id];
      const n = state.inventory[id] || 0;
      if (item.sell <= 0 || n <= 0) return;
      any = true;
      list.appendChild(makeRow(item.icon, item.name + ' ×' + n, item.sell + ' coins each', (n * item.sell) + ' 🪙', [
        { label: 'Sell 1', onClick: function () { sellItem(id, 1); afterTransaction(); } },
        { label: 'Sell all', onClick: function () { sellItem(id, n); afterTransaction(); } }
      ]));
    });
    if (!any) list.innerHTML = '<div class="empty-note">Nothing to sell yet. Harvest crops, collect eggs and milk, or chop wood.</div>';
    $('btn-sell-all').disabled = !any;
  }

  function openMenu(which) {
    uiState = which;
    if (which === 'shop') renderShop(); else renderSell();
    $(which === 'shop' ? 'shop-menu' : 'sell-menu').classList.remove('hidden');
    input.keys = {};
    if (document.exitPointerLock && input.locked) document.exitPointerLock();
  }

  function closeMenus() {
    $('shop-menu').classList.add('hidden');
    $('sell-menu').classList.add('hidden');
    resumeGame();
  }

  function openPause() {
    uiState = 'paused';
    pausedAt = performance.now();
    input.keys = {};
    $('pause-menu').classList.remove('hidden');
    $('pause-controls').classList.add('hidden');
  }

  function resumeGame() {
    $('pause-menu').classList.add('hidden');
    uiState = 'playing';
    requestLock();
  }

  function requestLock() {
    const canvas = renderer.domElement;
    if (!canvas.requestPointerLock) return;
    try {
      const p = canvas.requestPointerLock();
      // Browsers refuse re-locking right after Esc; the "click to capture" hint covers that case.
      if (p && p.catch) p.catch(function () {});
    } catch (e) { /* ignore */ }
  }

  function showStartScreen() {
    $('start-screen').classList.remove('hidden');
    $('btn-continue').disabled = !hasSave();
  }

  function startGame(continueSave) {
    let loaded = false;
    if (continueSave) loaded = loadGame();
    if (!loaded) newGame();
    $('start-screen').classList.add('hidden');
    $('hud').classList.remove('hidden');
    uiState = 'playing';
    autosaveTimer = 0;
    renderHotbar();
    renderInventory();
    updateViewModelVisibility();
    requestLock();
    showToast(loaded ? 'Welcome back! Day ' + state.day : 'Welcome to Meadowbrook Ranch!');
  }

  function bindUI() {
    document.querySelectorAll('.controls-help').forEach(function (el) { el.innerHTML = CONTROLS_HTML; });
    $('btn-new').addEventListener('click', function () {
      if (hasSave() && !window.confirm('Start a new game? Your saved progress will be overwritten.')) return;
      startGame(false);
    });
    $('btn-continue').addEventListener('click', function () { startGame(true); });
    $('btn-resume').addEventListener('click', resumeGame);
    $('btn-save').addEventListener('click', function () { saveGame(false); });
    $('btn-controls').addEventListener('click', function () { $('pause-controls').classList.toggle('hidden'); });
    $('btn-restart').addEventListener('click', function () {
      if (!window.confirm('Start a new game? Your saved progress will be overwritten.')) return;
      newGame();
      saveGame(true);
      renderHotbar();
      renderInventory();
      resumeGame();
    });
    $('btn-sell-all').addEventListener('click', sellEverything);
    document.querySelectorAll('.btn-close').forEach(function (b) { b.addEventListener('click', closeMenus); });
  }

  // =====================================================================
  // 12. SAVE / LOAD
  // =====================================================================

  function getSaveData() {
    const data = JSON.parse(JSON.stringify(Object.assign({}, state, { plots: [], animals: [], eggs: [], trees: [] })));
    data.player = { x: player.pos.x, z: player.pos.z, yaw: player.yaw, pitch: player.pitch };
    world.plots.forEach(function (p) {
      data.plots.push({ i: p.i, j: p.j, crop: p.crop, stage: p.stage, progress: p.progress, watered: p.watered });
    });
    world.animals.forEach(function (a) {
      data.animals.push({ type: a.type, x: a.x, z: a.z, status: a.status, timer: a.timer });
    });
    world.eggs.forEach(function (e) { data.eggs.push({ x: e.x, z: e.z }); });
    world.trees.forEach(function (t) { data.trees.push({ hp: t.hp, isStump: t.isStump, regrowDay: t.regrowDay }); });
    return data;
  }

  function saveGame(silent) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(getSaveData()));
      if (!silent) showToast('Game saved');
      return true;
    } catch (e) {
      showToast('Could not save (storage unavailable)');
      return false;
    }
  }

  function hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  }

  /** Loads the saved game into the world. Returns false if there is no valid save. */
  function loadGame() {
    let data;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      data = JSON.parse(raw);
    } catch (e) {
      return false;
    }
    if (!data || data.version !== SAVE_VERSION) return false;
    try {
      applySaveData(data);
      return true;
    } catch (e) {
      console.warn('Save data could not be applied, starting a new game.', e);
      return false;
    }
  }

  /** Removes all dynamic objects (plots, animals, eggs) and resets trees. */
  function clearDynamicWorld() {
    Array.from(world.plots.values()).forEach(removePlot);
    removeAllAnimals();
    removeAllEggs();
    world.trees.forEach(function (t) { setTreeStump(t, false); t.regrowDay = 0; });
  }

  function applySaveData(data) {
    clearDynamicWorld();
    const fresh = defaultState();
    state = Object.assign(fresh, data);
    state.inventory = Object.assign(defaultState().inventory, data.inventory || {});
    state.fenceLevel = clamp(state.fenceLevel | 0, 1, FENCE_LEVELS.length);
    if (SEED_TYPES.indexOf(state.seedType) < 0) state.seedType = 'wheat';
    state.selectedSlot = clamp(state.selectedSlot | 0, 0, TOOLS.length - 1);

    (data.plots || []).forEach(function (p) {
      const f = LAYOUT.field;
      if (p.i < 0 || p.j < 0 || p.i >= f.cols || p.j >= f.rows) return;
      createPlot({ i: p.i, j: p.j, key: p.i + ',' + p.j, x: f.minX + (p.i + 0.5) * f.cell, z: f.minZ + (p.j + 0.5) * f.cell }, p);
    });
    (data.animals || []).forEach(function (a) { if (ANIMALS[a.type]) spawnAnimal(a.type, a); });
    (data.eggs || []).forEach(function (e) { spawnEgg(e.x, e.z); });
    (data.trees || []).forEach(function (t, i) {
      const tree = world.trees[i];
      if (!tree) return;
      setTreeStump(tree, !!t.isStump);
      tree.hp = t.hp || 3;
      tree.regrowDay = t.regrowDay || 0;
    });
    buildFence(state.fenceLevel);
    placePlayer(state.player);
  }

  function newGame() {
    clearDynamicWorld();
    state = defaultState();
    for (let i = 0; i < 3; i++) spawnAnimal('chicken', null);
    for (let i = 0; i < 2; i++) spawnAnimal('cow', null);
    buildFence(state.fenceLevel);
    placePlayer(state.player);
  }

  function placePlayer(p) {
    player.pos.set(p.x, 0, p.z);
    player.yaw = p.yaw || 0;
    player.pitch = p.pitch || 0;
    resolveCollisions();
    camera.position.set(player.pos.x, EYE_HEIGHT, player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
  }

  // =====================================================================
  // 13. INPUT & MAIN LOOP
  // =====================================================================

  function bindInput() {
    const canvas = renderer.domElement;

    document.addEventListener('keydown', function (e) {
      if (e.code === 'Escape') { handleEscape(); return; }
      if (uiState !== 'playing') return;
      input.keys[e.code] = true;
      if (e.code.indexOf('Digit') === 0) {
        const n = parseInt(e.code.slice(5), 10);
        if (n >= 1 && n <= TOOLS.length) selectSlot(n - 1);
      } else if (e.code === 'KeyE') {
        interact();
      } else if (e.code === 'KeyR') {
        cycleSeed();
      }
    });
    document.addEventListener('keyup', function (e) { input.keys[e.code] = false; });
    window.addEventListener('blur', function () { input.keys = {}; });

    canvas.addEventListener('mousedown', function (e) {
      if (uiState !== 'playing' || e.button !== 0) return;
      if (input.locked) { interact(); return; }
      // Not locked: try to lock; also allow click-and-drag looking as a fallback.
      requestLock();
      input.dragging = true;
      input.lastX = e.clientX;
      input.lastY = e.clientY;
    });
    document.addEventListener('mouseup', function () { input.dragging = false; });

    document.addEventListener('mousemove', function (e) {
      if (uiState !== 'playing') return;
      let dx = 0, dy = 0;
      if (input.locked) {
        dx = e.movementX || 0; dy = e.movementY || 0;
        // Some browsers report a huge jump right after locking; ignore it.
        if (Math.abs(dx) > 250 || Math.abs(dy) > 250) return;
      } else if (input.dragging) {
        dx = e.clientX - input.lastX; dy = e.clientY - input.lastY;
        input.lastX = e.clientX; input.lastY = e.clientY;
      } else {
        return;
      }
      player.yaw -= dx * 0.0022;
      player.pitch = clamp(player.pitch - dy * 0.0022, -1.45, 1.45);
    });

    canvas.addEventListener('wheel', function (e) {
      if (uiState !== 'playing') return;
      const dir = e.deltaY > 0 ? 1 : -1;
      state.selectedSlot = (state.selectedSlot + dir + TOOLS.length) % TOOLS.length;
      updateViewModelVisibility();
      renderHotbar();
    }, { passive: true });

    document.addEventListener('pointerlockchange', function () {
      input.locked = document.pointerLockElement === canvas;
      // Losing the lock while playing (Esc) opens the pause menu.
      if (!input.locked && uiState === 'playing') openPause();
    });

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('beforeunload', function () {
      if (uiState !== 'start') saveGame(true);
    });
  }

  function handleEscape() {
    if (uiState === 'shop' || uiState === 'sell') { closeMenus(); return; }
    // Ignore the Esc that just released the pointer lock (it already opened the pause menu).
    if (uiState === 'paused' && performance.now() - pausedAt > 300) { resumeGame(); return; }
    if (uiState === 'playing') {
      // Normally the browser releases the lock itself on Esc (which opens the pause menu via
      // pointerlockchange); release it explicitly in case it didn't.
      if (input.locked && document.exitPointerLock) document.exitPointerLock();
      else openPause();
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    if (uiState === 'playing') {
      updatePlayer(dt);
      updateTime(dt);
      updateCrops(dt);
      updateAnimals(dt, t);
      updateTarget();
      autosaveTimer += dt;
      if (autosaveTimer >= AUTOSAVE_SECONDS) {
        autosaveTimer = 0;
        if (saveGame(true)) showToast('Autosaved');
      }
    } else if (uiState === 'start') {
      // Slow look-around behind the title screen.
      player.yaw += dt * 0.05;
      camera.rotation.set(-0.05, player.yaw, 0);
    }
    if (uiState !== 'start') updateHUD();
    updateTrees(dt);
    updateClouds(dt);
    updateViewModel(dt);
    updateSky();
    renderer.render(scene, camera);
  }

  function init() {
    if (typeof THREE === 'undefined') {
      document.getElementById('load-error').classList.remove('hidden');
      document.getElementById('btn-new').disabled = true;
      return;
    }
    initRenderer();
    buildWorld();
    bindUI();
    bindInput();
    newGame();               // populate the world for the title screen background
    showStartScreen();
    animate();
  }

  // Debug handle for the browser console (e.g. RanchGame.state().coins = 999).
  window.RanchGame = {
    state: function () { return state; },
    world: world,
    player: player,
    uiState: function () { return uiState; },
    save: function () { return saveGame(false); },
    load: loadGame,
    skipSeconds: simulateSkippedTime,
    getAction: function () { return currentAction; },
    getTarget: function () { return currentTarget && { type: currentTarget.info.type, point: currentTarget.point }; }
  };

  init();
})();
