"use client";

import { useEffect, useRef } from "react";

type ChromaKeyOptions = {
  /** The exact background color to remove, as [r, g, b] (0-255). */
  keyColor: readonly [number, number, number];
  /** The color to composite in its place. */
  bgColor?: readonly [number, number, number];
  /** Pixels within this distance of keyColor are fully replaced. */
  innerThreshold?: number;
  /** Pixels beyond this distance are left untouched (fully foreground). */
  outerThreshold?: number;
  /** Internal processing width cap — a kiosk avatar is viewed from a couple
   *  of feet away, not pixel-peeped, so trading some sharpness for headroom
   *  on modest kiosk hardware is a good default rather than always
   *  processing at the source's native resolution. */
  maxWidth?: number;
};

/**
 * Draws a <video> onto a <canvas> every frame with a solid-color backdrop
 * (a real green screen) keyed out and replaced by bgColor, so the avatar
 * composites as an actual cutout instead of sitting in front of a colored
 * rectangle. Runs entirely in the browser: the video is already decoding
 * (LiveAvatar streams it in), this just reads the pixels back out.
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
  {
    keyColor,
    bgColor = [255, 255, 255],
    innerThreshold = 60,
    outerThreshold = 140,
    maxWidth = 640,
  }: ChromaKeyOptions
) {
  // Read from a ref inside the rAF loop so a parent re-render with new
  // option values doesn't have to restart the loop (identity of the options
  // object isn't guaranteed stable across renders) — synced after each
  // commit via an effect, never written during render itself.
  const optsRef = useRef({ keyColor, bgColor, innerThreshold, outerThreshold, maxWidth });
  useEffect(() => {
    optsRef.current = { keyColor, bgColor, innerThreshold, outerThreshold, maxWidth };
  }, [keyColor, bgColor, innerThreshold, outerThreshold, maxWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!active || !canvas) return;
    const video = videoRef.current;
    if (!video) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    let raf = 0;
    let cancelled = false;

    const draw = () => {
      if (cancelled) return;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh) {
        const { keyColor, bgColor, innerThreshold, outerThreshold, maxWidth } = optsRef.current;
        const scale = Math.min(1, maxWidth / vw);
        const w = Math.max(1, Math.round(vw * scale));
        const h = Math.max(1, Math.round(vh * scale));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctx.drawImage(video, 0, 0, w, h);
        const frame = ctx.getImageData(0, 0, w, h);
        const data = frame.data;
        const [kr, kg, kb] = keyColor;
        const [bgR, bgG, bgB] = bgColor;
        const span = Math.max(1, outerThreshold - innerThreshold);
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const dr = r - kr;
          const dg = g - kg;
          const db = b - kb;
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          let alpha; // 0 = fully background, 1 = fully original pixel
          if (dist <= innerThreshold) alpha = 0;
          else if (dist >= outerThreshold) alpha = 1;
          else alpha = (dist - innerThreshold) / span;

          // Spill suppression: on partially-keyed edge pixels (hair,
          // soft shadow), clamp green down to the stronger of red/blue so
          // the composite doesn't carry a green fringe.
          const maxRB = r > b ? r : b;
          const g2 = g > maxRB ? maxRB : g;

          data[i] = r * alpha + bgR * (1 - alpha);
          data[i + 1] = g2 * alpha + bgG * (1 - alpha);
          data[i + 2] = b * alpha + bgB * (1 - alpha);
        }
        ctx.putImageData(frame, 0, 0);
      }
      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      // Otherwise the last-drawn frame lingers on screen after Cancel/stop.
      const c = canvas.getContext("2d");
      c?.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, videoRef, canvasRef]);
}
