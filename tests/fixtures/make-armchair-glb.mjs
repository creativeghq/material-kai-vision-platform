/**
 * Generates tests/fixtures/armchair.glb — a lounge armchair modeled at true
 * real-world scale in meters, with NAMED sub-meshes and named PBR materials
 * (what the #260 configurator swaps per part). Geometry comes from three.js;
 * the GLB container is packed by hand so this runs headless with no DOM.
 *
 *   node tests/fixtures/make-armchair-glb.mjs tests/fixtures/armchair.glb
 *
 * Shape notes, because the first pass read as a stack of blocks: upholstery is
 * RoundedBoxGeometry with a generous corner radius (sharp box corners are what
 * make a chair look like packaging), the legs are turned profiles on a lathe
 * rather than cylinders, and they splay outward. Nothing here is axis-aligned
 * and square except the plinth.
 */
import { LatheGeometry, Vector2, Matrix4 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { writeFileSync, statSync } from 'fs';

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
  { name: 'Walnut', pbrMetallicRoughness: { baseColorFactor: srgbHexToLinear('#5A3A22'), metallicFactor: 0.0, roughnessFactor: 0.40 } },
  { name: 'Oak_Frame', pbrMetallicRoughness: { baseColorFactor: srgbHexToLinear('#A87C4E'), metallicFactor: 0.0, roughnessFactor: 0.60 } },
  { name: 'Fabric_Navy', pbrMetallicRoughness: { baseColorFactor: srgbHexToLinear('#33405F'), metallicFactor: 0.0, roughnessFactor: 0.95 } },
];
const M_WALNUT = 0, M_OAK = 1, M_FABRIC = 2;

// --- Dimensions (meters) --------------------------------------------------
const LEG_H = 0.17;            // floor -> underside of plinth
const PLINTH_Y = LEG_H;        // 0.17 -> 0.22
const PLINTH_H = 0.05;
const BODY_Y = PLINTH_Y + PLINTH_H;   // 0.22 -> 0.34
const BODY_H = 0.12;
const CUSH_Y = BODY_Y + BODY_H;       // 0.34 -> 0.46  (seat height 0.46)
const CUSH_H = 0.12;
const W = 0.74, D = 0.72;
// The oak rail is INSET so the upholstery overhangs it. A plinth wider than
// the body reads as a tray the chair has been set down on, not part of it.
const PLINTH_INSET = 0.13;

/**
 * Rounded upholstery block. The corner RADIUS is what stops it reading as a
 * carton — but it is capped at 28% of the smallest dimension, because a radius
 * approaching half of that leaves no flat face at all: the box degenerates,
 * its smooth normals stretch across the whole surface, and it renders as a
 * glassy see-through blob. (That is exactly what the first reshape did to the
 * arms — 0.052 m of radius on a 0.11 m width.)
 * Segments only control corner smoothness and cost vertices quadratically
 * (seg2 = 900 a box, seg3 = 1764), so 3 is the ceiling worth paying for here.
 */
const soft = (w, h, d, r) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) * 0.28));

function place(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  if (rx) geo.applyMatrix4(new Matrix4().makeRotationX(rx));
  if (ry) geo.applyMatrix4(new Matrix4().makeRotationY(ry));
  if (rz) geo.applyMatrix4(new Matrix4().makeRotationZ(rz));
  geo.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
  return geo;
}

/**
 * A turned leg: wide where it meets the plinth, tapering to a small foot,
 * with a slight waist. Built with its top at y=0 so it can be splayed about
 * that joint and then hung under the frame.
 */
function turnedLeg(sx, sz) {
  const profile = [
    new Vector2(0.0120, -LEG_H),
    new Vector2(0.0145, -LEG_H + 0.012),
    new Vector2(0.0165, -LEG_H + 0.045),
    new Vector2(0.0195, -LEG_H + 0.085),
    new Vector2(0.0240, -LEG_H + 0.120),
    new Vector2(0.0285, -0.004),
    new Vector2(0.0290, 0),
  ];
  const geo = new LatheGeometry(profile, 20);
  // Splay outward from the joint: the foot swings out, the top stays put.
  const splay = 0.12;
  return place(geo, sx * (W / 2 - PLINTH_INSET - 0.02), PLINTH_Y, sz * (D / 2 - PLINTH_INSET - 0.02),
    -sz * splay, 0, sx * splay);
}

const parts = [
  { name: 'leg_front_left',  material: M_WALNUT, geo: turnedLeg(-1,  1) },
  { name: 'leg_front_right', material: M_WALNUT, geo: turnedLeg( 1,  1) },
  { name: 'leg_back_left',   material: M_WALNUT, geo: turnedLeg(-1, -1) },
  { name: 'leg_back_right',  material: M_WALNUT, geo: turnedLeg( 1, -1) },

  // Slim oak rail the upholstery sits on — the only square element, on purpose.
  { name: 'frame', material: M_OAK, geo: place(soft(W - PLINTH_INSET, PLINTH_H, D - PLINTH_INSET, 0.012), 0, PLINTH_Y + PLINTH_H / 2, 0) },

  // Upholstered body, then a separate seat cushion resting in it. The cushion
  // is inset so the body reads as a surround rather than a second slab.
  { name: 'seat_base',    material: M_FABRIC, geo: place(soft(W, BODY_H, D, 0.030), 0, BODY_Y + BODY_H / 2, 0) },
  { name: 'seat_cushion', material: M_FABRIC, geo: place(soft(W - 0.20, CUSH_H, D - 0.22, 0.033), 0, CUSH_Y + CUSH_H / 2, 0.06) },

  // Back: a solid raked panel with a plump cushion in front of it.
  { name: 'back_panel',   material: M_FABRIC, geo: place(soft(W, 0.50, 0.13, 0.034), 0, 0.60, -0.285, -0.11) },
  { name: 'back_cushion', material: M_FABRIC, geo: place(soft(W - 0.22, 0.30, 0.16, 0.042), 0, 0.61, -0.205, -0.15) },

  // Rolled arms — wide enough to carry a real radius, and canted outward a
  // touch so the silhouette opens toward the front instead of reading as a crate.
  { name: 'armrest_left',  material: M_FABRIC, geo: place(soft(0.15, 0.26, D - 0.10, 0.042), -(W / 2 - 0.075), 0.46, 0.025, 0.03, 0, 0.05) },
  { name: 'armrest_right', material: M_FABRIC, geo: place(soft(0.15, 0.26, D - 0.10, 0.042),  (W / 2 - 0.075), 0.46, 0.025, 0.03, 0, -0.05) },
];

// --- Pack into GLB --------------------------------------------------------
const chunks = [];
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
  const comps = type === 'VEC3' ? 3 : type === 'VEC2' ? 2 : 1;
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
  const geo = part.geo;
  // Use each geometry's OWN normals. Calling computeVertexNormals() on
  // non-indexed geometry replaces them with per-face normals, which flat-shades
  // every rounded corner — the exact opposite of what the radius is buying.
  const posAcc = pushAccessor(new Float32Array(geo.attributes.position.array), 'VEC3', 5126, 34962, true);
  const nrmAcc = pushAccessor(new Float32Array(geo.attributes.normal.array), 'VEC3', 5126, 34962, false);
  const primitive = { attributes: { POSITION: posAcc, NORMAL: nrmAcc }, material: part.material, mode: 4 };
  // TEXCOORD_0 is not optional for a product model. Without UVs no texture can
  // ever bind — an albedo/normal/roughness map silently samples one texel and
  // the surface renders as flat colour, which is exactly how the first realism
  // pass "failed": the maps were never applied at all. It also blocks the #260
  // material swap, whose whole job is putting a fabric map on a named part.
  if (geo.attributes.uv) {
    primitive.attributes.TEXCOORD_0 =
      pushAccessor(new Float32Array(geo.attributes.uv.array), 'VEC2', 5126, 34962, false);
  }
  if (geo.index) {
    primitive.indices = pushAccessor(new Uint16Array(geo.index.array), 'SCALAR', 5123, 34963, false);
  }
  meshes.push({ name: part.name, primitives: [primitive] });
  nodes.push({ name: part.name, mesh: meshes.length - 1 });
}

const bin = Buffer.concat(chunks);
const gltf = {
  asset: { version: '2.0', generator: 'material-kai armchair fixture (#321)' },
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
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + binPadded.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(json.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(binPadded.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);

const out = process.argv[2] ?? 'tests/fixtures/armchair.glb';
writeFileSync(out, Buffer.concat([header, jsonHeader, json, binHeader, binPadded]));
console.log(`wrote ${out}: ${statSync(out).size} bytes, ${parts.length} named meshes, ${MATERIALS.length} materials`);
