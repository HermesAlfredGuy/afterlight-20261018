// AFTERLIGHT — procedural asset builders.
// Every mesh here is authored from a few deliberate silhouette families so that
// scale reads instantly at distance (see DESIGN.md, reference lesson #1/#6):
//   * island  : lumpy karst mesa, steep flanks, plateau crown
//   * spire   : tall wind-cut karst needle, clustered in pairs
//   * slab    : floating rock slab with an inverted cone keel
//   * arch    : stone aqueduct deck on piers (architecture, not accident)
//   * craft   : cream gull-wing glider with coral sail panels
import * as THREE from 'three';

/* ------------------------------------------------------------------ noise */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

export function makeNoise2D(seed) {
  return function (x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
    const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}

export function fbm2(noise, x, y, octaves = 3, gain = 0.5, lac = 2.0) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= gain; freq *= lac;
  }
  return sum / norm;
}

/* ------------------------------------------------------------- materials */
function linMaterial(color, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.86,
    metalness: opts.metalness ?? 0.0,
    flatShading: opts.flatShading ?? false,
    vertexColors: opts.vertexColors ?? false,
    side: opts.side ?? THREE.FrontSide,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
  m.color.convertSRGBToLinear?.();
  return m;
}

const shade = (hex, k) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c;
};

/** Vertical strata banding + damp base + crown blend, written as vertex colours. */
function paintRock(geo, rock, height, seed, opts = {}) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cTop = new THREE.Color(rock.top).convertSRGBToLinear();
  const cSide = new THREE.Color(rock.side).convertSRGBToLinear();
  const cStrata = new THREE.Color(rock.strata).convertSRGBToLinear();
  const cSand = new THREE.Color(rock.sand).convertSRGBToLinear();
  const cCrown = new THREE.Color(opts.crown ?? rock.crown).convertSRGBToLinear();
  const n = makeNoise2D(seed);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = THREE.MathUtils.clamp((y + height * 0.06) / height, 0, 1);
    const ang = Math.atan2(z, x);
    const jitter = fbm2(n, ang * 1.9 + 4.2, y * 0.012, 3) - 0.5;
    if (t < 0.045) tmp.copy(cSand);
    else if (t > 0.93) tmp.copy(cCrown);
    else {
      tmp.copy(cSide);
      const band = Math.abs(((y * 0.055 + jitter * 1.4) % 1) - 0.5) * 2; // 0..1
      tmp.lerp(cStrata, 0.34 * band);
      tmp.lerp(cTop, 0.14 * Math.max(0, jitter + 0.5));
    }
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/* -------------------------------------------------------------- islands */
/**
 * Sculptural island. Returns { group, collider } where collider is a generous
 * vertical cylinder used for readable, forgiving collision.
 */
export function makeIsland(spec) {
  const {
    radius = 200, height = 160, seed = 1, segments = 44, levels = 11,
    crownTint = null, beaches = true, roughness = 1,
  } = spec;
  const rock = spec.rock;
  const noise = makeNoise2D(seed * 977 + 13);
  const group = new THREE.Group();

  const verts = [], idx = [], rings = [];
  for (let j = 0; j <= levels; j++) {
    const t = j / levels;
    // steep flanks, flared wet base, small domed plateau
    let prof = 0.34 + 0.66 * Math.pow(1 - t, 0.62);
    if (t > 0.86) prof = 0.34 * (1 - (t - 0.86) / 0.14 * 0.09) + 0.02;
    if (t < 0.06) prof *= 1.16 + (0.06 - t) * 1.4;
    const y = height * Math.pow(t, 0.92) + (fbm2(noise, t * 3.3, 7.1, 2) - 0.5) * height * 0.035;
    const ring = [];
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const wob = fbm2(noise, Math.cos(a) * 1.7 + t * 1.1, Math.sin(a) * 1.7 + t * 0.7, 4) - 0.5;
      const wob2 = fbm2(noise, Math.cos(a) * 4.6, Math.sin(a) * 4.6 + t * 2.0, 2) - 0.5;
      const r = radius * prof * (1 + 0.20 * wob * roughness + 0.07 * wob2 * roughness);
      ring.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    rings.push(ring);
    for (const v of ring) verts.push(v.x, v.y, v.z);
  }
  const rowLen = segments + 1;
  for (let j = 0; j < levels; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * rowLen + i, b = a + 1, c = a + rowLen, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // crown cap
  const capIndex = verts.length / 3;
  const top = rings[levels];
  const capY = height * 1.0 + (fbm2(noise, 3.1, 2.2, 2) - 0.5) * height * 0.05 + height * 0.045;
  verts.push(0, capY, 0);
  for (let i = 0; i < segments; i++) {
    idx.push(capIndex, levels * rowLen + i, levels * rowLen + i + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  paintRock(geo, rock, height, seed * 31 + 7, { crown: crownTint || rock.crown });

  const bodyMat = linMaterial('#ffffff', { vertexColors: true, roughness: 0.95, flatShading: true });
  const body = new THREE.Mesh(geo, bodyMat);
  body.castShadow = true; body.receiveShadow = true;
  body.name = 'island-body';
  group.add(body);

  // crown grass field: a soft dome just above the cap so the top reads green
  const crownGeo = new THREE.SphereGeometry(radius * 0.31, 18, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
  crownGeo.scale(1, 0.12, 1);
  const crownMat = linMaterial(crownTint || rock.crown, { roughness: 0.95, flatShading: true });
  const crown = new THREE.Mesh(crownGeo, crownMat);
  crown.position.y = capY - radius * 0.008;
  crown.receiveShadow = true;
  crown.name = 'island-crown';
  group.add(crown);

  group.position.set(spec.x || 0, spec.baseY ?? -6, spec.z || 0);
  const collider = {
    x: spec.x || 0, z: spec.z || 0,
    r: radius * 0.80,
    baseR: radius,
    baseY: spec.baseY ?? -6,
    height,
    topY: capY + (spec.baseY ?? -6),
    kind: 'island',
  };
  return { group, collider, capY: capY + (spec.baseY ?? -6) };
}

/** Tall wind-cut karst needle. */
export function makeSpire(spec) {
  const { radius = 34, height = 300, seed = 5, rock, x = 0, z = 0 } = spec;
  const noise = makeNoise2D(seed * 331 + 5);
  const verts = [], idx = [];
  const segments = 22, levels = 12;
  for (let j = 0; j <= levels; j++) {
    const t = j / levels;
    let prof = Math.pow(1 - t, 0.78) * 0.9 + 0.12;
    if (t > 0.9) prof *= 1 - (t - 0.9) * 3.4;
    const y = height * t;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const wob = fbm2(noise, Math.cos(a) * 1.4 + t * 2.4, Math.sin(a) * 1.4 - t * 1.3, 3) - 0.5;
      const lean = Math.sin(t * 1.7 + seed) * 0.06 * height;
      const r = radius * prof * (1 + 0.32 * wob);
      verts.push(Math.cos(a) * r + lean * 0.4, y, Math.sin(a) * r + lean * 0.2);
    }
  }
  const row = segments + 1;
  for (let j = 0; j < levels; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const ci = verts.length / 3;
  verts.push(0, height * 1.01, 0);
  for (let i = 0; i < segments; i++) idx.push(ci, levels * row + i, levels * row + i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  paintRock(geo, rock, height, seed * 71 + 3);
  const mesh = new THREE.Mesh(geo, linMaterial('#ffffff', { vertexColors: true, flatShading: true, roughness: 0.95 }));
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.position.set(x, -6, z);
  return { mesh, collider: { x, z, r: radius * 0.72, baseR: radius, baseY: -6, height, topY: height * 0.94, kind: 'spire' } };
}

/** Floating rock slab over the void: inverted keel + flat crown. */
export function makeFloatingSlab(spec) {
  const { radius = 90, depth = 120, thickness = 16, seed = 9, rock, x = 0, y = 150, z = 0 } = spec;
  const noise = makeNoise2D(seed * 149 + 23);
  const group = new THREE.Group();
  const segments = 26, levels = 6;
  const verts = [], idx = [];
  for (let j = 0; j <= levels; j++) {
    const t = j / levels;
    const prof = Math.pow(1 - t, 0.55);
    const yy = -depth * t;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const wob = fbm2(noise, Math.cos(a) * 1.6 + t * 1.5, Math.sin(a) * 1.6, 3) - 0.5;
      const r = radius * (0.32 + 0.68 * prof) * (1 + 0.22 * wob);
      verts.push(Math.cos(a) * r, yy, Math.sin(a) * r);
    }
  }
  const row = segments + 1;
  for (let j = 0; j < levels; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const ci = verts.length / 3;
  verts.push(0, -depth * 1.12, 0);
  for (let i = 0; i < segments; i++) idx.push(ci, levels * row + i + 1, levels * row + i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  paintRock(geo, rock, depth, seed * 17 + 11);
  const keel = new THREE.Mesh(geo, linMaterial('#ffffff', { vertexColors: true, flatShading: true }));
  keel.castShadow = true;
  group.add(keel);

  const slabGeo = new THREE.CylinderGeometry(radius * 1.0, radius * 0.96, thickness, 26, 1);
  const slab = new THREE.Mesh(slabGeo, linMaterial(rock.top, { roughness: 0.9, flatShading: true }));
  slab.position.y = thickness * 0.5;
  slab.castShadow = true; slab.receiveShadow = true;
  group.add(slab);

  const lawnGeo = new THREE.CylinderGeometry(radius * 0.93, radius * 0.95, 2, 26, 1);
  const lawn = new THREE.Mesh(lawnGeo, linMaterial(rock.crown, { roughness: 0.95, flatShading: true }));
  lawn.position.y = thickness + 1;
  lawn.receiveShadow = true;
  group.add(lawn);

  group.position.set(x, y, z);
  return { group, collider: { x, z, r: radius * 0.82, topY: y + thickness + 1, kind: 'slab', airborne: true } };
}

/* ---------------------------------------------------------- vegetation */
/** Wind-shaped umbrella pine: trunk + stacked flattened crowns (silhouette family). */
export function makePineTree(rock, seed = 1, scale = 1) {
  const g = new THREE.Group();
  const n = makeNoise2D(seed * 91 + 3);
  const trunkMat = linMaterial(rock.strata, { roughness: 0.9, flatShading: true });
  const leafMat = linMaterial(rock.crownAlt, { roughness: 0.95, flatShading: true });
  const h = (7 + n(seed, 1) * 5) * scale;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * scale, 0.9 * scale, h, 6, 1), trunkMat);
  trunk.position.y = h * 0.5; trunk.castShadow = true;
  g.add(trunk);
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const r = (4.6 - i * 0.9) * scale * (0.85 + n(i, seed) * 0.3);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, 2.6 * scale, 7, 1), leafMat);
    cone.position.set((n(i, 2) - 0.5) * scale * 1.4, h * (0.72 + i * 0.16), (n(i, 3) - 0.5) * scale * 1.4);
    cone.castShadow = true;
    g.add(cone);
  }
  return g;
}

/** Palm for beaches and reef atolls. */
export function makePalm(rock, seed = 1, scale = 1) {
  const g = new THREE.Group();
  const n = makeNoise2D(seed * 57 + 9);
  const trunkMat = linMaterial(rock.strata, { roughness: 0.92, flatShading: true });
  const leafMat = linMaterial(rock.crownAlt, { roughness: 0.95, flatShading: true });
  const h = (9 + n(1, seed) * 4) * scale;
  const bend = (n(2, seed) - 0.5) * 0.4;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * scale, 0.62 * scale, h, 6, 1), trunkMat);
  trunk.position.y = h * 0.5;
  trunk.rotation.z = bend;
  trunk.castShadow = true;
  g.add(trunk);
  for (let i = 0; i < 7; i++) {
    const frond = new THREE.Mesh(new THREE.ConeGeometry(0.75 * scale, 6.4 * scale, 4, 1), leafMat);
    frond.position.set(0, h, 0);
    frond.rotation.z = Math.PI * 0.5 - 0.35 - n(i, 4) * 0.35;
    frond.rotation.y = (i / 7) * Math.PI * 2;
    frond.rotateOnAxis(new THREE.Vector3(0, 0, 1), 0);
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / 7) * Math.PI * 2;
    const f2 = frond.clone();
    f2.position.set(2.8 * scale, h + 0.5, 0);
    f2.rotation.set(0, 0, Math.PI * 0.5 - 0.5);
    pivot.add(f2);
    g.add(pivot);
  }
  return g;
}

/* -------------------------------------------------------- architecture */
/** Stepped stone town on a terrace edge — the hero island's inhabited face. */
export function makeTerraceTown(rock, seed = 3) {
  const g = new THREE.Group();
  const n = makeNoise2D(seed * 13 + 5);
  const wallMat = linMaterial(rock.top, { roughness: 0.88, flatShading: true });
  const roofMat = linMaterial(rock.strata, { roughness: 0.8, flatShading: true });
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    const y = 6 + r * 11;
    const radiusX = 96 - r * 7;
    const depth = 26 - r * 2;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(radiusX * 2, 10, depth), wallMat);
    wall.position.set(0, y, -radiusX * 0.78 + r * 6);
    wall.castShadow = true; wall.receiveShadow = true;
    g.add(wall);
    for (let c = 0; c < 7; c++) {
      const house = new THREE.Mesh(new THREE.BoxGeometry(9 + n(c, r) * 4, 7, 8), wallMat);
      house.position.set((c - 3) * 15 + (n(c, r + 9) - 0.5) * 6, y + 8.5, -radiusX * 0.78 + r * 6 + (n(r, c) - 0.5) * 5);
      house.castShadow = true;
      g.add(house);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(8, 5, 4, 1), roofMat);
      roof.position.copy(house.position);
      roof.position.y += 6;
      roof.rotation.y = Math.PI * 0.25;
      roof.castShadow = true;
      g.add(roof);
    }
  }
  return g;
}

/** Lighthouse with a stone gallery, an emissive lamp and a rotating beam. */
export function makeLighthouse(rock, height = 46) {
  const g = new THREE.Group();
  const stone = linMaterial(rock.top, { roughness: 0.85, flatShading: true });
  const dark = linMaterial(rock.strata, { roughness: 0.75, flatShading: true });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 7.5, height, 10, 1), stone);
  shaft.position.y = height * 0.5; shaft.castShadow = true;
  g.add(shaft);
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 2.4, 10, 1), dark);
  gallery.position.y = height + 1.0; gallery.castShadow = true;
  g.add(gallery);
  const lampMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fff0c6'), emissive: new THREE.Color('#ffd489'),
    emissiveIntensity: 2.6, roughness: 0.4, metalness: 0.0,
  });
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.2, 5.4, 10, 1), lampMat);
  lamp.position.y = height + 4.6;
  g.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(5.4, 6, 10, 1), dark);
  cap.position.y = height + 10.2; cap.castShadow = true;
  g.add(cap);

  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(9, 240, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffdba6'), transparent: true, opacity: 0.10,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  beam.rotation.z = Math.PI * 0.5;
  beam.position.set(120, height + 4.6, 0);
  const beacon = new THREE.Group();
  beacon.add(beam);
  beacon.position.y = 0;
  g.add(beacon);
  return { group: g, beacon, lamp };
}

/** Stone aqueduct: piers + arched deck you can fly beneath. */
export function makeAqueduct(rock, span = 300, deckY = 116, seed = 6) {
  const g = new THREE.Group();
  const n = makeNoise2D(seed * 37 + 21);
  const stone = linMaterial(rock.top, { roughness: 0.9, flatShading: true });
  // dusk fill: the underside of a span must not read as a black hole
  stone.emissive = new THREE.Color('#2c2318');
  stone.emissiveIntensity = 0.3;
  const darkMat = linMaterial(rock.strata, { roughness: 0.85, flatShading: true });
  const piers = 4;
  for (let i = 0; i <= piers; i++) {
    const t = i / piers;
    const x = -span * 0.5 + span * t;
    const h = deckY - 6 + (n(i, 3) - 0.5) * 8;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(12, h, 14), stone);
    pier.position.set(x, h * 0.5 - 8, 0);
    pier.castShadow = true; pier.receiveShadow = true;
    g.add(pier);
    if (i < piers) {
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(span / piers * 0.5, 4.2, 6, 14, Math.PI),
        darkMat
      );
      arch.position.set(x + (span / piers) * 0.5, deckY - 8, 0);
      arch.castShadow = true;
      g.add(arch);
    }
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(span * 1.04, 7, 17), stone);
  deck.position.set(0, deckY - 2, 0);
  deck.castShadow = true; deck.receiveShadow = true;
  g.add(deck);
  for (let i = 0; i < 12; i++) {
    const x = -span * 0.5 + (span / 11) * i;
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.4, 5, 1.4), darkMat);
    post.position.set(x, deckY + 4.5, 7.5);
    g.add(post);
  }
  return { group: g, archY: deckY - 8, span };
}

/** Floating temple pavilion — the architectural landmark in the sky. */
export function makePavilion(rock, radius = 46, seed = 4) {
  const g = new THREE.Group();
  const n = makeNoise2D(seed * 53 + 17);
  const stone = linMaterial(rock.top, { roughness: 0.88, flatShading: true });
  const dark = linMaterial(rock.strata, { roughness: 0.8, flatShading: true });
  const cloth = linMaterial('#f0e2c6', { roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.CylinderGeometry(radius * (1 - i * 0.16), radius * (1 - i * 0.14), 5, 20, 1), stone);
    step.position.y = i * 5;
    step.castShadow = true; step.receiveShadow = true;
    g.add(step);
  }
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.62, radius * 0.66, 4, 20, 1), stone);
  deck.position.y = 17; deck.receiveShadow = true;
  g.add(deck);
  const cols = 10;
  for (let i = 0; i < cols; i++) {
    const a = (i / cols) * Math.PI * 2;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 17, 8, 1), dark);
    col.position.set(Math.cos(a) * radius * 0.5, 27, Math.sin(a) * radius * 0.5);
    col.castShadow = true;
    g.add(col);
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.78, 20, 10, 1), dark);
  roof.position.y = 45; roof.castShadow = true;
  g.add(roof);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 6), stone);
  finial.position.y = 57;
  g.add(finial);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(3, 12), cloth);
    banner.position.set(Math.cos(a) * radius * 0.68, 15, Math.sin(a) * radius * 0.68);
    banner.rotation.y = -a + Math.PI * 0.5;
    banner.userData.flutter = { seed: i, a };
    g.add(banner);
  }
  return { group: g, height: 60 };
}

/** Halo Beacon: the finish. A ring platform with an emissive halo. */
export function makeHaloBeacon(rock, radius = 26) {
  const g = new THREE.Group();
  const stone = linMaterial(rock.top, { roughness: 0.85, flatShading: true });
  const darkStone = linMaterial(rock.strata, { roughness: 0.9, flatShading: true });

  // Needle under the platform: the beacon must be a landmark from the far side of the sea.
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius * 2.1, 150, 9, 1), darkStone);
  needle.position.y = -78;
  needle.scale.set(1, 1, 0.62);
  g.add(needle);

  // Central spire above the platform: the silhouette you steer by.
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(1.1, radius * 0.62, 52, 7, 1), stone);
  spire.position.y = 30;
  spire.castShadow = true;
  g.add(spire);

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.15, 7, 22, 1), stone);
  platform.receiveShadow = true;
  g.add(platform);

  const ringMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fff3d2'), emissive: new THREE.Color('#ffd58f'),
    emissiveIntensity: 2.2, roughness: 0.5,
  });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.86, 1.2, 6, 30), ringMat);
  halo.rotation.x = Math.PI * 0.5;
  halo.position.y = 15;
  g.add(halo);

  // Outer counter-rotating ring: the "halo" the finish is named for.
  const outerMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffe9c4'), emissive: new THREE.Color('#ffb371'),
    emissiveIntensity: 1.1, roughness: 0.6,
  });
  const outer = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.32, 0.55, 6, 34), outerMat);
  outer.rotation.x = Math.PI * 0.5;
  outer.position.y = 27;
  g.add(outer);

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 30, 6, 1), stone);
    mast.position.set(Math.cos(a) * radius * 0.55, 20, Math.sin(a) * radius * 0.55);
    mast.castShadow = true;
    g.add(mast);
  }

  // Pennants off the mastheads: warm cloth that catches the last light.
  const pennants = [];
  const clothMat = linMaterial('#e2704a', { roughness: 0.95, side: THREE.DoubleSide, flatShading: true });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.4, 1, 3), clothMat);
    p.position.set(Math.cos(a) * radius * 0.55, 34, Math.sin(a) * radius * 0.55);
    p.rotation.y = a;
    p.userData.phase = i * 1.7;
    pennants.push(p);
    g.add(p);
  }

  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.0, radius * 1.9, 200, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffd9a0'), transparent: true, opacity: 0.085,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  glow.position.y = 96;
  g.add(glow);

  return { group: g, halo, outer, glow, pennants };
}

/* ------------------------------------------------------------- the craft */
/** Soft round shadow blob used to ground the craft on the swell. */
export function makeContactShadow(color = '#08222b') {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.42)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: tex, color: new THREE.Color(color), transparent: true, opacity: 0.3,
      depthWrite: false, blending: THREE.NormalBlending,
    })
  );
  mesh.rotation.x = -Math.PI * 0.5;
  mesh.frustumCulled = false;
  return mesh;
}
/** Painted number, mirrored for the port panel so both sides read. */
function sailNumberTexture(text, mirror = false) {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, s, s);
  if (mirror) { ctx.translate(s, 0); ctx.scale(-1, 1); }
  ctx.fillStyle = 'rgba(74,52,38,0.88)';
  ctx.font = '600 84px "Cormorant Garamond", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, s / 2, s * 0.54);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Airframe dimensions shared by the rig, the animator and the probes. */
export const CRAFT_RIG = {
  elevonSpan: 4.7,
  elevonChord: 1.5,     // pass 2b: 1.05 read as sub-pixel at chase distance
  elevonThick: 0.16,
  flexPivotX: 4.2,      // wing-root line the outer panel flexes about
  flexPivotY: 0.9,
  ribbonRows: 14,
  ribbonSegs: 13,
  ribbonW: 0.92,
  ribbonLen: 9.2,
  // Pass 2b authority (deg -> rad). A 9 deg deflection on a 1.05 chord at 30 m sits under a
  // pixel; 24/18/28 deg on a 1.5 chord with a dark body and a bright aft edge does not.
  maxElevon: 0.419,     // 24 deg, both-together pitch deflection
  maxAileron: 0.314,    // 18 deg, differential roll deflection
  maxRudder: 0.489,     // 28 deg
  maxFlex: 0.150,       // 8.6 deg of outer-panel bend at full load: a bend you can see at chase
                        // distance; 3 deg read as rigid and 5.4 deg still needed a ruler
};

/**
 * The craft's grazing-angle rim. One shared uniform pair so a probe (or the menu) can A/B
 * the term on real pixels: it is the only thing that keeps the dark keel and the shaded
 * undersides apart from dark rock at the lighthouse, where silhouette-by-value loses.
 */
export const CRAFT_RIM = { k: { value: 1 }, color: { value: new THREE.Color('#ffd2a0') }, power: { value: 2.6 } };

/** Add the rim to a standard material: brightens fragments whose normal grazes the view ray. */
function rimmed(mat, k) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimK = CRAFT_RIM.k;
    shader.uniforms.uRimC = CRAFT_RIM.color;
    shader.uniforms.uRimP = CRAFT_RIM.power;
    shader.uniforms.uRimW = { value: k };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRimK;\nuniform float uRimW;\nuniform float uRimP;\nuniform vec3 uRimC;')
      .replace('#include <opaque_fragment>', `{
        float graze = 1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0);
        outgoingLight += uRimC * (uRimK * uRimW * pow(graze, uRimP));
      }
      #include <opaque_fragment>`);
  };
  // Materials that share a program would share the injected constants, so key them apart.
  mat.customProgramCacheKey = () => 'al-rim-' + k;
  return mat;
}

/** Root-to-tip alpha ramp for the vapour ribbon (u is across, v runs root -> tip). */
function taperTexture() {
  const h = 128;
  const c = document.createElement('canvas');
  c.width = 4; c.height = h;
  const ctx = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    // image top (y=0) is v=1, which is the strip's root at the tail
    const t = 1 - y / (h - 1);
    const a = Math.pow(1 - t, 0.85) * 0.92 + 0.08;
    ctx.fillStyle = `rgb(${Math.round(a * 255)},${Math.round(a * 255)},${Math.round(a * 255)})`;
    ctx.fillRect(0, y, 4, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * "Skimmer" — cream gull-wing glider, coral sail panels, dark keel.
 *
 * Pass 2 gives the airframe a real rig so the animation state machine has something to
 * drive: hinged elevons at the wing trailing edges, a hinged rudder on the fin, outer
 * wing panels that bend about the wing-root line, and a 13-segment trail ribbon whose
 * vertices are rewritten every physics substep (a strip, not a plank).
 *
 * Returns `{ group, ribbon, tipGlow, rig }` where rig exposes the setters.
 */
export function makeCraft(look) {
  const g = new THREE.Group();
  const rig = CRAFT_RIG;
  const sail = rimmed(linMaterial(look.craft.sail, { roughness: 0.62, flatShading: true, side: THREE.DoubleSide }), 0.30);
  // Dusk sails catch light like lit paper, but pass 1's flat 0.7 emissive wash erased every
  // shading cue (top and bottom read the same). The lift is now small, so the key/rim and the
  // hemispheric ground term are what separate the lit top from the shaded underside.
  sail.emissive = new THREE.Color('#4a3116');
  sail.emissiveIntensity = 0.24;
  const accent = rimmed(linMaterial(look.craft.accent, { roughness: 0.72, flatShading: true, side: THREE.DoubleSide }), 0.26);
  const keelCol = new THREE.Color(look.craft.keel).multiplyScalar(0.68);   // darker keel: silhouette, not sludge
  const keel = rimmed(linMaterial(keelCol, { roughness: 0.48, metalness: 0.18, flatShading: true }), 0.62);
  const boom = rimmed(linMaterial(look.craft.boom, { roughness: 0.6, flatShading: true }), 0.55);
  // Control surfaces: a coral body with a bright cream aft edge. The contrast between the two is
  // what makes a deflection read at chase distance, where a same-tone flap on a same-tone wing
  // is a 2 px shift nobody sees.
  // Movable surfaces are coral, fixed structure is cream and keel: one glance tells you what the
  // stick is moving. (A dark flap on a cream wing reads as shadow, not as a surface.)
  const srf = rimmed(linMaterial(new THREE.Color(look.craft.accent).multiplyScalar(0.92),
    { roughness: 0.62, metalness: 0.05, flatShading: true, side: THREE.DoubleSide }), 0.35);
  const srfEdge = linMaterial('#fff3d8', { roughness: 0.5, flatShading: true });
  srfEdge.emissive = new THREE.Color('#ffcf9a');
  srfEdge.emissiveIntensity = 0.55;
  // The hinge line: a dark slot the surface swings across, so the gap itself is legible.
  const gap = linMaterial(new THREE.Color('#150f10').multiplyScalar(1), { roughness: 0.9, flatShading: true });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.85, 6.4, 8, 1), keel);
  body.rotation.x = Math.PI * 0.5;
  body.castShadow = true;
  g.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2.6, 8, 1), keel);
  nose.rotation.x = Math.PI * 0.5;
  nose.position.z = -4.4;
  g.add(nose);

  const tailBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.28, 5.2, 6, 1), boom);
  tailBoom.rotation.x = Math.PI * 0.5;
  tailBoom.position.z = 5.4;
  g.add(tailBoom);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3.4, 4, 1), accent);
  tail.position.set(0, 0.2, 8.2);
  tail.rotation.z = Math.PI * 0.5;
  tail.scale.set(1, 1, 0.28);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.6), sail);
  fin.position.set(0, 1.5, 7.6);
  fin.rotation.y = Math.PI * 0.5;
  g.add(fin);

  // gull wings: inner dihedral panel + outer panel, both with coral sail cloth
  const elevons = [];
  const flex = [];
  for (const s of [-1, 1]) {
    const inner = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.5, 2.5), sail);
    inner.position.set(s * 2.5, 0.55, 0.2);
    inner.rotation.z = -s * 0.22;
    inner.castShadow = true;
    g.add(inner);

    // --- outer panel: every piece is registered so the whole panel can bend rigidly
    //     about the wing-root line (wing flex) without restarting the silhouette.
    const parts = [];
    const reg = (mesh) => {
      parts.push({ mesh, x: mesh.position.x, y: mesh.position.y, rz: mesh.rotation.z });
      return mesh;
    };

    const outer = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.42, 1.9), sail);
    outer.position.set(s * 6.6, 1.35, 0.6);
    outer.rotation.z = -s * 0.16;
    outer.castShadow = true;
    g.add(outer); reg(outer);

    // Shoulder fairing: the gull wing steps up from the inner panel to the raised outer panel.
    // Without this the step reads as two planks stacked at different heights; with it the break
    // is a faceted joint, which is the low-poly language the rest of the craft uses.
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.44, 2.3), sail);
    shoulder.position.set(s * 4.45, 0.95, 0.45);
    shoulder.rotation.z = -s * 0.38;
    shoulder.castShadow = true;
    g.add(shoulder); reg(shoulder);

    // sunlit leading edge: the rim that keeps the small craft legible against dark water
    const edgeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#fff3d8'), emissive: new THREE.Color('#ffcf9a'),
      emissiveIntensity: 0.6, roughness: 0.5,
    });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.11, 0.26), edgeMat);
    edge.position.set(s * 6.6, 1.42, -0.32);
    edge.rotation.z = -s * 0.16;
    g.add(edge); reg(edge);
    // rear edge: the chase camera sees the trailing edge, so it carries the rim too
    const trail = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.13, 0.3), edgeMat);
    trail.position.set(s * 6.6, 1.3, 1.55);
    trail.rotation.z = -s * 0.16;
    g.add(trail); reg(trail);

    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 3.0), accent);
    panel.position.set(s * 8.6, 1.7, 1.1);
    panel.castShadow = true;
    g.add(panel); reg(panel);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.2, 0.16), edgeMat);
    tip.position.set(s * 9.45, 2.15, 0.9);
    g.add(tip); reg(tip);

    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.9, 5, 1), boom);
    strut.position.set(s * 4.5, 0.78, 0.4);
    strut.rotation.z = -s * (Math.PI * 0.5 - 0.35);
    g.add(strut); reg(strut);

    // painted number on the sail: a readable material detail when the camera closes in
    const num = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({
        map: sailNumberTexture('07', s > 0), transparent: true, depthWrite: false,
        color: new THREE.Color('#ffffff'),
      })
    );
    num.position.set(s * 7.2, 1.575, 0.55);
    num.rotation.x = -Math.PI * 0.5;
    num.rotation.z = -s * 0.16;
    g.add(num); reg(num);

    // --- elevon: hinged ON the wing's trailing edge, hanging aft, so its aft edge sweeps
    //     up/down in the chase camera's view — the stick's answer, in silhouette. Pass 2b:
    //     1.5 chord, 0.16 thick, dark body, bright aft strip, and a dark hinge slot behind it.
    const pivot = new THREE.Group();
    pivot.position.set(s * 6.6, 1.30, 1.70);
    pivot.rotation.z = -s * 0.16;
    const flap = new THREE.Mesh(new THREE.BoxGeometry(rig.elevonSpan, rig.elevonThick, rig.elevonChord), srf);
    flap.position.set(0, 0, rig.elevonChord * 0.5);
    flap.castShadow = true;
    pivot.add(flap);
    const flapEdge = new THREE.Mesh(new THREE.BoxGeometry(rig.elevonSpan + 0.04, 0.2, 0.2), srfEdge);
    flapEdge.position.set(0, 0, rig.elevonChord - 0.09);
    pivot.add(flapEdge);
    g.add(pivot); reg(pivot);
    elevons.push({ side: s, pivot });

    // The hinge slot: a dark bar sitting under the surface's leading edge. When the surface
    // swings it opens a black gap that is visible from any angle — the deflection's own shadow.
    const slot = new THREE.Mesh(new THREE.BoxGeometry(rig.elevonSpan + 0.06, 0.22, 0.16), gap);
    slot.position.set(s * 6.6, 1.255, 1.66);
    slot.rotation.z = -s * 0.16;
    g.add(slot); reg(slot);

    // The wing-root pivot line: a dark seam plus a hinge barrel, so the outer panel reads as a
    // separate, moving piece rather than part of one rigid plank.
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 2.9), gap);
    seam.position.set(s * rig.flexPivotX, 0.88, 0.5);
    seam.rotation.z = -s * 0.22;
    g.add(seam);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.6, 6, 1), boom);
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.set(s * rig.flexPivotX, 0.95, 0.5);
    g.add(barrel);

    flex.push({ side: s, pivot: { x: s * rig.flexPivotX, y: rig.flexPivotY }, parts });
  }

  // --- rudder: hinged on the fin's trailing edge, aft edge swings left/right. Pass 2b: a
  //     deeper dark blade with a bright aft strip and a dark base slot, so 28 deg of travel
  //     changes both the silhouette and the light.
  const rudderPivot = new THREE.Group();
  rudderPivot.position.set(0, 1.7, 8.02);
  const rFlap = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.05, 1.35), srf);
  rFlap.position.set(0, 0, 0.675);
  rFlap.castShadow = true;
  rudderPivot.add(rFlap);
  const rAft = new THREE.Mesh(new THREE.BoxGeometry(0.17, 2.1, 0.2), srfEdge);
  rAft.position.set(0, 0, 1.28);
  rudderPivot.add(rAft);
  g.add(rudderPivot);
  const rSlot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.2, 0.18), gap);
  rSlot.position.set(0, 1.7, 7.94);
  g.add(rSlot);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.8), keel);
  seat.position.set(0, 0.7, 1.6);
  g.add(seat);

  // Wind ribbon: a 13-segment strip that trails the craft. It used to be a flat plank; the
  // animator writes one lateral and one vertical offset per row, so it curls and lags down its
  // length and reads as moving air rather than a board bolted to the tail.
  //
  // Pass 2b: it used to be AdditiveBlending at 0.26 — which is why it read as a glowing UI
  // tether instead of vapour. Now it is a normal-blended, root-to-tip tapered, unlit strip,
  // and it is built as a CROSS of two strips sharing one geometry: a flat one reads edge-on
  // to a chase camera in any bank, so the vertical partner is what makes it a volume.
  const ribRows = rig.ribbonRows;
  const ribLen = rig.ribbonLen;
  const ribGeo = new THREE.PlaneGeometry(rig.ribbonW, ribLen, 2, rig.ribbonSegs);
  const ribbonMat = new THREE.MeshBasicMaterial({
    color: shade(look.craft.sail, 0.96), transparent: true, opacity: 0.5,
    alphaMap: taperTexture(), depthWrite: false, side: THREE.DoubleSide,
  });
  const ribbon = new THREE.Group();
  const ribFlat = new THREE.Mesh(ribGeo, ribbonMat);
  ribFlat.rotation.x = -Math.PI * 0.5;
  const ribUpright = new THREE.Mesh(ribGeo, ribbonMat);
  // local x -> craft y (upright), local y -> craft -z (same root/tip direction as the flat
  // strip), local z -> craft -x. Built as an explicit basis so the two strips cannot disagree.
  ribUpright.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().set(0, 0, -1, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 1));
  ribbon.add(ribFlat, ribUpright);
  ribbon.position.set(0, 0.2, 9);
  ribbon.frustumCulled = false;      // the tail swings outside the flat strip's bounds
  g.add(ribbon);

  const ribbonRig = {
    rows: ribRows,
    cols: 3,
    segLen: ribLen / rig.ribbonSegs,
    halfW: rig.ribbonW * 0.5,
    geo: ribGeo,
    mat: ribbonMat,
    /**
     * xs/zs: per-row lateral (craft-x) and vertical (craft-y) offsets.
     * widthK: taper along the strip. flare: 0..1 gust flare (wider + deeper fold).
     */
    write(xs, zs, widthK, flare) {
      const arr = ribGeo.attributes.position.array;
      const w = rig.ribbonW * 0.5 * widthK * (1 + flare * 0.85);
      const fold = -0.05 * (1 + flare * 2.2);
      for (let r = 0; r < ribRows; r++) {
        const t = r / (ribRows - 1);
        const wk = w * (1 - 0.42 * t);
        for (let c = 0; c < 3; c++) {
          const i = (r * 3 + c) * 3;
          arr[i] = (c - 1) * wk + xs[r];
          arr[i + 2] = zs[r] + (c === 1 ? fold : fold * 0.25);
        }
      }
      ribGeo.attributes.position.needsUpdate = true;
    },
    dispose() { ribGeo.dispose(); ribbonMat.alphaMap?.dispose(); ribbonMat.dispose(); },
  };

  const tipGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 8, 6),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#fff4dc'), emissive: new THREE.Color('#ffd79a'), emissiveIntensity: 1.25 })
  );
  tipGlow.position.set(0, 0.4, -4.6);
  g.add(tipGlow);

  return {
    group: g,
    ribbon,
    tipGlow,
    lamp: tipGlow.material,
    rim: CRAFT_RIM,
    rig: {
      elevons,
      rudder: rudderPivot,
      flex,
      ribbon: ribbonRig,
      /** Aft edge lifts for positive input on both panels. */
      setElevons(both, differential) {
        for (const e of elevons) {
          const a = both + differential * e.side;
          e.pivot.rotation.x = THREE.MathUtils.clamp(a, -0.78, 0.78);
        }
      },
      setRudder(a) { rudderPivot.rotation.y = THREE.MathUtils.clamp(a, -0.52, 0.52); },
      /** phi >= 0 raises both tips; each outer panel rotates rigidly about its root line. */
      setFlex(phi, rollDelta) {
        for (const f of flex) {
          const a = f.side * phi + f.side * rollDelta;
          const c = Math.cos(a), sn = Math.sin(a);
          for (const p of f.parts) {
            const dx = p.x - f.pivot.x, dy = p.y - f.pivot.y;
            p.mesh.position.x = f.pivot.x + dx * c - dy * sn;
            p.mesh.position.y = f.pivot.y + dx * sn + dy * c;
            p.mesh.rotation.z = p.rz + a;
          }
        }
      },
    },
  };
}

/* ----------------------------------------------------------------- gates */
function gatePlaqueTexture(number, look) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#f6ecd6';
  ctx.beginPath();
  ctx.roundRect(18, 26, 220, 76, 14);
  ctx.fill();
  ctx.strokeStyle = '#8c7250';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#3b3226';
  ctx.font = '600 62px "Cormorant Garamond", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 128, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * A gate ring: stone torus + cloth streamers + a soft inner veil + ivory plaque.
 */
export function makeGate(index, look, radius = 9.5) {
  const g = new THREE.Group();
  // Ring material is per gate so the active ring can be lit cream while the rest fade to slate.
  const ringMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(look.craft.sail), emissive: new THREE.Color(look.craft.accent),
    emissiveIntensity: 0.02, roughness: 0.78, flatShading: true,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.02, 1.0, 7, 30), ringMat);
  ring.castShadow = true;
  g.add(ring);

  // Emissive band: the active ring must be unmistakable at a glance.
  const bandMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(look.craft.sail), emissive: new THREE.Color(look.craft.accent),
    emissiveIntensity: 0.2, roughness: 0.5, flatShading: false,
  });
  const band = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.16, 0.5, 6, 30), bandMat);
  g.add(band);

  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(look.craft.accent), transparent: true, opacity: 0.13,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const veil = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.98, 30), glowMat);
  g.add(veil);

  // Approach chevrons: three coral pennants that point along the flight line.
  const chevrons = [];
  const chevMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(look.craft.accent), transparent: true, opacity: 0.85,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(1.9 - i * 0.35, 2.6 - i * 0.4), chevMat);
    c.position.set(0, -radius * 0.42 + i * 0.9, -(radius * 0.55 + i * 2.6));
    c.rotation.x = -0.35;
    chevrons.push(c);
    g.add(c);
  }

  const streamers = [];
  const cloth = linMaterial(look.craft.accent, { roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 5.5, 1, 4), cloth);
    s.position.set(Math.cos(a) * radius, -radius * 0.6, Math.sin(a) * radius);
    s.userData.phase = i * 1.3 + index * 0.7;
    streamers.push(s);
    g.add(s);
  }

  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 2.1),
    new THREE.MeshBasicMaterial({ map: gatePlaqueTexture(index + 1, look), transparent: true, side: THREE.DoubleSide })
  );
  plaque.position.set(0, radius + 1.9, 0);
  g.add(plaque);

  return { group: g, glowMat, bandMat, ringMat, chevrons, streamers, radius, plaque };
}

/* ------------------------------------------------------ coral sail ships */
/** Drifting coral-sail courier ship: the warm moving accent in the vista. */
export function makeSailShip(look, scale = 1) {
  const g = new THREE.Group();
  const hullMat = linMaterial(look.craft.boom, { roughness: 0.7, flatShading: true });
  const sailMat = linMaterial(look.craft.accent, { roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
  const mastMat = linMaterial('#3c352c', { roughness: 0.7, flatShading: true });
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(3.4 * scale, 2.2 * scale, 22 * scale, 7, 1), hullMat);
  hull.rotation.z = Math.PI * 0.5;
  hull.scale.set(1, 1, 0.55);
  hull.castShadow = true;
  g.add(hull);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * scale, 0.5 * scale, 22 * scale, 5, 1), mastMat);
  mast.position.y = 11 * scale;
  g.add(mast);
  for (const [dir, len] of [[-1, 13], [1, 10]]) {
    const sail = new THREE.Mesh(new THREE.ConeGeometry(4.4 * scale, len * scale, 3, 1), sailMat);
    sail.position.set(0, (13 + dir * 2) * scale, dir * 3 * scale);
    sail.scale.set(1, 1, 0.22);
    sail.rotation.z = Math.PI;
    sail.castShadow = true;
    g.add(sail);
  }
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4 * scale, 0.9 * scale), sailMat);
  flag.position.set(0, 23 * scale, 0);
  g.add(flag);
  return { group: g, scale };
}

/* --------------------------------------------------------- atmosphere */
export function makeCloudTexture(color = '#ffd9b3', seed = 5) {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n = makeNoise2D(seed * 61 + 3);
  const base = new THREE.Color(color);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const rr = Math.hypot(u - 0.5, v - 0.5) * 2;
      let a = fbm2(n, u * 3.2, v * 3.2, 4) * 1.15;
      a *= Math.pow(Math.max(0, 1 - rr), 0.7);
      a = THREE.MathUtils.clamp((a - 0.28) * 2.4, 0, 1);
      const i = (y * size + x) * 4;
      img.data[i] = base.r * 255; img.data[i + 1] = base.g * 255; img.data[i + 2] = base.b * 255;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeSoftSprite(color = '#ffe6c0') {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function applyInkOutline(mesh, scale = 1.03, color = '#2b2620') {
  const outline = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.BackSide })
  );
  outline.scale.multiplyScalar(scale);
  outline.renderOrder = -1;
  mesh.add(outline);
  return outline;
}
