import * as THREE from "three";

/**
 * Subtly twinkles the bright (city-light) pixels of the globe's night-earth
 * texture by patching the material's fragment shader at compile time. The
 * dark land / ocean is left alone, so only the lights flicker.
 *
 * The patch works by hashing each pixel's UV cell into a per-cell phase + rate,
 * then driving a tiny multiplicative oscillation on `diffuseColor` weighted by
 * the pixel's own brightness. Bright pixels (lit) twinkle; dark pixels don't.
 *
 * Returns a `dispose` function that stops the RAF loop and tidies up.
 */
export function applyCityLightShimmer(
  material: THREE.Material,
  opts: { intensity?: number; rate?: number } = {},
): () => void {
  const intensity = opts.intensity ?? 0.22; // peak ± multiplier on bright lights
  const rate = opts.rate ?? 1.0;            // overall speed multiplier
  const uTime = { value: 0 };

  const m = material as THREE.MeshPhongMaterial;
  const prevOnBeforeCompile = m.onBeforeCompile?.bind(m);

  m.onBeforeCompile = (shader) => {
    if (prevOnBeforeCompile) prevOnBeforeCompile(shader);
    shader.uniforms.uTime = uTime;
    shader.uniforms.uShimmerIntensity = { value: intensity };

    // Add uniforms + a tiny hash() at the top of the fragment shader.
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `
        uniform float uTime;
        uniform float uShimmerIntensity;
        float __ufoHash(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        void main() {`,
      )
      // Hook just after the diffuse-map sampling: at this point diffuseColor
      // already carries the texel value. Boost only the bright pixels.
      .replace(
        "#include <map_fragment>",
        `
        #include <map_fragment>
        #ifdef USE_MAP
          float __lightMask = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b);
          // Quantise UVs into cells so a "city" twinkles as one blob (not per-pixel noise).
          vec2 __cell = floor(vMapUv * 420.0);
          float __h = __ufoHash(__cell);
          float __h2 = __ufoHash(__cell + 11.7);
          float __phase = __h * 6.28318;
          float __freq = 1.2 + __h * 4.0;
          // a slow sine, plus an occasional sharper "surge" so some lights blink harder
          float __osc = sin(uTime * __freq + __phase) * 0.7
                      + pow(max(0.0, sin(uTime * (0.45 + __h2 * 0.5) + __h2 * 6.28)), 8.0) * 0.6;
          // most of the lit landmass twinkles a bit; the brightest cities twinkle hardest
          float __weight = smoothstep(0.16, 0.55, __lightMask);
          diffuseColor.rgb *= 1.0 + uShimmerIntensity * __osc * __weight;
        #endif
        `,
      );
  };
  // Force a shader recompile on the next render.
  m.needsUpdate = true;

  let rafId: number | null = null;
  let started = performance.now();
  const loop = (now: number) => {
    uTime.value = ((now - started) / 1000) * rate;
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  };
}
