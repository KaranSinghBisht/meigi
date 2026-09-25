// One step of the damped 2D wave equation on the ripple height field.
// State texture: R = height now, G = height one step ago.

export const MAX_SIM_DROPS = 8

export const simVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const simFragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D uState;
  uniform vec2 uTexel;
  uniform vec4 uMap;      // xSpan, invNear, invFar, unused
  uniform vec2 uOrigin;   // world x, z the mapping is centred on
  uniform float uCourant;
  uniform float uDamping;
  uniform vec4 uDrops[${MAX_SIM_DROPS}];  // x, z, radius, amplitude
  uniform int uDropCount;
  uniform vec4 uWake;     // segment start xz, end xz
  uniform vec2 uWakeShape; // radius, amplitude
  varying vec2 vUv;

  float depthAt(float w) {
    return 1.0 / mix(uMap.z, uMap.y, w);
  }

  vec2 worldAt(vec2 uv) {
    float d = depthAt(uv.y);
    return vec2(uOrigin.x + (uv.x - 0.5) * uMap.x * d, uOrigin.y - d);
  }

  float bump(float dist, float radius) {
    float q = dist / radius;
    return exp(-q * q);
  }

  float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    float len2 = dot(ab, ab);
    float t = len2 > 1e-8 ? clamp(dot(p - a, ab) / len2, 0.0, 1.0) : 0.0;
    return length(p - (a + ab * t));
  }

  float sources(vec2 p) {
    float added = 0.0;
    for (int i = 0; i < ${MAX_SIM_DROPS}; i++) {
      if (i >= uDropCount) break;
      vec4 drop = uDrops[i];
      added += drop.w * bump(length(p - drop.xy), drop.z);
    }
    if (uWakeShape.y != 0.0) {
      added += uWakeShape.y * bump(segmentDistance(p, uWake.xy, uWake.zw), uWakeShape.x);
    }
    return added;
  }

  void main() {
    vec4 state = texture2D(uState, vUv);
    float h = state.r;
    float left = texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r;
    float right = texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r;
    float down = texture2D(uState, vUv - vec2(0.0, uTexel.y)).r;
    float up = texture2D(uState, vUv + vec2(0.0, uTexel.y)).r;

    // Texel footprint in world units; rows nearer the horizon are deeper.
    float d = depthAt(vUv.y);
    float dx = d * uMap.x * uTexel.x;
    float dz = d * d * (uMap.y - uMap.z) * uTexel.y;
    float cu = uCourant;
    float cw = min(uCourant * dx / dz, 0.68);

    float next = 2.0 * h - state.g
      + cu * cu * (left + right - 2.0 * h)
      + cw * cw * (up + down - 2.0 * h);

    // A soft sponge at the borders so rings fade instead of bouncing back.
    vec2 edge = min(vUv, 1.0 - vUv);
    float sponge = smoothstep(0.0, 0.06, min(edge.x, edge.y));
    next *= mix(0.9, uDamping, sponge);

    // Sources displace both time levels: a dent with no initial velocity.
    // Adding to the new level only would be a velocity kick that keeps
    // deepening wide drops for dozens of steps.
    float src = sources(worldAt(vUv));
    gl_FragColor = vec4(next + src, h + src, 0.0, 1.0);
  }
`
