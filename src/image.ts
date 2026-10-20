export function trimTransparent(dataUrl: string): Promise<{ dataUrl: string; x: number; y: number; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const id = ctx.getImageData(0, 0, c.width, c.height)
      const d = id.data
      let minX = c.width, minY = c.height, maxX = 0, maxY = 0
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (d[(y * c.width + x) * 4 + 3] > 0) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      if (minX > maxX || minY > maxY) {
        resolve({ dataUrl, x: 0, y: 0, w: c.width, h: c.height })
        return
      }
      const tw = maxX - minX + 1
      const th = maxY - minY + 1
      const out = document.createElement('canvas')
      out.width = tw
      out.height = th
      const octx = out.getContext('2d')!
      octx.drawImage(c, minX, minY, tw, th, 0, 0, tw, th)
      resolve({ dataUrl: out.toDataURL('image/png'), x: minX, y: minY, w: tw, h: th })
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

/** Convert a base64 data URL into raw bytes (for writing files to disk). */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1]
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Bake the non-destructive crop window of a full image into a standalone PNG
 *  data URL (drawn at the crop's pixel dimensions). Used so region-based
 *  operations (e.g. AI background removal) run on the CROPPED image, not the
 *  full original. */
export function cropToDataUrl(
  dataUrl: string,
  crop: { x: number; y: number; w: number; h: number; imgW: number; imgH: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(crop.w))
      c.height = Math.max(1, Math.round(crop.h))
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}
