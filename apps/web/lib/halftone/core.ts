import { VERT_SRC, buildFragSrc } from "./shader";
import { makeTextCanvas } from "./text";
import type {
  HalftoneHandle,
  HalftoneOptions,
  ObjectConfig,
  SceneObject,
} from "./types";

/** 내부 로드 후 상태 */
interface LoadedObject extends SceneObject {
  el?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
  tex?: WebGLTexture;
  width: number;
  height: number;
  lastVideoTime: number;
}

function parseColor(c: string | [number, number, number]): [number, number, number] {
  if (Array.isArray(c)) return c;
  const hex = c.replace("#", "").trim();
  const full = hex.length === 3 ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] : hex;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

function parseSize(v: string | number | undefined, base: number, vw?: number): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  if (v.endsWith("%")) return (parseFloat(v) / 100) * base;
  if (v.endsWith("vw") && vw != null) return (parseFloat(v) / 100) * vw;
  if (v.endsWith("px")) return parseFloat(v);
  return parseFloat(v);
}

const FALLBACK_CONFIG: Required<ObjectConfig> = {
  x: 0,
  y: 0,
  width: "100%",
  height: "100%",
  xSquares: 100,
  ySquares: 0,
  minSquareWidth: "-2%",
  maxSquareWidth: "102%",
  threshold: 255,
  gamma: 1.0,
  blackPoint: 0,
  whitePoint: 255,
  bgOpacity: 0,
  fillOpacity: 1,
};

/**
 * 캔버스 하나 위에 여러 오브젝트를 sondaven halftone shader 로 합성하는 엔진.
 */
export class Halftone implements HalftoneHandle {
  private gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private U: Record<string, WebGLUniformLocation | null> = {};
  private objects: LoadedObject[];
  private opts: HalftoneOptions;
  private fillRGB: [number, number, number];
  private bgRGB: [number, number, number];
  private rafId: number | null = null;
  private running = false;
  private ro: ResizeObserver | null = null;
  private destroyed = false;

  constructor(private canvas: HTMLCanvasElement, options: HalftoneOptions) {
    this.opts = options;
    this.fillRGB = parseColor(options.fillColor ?? "#1a1208");
    this.bgRGB = parseColor(options.bgColor ?? "#ffffff");

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL unsupported");
    this.gl = gl;

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

    const radius = Math.max(0, Math.min(3, options.neighborRadius ?? 2));
    this.prog = this.compile(buildFragSrc(radius));
    gl.useProgram(this.prog);
    this.setupBuffers();
    this.cacheUniforms();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(this.U.tex, 0);

    // 오브젝트 초기 상태
    this.objects = options.objects.map((o) => ({
      ...o,
      config: { ...(options.defaultConfig ?? {}), ...o.config },
      width: 1,
      height: 1,
      lastVideoTime: -1,
    }));

    this.load()
      .then(() => {
        if (this.destroyed) return;
        this.resize();
        this.opts.onReady?.();
        this.resume();
      })
      .catch((err) => {
        console.error("[halftone] load failed", err);
        this.opts.onError?.(err);
      });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement ?? canvas);
  }

  // ── 셰이더 / 버퍼 ───────────────────────────────────────────────────
  private compile(fragSrc: string): WebGLProgram {
    const gl = this.gl;
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) throw new Error("shader create failed");
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        throw new Error("shader compile: " + log);
      }
      return s;
    };
    const p = gl.createProgram();
    if (!p) throw new Error("program create failed");
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VERT_SRC));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fragSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("program link: " + gl.getProgramInfoLog(p));
    }
    return p;
  }

  private setupBuffers() {
    const gl = this.gl;
    const aPos = gl.getAttribLocation(this.prog, "a_position");
    const aUV = gl.getAttribLocation(this.prog, "a_texCoord");

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uvBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
  }

  private cacheUniforms() {
    const names = [
      "u_texture",
      "u_resolution",
      "u_texSize",
      "u_gridSize",
      "u_minWidth",
      "u_maxWidth",
      "u_threshold",
      "u_gamma",
      "u_blackPoint",
      "u_whitePoint",
      "u_bgColor",
      "u_fillColor",
      "u_bgOpacity",
      "u_fillOpacity",
      "u_bounds",
    ];
    const short: Record<string, string> = {
      u_texture: "tex",
      u_resolution: "res",
      u_texSize: "texSize",
      u_gridSize: "gridSize",
      u_minWidth: "minW",
      u_maxWidth: "maxW",
      u_threshold: "threshold",
      u_gamma: "gamma",
      u_blackPoint: "blackPoint",
      u_whitePoint: "whitePoint",
      u_bgColor: "bgColor",
      u_fillColor: "fillColor",
      u_bgOpacity: "bgOpacity",
      u_fillOpacity: "fillOpacity",
      u_bounds: "bounds",
    };
    for (const n of names) {
      this.U[short[n]] = this.gl.getUniformLocation(this.prog, n);
    }
  }

  // ── 텍스처 로딩 ─────────────────────────────────────────────────────
  private makeTex(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    if (!t) throw new Error("texture create failed");
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  private async loadImage(obj: LoadedObject): Promise<void> {
    const gl = this.gl;
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => {
        obj.el = im;
        obj.width = im.naturalWidth;
        obj.height = im.naturalHeight;
        obj.tex = this.makeTex();
        gl.bindTexture(gl.TEXTURE_2D, obj.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        resolve();
      };
      im.onerror = () => reject(new Error(`image load: ${obj.src}`));
      im.src = obj.src!;
    });
  }

  private async loadVideo(obj: LoadedObject): Promise<void> {
    const gl = this.gl;
    return new Promise((resolve) => {
      const v = document.createElement("video");
      v.crossOrigin = "anonymous";
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.autoplay = true;
      ["muted", "playsinline", "webkit-playsinline"].forEach((a) => v.setAttribute(a, ""));
      v.preload = "auto";
      v.src = obj.src!;
      obj.tex = this.makeTex();
      obj.el = v;

      let done = false;
      const ready = () => {
        if (done) return;
        done = true;
        obj.width = v.videoWidth || 1920;
        obj.height = v.videoHeight || 1080;
        gl.bindTexture(gl.TEXTURE_2D, obj.tex!);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
        } catch {
          /* not ready yet — first frame will retry in render */
        }
        v.play().catch(() => {});
        resolve();
      };
      v.addEventListener("loadeddata", ready);
      v.addEventListener("canplay", ready);
      v.addEventListener("error", () => {
        if (!done) {
          done = true;
          console.warn("[halftone] video error:", obj.src);
          resolve();
        }
      });
      v.load();
      setTimeout(ready, 5000);
    });
  }

  private async loadText(obj: LoadedObject): Promise<void> {
    const gl = this.gl;
    if ("fonts" in document) {
      try {
        await (document as Document).fonts.ready;
      } catch {
        /* ignore */
      }
    }
    const c = makeTextCanvas(obj.text ?? "", obj.textOptions);
    obj.el = c;
    obj.width = c.width;
    obj.height = c.height;
    obj.tex = this.makeTex();
    gl.bindTexture(gl.TEXTURE_2D, obj.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  }

  private async load(): Promise<void> {
    await Promise.all(
      this.objects.map((o) => {
        if (o.type === "image") return this.loadImage(o);
        if (o.type === "video") return this.loadVideo(o);
        return this.loadText(o);
      }),
    );
  }

  // ── 크기 / 렌더 ─────────────────────────────────────────────────────
  private resize() {
    const gl = this.gl;
    const dprCap = this.opts.dprCap ?? 1.5;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const parent = this.canvas.parentElement;
    const cssW = parent ? parent.clientWidth : this.canvas.clientWidth;
    const aspect = this.opts.aspectRatio ?? this.intrinsicAspect();
    const cssH = Math.max(1, Math.round(cssW / aspect));
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";
    this.canvas.width = Math.max(1, Math.round(cssW * dpr));
    this.canvas.height = Math.max(1, Math.round(cssH * dpr));
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (this.U.res) gl.uniform2f(this.U.res, this.canvas.width, this.canvas.height);
  }

  private intrinsicAspect(): number {
    const base = this.objects.find((o) => o.tex);
    if (base && base.width && base.height) return base.width / base.height;
    return 16 / 9;
  }

  private drawObject(obj: LoadedObject) {
    if (!obj.tex || !obj.el) return;
    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const VW = window.innerWidth;

    gl.bindTexture(gl.TEXTURE_2D, obj.tex);

    if (obj.type === "video") {
      const v = obj.el as HTMLVideoElement;
      if (v.readyState >= 2 && v.currentTime !== obj.lastVideoTime) {
        obj.lastVideoTime = v.currentTime;
        try {
          gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, v);
        } catch {
          try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
          } catch {
            /* skip frame */
          }
        }
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        if (vw && vh) {
          obj.width = vw;
          obj.height = vh;
        }
      }
    }

    const cfg = { ...FALLBACK_CONFIG, ...obj.config };
    gl.uniform2f(this.U.texSize, obj.width, obj.height);

    const x = parseSize(cfg.x, W, VW);
    const y = parseSize(cfg.y, H, VW);
    const w = parseSize(cfg.width, W, VW);
    const h = parseSize(cfg.height, H, VW);
    const xSq = cfg.xSquares;
    const ySq = cfg.ySquares
      ? cfg.ySquares
      : Math.max(1, Math.round(xSq / (Math.max(w, 1) / Math.max(h, 1))));
    const cellPx = w / xSq;

    gl.uniform2f(this.U.gridSize, xSq, ySq);
    gl.uniform1f(this.U.minW, parseSize(cfg.minSquareWidth, cellPx));
    gl.uniform1f(this.U.maxW, parseSize(cfg.maxSquareWidth, cellPx));
    gl.uniform1f(this.U.threshold, cfg.threshold);
    gl.uniform1f(this.U.gamma, cfg.gamma);
    gl.uniform1f(this.U.blackPoint, cfg.blackPoint);
    gl.uniform1f(this.U.whitePoint, cfg.whitePoint);
    gl.uniform3fv(this.U.bgColor, this.bgRGB);
    gl.uniform3fv(this.U.fillColor, this.fillRGB);
    gl.uniform1f(this.U.bgOpacity, cfg.bgOpacity);
    gl.uniform1f(this.U.fillOpacity, cfg.fillOpacity);
    gl.uniform4f(this.U.bounds, x, H - y - h, x + w, H - y);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private frame = () => {
    if (!this.running) return;
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const o of this.objects) this.drawObject(o);
    this.rafId = requestAnimationFrame(this.frame);
  };

  // ── 외부 API ────────────────────────────────────────────────────────
  resume() {
    if (this.running || this.destroyed) return;
    this.running = true;
    for (const o of this.objects) {
      if (o.type === "video" && o.el) (o.el as HTMLVideoElement).play().catch(() => {});
    }
    this.rafId = requestAnimationFrame(this.frame);
  }
  pause() {
    this.running = false;
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    for (const o of this.objects) {
      if (o.type === "video" && o.el) (o.el as HTMLVideoElement).pause();
    }
  }

  private resolve(nameOrIndex: string | number): LoadedObject | undefined {
    if (typeof nameOrIndex === "number") return this.objects[nameOrIndex];
    return this.objects.find((o) => o.name === nameOrIndex);
  }
  setConfig(nameOrIndex: string | number, patch: Partial<ObjectConfig>) {
    const o = this.resolve(nameOrIndex);
    if (!o) return;
    o.config = { ...o.config, ...patch };
  }
  getConfig(nameOrIndex: string | number): ObjectConfig | undefined {
    return this.resolve(nameOrIndex)?.config;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pause();
    this.ro?.disconnect();
    const gl = this.gl;
    for (const o of this.objects) {
      if (o.tex) gl.deleteTexture(o.tex);
      if (o.type === "video" && o.el) {
        const v = o.el as HTMLVideoElement;
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
    }
    gl.deleteProgram(this.prog);
  }
}
