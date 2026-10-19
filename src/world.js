// AFTERLIGHT — world: sky, sea, archipelago, landmarks, gates, life.
// Layout follows the composition brief: one hero landmass 3-5x the satellites,
// satellites as progression steps, deep water as negative space, foam only at
// edges and hazards so the route is readable from altitude.
import * as THREE from 'three';
import * as P from './procgen.js';
import { aerialGLSL, applyAerialTo, hazeColor, coolColor } from './atmosphere.js';

export const COURSE = {
  start: { x: 0, y: 252, z: -150, heading: Math.PI },
  gates: [
    { x: 0, y: 206, z: -350, yaw: Math.PI, note: 'off the north cliff' },
    { x: -230, y: 178, z: -470, yaw: Math.PI * 1.18, note: 'over the channel' },
    { x: -430, y: 162, z: -565, yaw: Math.PI * 1.34, note: 'the reef run' },
    { x: -600, y: 148, z: -390, yaw: Math.PI * 1.74, note: 'atoll lagoon' },
    { x: -380, y: 92, z: -170, yaw: Math.PI * 0.16, note: 'under the aqueduct' },
    { x: -540, y: 118, z: 60, yaw: 0.28, note: 'along the west wall' },
    { x: -330, y: 106, z: 250, yaw: 0.62, note: 'low over the swell' },
    { x: -90, y: 98, z: 340, yaw: 0.95, note: 'south crossing' },
    { x: 200, y: 104, z: 330, yaw: 1.32, note: 'the pine islet' },
    { x: 520, y: 148, z: 380, yaw: 1.5, note: 'between the spires' },
    { x: 710, y: 120, z: 120, yaw: 2.25, note: 'past the high slab' },
    { x: 620, y: 120, z: -180, yaw: 2.62, note: 'east wall' },
    { x: 480, y: 140, z: -520, yaw: 3.05, note: 'long climb' },
    { x: 420, y: 172, z: -860, yaw: 3.42, note: 'beacon approach' },
  ],
  beacon: { x: 280, y: 168, z: -760, radius: 46 },
};

export const LANDMARKS = {
  hero: { x: 0, z: 0, radius: 300, height: 200 },
  spires: { x: 520, z: 380 },
  atoll: { x: -620, z: -320, radius: 190, height: 34 },
  slabHigh: { x: 620, y: 205, z: -300, radius: 62 },
  slabTemple: { x: -300, y: 172, z: -650, radius: 96 },
  islet: { x: -900, z: 430, radius: 145, height: 96 },
  finish: { x: 280, z: -760, radius: 170, height: 150 },
  // The aqueduct centre is deliberately placed so its braced bay straddles gate 5 (the ring
  // under the arch at -380/92/-170): 37.5 m to the nearest pier on either side, 63 m of clear
  // span, ring fully below the deck. It used to be centred ON the gate, which buried the ring
  // inside a 12 m pier and flew the craft through solid stone.
  aqueduct: { x: -413.1, z: -152.3, yaw: Math.PI * 1.156, deckY: 128, span: 300 },
};

const SEA_SHADER = {
  uniforms: {
    uTime: { value: 0 },
    uWaveHeight: { value: 1.15 },
    uChoppy: { value: 1 },
    uShallow: { value: new THREE.Color('#2fc0a0') },
    uMid: { value: new THREE.Color('#17807e') },
    uDeep: { value: new THREE.Color('#123f5c') },
    uGlitter: { value: new THREE.Color('#ffdfae') },
    uFoam: { value: new THREE.Color('#f4f1e4') },
    uSkyLow: { value: new THREE.Color('#ffc48c') },
    uSkyHigh: { value: new THREE.Color('#22375e') },
    uSunDir: { value: new THREE.Vector3(0, 0.2, 1) },
    uFogColor: { value: new THREE.Color('#c79f86') },
    uSeaHaze: { value: new THREE.Color('#8fb0a8') },
    // aerial perspective: display-referred haze the far water dissolves into, and the cool
    // direction its far bands lean toward (set per look in _applyLook)
    uAerialHaze: { value: new THREE.Color('#9aa3ac') },
    uAerialCool: { value: new THREE.Color('#4d6b96') },
    uFogDensity: { value: 0.00062 },
    uIslandPos: { value: new Array(8).fill(0).map(() => new THREE.Vector3(1e6, 0, 1e6)) },
    uIslandRad: { value: new Array(8).fill(1) },
    uDebug: { value: 0 },
  },
  vertexShader: /* glsl */`
    uniform float uTime, uWaveHeight, uChoppy;
    uniform vec3 uIslandPos[8];
    uniform float uIslandRad[8];
    varying vec3 vWorld;
    varying vec3 vNrm;
    varying vec2 vShFoam;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec2 p = wp.xz;
      float w1 = sin(dot(p, vec2(0.070, 0.055)) * 1.0 + uTime * 1.05);
      float w2 = sin(dot(p, vec2(-0.050, 0.090)) * 1.7 + uTime * 1.62);
      float w3 = sin(dot(p, vec2(0.120, -0.038)) * 1.0 + uTime * 2.35);
      float w4 = sin(dot(p, vec2(0.026, 0.019)) * 1.0 + uTime * 0.72);
      float h = (w1 * 0.34 + w2 * 0.22 + w3 * 0.10 + w4 * 0.34) * uWaveHeight * uChoppy;
      float camD = distance(p, cameraPosition.xz);
      float atten = 1.0 - smoothstep(600.0, 2200.0, camD);
      wp.y += h * (0.55 + 0.45 * atten);

      float dx = (cos(dot(p, vec2(0.070, 0.055)) + uTime * 1.05) * 0.070 * 0.34
                + cos(dot(p, vec2(-0.050, 0.090)) * 1.7 + uTime * 1.62) * 0.050 * 1.7 * 0.22
                + cos(dot(p, vec2(0.120, -0.038)) + uTime * 2.35) * 0.120 * 0.10
                + cos(dot(p, vec2(0.026, 0.019)) + uTime * 0.72) * 0.026 * 0.34) * uWaveHeight * uChoppy;
      float dz = (cos(dot(p, vec2(0.070, 0.055)) + uTime * 1.05) * 0.055 * 0.34
                + cos(dot(p, vec2(-0.050, 0.090)) * 1.7 + uTime * 1.62) * 0.090 * 1.7 * 0.22
                + cos(dot(p, vec2(0.120, -0.038)) + uTime * 2.35) * -0.038 * 0.10
                + cos(dot(p, vec2(0.026, 0.019)) + uTime * 0.72) * 0.019 * 0.34) * uWaveHeight * uChoppy;
      float slope = mix(1.0, 0.18, smoothstep(200.0, 1300.0, camD));
      vNrm = normalize(vec3(-dx * slope, 1.0, -dz * slope));

      float sh = 0.0;
      float foam = 0.0;
      for (int i = 0; i < 8; i++) {
        float d = distance(p, uIslandPos[i].xz);
        float r = uIslandRad[i];
        sh = max(sh, clamp(1.0 - (d - r * 0.45) / (r * 1.05), 0.0, 1.0));
        foam = max(foam, exp(-pow((d - r * 0.92) / (r * 0.085), 2.0)));
      }
      vShFoam = vec2(sh, foam);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uShallow, uMid, uDeep, uGlitter, uFoam, uSkyLow, uSkyHigh;
    uniform vec3 uSunDir, uFogColor, uSeaHaze;
    uniform float uFogDensity, uTime, uDebug;
    varying vec3 vWorld;
    varying vec3 vNrm;
    varying vec2 vShFoam;
${aerialGLSL(null, { exterior: true })}

    // ShaderMaterial output must do its own encoding: three only converts
    // built-in materials, which is why the first pass looked like wet coal.
    vec3 encode(vec3 c) {
      c = max(c, 0.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }

    // Analytic micro-waves in the fragment: detail never depends on the mesh grid,
    // which is what turned the first pass into flat corduroy banding.
    vec3 microNormal(vec2 p, float damp) {
      float warp = sin(p.x * 0.0137 + p.y * 0.0171) * 2.2;
      float near = length(p - cameraPosition.xz);
      float fine = 1.0 - smoothstep(60.0, 380.0, near);
      vec2 d = vec2(0.0);
      d += vec2(0.90, 0.44) * 1.6 * cos(dot(p, vec2(0.90, 0.44)) * 1.5 + uTime * 1.7 + warp);
      d += vec2(-0.62, 0.78) * 1.0 * cos(dot(p, vec2(-0.62, 0.78)) * 2.6 + uTime * 2.6 - warp);
      d += vec2(0.30, -0.95) * 0.6 * fine * cos(dot(p, vec2(0.30, -0.95)) * 4.1 + uTime * 3.8 + warp * 0.6);
      d += vec2(0.75, 0.66) * 0.3 * fine * fine * cos(dot(p, vec2(0.75, 0.66)) * 7.3 + uTime * 5.5);
      return normalize(vec3(-d.x * 0.07 * damp, 1.0, -d.y * 0.07 * damp));
    }

    void main() {
      float dist = length(cameraPosition - vWorld);
      float damp = mix(1.0, 0.10, smoothstep(90.0, 760.0, dist));
      vec3 macro = normalize(vNrm);
      vec3 N = normalize(mix(macro, microNormal(vWorld.xz, damp), 0.62));
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);

      // Body colour stays emerald: the sea is a place, not a mirror of the sunset.
      float shelf = clamp(vShFoam.x * 1.3, 0.0, 1.0);
      float band = 0.5 + 0.5 * sin(vWorld.x * 0.0031 + vWorld.z * 0.0024 + 1.7);
      float current = 0.5 + 0.5 * sin(vWorld.x * 0.0089 - vWorld.z * 0.0067 + 4.1);
      vec3 base = mix(uDeep, uMid, clamp(0.38 + 0.30 * band + 0.20 * current, 0.0, 1.0));
      base = mix(base, uShallow, smoothstep(0.04, 0.62, shelf) * 0.9);

      // Sky reflection: cool and restrained; only grazing angles turn the water to sky.
      vec3 R = reflect(-V, N);
      vec3 sky = mix(uSkyLow, uSkyHigh, clamp(R.y * 2.4, 0.0, 1.0));
      sky = mix(sky, uSeaHaze, 0.62);
      vec3 col = mix(base, sky, clamp(0.03 + 0.26 * fres, 0.0, 0.38));
      if (uDebug > 0.5 && uDebug < 1.5) { gl_FragColor = vec4(encode(base), 1.0); return; }
      if (uDebug > 1.5 && uDebug < 2.5) { gl_FragColor = vec4(encode(sky), 1.0); return; }
      if (uDebug > 2.5 && uDebug < 3.5) { gl_FragColor = vec4(vec3(fres), 1.0); return; }
      if (uDebug > 3.5 && uDebug < 4.5) { gl_FragColor = vec4(encode(col), 1.0); return; }

      // Sun glitter path: broken shimmer, the strongest "this is water" cue.
      vec3 H = normalize(uSunDir + V);
      float ndh = max(dot(N, H), 0.0);
      float path = pow(ndh, 50.0) * 0.55 + pow(ndh, 300.0) * 2.0;
      float broken = 0.55 + 0.45 * sin(vWorld.x * 1.9 + vWorld.z * 2.7 + uTime * 5.0);
      col += uGlitter * path * broken * (1.0 - smoothstep(1200.0, 3400.0, dist));
      if (uDebug > 4.5 && uDebug < 5.5) { gl_FragColor = vec4(encode(col), 1.0); return; }

      // Shore foam, with a slow breaker rhythm around the landforms.
      float shore = vShFoam.y * (0.55 + 0.45 * sin(vWorld.x * 0.35 + vWorld.z * 0.22 + uTime * 1.7));
      float breakers = smoothstep(0.55, 1.0, sin(vWorld.x * 0.10 + vWorld.z * 0.14 + uTime * 0.9) * 0.5 + 0.5) * vShFoam.y * 0.5;
      if (uDebug > 5.5 && uDebug < 6.5) { gl_FragColor = vec4(vec3(shore, vShFoam.y, breakers), 1.0); return; }
      col = mix(col, uFoam, clamp(shore * 1.15 + breakers, 0.0, 0.9));

      // Distance: the water keeps its own colour a long way out; only the far sea greys off.
      // It greys off through the SAME aerial-perspective bands the land uses, so distant water
      // and distant land dissolve into one colour instead of two different greys.
      float f = 1.0 - exp(-pow(dist * uFogDensity * 0.34, 1.7));
      if (uDebug > 6.5 && uDebug < 7.5) { gl_FragColor = vec4(vec3(f), 1.0); return; }
      gl_FragColor = vec4(aerialPerspective(encode(col), dist, clamp(f, 0.0, 0.92)), 1.0);
    }`,
};

// Gate ring states: only the next ring is lit, so the objective is never ambiguous.
const RING_HOT = new THREE.Color('#fdf3e0');
const RING_IDLE = new THREE.Color('#33454f');
const RING_DONE = new THREE.Color('#4a5a62');
// the ring after the next one: readable through the near arch and across the water, quiet
// enough that it can never be mistaken for the objective
const RING_AHEAD = new THREE.Color('#b9cbcd');

const SKY_SHADER = {
  uniforms: {
    uZenith: { value: new THREE.Color('#22375e') },
    uMid: { value: new THREE.Color('#5d6f96') },
    uHorizon: { value: new THREE.Color('#ffc48c') },
    uLow: { value: new THREE.Color('#1d5f5c') },
    uSunTint: { value: new THREE.Color('#ffe6bd') },
    uSunDir: { value: new THREE.Vector3(0, 0.2, 1) },
    uSunSize: { value: 0.03 },
    uGlow: { value: 0.55 },
    uBand: { value: 0.55 },
  },
  vertexShader: /* glsl */`
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uZenith, uMid, uHorizon, uLow, uSunTint, uSunDir;
    uniform float uSunSize, uGlow, uBand;
    varying vec3 vDir;
    vec3 encode(vec3 c) {
      c = max(c, 0.0);
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    void main() {
      vec3 d = normalize(vDir);
      float t = d.y;
      vec3 col;
      if (t > 0.0) {
        col = mix(uHorizon, uMid, smoothstep(0.0, 0.14, t));
        col = mix(col, uZenith, smoothstep(0.10, 0.46, t));
      } else {
        col = mix(uHorizon, uLow, smoothstep(0.0, 0.14, -t));
      }
      float sd = max(dot(d, normalize(uSunDir)), 0.0);
      // large diffuse sun: no hard disc (reference: Ha Long Bay backlight)
      float disc = smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.25, sd);
      col = mix(col, uSunTint, disc * 0.5);
      col += uSunTint * pow(sd, 12.0) * uGlow * 0.26;
      col += uSunTint * pow(sd, 3.0) * uGlow * 0.04;
      // horizon haze bands
      float band = sin(t * 34.0 + d.x * 2.1) * 0.5 + 0.5;
      col += uSunTint * band * uBand * 0.035 * exp(-abs(t) * 16.0);
      gl_FragColor = vec4(encode(col), 1.0);
    }`,
};

export class World {
  constructor(look, quality = 'high') {
    this.look = look;
    this.quality = quality;
    this.root = new THREE.Group();
    this.colliders = [];
    this.gates = [];
    this.gateAhead = null;
    this.sailShips = [];
    this.birds = [];
    this.thermals = [];
    this.banners = [];
    this.time = 0;
    this._build();
  }

  _build() {
    const look = this.look;
    const L = LANDMARKS;

    /* sky dome */
    const skyMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SKY_SHADER.uniforms),
      vertexShader: SKY_SHADER.vertexShader,
      fragmentShader: SKY_SHADER.fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    skyMat.uniforms.uZenith.value = new THREE.Color(look.sky.zenith).convertSRGBToLinear();
    skyMat.uniforms.uMid.value = new THREE.Color(look.sky.mid).convertSRGBToLinear();
    skyMat.uniforms.uHorizon.value = new THREE.Color(look.sky.horizon).convertSRGBToLinear();
    skyMat.uniforms.uLow.value = new THREE.Color(look.sky.low).convertSRGBToLinear();
    skyMat.uniforms.uSunTint.value = new THREE.Color(look.sky.sunTint).convertSRGBToLinear();
    skyMat.uniforms.uSunSize.value = look.sky.sunSize;
    skyMat.uniforms.uGlow.value = look.sky.glow;
    skyMat.uniforms.uBand.value = look.sky.bandStrength;
    this.skyMat = skyMat;
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 40, 24), skyMat);
    this.sky.frustumCulled = false;
    this.root.add(this.sky);

    /* solar direction (from azimuth/elevation) */
    const az = THREE.MathUtils.degToRad(look.sun.azimDeg);
    const el = THREE.MathUtils.degToRad(look.sun.elevDeg);
    this.sunDir = new THREE.Vector3(
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
      Math.cos(el) * Math.cos(az)
    ).normalize();
    skyMat.uniforms.uSunDir.value.copy(this.sunDir);

    /* sea */
    const landforms = [
      [L.hero.x, L.hero.z, L.hero.radius],
      [L.spires.x, L.spires.z, 90],
      [L.atoll.x, L.atoll.z, L.atoll.radius],
      [L.islet.x, L.islet.z, L.islet.radius],
      [L.finish.x, L.finish.z, L.finish.radius],
      [L.slabTemple.x, L.slabTemple.z, L.slabTemple.radius],
      [L.slabHigh.x, L.slabHigh.z, L.slabHigh.radius],
      [0, 0, 0],
    ];
    const segs = this.quality === 'low' ? 140 : 220;
    const seaGeo = new THREE.PlaneGeometry(5000, 5000, segs, segs);
    seaGeo.rotateX(-Math.PI / 2);
    const seaMat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(SEA_SHADER.uniforms),
      vertexShader: SEA_SHADER.vertexShader,
      fragmentShader: SEA_SHADER.fragmentShader,
    });
    const u = seaMat.uniforms;
    u.uWaveHeight.value = look.sea.waveHeight;
    u.uChoppy.value = look.sea.choppy;
    u.uShallow.value = new THREE.Color(look.sea.shallow).convertSRGBToLinear();
    u.uMid.value = new THREE.Color(look.sea.mid).convertSRGBToLinear();
    u.uDeep.value = new THREE.Color(look.sea.deep).convertSRGBToLinear();
    u.uGlitter.value = new THREE.Color(look.sea.glitter).convertSRGBToLinear();
    u.uFoam.value = new THREE.Color(look.sea.foam).convertSRGBToLinear();
    u.uSkyLow.value = new THREE.Color(look.sky.horizon).convertSRGBToLinear();
    u.uSkyHigh.value = new THREE.Color(look.sky.mid).convertSRGBToLinear();
    u.uSunDir.value.copy(this.sunDir);
    // Fog and aerial perspective must agree: the fog colour IS the haze colour, so the far
    // land's dissolve and the bands that desaturate it end in the same place.
    const hazeLin = hazeColor(look);
    u.uFogColor.value.copy(hazeLin);
    u.uAerialHaze.value.copy(hazeLin).convertLinearToSRGB();
    u.uAerialCool.value.copy(coolColor(look));
    u.uSeaHaze.value = new THREE.Color(look.sea.mid).convertSRGBToLinear()
      .lerp(new THREE.Color(look.sky.mid).convertSRGBToLinear(), 0.45)
      .lerp(hazeLin.clone(), 0.12);
    u.uFogDensity.value = look.fog.density;
    u.uDebug.value = Number(new URLSearchParams(location.search).get('dbg') || 0);
    for (let i = 0; i < 8; i++) {
      const [x, z, r] = landforms[i];
      u.uIslandPos.value[i].set(x, 0, z);
      u.uIslandRad.value[i] = r;
    }
    this.seaMat = seaMat;
    this.sea = new THREE.Mesh(seaGeo, seaMat);
    this.sea.frustumCulled = false;
    this.root.add(this.sea);

    // far sea: flat, fog-tinted, fills the horizon without vertex cost
    const farGeo = new THREE.PlaneGeometry(16000, 16000, 1, 1);
    farGeo.rotateX(-Math.PI / 2);
    const farMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(look.sea.deep) });
    farMat.color.lerp(new THREE.Color(look.sky.mid), 0.45)
      .lerp(new THREE.Color(coolColor(look)), 0.18);
    this.farSea = new THREE.Mesh(farGeo, farMat);
    this.farSea.position.y = -3.0;
    this.farSea.frustumCulled = false;
    this.root.add(this.farSea);

    /* clouds: soft warm billboards high above (low-contrast, reference lesson) */
    const cloudTex = P.makeCloudTexture(look.clouds, 7);
    const cloudCount = this.quality === 'low' ? 9 : 18;
    const rnd = P.mulberry32(4242);
    for (let i = 0; i < cloudCount; i++) {
      const w = 900 + rnd() * 1500;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, w * (0.34 + rnd() * 0.2)),
        new THREE.MeshBasicMaterial({
          map: cloudTex, transparent: true, opacity: 0.32 + rnd() * 0.28,
          depthWrite: false, color: new THREE.Color(look.clouds),
        })
      );
      const ang = rnd() * Math.PI * 2;
      const rad = 1200 + rnd() * 4200;
      m.position.set(Math.cos(ang) * rad, 380 + rnd() * 900, Math.sin(ang) * rad);
      m.userData.drift = 1.2 + rnd() * 2.4;
      this.root.add(m);
      (this.clouds ||= []).push(m);
    }

    /* archipelago */
    const rock = look.rock;
    const hero = P.makeIsland({ ...L.hero, rock, seed: 11, crownTint: rock.crown });
    this.root.add(hero.group);
    this.colliders.push(hero.collider);
    this.heroCapY = hero.capY;

    const town = P.makeTerraceTown(rock, 3);
    town.position.set(0, 112, 0);
    town.scale.set(0.62, 0.62, 0.62);
    town.rotation.y = Math.PI;
    this.root.add(town);

    const lh = P.makeLighthouse(rock, 46);
    lh.group.position.set(0, hero.capY - 6, 34);
    this.root.add(lh.group);
    this.lighthouse = lh;

    const atoll = P.makeIsland({ ...L.atoll, rock, seed: 23, crownTint: rock.crownAlt });
    this.root.add(atoll.group);
    this.colliders.push(atoll.collider);

    const islet = P.makeIsland({ ...L.islet, rock, seed: 31, crownTint: rock.crown });
    this.root.add(islet.group);
    this.colliders.push(islet.collider);

    const finishIsland = P.makeIsland({ ...L.finish, rock, seed: 47, crownTint: rock.crownAlt });
    this.root.add(finishIsland.group);
    this.colliders.push(finishIsland.collider);

    for (const [dx, dz, h, s] of [[-92, 8, 300, 5], [92, -12, 268, 8]]) {
      const sp = P.makeSpire({ radius: 34, height: h, seed: s, rock, x: L.spires.x + dx, z: L.spires.z + dz });
      this.root.add(sp.mesh);
      this.colliders.push(sp.collider);
    }

    const slabTemple = P.makeFloatingSlab({ ...L.slabTemple, seed: 13, rock });
    this.root.add(slabTemple.group);
    this.colliders.push(slabTemple.collider);
    const pav = P.makePavilion(rock, 44, 4);
    pav.group.position.set(L.slabTemple.x, L.slabTemple.y + 16, L.slabTemple.z);
    this.root.add(pav.group);
    this.banners.push(...pav.group.children.filter((c) => c.userData.flutter));
    this.colliders.push({ x: L.slabTemple.x, z: L.slabTemple.z, r: 30, topY: L.slabTemple.y + 74, kind: 'pavilion' });

    const slabHigh = P.makeFloatingSlab({ ...L.slabHigh, seed: 19, rock });
    this.root.add(slabHigh.group);
    this.colliders.push(slabHigh.collider);

    const aq = P.makeAqueduct(rock, L.aqueduct.span, L.aqueduct.deckY, 6);
    aq.group.position.set(L.aqueduct.x, -8, L.aqueduct.z);
    aq.group.rotation.y = L.aqueduct.yaw;
    this.root.add(aq.group);
    const aqDir = new THREE.Vector2(Math.cos(L.aqueduct.yaw), -Math.sin(L.aqueduct.yaw));
    for (let i = 0; i <= 4; i++) {
      const off = (-L.aqueduct.span * 0.5 + (L.aqueduct.span / 4) * i) * 1.0;
      this.colliders.push({
        x: L.aqueduct.x + aqDir.x * off,
        z: L.aqueduct.z + aqDir.y * off,
        r: 12, topY: L.aqueduct.deckY + 6, kind: 'pier', deck: L.aqueduct.deckY,
      });
    }
    this.colliders.push({
      x: L.aqueduct.x, z: L.aqueduct.z, r: 22,
      topY: L.aqueduct.deckY + 6, kind: 'deck', deckOnly: true, deck: L.aqueduct.deckY,
    });

    const beacon = P.makeHaloBeacon(rock, 40);
    beacon.group.position.set(L.finish.x, L.finish.height + 6, L.finish.z);
    this.root.add(beacon.group);
    this.beacon = beacon;
    this.colliders.push({
      x: L.finish.x, z: L.finish.z, r: 52, topY: L.finish.height + 13, kind: 'beacon', platform: true,
    });

    /* far archipelago: silhouettes that give the sea a horizon to fade into */
    const farRnd = P.mulberry32(24601);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + farRnd() * 0.22;
      const dist = 1350 + farRnd() * 1900;
      const radius = 130 + farRnd() * 300;
      const height = 110 + farRnd() * 220;
      const far = P.makeIsland({
        x: Math.cos(a) * dist, z: Math.sin(a) * dist, radius, height,
        seed: 900 + i, segments: 13, levels: 5, roughness: 0.85,
        rock, crownTint: rock.crownAlt,
      });
      far.group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
      this.root.add(far.group);
      (this.farIslands ||= []).push(far.group);
    }

    /* vegetation — clustered, never a scatter gun */
    const rndV = P.mulberry32(777);
    const plantOn = (island, count, kind, y) => {
      for (let i = 0; i < count; i++) {
        const a = rndV() * Math.PI * 2;
        const rad = (0.15 + rndV() * 0.72) * island.radius;
        const t = kind === 'palm' ? P.makePalm(rock, i + 1, 0.85 + rndV() * 0.5)
          : P.makePineTree(rock, i + 1, 0.8 + rndV() * 0.7);
        t.position.set(island.x + Math.cos(a) * rad, y, island.z + Math.sin(a) * rad);
        t.rotation.y = rndV() * Math.PI * 2;
        this.root.add(t);
      }
    };
    plantOn(L.hero, 16, 'pine', hero.capY - 5);
    plantOn(L.atoll, 12, 'palm', atoll.capY - 2);
    plantOn(L.islet, 10, 'pine', islet.capY - 5);
    plantOn(L.finish, 10, 'pine', finishIsland.capY - 5);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const t = P.makePineTree(rock, i + 40, 0.7);
      t.position.set(L.slabHigh.x + Math.cos(a) * L.slabHigh.radius * 0.55,
        L.slabHigh.y + 18, L.slabHigh.z + Math.sin(a) * L.slabHigh.radius * 0.55);
      this.root.add(t);
    }

    /* gates */
    COURSE.gates.forEach((g, i) => {
      const gate = P.makeGate(i, look, 9.5);
      gate.group.position.set(g.x, g.y, g.z);
      gate.group.rotation.y = g.yaw;
      this.root.add(gate.group);
      this.gates.push({
        index: i, group: gate.group, glowMat: gate.glowMat, bandMat: gate.bandMat, ringMat: gate.ringMat,
        chevrons: gate.chevrons, streamers: gate.streamers,
        radius: gate.radius, pos: new THREE.Vector3(g.x, g.y, g.z),
        normal: new THREE.Vector3(Math.sin(g.yaw), 0, Math.cos(g.yaw)),
        passed: false, flash: 0, note: g.note,
      });
    });

    /* objective column: a light shaft over the next ring, legible across the sea */
    this.objectiveColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 3.6, 130, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(look.craft.accent), transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true,
      })
    );
    this.objectiveColumn.frustumCulled = false;
    this.root.add(this.objectiveColumn);

    /* guide arc: a soft line from the craft to the next objective */
    const guideGeo = new THREE.BufferGeometry();
    guideGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3));
    this.guide = new THREE.Line(guideGeo, new THREE.LineBasicMaterial({
      // cool and faint on purpose: the warm cream vapour is the aircraft's own trail, so the
      // guide must read as instrumentation and never as a second streamer behind the craft.
      color: new THREE.Color('#bfe0ff'), transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: true,
    }));
    this.guide.frustumCulled = false;
    this.root.add(this.guide);
    this.beaconTarget = new THREE.Vector3(L.finish.x, beacon.group.position.y + 15, L.finish.z);

    /* coral sail ships — the warm moving accent */
    const paths = [
      { a: new THREE.Vector3(-520, 62, 320), b: new THREE.Vector3(180, 74, 480), r: 180, speed: 0.055 },
      { a: new THREE.Vector3(420, 88, -430), b: new THREE.Vector3(-260, 70, -560), r: 240, speed: 0.042 },
      { a: new THREE.Vector3(-760, 58, -60), b: new THREE.Vector3(-160, 66, 120), r: 200, speed: 0.05 },
    ];
    paths.forEach((p, i) => {
      const ship = P.makeSailShip(look, 1 + (i % 2) * 0.35);
      this.root.add(ship.group);
      this.sailShips.push({ ...p, obj: ship.group, t: i * 0.33, bob: i });
    });

    /* thermal columns: visible lift you can plan a route around */
    const thermalSpots = [
      { x: -140, z: -420, h: 220 },
      { x: 660, z: 40, h: 240 },
      { x: -60, z: 430, h: 200 },
      { x: 420, z: -700, h: 260 },
    ];
    const moteTex = P.makeSoftSprite(look.mote);
    for (const t of thermalSpots) {
      const count = this.quality === 'low' ? 90 : 180;
      const pos = new Float32Array(count * 3);
      const seed = P.mulberry32(t.x * 13 + t.z);
      const data = [];
      for (let i = 0; i < count; i++) {
        const a = seed() * Math.PI * 2;
        const r = Math.sqrt(seed()) * 34;
        data.push({ a, r, y: seed(), spd: 0.35 + seed() * 0.5 });
        pos[i * 3] = t.x + Math.cos(a) * r;
        pos[i * 3 + 1] = t.y || 20;
        pos[i * 3 + 2] = t.z + Math.sin(a) * r;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        size: 2.8, map: moteTex, transparent: true, opacity: 0.20,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
        color: new THREE.Color(look.mote), fog: true,
      });
      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      this.root.add(points);
      this.thermals.push({ x: t.x, z: t.z, h: t.h, points, data, baseY: 14 });
    }

    /* ambient motes near the craft */
    {
      const count = this.quality === 'low' ? 120 : 260;
      const pos = new Float32Array(count * 3);
      const rnd = P.mulberry32(909);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (rnd() - 0.5) * 320;
        pos[i * 3 + 1] = (rnd() - 0.5) * 200;
        pos[i * 3 + 2] = (rnd() - 0.5) * 320;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.motes = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 1.0, map: moteTex, transparent: true, opacity: 0.30, depthWrite: false,
        blending: THREE.AdditiveBlending, color: new THREE.Color(look.mote),
      }));
      this.motes.frustumCulled = false;
      this.root.add(this.motes);
    }

    /* bird flocks: two loose wheels of life */
    const birdTex = P.makeSoftSprite('#3a3128');
    for (const [cx, cy, cz, r, count] of [[0, 150, 0, 420, 26], [-620, 90, -320, 260, 18]]) {
      const pos = new Float32Array(count * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 3.4, map: birdTex, transparent: true, opacity: 0.75, depthWrite: false,
        color: new THREE.Color('#3a3128'), sizeAttenuation: true,
      }));
      pts.frustumCulled = false;
      this.root.add(pts);
      this.birds.push({ center: new THREE.Vector3(cx, cy, cz), r, count, pts, phase: r * 0.01 });
    }

    /* splash pool for sea skims and gate bursts */
    {
      const count = 160;
      const pos = new Float32Array(count * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.splash = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 3.6, map: moteTex, transparent: true, opacity: 0.85, depthWrite: false,
        blending: THREE.AdditiveBlending, color: new THREE.Color(look.sea.foam),
      }));
      this.splash.frustumCulled = false;
      this.splashData = [];
      for (let i = 0; i < count; i++) this.splashData.push({ life: 0, v: new THREE.Vector3(), p: new THREE.Vector3() });
      this.splash.visible = false;
      this.root.add(this.splash);
    }

    /* contact shadow under the craft: grounds it over the swell */
    this.craftShadow = P.makeContactShadow();
    this.root.add(this.craftShadow);

    /* aerial perspective: one function, applied to every fogged material in the world so the
       depth bands are graded consistently. The craft, the gate glow, the clouds and the sky are
       deliberately left out: they must keep their local contrast at any distance. */
    this.aerialMaterials = applyAerialTo(this.root, look, {
      bands: look.id === 'ink' ? 'ink' : 'default',
    });
  }

  /** Draw the guide arc toward the current objective, and the shaft above it. */
  setGuide(from, to) {
    if (!to) return;
    const d = from.distanceTo(to);
    if (this.objectiveColumn) {
      this.objectiveColumn.position.set(to.x, to.y - 30, to.z);
      // a long-range pointer only: it fades out as you arrive so it never competes with the ring
      const far = Math.min(1, Math.max(0, (d - 220) / 420));
      this.objectiveColumn.material.opacity = far * (0.07 + 0.035 * Math.sin(this.time * 2.2));
    }
    if (!this.guide) return;
    const arr = this.guide.geometry.attributes.position.array;
    const n = arr.length / 3;
    this.guide.material.opacity = d > 90 ? Math.min(0.11, 0.02 + d / 6000) : 0;
    if (d <= 90) return;
    const sag = Math.min(90, d * 0.055);
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      arr[i * 3] = from.x + (to.x - from.x) * k;
      arr[i * 3 + 1] = from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * sag;
      arr[i * 3 + 2] = from.z + (to.z - from.z) * k;
    }
    this.guide.geometry.attributes.position.needsUpdate = true;
  }

  spawnSplash(pos, count = 22, power = 1, color = null) {
    let spawned = 0;
    for (const d of this.splashData) {
      if (d.life > 0) continue;
      d.life = 0.55 + Math.random() * 0.5;
      d.max = d.life;
      d.p.copy(pos);
      const a = Math.random() * Math.PI * 2;
      const up = 1.4 + Math.random() * 2.6 * power;
      d.v.set(Math.cos(a) * (1 + Math.random() * 2.4) * power, up, Math.sin(a) * (1 + Math.random() * 2.4) * power);
      if (++spawned >= count) break;
    }
    this.splash.visible = true;
  }

  gatePassedFx(i) {
    const g = this.gates[i];
    if (!g) return;
    g.flash = 1;
    this.spawnSplash(g.pos, 30, 1.2);
    g.glowMat.opacity = 0.5;
  }

  /** Gate after the objective (lit while the player closes on the objective). */
  setGateAhead(g) { this.gateAhead = g || null; }

  update(dt, camera) {
    this.time += dt;
    const t = this.time;
    const look = this.look;
    if (this.seaMat) this.seaMat.uniforms.uTime.value = t;

    // clouds drift
    if (this.clouds) {
      for (const c of this.clouds) {
        c.position.x += c.userData.drift * dt;
        if (c.position.x > 6500) c.position.x = -6500;
        c.quaternion.copy(camera.quaternion);
      }
    }

    // gate hierarchy: the next ring is lit; the ring after it is legible through the near
    // arch so the player can plan the exit line; past rings fade to slate, later rings quiet
    for (const g of this.gates) {
      const near = g === this.nextGate;
      const ahead = !near && g === this.gateAhead;
      const done = g.index < this.gateIndex;
      g.flash = Math.max(0, g.flash - dt * 1.6);
      g.glowMat.opacity = (near ? 0.34 + 0.18 * Math.sin(t * 3.0) : ahead ? 0.11 : 0) + g.flash * 0.4;
      if (g.ringMat) {
        g.ringMat.color.lerp(near ? RING_HOT : ahead ? RING_AHEAD : done ? RING_DONE : RING_IDLE, 1 - Math.exp(-5 * dt));
        g.ringMat.emissiveIntensity = near ? 0.6 : ahead ? 0.20 : 0.015;
      }
      if (g.bandMat) {
        g.bandMat.emissiveIntensity = (near ? 2.2 + 0.8 * Math.sin(t * 3.4) : ahead ? 0.55 : done ? 0.03 : 0.05) + g.flash * 1.5;
      }
      if (g.chevrons) {
        for (let i = 0; i < g.chevrons.length; i++) {
          const c = g.chevrons[i];
          c.visible = near;
          if (!near) continue;
          c.position.z = -(g.radius * 0.55 + i * 2.6) + (t * 5 + i * 2.4) % 8.5;
          c.material.opacity = 0.85 - i * 0.22;
        }
      }
      g.group.rotation.z = Math.sin(t * 0.7 + g.index) * 0.02;
      for (const s of g.streamers) {
        s.rotation.z = Math.sin(t * 2.1 + s.userData.phase) * 0.35;
        s.rotation.x = Math.cos(t * 1.7 + s.userData.phase) * 0.22;
      }
    }

    for (const s of this.sailShips) {
      s.t = (s.t + dt * s.speed * 0.06) % 1;
      const k = 0.5 - 0.5 * Math.cos(s.t * Math.PI * 2);
      s.obj.position.lerpVectors(s.a, s.b, k);
      s.obj.position.y += Math.sin(t * 0.6 + s.bob) * 0.9;
      s.obj.position.x += Math.sin(s.t * Math.PI * 2) * 0.0;
      const dir = new THREE.Vector3().subVectors(s.b, s.a).normalize();
      s.obj.rotation.y = Math.atan2(dir.x, dir.z);
      s.obj.rotation.z = Math.sin(t * 0.7 + s.bob) * 0.03;
    }

    for (const b of this.birds) {
      const arr = b.pts.geometry.attributes.position.array;
      for (let i = 0; i < b.count; i++) {
        const a = t * 0.14 + (i / b.count) * Math.PI * 2 + Math.sin(t * 0.3 + i) * 0.4;
        const rr = b.r * (0.75 + 0.25 * Math.sin(t * 0.2 + i * 1.7));
        arr[i * 3] = b.center.x + Math.cos(a) * rr;
        arr[i * 3 + 1] = b.center.y + Math.sin(t * 0.35 + i * 1.1) * 16;
        arr[i * 3 + 2] = b.center.z + Math.sin(a) * rr;
      }
      b.pts.geometry.attributes.position.needsUpdate = true;
    }

    for (const th of this.thermals) {
      const arr = th.points.geometry.attributes.position.array;
      for (let i = 0; i < th.data.length; i++) {
        const d = th.data[i];
        d.y += dt * d.spd * 0.16;
        if (d.y > 1) d.y -= 1;
        arr[i * 3] = th.x + Math.cos(d.a + t * 0.2) * d.r;
        arr[i * 3 + 1] = th.baseY + d.y * th.h;
        arr[i * 3 + 2] = th.z + Math.sin(d.a + t * 0.2) * d.r;
      }
      th.points.geometry.attributes.position.needsUpdate = true;
    }

    if (this.motes) {
      const arr = this.motes.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += Math.sin(t * 0.3 + i) * dt * 1.6;
        arr[i + 1] += dt * 1.1;
        if (arr[i + 1] > 110) arr[i + 1] = -110;
        if (arr[i] > 170) arr[i] = -170;
      }
      this.motes.geometry.attributes.position.needsUpdate = true;
      this.motes.position.copy(camera.position);
    }

    if (this.lighthouse) this.lighthouse.beacon.rotation.y += dt * 0.35;
    if (this.beacon) {
      this.beacon.halo.rotation.z += dt * 0.5;
      this.beacon.outer.rotation.z -= dt * 0.22;
      this.beacon.glow.material.opacity = 0.06 + 0.035 * Math.sin(t * 1.2);
      for (const p of this.beacon.pennants || []) {
        p.rotation.z = Math.sin(t * 1.9 + p.userData.phase) * 0.3;
        p.rotation.x = Math.cos(t * 1.4 + p.userData.phase) * 0.18;
      }
    }
    for (const b of this.banners) {
      b.rotation.z = Math.sin(t * 1.5 + b.userData.flutter.seed) * 0.12;
    }

    // splash particles
    const sarr = this.splash.geometry.attributes.position.array;
    let alive = 0;
    for (let i = 0; i < this.splashData.length; i++) {
      const d = this.splashData[i];
      if (d.life > 0) {
        d.life -= dt;
        d.v.y -= 9.0 * dt;
        d.p.addScaledVector(d.v, dt);
        alive++;
      }
      sarr[i * 3] = d.p.x; sarr[i * 3 + 1] = d.p.y; sarr[i * 3 + 2] = d.p.z;
    }
    if (alive > 0) {
      this.splash.geometry.attributes.position.needsUpdate = true;
      this.splash.material.opacity = 0.9;
    } else {
      this.splash.visible = false;
    }
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          for (const k of Object.keys(m)) {
            const v = m[k];
            if (v && v.isTexture) v.dispose();
          }
          m.dispose();
        }
      }
    });
  }
}
