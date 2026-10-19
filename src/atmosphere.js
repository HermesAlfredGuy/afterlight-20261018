// AFTERLIGHT — atmosphere: ONE aerial-perspective function, evaluated per depth band.
//
// Pass 1 had a single-colour FogExp2, and that colour was warm. Distant land therefore
// dissolved into a warm grey that matched neither the cool zenith nor the emerald sea, and
// nothing in the silhouette lost contrast — the far archipelago read at the same local
// contrast as the near islands, so the low-poly LOD never hid.
//
// Here the scene gets one function, applied to every fogged material (and to the sea
// shader's own haze path) that walks four depth bands and, per band, drops saturation,
// drops contrast and leans the hue toward the cool sky while preserving luminance. The
// band's dissolve into the haze colour is the ordinary fog mix, so the two agree by
// construction instead of fighting.
import * as THREE from 'three';

/** Distance bands (metres, view depth). sat/con are multipliers; cool is a hue lean 0..1. */
export const BANDS = {
  default: [
    { d: 0, sat: 1.00, con: 1.00, cool: 0.00 },
    { d: 220, sat: 0.96, con: 0.97, cool: 0.10 },
    { d: 700, sat: 0.74, con: 0.82, cool: 0.45 },
    { d: 1600, sat: 0.46, con: 0.62, cool: 0.74 },
    { d: 3400, sat: 0.28, con: 0.42, cool: 0.92 },
  ],
  // the pale cel look loses contrast sooner (it has less to lose) and must not grey out
  ink: [
    { d: 0, sat: 1.00, con: 1.00, cool: 0.00 },
    { d: 260, sat: 0.99, con: 0.99, cool: 0.06 },
    { d: 900, sat: 0.88, con: 0.92, cool: 0.34 },
    { d: 2000, sat: 0.70, con: 0.82, cool: 0.58 },
    { d: 4200, sat: 0.54, con: 0.72, cool: 0.76 },
  ],
};

/** The colour distance dissolves into: the sky's own horizon-to-mid gradient, cooled. */
export function hazeColor(look) {
  const h = new THREE.Color(look.sky.horizon);
  const m = new THREE.Color(look.sky.mid);
  const z = new THREE.Color(look.sky.zenith);
  const c = h.clone().lerp(m, 0.55).lerp(z, 0.12);
  return c.convertSRGBToLinear();
}

/** The colour the cool lean pulls toward (usually the sky's own cool end). sRGB values. */
export function coolColor(look) {
  const m = new THREE.Color(look.sky.mid);
  const z = new THREE.Color(look.sky.zenith);
  return m.clone().lerp(z, 0.5);
}

const f3 = (v) => v.toFixed(3);
const hex3 = (c) => `vec3( ${f3(c.r)}, ${f3(c.g)}, ${f3(c.b)} )`;

/**
 * GLSL for the aerial function, with the band table baked in as constants: every fogged
 * material shares one program, so this costs no uniforms and no per-frame uploads.
 *
 * The function runs where three's own fog does — AFTER tone mapping and the colour-space
 * conversion — so its inputs and the fog colour are display-referred sRGB values.
 */
export function aerialGLSL(look, opts = {}) {
  const xe = opts.exterior === true;                       // sea: haze + cool arrive as uniforms
  const bands = BANDS[opts.bands || 'default'];
  const haze = xe ? null : new THREE.Color(opts.haze || hazeColor(look)).convertLinearToSRGB();
  const cool = xe ? null : coolColor(look);
  const bandD = bands.map((b) => f3(b.d));
  const props = bands.map((b) => `vec3( ${f3(b.sat)}, ${f3(b.con)}, ${f3(b.cool)} )`);
  const coolDecl = xe ? 'uniform vec3 uAerialCool;' : `const vec3 AE_COOL = ${hex3(cool)};`;
  const sig = xe
    ? 'vec3 aerialPerspective( vec3 col, float depth, float fogFactor )'
    : 'vec3 aerialPerspective( vec3 col, float depth, float fogFactor, vec3 fogCol )';
  const dissolve = xe
    ? 'return mix( col, uAerialHaze, clamp( fogFactor, 0.0, 1.0 ) );'
    : 'return mix( col, fogCol, clamp( fogFactor, 0.0, 1.0 ) );';
  return /* glsl */`
// ---------------------------------------------------------------- aerial perspective
const float AE_D[5] = float[5]( ${bandD.join(', ')} );
const vec3 AE_P[5] = vec3[5]( ${props.join(', ')} );
${coolDecl}
${xe ? 'uniform vec3 uAerialHaze;   // display-referred (sRGB) haze colour' : ''}

float aeLum( vec3 c ) { return dot( c, vec3( 0.2126, 0.7152, 0.0722 ) ); }

${sig} {
  float sat = AE_P[0].x, con = AE_P[0].y, coolK = AE_P[0].z;
  for ( int i = 1; i < 5; i ++ ) {
    float w = smoothstep( AE_D[i - 1], AE_D[i], depth );
    sat = mix( sat, AE_P[i].x, w );
    con = mix( con, AE_P[i].y, w );
    coolK = mix( coolK, AE_P[i].z, w );
  }
  // contrast falloff: compress toward the band's own mean
  float lum = aeLum( col );
  col = mix( vec3( lum ), col, con );
  // saturation falloff
  lum = aeLum( col );
  col = mix( vec3( lum ), col, sat );
  // cool shift, luminance-preserving so far land does not simply darken
  float cl = max( aeLum( ${xe ? 'uAerialCool' : 'AE_COOL'} ), 0.001 );
  col = mix( col, ${xe ? 'uAerialCool' : 'AE_COOL'} * ( aeLum( col ) / cl ), coolK * 0.45 );
  // the band's dissolve: the same fog mix the renderer would have done, with a graded colour
  ${dissolve}
}
`;
}

/** Haze in sRGB display space, for shaders that encode their own output. */
export function hazeSRGB(look) {
  return new THREE.Color(hazeColor(look)).convertLinearToSRGB();
}

/**
 * Patch a built-in material so its fog path runs through `aerialPerspective`.
 * Transparent/additive materials and custom shaders are left exactly as they are: the
 * craft, the gate glow and the clouds must not be graded away.
 */
export function applyAerial(material, look, opts = {}) {
  if (!material || material.isShaderMaterial || material.userData.__aerial) return material;
  if (opts.skipTransparent !== false && (material.transparent || material.blending !== THREE.NormalBlending)) return material;
  const glsl = aerialGLSL(look, opts);
  const key = 'aerial:' + (opts.bands || 'default');
  material.userData.__aerial = true;
  material.fog = true;
  material.onBeforeCompile = (shader) => {
    if (!shader.fragmentShader.includes('#include <fog_pars_fragment>')) return;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + glsl)
      // three hands onBeforeCompile the shader with its #include directives NOT resolved yet, so
      // the fog mix cannot be found as a literal line — the whole <fog_fragment> include has to be
      // expanded here. The body below is three r186's chunk verbatim (same fogFactor maths, same
      // uniform names); only the final mix is redirected through aerialPerspective.
      .replace('#include <fog_fragment>', /* glsl */`
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = aerialPerspective( gl_FragColor.rgb, vFogDepth, fogFactor, fogColor );
#endif`);
  };
  material.customProgramCacheKey = () => key;
  material.userData.__aerialFn = material.onBeforeCompile;    // kept for the A/B probe
  material.userData.__aerialKey = material.customProgramCacheKey;
  material.needsUpdate = true;
  return material;
}

/** Patch every eligible material under a root (world geometry, not the craft). */
export function applyAerialTo(root, look, opts = {}) {
  const seen = new Set();
  let n = 0;
  root.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      if (applyAerial(m, look, opts)) n++;
    }
  });
  return n;
}
