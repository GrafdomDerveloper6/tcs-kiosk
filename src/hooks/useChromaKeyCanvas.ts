"use client";

import { useEffect, useRef } from "react";

type ChromaKeyOptions = {
  /** The exact background color to remove, as [r, g, b] (0-255). */
  keyColor: readonly [number, number, number];
  /** Pixels within this distance of keyColor are fully replaced. */
  innerThreshold?: number;
  /** Pixels beyond this distance are left untouched (fully foreground). */
  outerThreshold?: number;
  /** Cap on the processing resolution. The GPU path can afford the source's
   *  native 1280x720; the CPU fallback below drops itself to 640 wide, since
   *  there every extra pixel is main-thread work. */
  maxWidth?: number;
};

type ResolvedOptions = {
  keyColor: readonly [number, number, number];
  innerThreshold: number;
  outerThreshold: number;
  maxWidth: number;
};

/** Both paths present the same face to the loop that drives them. */
type Renderer = {
  draw: (video: HTMLVideoElement, opts: ResolvedOptions) => void;
  clear: () => void;
};

const VERTEX_SRC = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  // Video frames arrive top-down, GL samples bottom-up, so flip V here.
  vUv = vec2((aPos.x + 1.0) * 0.5, 1.0 - (aPos.y + 1.0) * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/* Same maths as the CPU path, one pixel per fragment: distance to the key
   colour, linearly feathered between the two thresholds (not smoothstep —
   the thresholds were tuned against a captured frame with a linear ramp),
   plus the green-spill clamp. */
const FRAGMENT_SRC = `
precision mediump float;
uniform sampler2D uTex;
uniform vec3 uKey;
uniform float uInner;
uniform float uOuter;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(uTex, vUv);
  float dist = distance(c.rgb, uKey);
  float alpha = clamp((dist - uInner) / max(uOuter - uInner, 0.0001), 0.0, 1.0);
  float g = min(c.g, max(c.r, c.b));
  gl_FragColor = vec4(c.r, g, c.b, alpha);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn("[chroma] shader failed to compile:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * GPU path. The frame goes video -> texture -> framebuffer without ever
 * being read back into JS, which is the whole point: the CPU path below
 * has to pull every frame out of GPU memory (drawImage into a
 * willReadFrequently canvas), walk it pixel by pixel, and push it back —
 * measured at ~8ms of main thread per frame on a dev machine, and this
 * runs on kiosk hardware.
 */
function createWebglRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = (canvas.getContext("webgl", {
    premultipliedAlpha: false,
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
  }) ?? null) as WebGLRenderingContext | null;
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  const program = vs && fs ? gl.createProgram() : null;
  if (!vs || !fs || !program) return null;

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn("[chroma] program failed to link:", gl.getProgramInfoLog(program));
    return null;
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  // No mipmaps and clamped edges: the frame is not power-of-two.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const uKey = gl.getUniformLocation(program, "uKey");
  const uInner = gl.getUniformLocation(program, "uInner");
  const uOuter = gl.getUniformLocation(program, "uOuter");

  // The alpha coming out of the shader is the final value, not something to
  // blend against what was already there.
  gl.disable(gl.BLEND);

  return {
    draw(video, opts) {
      const scale = Math.min(1, opts.maxWidth / video.videoWidth);
      const w = Math.max(1, Math.round(video.videoWidth * scale));
      const h = Math.max(1, Math.round(video.videoHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      const [kr, kg, kb] = opts.keyColor;
      gl.uniform3f(uKey, kr / 255, kg / 255, kb / 255);
      gl.uniform1f(uInner, opts.innerThreshold / 255);
      gl.uniform1f(uOuter, opts.outerThreshold / 255);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    clear() {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
  };
}

/** CPU fallback, for hardware or a browser where WebGL won't start. Same
 *  output, just paid for on the main thread. */
function create2dRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  return {
    draw(video, opts) {
      // Deliberately smaller than the GPU path: here resolution is spent
      // directly out of the frame budget.
      const cap = Math.min(opts.maxWidth, 640);
      const scale = Math.min(1, cap / video.videoWidth);
      const w = Math.max(1, Math.round(video.videoWidth * scale));
      const h = Math.max(1, Math.round(video.videoHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.drawImage(video, 0, 0, w, h);
      const frame = ctx.getImageData(0, 0, w, h);
      const data = frame.data;
      const [kr, kg, kb] = opts.keyColor;
      const span = Math.max(1, opts.outerThreshold - opts.innerThreshold);
      /* Thresholds compared squared so the common cases — fully keyed
         backdrop and fully opaque subject, together the vast majority of
         pixels — cost no sqrt at all. Only the feather band pays for one. */
      const inner2 = opts.innerThreshold * opts.innerThreshold;
      const outer2 = opts.outerThreshold * opts.outerThreshold;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const dr = r - kr;
        const dg = g - kg;
        const db = b - kb;
        const d2 = dr * dr + dg * dg + db * db;
        let alpha; // 0 = fully transparent, 255 = fully opaque/original
        if (d2 <= inner2) alpha = 0;
        else if (d2 >= outer2) alpha = 255;
        else alpha = ((Math.sqrt(d2) - opts.innerThreshold) / span) * 255;

        // Spill suppression: on partially-keyed edge pixels (hair, soft
        // shadow), clamp green down to the stronger of red/blue so the
        // cutout doesn't carry a green fringe.
        const maxRB = r > b ? r : b;
        if (g > maxRB) data[i + 1] = maxRB;
        data[i + 3] = alpha;
      }
      ctx.putImageData(frame, 0, 0);
    },
    clear() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

/**
 * Draws a <video> onto a <canvas> with a solid-color backdrop (a real green
 * screen) keyed out to actual alpha transparency — not composited onto a
 * solid replacement color — so whatever sits behind the canvas in the page
 * shows straight through, the same way the static poster's own real alpha
 * channel does.
 *
 * Tuned offline against a captured frame from the real avatar rather than
 * guessed — see tune-key.js in the repo history for how innerThreshold /
 * outerThreshold were picked. Distance-to-known-color (not the more usual
 * "excess green" heuristic) because the source here is a genuinely flat,
 * evenly lit screen, so the exact key color is known and stable.
 */
export function useChromaKeyCanvas(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  active: boolean,
  { keyColor, innerThreshold = 60, outerThreshold = 140, maxWidth = 1280 }: ChromaKeyOptions
) {
  // Read from a ref inside the frame loop so a parent re-render with new
  // option values doesn't have to restart the loop (identity of the options
  // object isn't guaranteed stable across renders) — synced after each
  // commit via an effect, never written during render itself.
  const optsRef = useRef<ResolvedOptions>({ keyColor, innerThreshold, outerThreshold, maxWidth });
  useEffect(() => {
    optsRef.current = { keyColor, innerThreshold, outerThreshold, maxWidth };
  }, [keyColor, innerThreshold, outerThreshold, maxWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas) return;
    const video = videoRef.current;
    if (!video) return;

    const renderer = createWebglRenderer(canvas) ?? create2dRenderer(canvas);
    if (!renderer) return;

    let cancelled = false;
    let raf = 0;
    let rvfc = 0;

    const draw = () => {
      if (video.videoWidth && video.videoHeight) renderer.draw(video, optsRef.current);
    };

    /* Key once per *newly presented* video frame, not once per display
       refresh. The stream runs at roughly 20fps while requestAnimationFrame
       wants 60, so driving this off rAF re-keyed each frame two or three
       times over — pure cost for an identical picture. Measured ~47 keyed
       frames/sec against ~19 real ones before this. */
    const onVideoFrame = () => {
      if (cancelled) return;
      draw();
      rvfc = video.requestVideoFrameCallback(onVideoFrame);
    };
    const onAnimationFrame = () => {
      if (cancelled) return;
      draw();
      raf = requestAnimationFrame(onAnimationFrame);
    };

    if (typeof video.requestVideoFrameCallback === "function") {
      rvfc = video.requestVideoFrameCallback(onVideoFrame);
    } else {
      raf = requestAnimationFrame(onAnimationFrame);
    }

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      if (rvfc) video.cancelVideoFrameCallback?.(rvfc);
      // Otherwise the last-drawn frame lingers on screen after Cancel/stop.
      renderer.clear();
    };
  }, [active, videoRef, canvasRef]);
}
