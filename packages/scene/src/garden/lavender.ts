import { Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, ShaderMaterial } from 'three'
import { OUTPUT_GLSL } from '../shared/glsl'
import { color } from '../shared/palette'

// Lavender (ラベンダー): a row of low tufts, each a camera-facing quad of thin
// green stems topped with purple spikes, drawn procedurally.

const vertexShader = /* glsl */ `
  attribute vec4 aTuft; // x, z, height, width
  uniform float uTime;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = position.xy + 0.5;
    vSeed = fract(aTuft.x * 3.17 + aTuft.y * 1.93);
    vec3 root = vec3(aTuft.x, 0.0, aTuft.y);
    vec3 toCam = cameraPosition - root;
    toCam.y = 0.0;
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toCam)));
    float up = vUv.y;
    float sway = sin(uTime * 1.1 + aTuft.x * 0.9 + aTuft.y * 1.4) * 0.03 * up * up;
    vec3 world = root + right * (position.x * aTuft.w + sway) + vec3(0.0, up * aTuft.z, 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uStem;
  uniform vec3 uBloom;
  uniform vec3 uBloomTip;
  varying vec2 vUv;
  varying float vSeed;

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    float cover = 0.0;
    vec3 col = uStem;
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      float x = 0.1 + 0.8 * (fi + hash(fi + vSeed * 17.0) * 0.8) / 9.0;
      float h = 0.62 + 0.36 * hash(fi * 3.1 + vSeed * 29.0);
      float lean = (x - 0.5) * 0.35 * vUv.y;
      float dx = abs(vUv.x - x - lean);
      float spike = smoothstep(h * 0.55, h * 0.62, vUv.y) * step(vUv.y, h);
      float width = mix(0.012, 0.034, spike) * (1.0 - 0.5 * smoothstep(h * 0.9, h, vUv.y));
      float aa = fwidth(vUv.x) * 1.2;
      float here = (1.0 - smoothstep(width - aa, width + aa, dx)) * step(vUv.y, h);
      if (here > cover) {
        cover = here;
        float bud = 0.75 + 0.25 * sin(vUv.y * 90.0 + fi);
        col = mix(uStem, mix(uBloom, uBloomTip, smoothstep(h * 0.6, h, vUv.y)) * bud, spike);
      }
    }
    if (cover < 0.02) discard;
    gl_FragColor = vec4(col, cover);
    ${OUTPUT_GLSL}
  }
`

export function createLavenderMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStem: { value: color('#7D9474') },
      uBloom: { value: color('#8F7CC6') },
      uBloomTip: { value: color('#B9A8E6') },
    },
    vertexShader,
    fragmentShader,
    alphaToCoverage: true,
  })
}

export function createLavenderGeometry(tufts: Float32Array): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3))
  geometry.setAttribute('aTuft', new InstancedBufferAttribute(tufts, 4))
  geometry.instanceCount = Math.floor(tufts.length / 4)
  return geometry
}
