/**
 * Non-destructive crop: render the FULL source image inside the (crop-aspect)
 * layer box with background-size/background-position tuned so only the crop
 * window is visible.
 *
 * With the image scaled so that `crop.w` source px span the box width:
 *   size% = (imgW / crop.w) * 100
 * and `crop.h` px span the box height:
 *   sizeY% = (imgH / crop.h) * 100
 *
 * background-position % aligns the p% point of the image with the p% point of
 * the container: offset = (container - image) * p/100. We want source pixel
 * (crop.x, crop.y) to land at (0,0) of the box:
 *   offsetX = -crop.x * (boxW / crop.w)
 *   p/100 = -crop.x * (boxW / crop.w) / (boxW - boxW * imgW / crop.w)
 *         = -crop.x / (crop.w - imgW)
 */
export interface CropRect {
  x: number
  y: number
  w: number
  h: number
  imgW: number
  imgH: number
}

export interface CropCss {
  sizeX: number
  sizeY: number
  posX: number
  posY: number
  backgroundSize: string
  backgroundPosition: string
}

export function cropBackgroundCss(crop: CropRect): CropCss {
  if (!crop || !Number.isFinite(crop.w) || !Number.isFinite(crop.h) || crop.w <= 0 || crop.h <= 0 || crop.imgW <= 0 || crop.imgH <= 0) {
    return { sizeX: 100, sizeY: 100, posX: 0, posY: 0, backgroundSize: '100% 100%', backgroundPosition: '0% 0%' }
  }
  const w = Math.min(crop.w, crop.imgW), h = Math.min(crop.h, crop.imgH)
  const x = Math.max(0, Math.min(crop.x, crop.imgW - w)), y = Math.max(0, Math.min(crop.y, crop.imgH - h))
  const sizeX = (crop.imgW / w) * 100
  const sizeY = (crop.imgH / h) * 100
  const posX = w >= crop.imgW ? 0 : (-x / (w - crop.imgW)) * 100
  const posY = h >= crop.imgH ? 0 : (-y / (h - crop.imgH)) * 100
  if (!Number.isFinite(sizeX) || !Number.isFinite(sizeY) || !Number.isFinite(posX) || !Number.isFinite(posY)) {
    return { sizeX: 100, sizeY: 100, posX: 0, posY: 0, backgroundSize: '100% 100%', backgroundPosition: '0% 0%' }
  }
  return {
    sizeX,
    sizeY,
    posX,
    posY,
    backgroundSize: `${sizeX}% ${sizeY}%`,
    backgroundPosition: `${posX}% ${posY}%`,
  }
}
