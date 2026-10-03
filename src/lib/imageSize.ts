// Loeb PNG, JPEG ja WebP pildi tüübi ja mõõdud faili päisest. Brauseri
// saadetud MIME-tüüpi ei usaldata; muud vormingud (sh SVG) lükatakse tagasi.

export type ImageInfo = { type: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number }

const MAX_DIMENSION = 20_000

function valid(info: ImageInfo | null): ImageInfo | null {
  if (!info) return null
  const ok = (value: number) => Number.isInteger(value) && value > 0 && value <= MAX_DIMENSION
  return ok(info.width) && ok(info.height) ? info : null
}

function png(bytes: Uint8Array): ImageInfo | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || signature.some((byte, index) => bytes[index] !== byte)) return null
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { type: "image/png", width: view.getUint32(16), height: view.getUint32(20) }
}

function jpeg(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null
    let marker = bytes[offset + 1]
    // Täitebaidid enne markerit.
    while (marker === 0xff && offset + 2 < bytes.length) { offset++; marker = bytes[offset + 1] }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue }
    if (marker === 0xd9 || marker === 0xda) return null
    if (offset + 4 > bytes.length) return null
    const length = view.getUint16(offset + 2)
    if (length < 2) return null
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isFrame) {
      if (offset + 9 > bytes.length) return null
      return { type: "image/jpeg", height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) }
    }
    offset += 2 + length
  }
  return null
}

function webp(bytes: Uint8Array): ImageInfo | null {
  if (bytes.length < 30) return null
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (text(0, 4) !== "RIFF" || text(8, 12) !== "WEBP") return null
  const chunk = text(12, 16)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (chunk === "VP8 ") {
    // Võtmekaadri allkiri 9d 01 2a.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null
    return { type: "image/webp", width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff }
  }
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) return null
    const [b0, b1, b2, b3] = [bytes[21], bytes[22], bytes[23], bytes[24]]
    return {
      type: "image/webp",
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
    }
  }
  if (chunk === "VP8X") {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16))
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
    return { type: "image/webp", width, height }
  }
  return null
}

export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  return valid(png(bytes) ?? jpeg(bytes) ?? webp(bytes))
}
