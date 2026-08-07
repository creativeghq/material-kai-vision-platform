/**
 * Generates a real .glb product model: a lounge armchair, modeled at true
 * real-world scale in meters, with NAMED sub-meshes and named PBR materials
 * (what the #260 configurator will swap). Geometry comes from three.js; the
 * GLB container is packed by hand so this runs headless with no DOM.
 */
const { BoxGeometry, CylinderGeometry, Matrix4 } = require('three');
const fs = require('fs');

// --- Materials (glTF PBR metallic-roughness) ------------------------------
// glTF baseColorFactor is LINEAR, not sRGB. Authoring the hex value directly
// makes every material render several stops too light once three converts the
// framebuffer to sRGB — which is exactly what the first render showed.
function srgbHexToLinear(hex) {
  const to = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const n = parseInt(hex.replace('#', ''), 16);
  return [to(((n >> 16) & 255) / 255), to(((n >> 8) & 255) / 255), to((n & 255) / 255), 1];
}

const MATERIALS = [
  { name: 'Walnut', pbrMetallicRoughness: { baseColorFactor: srgbHexToLinear('#5A3A22'), metallicFactor: 0.0, roughnessFactor: 0.45 } },
  { name: 'Oak_Frame', pbrMetallicRoughness: { baseColorFactor: srgbHexToLinear('#B08B5E'), metallicFactor: 0.0, roughnessFactor: 0.70 } },
  { name: 'Fabric_Navy', pbrMetallicRoughness: { baseColorFactor: srgbHexToLinear('#2E3A5C'), metallicFactor: 0.0, roughnessFactor: 0.95 } },
];
const M_WALNUT = 0, M_OAK = 1, M_FABRIC = 2;

// --- Parts (meters; chair faces +Z, floor at y=0) -------------------------
function xf(geo, x, y, z, rx = 0) {
  if (rx) geo.applyMatrix4(new Matrix4().makeRotationX(rx));
  geo.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
  return geo;
}

const LEG_H = 0.22;
const parts = [
  { name: 'leg_front_left',  material: M_WALNUT, geo: xf(new CylinderGeometry(0.028, 0.020, LEG_H, 12), -0.33, LEG_H / 2,  0.30) },
  { name: 'leg_front_right', material: M_WALNUT, geo: xf(new CylinderGeometry(0.028, 0.020, LEG_H, 12),  0.33, LEG_H / 2,  0.30) },
  { name: 'leg_back_left',   material: M_WALNUT, geo: xf(new CylinderGeometry(0.028, 0.020, LEG_H, 12), -0.33, LEG_H / 2, -0.30) },
  { name: 'leg_back_right',  material: M_WALNUT, geo: xf(new CylinderGeometry(0.028, 0.020, LEG_H, 12),  0.33, LEG_H / 2, -0.30) },
  { name: 'frame',           material: M_OAK,    geo: xf(new BoxGeometry(0.78, 0.10, 0.74),  0, LEG_H + 0.05, 0) },
  { name: 'seat_cushion',    material: M_FABRIC, geo: xf(new BoxGeometry(0.70, 0.14, 0.66),  0, LEG_H + 0.17, 0.02) },
  { name: 'back_cushion',    material: M_FABRIC, geo: xf(new BoxGeometry(0.70, 0.44, 0.13),  0, LEG_H + 0.36, -0.30, -0.14) },
  { name: 'armrest_left',    material: M_FABRIC, geo: xf(new BoxGeometry(0.08, 0.22, 0.68), -0.35, LEG_H + 0.21, 0.00) },
  { name: 'armrest_right',   material: M_FABRIC, geo: xf(new BoxGeometry(0.08, 0.22, 0.68),  0.35, LEG_H + 0.21, 0.00) },
];

// --- Pack into GLB --------------------------------------------------------
const chunks = [];       // binary blobs, in order
let byteOffset = 0;
const bufferViews = [];
const accessors = [];

function pushView(typedArray, target) {
  const buf = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  const pad = (4 - (byteOffset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); byteOffset += pad; }
  bufferViews.push({ buffer: 0, byteOffset, byteLength: buf.length, ...(target ? { target } : {}) });
  chunks.push(buf);
  byteOffset += buf.length;
  return bufferViews.length - 1;
}

function pushAccessor(typedArray, type, componentType, target, withBounds) {
  const view = pushView(typedArray, target);
  const comps = type === 'VEC3' ? 3 : 1;
  const acc = { bufferView: view, componentType, count: typedArray.length / comps, type };
  if (withBounds) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < typedArray.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        min[c] = Math.min(min[c], typedArray[i + c]);
        max[c] = Math.max(max[c], typedArray[i + c]);
      }
    }
    acc.min = min; acc.max = max;
  }
  accessors.push(acc);
  return accessors.length - 1;
}

const meshes = [];
const nodes = [];
for (const part of parts) {
  const pos = part.geo.attributes.position.array;
  const nrm = part.geo.attributes.normal.array;
  const idx = part.geo.index.array;
  const posAcc = pushAccessor(new Float32Array(pos), 'VEC3', 5126, 34962, true);
  const nrmAcc = pushAccessor(new Float32Array(nrm), 'VEC3', 5126, 34962, false);
  const idxAcc = pushAccessor(new Uint16Array(idx), 'SCALAR', 5123, 34963, false);
  meshes.push({
    name: part.name,
    primitives: [{ attributes: { POSITION: posAcc, NORMAL: nrmAcc }, indices: idxAcc, material: part.material, mode: 4 }],
  });
  nodes.push({ name: part.name, mesh: meshes.length - 1 });
}

const bin = Buffer.concat(chunks);
const gltf = {
  asset: { version: '2.0', generator: 'material-kai armchair demo (#321)' },
  scene: 0,
  scenes: [{ name: 'Armchair', nodes: nodes.map((_, i) => i) }],
  nodes,
  meshes,
  materials: MATERIALS,
  accessors,
  bufferViews,
  buffers: [{ byteLength: bin.length }],
};

let json = Buffer.from(JSON.stringify(gltf), 'utf8');
const jsonPad = (4 - (json.length % 4)) % 4;
if (jsonPad) json = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)]);
const binPad = (4 - (bin.length % 4)) % 4;
const binPadded = binPad ? Buffer.concat([bin, Buffer.alloc(binPad)]) : bin;

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);                      // 'glTF'
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(json.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);                  // 'JSON'
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binPadded.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);                   // 'BIN'

const out = process.argv[2];
fs.writeFileSync(out, Buffer.concat([header, jsonHeader, json, binHeader, binPadded]));
console.log(`wrote ${out}: ${fs.statSync(out).size} bytes, ${parts.length} named meshes, ${MATERIALS.length} materials`);
