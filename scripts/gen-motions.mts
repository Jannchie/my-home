// 把 Quaternius 的 Universal Animation Library（CC0）里用得到的几段动作重定向成 VRM 标准化骨骼的动作，
// 生成 src/three/motions.generated.json（VRM 住户用，见 three/motions.ts）。
//
// 用法：pnpm gen:motions <AnimationLibrary_Godot_Standard.glb 的路径>
//   源文件来自 https://quaternius.com/packs/universalanimationlibrary.html（Standard 版，CC0），不放进仓库。
//
// 做法：源骨架（Rigify 的 DEF- 骨骼）按 A_TPose 那一帧当 T 字站姿的参照。每段动作按 FPS 采样，算出每根骨骼的世界旋转，
// 再求「从 T 字站姿到这一帧」的世界旋转差 D = W(t) · W(T)⁻¹。VRM 标准化骨骼在 T 字站姿时世界旋转都是单位旋转，
// 所以 D 就是 VRM 骨骼这一帧的世界旋转；运行时按模型实际有的骨骼求局部旋转（缺了 chest、肩膀之类的也能用）。
//   - 髋部位置：相对 T 字站姿的位移，除以 T 字站姿的髋高（运行时乘模型自己的髋高）；
//   - 手指：动作里基本不动，用手写的放松微弯姿势（固定的局部旋转），不逐帧存；
//   - 走路：另存脚着地时向后滑的速度（髋高 / 秒），运行时按实际移动速度调播放速度，脚不打滑。
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'

const FPS = 30
const CLIPS: Record<string, { src: string; loop: boolean }> = {
  idle: { src: 'Idle_Loop', loop: true },
  walk: { src: 'Walk_Loop', loop: true },
  sitEnter: { src: 'Sitting_Enter', loop: false },
  sitExit: { src: 'Sitting_Exit', loop: false },
  sitIdle: { src: 'Sitting_Idle_Loop', loop: true },
}

/** VRM 人形骨骼 → Rigify 的 DEF- 骨骼 */
const BODY: Record<string, string> = {
  hips: 'DEF-hips',
  spine: 'DEF-spine.001',
  chest: 'DEF-spine.002',
  upperChest: 'DEF-spine.003',
  neck: 'DEF-neck',
  head: 'DEF-head',
  leftShoulder: 'DEF-shoulder.L',
  leftUpperArm: 'DEF-upper_arm.L',
  leftLowerArm: 'DEF-forearm.L',
  leftHand: 'DEF-hand.L',
  rightShoulder: 'DEF-shoulder.R',
  rightUpperArm: 'DEF-upper_arm.R',
  rightLowerArm: 'DEF-forearm.R',
  rightHand: 'DEF-hand.R',
  leftUpperLeg: 'DEF-thigh.L',
  leftLowerLeg: 'DEF-shin.L',
  leftFoot: 'DEF-foot.L',
  leftToes: 'DEF-toe.L',
  rightUpperLeg: 'DEF-thigh.R',
  rightLowerLeg: 'DEF-shin.R',
  rightFoot: 'DEF-foot.R',
  rightToes: 'DEF-toe.R',
}
const FINGERS: Record<string, string> = {}
for (const [side, s] of [
  ['left', 'L'],
  ['right', 'R'],
] as const) {
  FINGERS[`${side}ThumbMetacarpal`] = `DEF-thumb.01.${s}`
  FINGERS[`${side}ThumbProximal`] = `DEF-thumb.02.${s}`
  FINGERS[`${side}ThumbDistal`] = `DEF-thumb.03.${s}`
  for (const [f, src] of [
    ['Index', 'f_index'],
    ['Middle', 'f_middle'],
    ['Ring', 'f_ring'],
    ['Little', 'f_pinky'],
  ])
    for (const [k, seg] of [
      ['Proximal', '01'],
      ['Intermediate', '02'],
      ['Distal', '03'],
    ])
      FINGERS[`${side}${f}${k}`] = `DEF-${src}.${seg}.${s}`
}
// ---------- glb ----------

interface GNode {
  name: string
  children?: number[]
  translation?: number[]
  rotation?: number[]
  scale?: number[]
}
interface Gltf {
  nodes: GNode[]
  scenes: { nodes: number[] }[]
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[]
  bufferViews: { byteOffset?: number; byteLength: number; byteStride?: number }[]
  animations: { name: string; channels: { sampler: number; target: { node: number; path: string } }[]; samplers: { input: number; output: number; interpolation?: string }[] }[]
}

const file = process.argv[2]
if (!file) throw new Error('用法：pnpm gen:motions <AnimationLibrary_Godot_Standard.glb>')
const buf = fs.readFileSync(file)
const jsonLen = buf.readUInt32LE(12)
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as Gltf
const bin = buf.subarray(20 + jsonLen + 8)

const SIZE: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 }
function read(i: number): Float32Array {
  const a = gltf.accessors[i]
  if (a.componentType !== 5126) throw new Error(`accessor ${i}: 只支持 float`)
  const v = gltf.bufferViews[a.bufferView]
  const n = SIZE[a.type]
  const stride = v.byteStride ?? n * 4
  const out = new Float32Array(a.count * n)
  const base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0)
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = bin.readFloatLE(base + k * stride + c * 4)
  return out
}

const parent = new Map<number, number>()
gltf.nodes.forEach((n, i) => n.children?.forEach((c) => parent.set(c, i)))
const byName = new Map(gltf.nodes.map((n, i) => [n.name, i]))
const idx = (name: string) => {
  const i = byName.get(name)
  if (i === undefined) throw new Error(`源骨架里没有 ${name}`)
  return i
}

type Track = { times: Float32Array; values: Float32Array; n: number }
function tracksOf(clip: string) {
  const a = gltf.animations.find((x) => x.name === clip)
  if (!a) throw new Error(`没有动作 ${clip}`)
  const map = new Map<string, Track>()
  for (const ch of a.channels) {
    const s = a.samplers[ch.sampler]
    if (s.interpolation && s.interpolation !== 'LINEAR') throw new Error(`${clip}: 只支持线性插值`)
    map.set(`${ch.target.node}/${ch.target.path}`, { times: read(s.input), values: read(s.output), n: ch.target.path === 'rotation' ? 4 : 3 })
  }
  const duration = Math.max(...[...map.values()].map((t) => t.times[t.times.length - 1]))
  return { map, duration }
}

function sample(t: Track, time: number, out: number[]) {
  const ts = t.times
  let i = 0
  while (i < ts.length - 2 && ts[i + 1] <= time) i++
  const k = ts.length < 2 ? 0 : Math.max(0, Math.min(1, (time - ts[i]) / (ts[i + 1] - ts[i] || 1)))
  const a = i * t.n
  const b = Math.min(ts.length - 1, i + 1) * t.n
  if (t.n === 4) {
    const qa = new THREE.Quaternion().fromArray(t.values, a)
    const qb = new THREE.Quaternion().fromArray(t.values, b)
    qa.slerp(qb, k).toArray(out)
  } else for (let c = 0; c < 3; c++) out[c] = t.values[a + c] + (t.values[b + c] - t.values[a + c]) * k
  return out
}

/** 某段动作某一时刻所有节点的世界矩阵 */
function pose(tracks: Map<string, Track>, time: number) {
  const world = new Map<number, THREE.Matrix4>()
  const local = (i: number) => {
    const n = gltf.nodes[i]
    const tr = tracks.get(`${i}/translation`)
    const ro = tracks.get(`${i}/rotation`)
    const sc = tracks.get(`${i}/scale`)
    const p = new THREE.Vector3().fromArray(tr ? sample(tr, time, []) : (n.translation ?? [0, 0, 0]))
    const q = new THREE.Quaternion().fromArray(ro ? sample(ro, time, []) : (n.rotation ?? [0, 0, 0, 1]))
    const s = new THREE.Vector3().fromArray(sc ? sample(sc, time, []) : (n.scale ?? [1, 1, 1]))
    return new THREE.Matrix4().compose(p, q, s)
  }
  const walk = (i: number, pm: THREE.Matrix4) => {
    const m = pm.clone().multiply(local(i))
    world.set(i, m)
    for (const c of gltf.nodes[i].children ?? []) walk(c, m)
  }
  for (const r of gltf.scenes[0].nodes) walk(r, new THREE.Matrix4())
  return world
}
const rotOf = (m: THREE.Matrix4) => {
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  m.decompose(p, q, s)
  return q
}
const posOf = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixPosition(m)

// ---------- T 字站姿参照、朝向 ----------

const tpose = pose(tracksOf('A_TPose').map, 0)
const tRot = new Map([...tpose].map(([i, m]) => [i, rotOf(m)]))
const tPos = (name: string) => posOf(tpose.get(idx(name))!)
const ground = Math.min(tPos('DEF-toe.L').y, tPos('DEF-foot.L').y)
const hipH = tPos('DEF-hips').y - ground
// 角色面朝 +z（和 VRM 1.0 一样）时左手在 +x；反过来就整体转 180°
const facesZ = tPos('DEF-hand.L').x > tPos('DEF-hand.R').x
const fix = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facesZ ? 0 : Math.PI)
const fixInv = fix.clone().invert()
console.log(`[gen:motions] T 字站姿髋高 ${hipH.toFixed(3)}，面朝 ${facesZ ? '+z' : '-z'}`)

/** 世界旋转差 D = W(t) · W(T)⁻¹，换到 VRM 的朝向 */
const delta = (world: Map<number, THREE.Matrix4>, name: string) => {
  const i = idx(name)
  const d = rotOf(world.get(i)!).multiply(tRot.get(i)!.clone().invert())
  return fix.clone().multiply(d).multiply(fixInv)
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4

/**
 * 姿态修正（度，绕身体的左右轴，负数 = 往后仰）：源动作相对它的 T 字站姿含胸、低头十几度，
 * 套到 VRM 上看起来一直在看地面。上半身几根骨骼的世界旋转统一往回扳一点（同一根链上一起扳，相对的局部旋转不变）
 */
const POSTURE: Record<string, number> = { upperChest: -9, neck: -9, head: -13, leftShoulder: -9, rightShoulder: -9, leftUpperArm: -9, rightUpperArm: -9, leftLowerArm: -9, rightLowerArm: -9, leftHand: -9, rightHand: -9 }
const postureQ = Object.fromEntries(Object.entries(POSTURE).map(([b, d]) => [b, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (d * Math.PI) / 180)]))

// ---------- 手指：放松微弯 ----------
// 源动作的待机是攥着拳头的，换成手写的放松姿势：各节绕 z 轴往掌心弯一点（左手掌心朝 -y，弯向掌心是负的 z；右手镜像），
// 小指比食指弯得多一点，拇指只微微收。按 VRM 1.0 约定的局部旋转写

const euler = (x: number, y: number, z: number) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z))
const fingers: Record<string, number[]> = {}
for (const vrm of Object.keys(FINGERS)) {
  const m = /^(left|right)(Thumb|Index|Middle|Ring|Little)(Metacarpal|Proximal|Intermediate|Distal)$/.exec(vrm)!
  const s = m[1] === 'left' ? -1 : 1
  const seg = { Metacarpal: 0, Proximal: 0.22, Intermediate: 0.32, Distal: 0.22 }[m[3]]!
  const q =
    m[2] === 'Thumb'
      ? euler(0, s * -0.12 * (m[3] === 'Metacarpal' ? 1 : 0), s * (m[3] === 'Metacarpal' ? 0.05 : 0.12))
      : euler(0, 0, s * seg * { Index: 0.8, Middle: 1, Ring: 1.12, Little: 1.25 }[m[2]]!)
  fingers[vrm] = q.toArray().map(r4)
}

// ---------- 风格：站姿、坐姿收一点 ----------
// 源动作的待机是叉开腿、两手架着的「战斗」站姿，坐着也是两膝大开。
//   - 腿：在参照帧（idle 第一帧、坐好的那一帧）里量出脚踝 / 膝盖离中线多远，整条腿绕髋关节转过去，
//     收到 width（髋高的倍数）；这一段动作的所有帧都转同样的角度。只转大腿、小腿，脚掌保持原来的朝向
//   - 胳膊（只有待机）：往「手臂自然垂下、手在大腿前」的姿势插值 arms，保留一点原来的呼吸起伏

const STYLE: Record<string, { ref: 'first' | 'last'; joint: 'DEF-foot' | 'DEF-shin'; width: number; arms?: number }> = {
  idle: { ref: 'first', joint: 'DEF-foot', width: 0.075, arms: 0.85 },
  sitEnter: { ref: 'last', joint: 'DEF-shin', width: 0.06 },
  sitIdle: { ref: 'first', joint: 'DEF-shin', width: 0.06 },
  sitExit: { ref: 'first', joint: 'DEF-shin', width: 0.06 },
}

/** 把一侧腿收到中线附近的世界旋转 */
function legFix(world: Map<number, THREE.Matrix4>, side: 'L' | 'R', joint: string, width: number) {
  const hip = posOf(world.get(idx(`DEF-thigh.${side}`))!).applyQuaternion(fix)
  const p = posOf(world.get(idx(`${joint}.${side}`))!).applyQuaternion(fix)
  const sign = side === 'L' ? 1 : -1
  const want = p.clone()
  want.x = sign * Math.min(Math.abs(p.x), width * hipH)
  return new THREE.Quaternion().setFromUnitVectors(p.clone().sub(hip).normalize(), want.sub(hip).normalize())
}

/** 待机时胳膊的目标世界旋转（VRM 1.0 约定）：自然垂在身侧，肘部、手腕微弯 */
const upperL = euler(-0.04, 0, -1.27)
const upperR = euler(-0.04, 0, 1.27)
const lowerL = upperL.clone().multiply(euler(0, -0.16, 0))
const lowerR = upperR.clone().multiply(euler(0, 0.16, 0))
const ARM_POSE: Record<string, THREE.Quaternion> = {
  leftUpperArm: upperL,
  rightUpperArm: upperR,
  leftLowerArm: lowerL,
  rightLowerArm: lowerR,
  leftHand: lowerL.clone().multiply(euler(0, 0, -0.08)),
  rightHand: lowerR.clone().multiply(euler(0, 0, 0.08)),
}

// ---------- 各段动作 ----------

const clips: Record<string, { duration: number; loop: boolean; fps: number; bones: Record<string, number[]>; hips: number[]; speed?: number }> = {}
for (const [id, def] of Object.entries(CLIPS)) {
  const { map, duration } = tracksOf(def.src)
  const n = Math.max(2, Math.round(duration * FPS) + 1)
  const bones: Record<string, number[]> = Object.fromEntries(Object.keys(BODY).map((k) => [k, []]))
  const hips: number[] = []
  const feet: { l: THREE.Vector3; r: THREE.Vector3 }[] = []
  const hip0 = tPos('DEF-hips')
  const style = STYLE[id]
  const legQ: Record<string, THREE.Quaternion> = {}
  if (style) {
    const ref = pose(map, style.ref === 'first' ? 0 : duration)
    for (const [side, s] of [
      ['left', 'L'],
      ['right', 'R'],
    ] as const) {
      const q = legFix(ref, s, style.joint, style.width)
      legQ[`${side}UpperLeg`] = q
      legQ[`${side}LowerLeg`] = q
    }
  }
  for (let f = 0; f < n; f++) {
    const world = pose(map, (f / (n - 1)) * duration)
    // 循环动作首尾是同一帧：最后一帧直接用第一帧的数据，接缝处不跳
    for (const [vrm, src] of Object.entries(BODY)) {
      let q = delta(world, src)
      if (postureQ[vrm]) q.premultiply(postureQ[vrm])
      if (legQ[vrm]) q.premultiply(legQ[vrm])
      if (style?.arms && ARM_POSE[vrm]) q.slerp(ARM_POSE[vrm], style.arms)
      const prev = bones[vrm].slice(-4)
      // 和上一帧保持同一半球，插值不绕远路
      if (prev.length && q.x * prev[0] + q.y * prev[1] + q.z * prev[2] + q.w * prev[3] < 0) q = new THREE.Quaternion(-q.x, -q.y, -q.z, -q.w)
      bones[vrm].push(...q.toArray().map(r4))
    }
    const hp = posOf(world.get(idx('DEF-hips'))!).sub(hip0).divideScalar(hipH).applyQuaternion(fix)
    hips.push(r4(hp.x), r4(hp.y), r4(hp.z))
    feet.push({ l: posOf(world.get(idx('DEF-foot.L'))!).applyQuaternion(fix), r: posOf(world.get(idx('DEF-foot.R'))!).applyQuaternion(fix) })
  }
  if (def.loop)
    for (const k of Object.keys(bones)) {
      const a = bones[k]
      a.splice(a.length - 4, 4, ...a.slice(0, 4))
    }
  const out: (typeof clips)[string] = { duration: r4(duration), loop: def.loop, fps: r4((n - 1) / duration), bones, hips }
  if (id === 'walk') {
    // 着地的那只脚（低的那只）向后滑的平均速度 = 走路速度（原地踏步的动作）
    let sum = 0
    let cnt = 0
    for (let f = 1; f < n; f++) {
      for (const s of ['l', 'r'] as const) {
        const a = feet[f - 1][s]
        const b = feet[f][s]
        const other = s === 'l' ? feet[f].r : feet[f].l
        if (b.y > other.y) continue
        sum += Math.hypot(b.x - a.x, b.z - a.z) * out.fps
        cnt++
      }
    }
    out.speed = r4(sum / Math.max(1, cnt) / hipH)
    console.log(`[gen:motions] 走路速度 ${out.speed} 髋高 / 秒`)
  }
  clips[id] = out
}

const dst = path.resolve(process.cwd(), 'src/three/motions.generated.json')
fs.writeFileSync(dst, JSON.stringify({ source: 'Quaternius Universal Animation Library (Standard), CC0 1.0', fingers, clips }))
console.log(`[gen:motions] ${Object.keys(clips).length} 段动作 → ${path.relative(process.cwd(), dst)}（${(fs.statSync(dst).size / 1024).toFixed(0)} KB）`)
