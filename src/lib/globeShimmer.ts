import * as THREE from "three";

/**
 * Patches the globe material's fragment shader (right after `<map_fragment>`, so
 * `diffuseColor` carries the night-earth texel) to do three things to the
 * texel before lighting:
 *   1. lift the dark ocean / unlit land toward a deep navy instead of pure black
 *   2. tone the city lights down a bit and pull them off the vivid "pin gold"
 *   3. twinkle the lit pixels — phase/rate seeded by the pixel's own brightness,
 *      so different lights flicker out of sync and the twinkle follows a city as
 *      the globe rotates (no dependency on `vMapUv` / any varying — robust).
 *
 * Returns a `dispose` function that stops the RAF loop.
 */
export function applyCityLightShimmer(
  material: THREE.Material,
  opts: { intensity?: number; rate?: number } = {},
): () => void {
  const intensity = opts.intensity ?? 0.6; // peak ± multiplier on the brightest lit pixels
  const rate = opts.rate ?? 1.0; // overall twinkle speed multiplier
  const uTime = { value: 0 };
  const uIntensity = { value: intensity };

  const m = material as THREE.MeshPhongMaterial;
  const prevOnBeforeCompile = m.onBeforeCompile?.bind(m);

  m.onBeforeCompile = (shader) => {
    if (prevOnBeforeCompile) prevOnBeforeCompile(shader);
    shader.uniforms.uShimmerTime = uTime;
    shader.uniforms.uShimmerIntensity = uIntensity;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "void main() {",
        `
        uniform float uShimmerTime;
        uniform float uShimmerIntensity;
        void main() {`,
      )
      .replace(
        "#include <map_fragment>",
        `
        #include <map_fragment>
        #ifdef USE_MAP
        {
          float __lm = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
          float __w = smoothstep(0.10, 0.55, __lm); // 0 on dark ocean, ~1 on bright cities
          // 1) deep-ocean navy floor so the unlit half isn't just black
          diffuseColor.rgb += vec3(0.022, 0.052, 0.115) * (1.0 - __w);
          if (__lm > 0.10) {
            // 2) pull the city lights off the pure pin-gold + take a little brightness off
            float __lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(__lum), 0.30 * __w);
            diffuseColor.rgb *= mix(1.0, 0.80, __w);
            // 3) twinkle — seeded by the pixel's own value so lights flicker out of sync
            float __s  = fract(sin(__lm * 113.17 + 41.7) * 4391.0);
            float __s2 = fract(sin(__lm * 271.93 + 7.1) * 9137.0);
            float __freq = 0.9 + __s * 3.6;
            float __osc = sin(uShimmerTime * __freq + __s * 6.28318) * 0.75
                        + pow(max(0.0, sin(uShimmerTime * (0.45 + __s2 * 0.6) + __s2 * 17.0)), 6.0) * 0.55;
            diffuseColor.rgb *= 1.0 + uShimmerIntensity * __osc * __w;
          }
        }
        #endif
        `,
      );
  };
  m.needsUpdate = true; // force a recompile so the patch takes effect

  let rafId: number | null = null;
  const started = performance.now();
  const loop = (now: number) => {
    rafId = requestAnimationFrame(loop);
    // Don't advance the twinkle (or even touch the uniform) while the tab is
    // hidden — nothing's painting anyway.
    if (document.hidden) return;
    uTime.value = ((now - started) / 1000) * rate;
  };
  rafId = requestAnimationFrame(loop);

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
  };
}
