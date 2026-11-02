import type { PointCloud } from './geometry'

export interface ModelData { positions: Float32Array; colors?: Uint8Array; indices?: Uint32Array; sourceFormat: 'ply' | 'obj' | 'glb' | 'synthetic' | 'ar' }

/** Lê PLY (ASCII ou binário LE/BE): vértices x,y,z (+ r,g,b) e faces triangulares/quadrangulares. Unidade assumida: metro. */
export function parsePLY(buf: ArrayBuffer): ModelData {
  const bytes = new Uint8Array(buf)
  const text = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 8192)))
  const end = text.indexOf('end_header')
  if (!text.startsWith('ply') || end < 0) throw new Error('Ficheiro PLY inválido: cabeçalho em falta.')
  const headerEnd = text.indexOf('\n', end) + 1
  const lines = text.slice(0, headerEnd).split(/\r?\n/)
  let format = 'ascii', nv = 0, nf = 0
  const vprops: { name: string; type: string }[] = []; let faceCountT = 'uchar', faceIdxT = 'int', cur = ''
  for (const l of lines) {
    const t = l.trim().split(/\s+/)
    if (t[0] === 'format') format = t[1]
    else if (t[0] === 'element') { cur = t[1]; if (cur === 'vertex') nv = +t[2]; else if (cur === 'face') nf = +t[2] }
    else if (t[0] === 'property') { if (cur === 'vertex') vprops.push({ type: t[1], name: t[2] }); else if (cur === 'face' && t[1] === 'list') { faceCountT = t[2]; faceIdxT = t[3] } }
  }
  if (!nv) throw new Error('Ficheiro PLY sem vértices.')
  const ix = vprops.findIndex((p) => p.name === 'x'), iy = vprops.findIndex((p) => p.name === 'y'), iz = vprops.findIndex((p) => p.name === 'z')
  if (ix < 0 || iy < 0 || iz < 0) throw new Error('Ficheiro PLY sem coordenadas x, y, z.')
  const ir = vprops.findIndex((p) => p.name === 'red'), ig = vprops.findIndex((p) => p.name === 'green'), ib = vprops.findIndex((p) => p.name === 'blue')
  const pos = new Float32Array(nv * 3), col = ir >= 0 && ig >= 0 && ib >= 0 ? new Uint8Array(nv * 3) : undefined
  const tris: number[] = []
  if (format === 'ascii') {
    const body = new TextDecoder('latin1').decode(bytes.subarray(headerEnd)).split(/\r?\n/)
    for (let i = 0; i < nv; i++) { const t = body[i].trim().split(/\s+/).map(Number); pos[3 * i] = t[ix]; pos[3 * i + 1] = t[iy]; pos[3 * i + 2] = t[iz]; if (col) { col[3 * i] = t[ir]; col[3 * i + 1] = t[ig]; col[3 * i + 2] = t[ib] } }
    for (let f = 0; f < nf; f++) { const t = body[nv + f].trim().split(/\s+/).map(Number); const c = t[0]; for (let k = 1; k + 1 < c; k++) tris.push(t[1], t[1 + k], t[2 + k]) }
  } else {
    const little = format === 'binary_little_endian'
    const dv = new DataView(buf, headerEnd)
    const size: Record<string, number> = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 }
    const read = (t: string, o: number) => { switch (t) { case 'char': case 'int8': return dv.getInt8(o); case 'uchar': case 'uint8': return dv.getUint8(o); case 'short': case 'int16': return dv.getInt16(o, little); case 'ushort': case 'uint16': return dv.getUint16(o, little); case 'int': case 'int32': return dv.getInt32(o, little); case 'uint': case 'uint32': return dv.getUint32(o, little); case 'float': case 'float32': return dv.getFloat32(o, little); case 'double': case 'float64': return dv.getFloat64(o, little); default: throw new Error('Tipo PLY não suportado: ' + t) } }
    let o = 0
    const offs: number[] = []; let acc = 0; for (const p of vprops) { offs.push(acc); acc += size[p.type] ?? 4 }
    for (let i = 0; i < nv; i++) {
      pos[3 * i] = read(vprops[ix].type, o + offs[ix]); pos[3 * i + 1] = read(vprops[iy].type, o + offs[iy]); pos[3 * i + 2] = read(vprops[iz].type, o + offs[iz])
      if (col) { col[3 * i] = read(vprops[ir].type, o + offs[ir]); col[3 * i + 1] = read(vprops[ig].type, o + offs[ig]); col[3 * i + 2] = read(vprops[ib].type, o + offs[ib]) }
      o += acc
    }
    for (let f = 0; f < nf; f++) {
      const c = read(faceCountT, o); o += size[faceCountT]; const idx: number[] = []
      for (let k = 0; k < c; k++) { idx.push(read(faceIdxT, o)); o += size[faceIdxT] }
      for (let k = 1; k + 1 < c; k++) tris.push(idx[0], idx[k], idx[k + 1])
    }
  }
  return { positions: pos, colors: col, indices: tris.length ? Uint32Array.from(tris) : undefined, sourceFormat: 'ply' }
}

export function parseOBJ(text: string): ModelData {
  const v: number[] = [], tris: number[] = []
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim()
    if (l.startsWith('v ')) { const t = l.split(/\s+/); v.push(+t[1], +t[2], +t[3]) }
    else if (l.startsWith('f ')) { const t = l.split(/\s+/).slice(1).map((x) => { let i = parseInt(x.split('/')[0], 10); if (i < 0) i = v.length / 3 + 1 + i; return i - 1 }); for (let k = 1; k + 1 < t.length; k++) tris.push(t[0], t[k], t[k + 1]) }
  }
  if (!v.length) throw new Error('Ficheiro OBJ sem vértices.')
  return { positions: Float32Array.from(v), indices: tris.length ? Uint32Array.from(tris) : undefined, sourceFormat: 'obj' }
}

/** PLY binário little-endian (float32 xyz + uint8 rgb opcional + faces). */
export function writePLY(m: { positions: Float32Array; colors?: Uint8Array; indices?: Uint32Array }, comment = 'JOVEM+ SMART HOLD SCAN'): ArrayBuffer {
  const nv = m.positions.length / 3, nf = m.indices ? m.indices.length / 3 : 0, hasC = !!m.colors
  const header = `ply\nformat binary_little_endian 1.0\ncomment ${comment}\ncomment unidade: metro\nelement vertex ${nv}\nproperty float x\nproperty float y\nproperty float z\n${hasC ? 'property uchar red\nproperty uchar green\nproperty uchar blue\n' : ''}${nf ? `element face ${nf}\nproperty list uchar int vertex_indices\n` : ''}end_header\n`
  const h = new TextEncoder().encode(header), vs = 12 + (hasC ? 3 : 0)
  const buf = new ArrayBuffer(h.length + nv * vs + nf * 13), dv = new DataView(buf)
  new Uint8Array(buf).set(h)
  let o = h.length
  for (let i = 0; i < nv; i++) { dv.setFloat32(o, m.positions[3 * i], true); dv.setFloat32(o + 4, m.positions[3 * i + 1], true); dv.setFloat32(o + 8, m.positions[3 * i + 2], true); o += 12; if (hasC) { dv.setUint8(o++, m.colors![3 * i]); dv.setUint8(o++, m.colors![3 * i + 1]); dv.setUint8(o++, m.colors![3 * i + 2]) } }
  for (let f = 0; f < nf; f++) { dv.setUint8(o++, 3); for (let k = 0; k < 3; k++) { dv.setInt32(o, m.indices![3 * f + k], true); o += 4 } }
  return buf
}

export function writeOBJ(m: { positions: Float32Array; indices?: Uint32Array }): string {
  const out = ['# JOVEM+ SMART HOLD SCAN — unidade: metro']
  for (let i = 0; i < m.positions.length; i += 3) out.push(`v ${m.positions[i].toFixed(5)} ${m.positions[i + 1].toFixed(5)} ${m.positions[i + 2].toFixed(5)}`)
  if (m.indices) for (let i = 0; i < m.indices.length; i += 3) out.push(`f ${m.indices[i] + 1} ${m.indices[i + 1] + 1} ${m.indices[i + 2] + 1}`)
  return out.join('\n') + '\n'
}
export const toCloud = (m: ModelData): PointCloud => ({ positions: m.positions, colors: m.colors })
