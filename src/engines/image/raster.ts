/** Minimal RGBA raster (compatible with ImageData) used by all pure image operations. */
export type Raster = { width: number; height: number; data: Uint8ClampedArray };

export function createRaster(width: number, height: number, fill?: [number, number, number, number]): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill) for (let i = 0; i < data.length; i += 4) { data[i] = fill[0]; data[i + 1] = fill[1]; data[i + 2] = fill[2]; data[i + 3] = fill[3]; }
  return { width, height, data };
}

export function cloneRaster(r: Raster): Raster {
  return { width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) };
}

export function getPixel(r: Raster, x: number, y: number): [number, number, number, number] {
  const i = (y * r.width + x) * 4;
  return [r.data[i], r.data[i + 1], r.data[i + 2], r.data[i + 3]];
}

/** Bilinear sample at fractional coordinate (premultiplied interpolation). Writes into out. */
export function sampleBilinear(r: Raster, x: number, y: number, out: number[]): void {
  const { width: w, height: h, data } = r;
  if (x < -0.5 || y < -0.5 || x > w - 0.5 || y > h - 0.5) { out[0] = out[1] = out[2] = out[3] = 0; return; }
  const xf = Math.min(Math.max(x, 0), w - 1), yf = Math.min(Math.max(y, 0), h - 1);
  const x0 = Math.floor(xf), y0 = Math.floor(yf);
  const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const fx = xf - x0, fy = yf - y0;
  let rr = 0, gg = 0, bb = 0, aa = 0;
  const acc = (px: number, py: number, wt: number) => {
    const i = (py * w + px) * 4;
    const a = data[i + 3] * wt;
    rr += data[i] * a; gg += data[i + 1] * a; bb += data[i + 2] * a; aa += a;
  };
  acc(x0, y0, (1 - fx) * (1 - fy));
  acc(x1, y0, fx * (1 - fy));
  acc(x0, y1, (1 - fx) * fy);
  acc(x1, y1, fx * fy);
  if (aa <= 0) { out[0] = out[1] = out[2] = out[3] = 0; return; }
  out[0] = rr / aa; out[1] = gg / aa; out[2] = bb / aa; out[3] = aa;
}

/** Generic inverse-mapping warp: for each output pixel, mapFn returns the source coordinate. */
export function warp(src: Raster, outW: number, outH: number, mapFn: (x: number, y: number, out: number[]) => boolean): Raster {
  const dst = createRaster(outW, outH);
  const p = [0, 0];
  const s = [0, 0, 0, 0];
  for (let y = 0; y < outH; y++)
    for (let x = 0; x < outW; x++) {
      if (!mapFn(x + 0.5, y + 0.5, p)) continue;
      sampleBilinear(src, p[0] - 0.5, p[1] - 0.5, s);
      const i = (y * outW + x) * 4;
      dst.data[i] = s[0]; dst.data[i + 1] = s[1]; dst.data[i + 2] = s[2]; dst.data[i + 3] = s[3];
    }
  return dst;
}

export function resize(src: Raster, w: number, h: number): Raster {
  const sx = src.width / w, sy = src.height / h;
  if (sx > 2 || sy > 2) {
    // area-average downscale for quality
    const dst = createRaster(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
        const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let yy = y0; yy < y1; yy++)
          for (let xx = x0; xx < x1; xx++) {
            const i = (yy * src.width + xx) * 4; const al = src.data[i + 3];
            r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al; n++;
          }
        const i = (y * w + x) * 4;
        if (a > 0) { dst.data[i] = r / a; dst.data[i + 1] = g / a; dst.data[i + 2] = b / a; }
        dst.data[i + 3] = a / n;
      }
    return dst;
  }
  return warp(src, w, h, (x, y, o) => { o[0] = x * sx; o[1] = y * sy; return true; });
}
