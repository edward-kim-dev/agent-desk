/**
 * sondaven 의 fragment shader 를 1:1 그대로 복제.
 * 인접 셀 침식(neighbor erosion)은 unrolled 루프로 생성됩니다.
 */

export const VERT_SRC = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    v_texCoord = a_texCoord;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

function buildErosion(radius: number): string {
  let s = "";
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (dx === 0 && dy === 0) continue;
      s += `
        neighbor = texture2D(u_texture, cc + vec2(${dx.toFixed(1)}, ${dy.toFixed(1)}) * texelSize);
        if (neighbor.a < 0.01 || (neighbor.r < 0.01 && neighbor.g < 0.01 && neighbor.b < 0.01)) discard;`;
    }
  }
  return s;
}

export function buildFragSrc(neighborRadius: number): string {
  return `
    precision mediump float;
    uniform sampler2D u_texture;
    uniform vec2  u_resolution;
    uniform vec2  u_texSize;
    uniform vec2  u_gridSize;
    uniform float u_minWidth;
    uniform float u_maxWidth;
    uniform float u_threshold;
    uniform float u_gamma;
    uniform float u_blackPoint;
    uniform float u_whitePoint;
    uniform vec3  u_bgColor;
    uniform vec3  u_fillColor;
    uniform float u_bgOpacity;
    uniform float u_fillOpacity;
    uniform vec4  u_bounds;
    varying vec2  v_texCoord;

    void main() {
      vec2 p  = gl_FragCoord.xy;
      vec2 b0 = u_bounds.xy;
      vec2 b1 = u_bounds.zw;
      if (p.x < b0.x || p.x > b1.x || p.y < b0.y || p.y > b1.y) discard;

      vec2 lc = (p - b0) / (b1 - b0);
      vec2 cs = 1.0 / u_gridSize;
      vec2 ci = floor(lc / cs);
      vec2 cc = (ci + 0.5) * cs;

      vec4 tc = texture2D(u_texture, cc);
      if (tc.a < 0.01 || (tc.r < 0.01 && tc.g < 0.01 && tc.b < 0.01)) discard;

      vec2 texelSize = 1.0 / u_texSize;
      vec4 neighbor;
      ${buildErosion(neighborRadius)}

      vec3 rgb = tc.rgb;
      if (u_gamma != 1.0) rgb = pow(rgb, vec3(u_gamma));

      float range = u_whitePoint - u_blackPoint;
      if (range != 0.0) {
        rgb = clamp((rgb * 255.0 - u_blackPoint) / range, 0.0, 1.0);
      }

      float br = dot(rgb, vec3(0.333)) * tc.a;
      if (br > u_threshold / 255.0) {
        gl_FragColor = vec4(u_bgColor, u_bgOpacity);
        return;
      }

      vec2 cl = (lc - ci * cs) / cs;
      float lw = ((1.0 - br) * (u_maxWidth - u_minWidth) + u_minWidth)
        / (b1.x - b0.x) * u_gridSize.x;

      gl_FragColor = abs(cl.x - 0.5) < lw * 0.5
        ? vec4(u_fillColor, u_fillOpacity)
        : vec4(u_bgColor, u_bgOpacity);
    }
  `;
}
