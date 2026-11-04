// VRM 住户的动作片段：scripts/gen-motions.mts 从 Quaternius 的动作库（CC0）重定向出来的数据（motions.generated.json，按需加载），
// 在这里按每个模型实际有的骨骼换算成 three 的 AnimationClip，交给 AnimationMixer 播放、混合（three/residents.ts）。
//
// 数据里身体骨骼存的是「从 T 字站姿到这一帧」的世界旋转（VRM 标准化骨骼在 T 字站姿时世界旋转都是单位旋转），
// 所以局部旋转 = 父骨骼的世界旋转⁻¹ · 自己的世界旋转；模型缺了可选骨骼（chest、upperChest、肩膀、脚趾）时，往上找最近的那根当父骨骼。
// VRM 0.x 的标准化骨骼局部坐标是转了 180° 的：旋转的 x / z 分量、位移的 x / z 取反。

import * as THREE from 'three'
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'

export type ClipId = 'idle' | 'walk' | 'sitEnter' | 'sitExit' | 'sitIdle'

interface ClipData {
  duration: number
  loop: boolean
  fps: number
  /** VRM 骨骼名 → 每帧的世界旋转（x, y, z, w 依次排开） */
  bones: Record<string, number[]>
  /** 每帧髋部相对 T 字站姿的位移（以髋高为单位） */
  hips: number[]
  /** 走路：脚着地时向后滑的速度（髋高 / 秒） */
  speed?: number
}

interface MotionData {
  fingers: Record<string, number[]>
  clips: Record<ClipId, ClipData>
}

let dataP: Promise<MotionData> | null = null
export function motionData() {
  dataP ??= import('./motions.generated.json').then((m) => m.default as unknown as MotionData)
  dataP.catch(() => (dataP = null))
  return dataP
}

/** 身体骨骼的父骨骼（VRM 人形骨骼的层级；缺的可选骨骼再往上找） */
const PARENT: Partial<Record<VRMHumanBoneName, VRMHumanBoneName>> = {
  spine: 'hips',
  chest: 'spine',
  upperChest: 'chest',
  neck: 'upperChest',
  head: 'neck',
  leftShoulder: 'upperChest',
  leftUpperArm: 'leftShoulder',
  leftLowerArm: 'leftUpperArm',
  leftHand: 'leftLowerArm',
  rightShoulder: 'upperChest',
  rightUpperArm: 'rightShoulder',
  rightLowerArm: 'rightUpperArm',
  rightHand: 'rightLowerArm',
  leftUpperLeg: 'hips',
  leftLowerLeg: 'leftUpperLeg',
  leftFoot: 'leftLowerLeg',
  leftToes: 'leftFoot',
  rightUpperLeg: 'hips',
  rightLowerLeg: 'rightUpperLeg',
  rightFoot: 'rightLowerLeg',
  rightToes: 'rightFoot',
}

/** 一个模型用的动作：片段、每段的信息 */
export interface Motions {
  clips: Record<ClipId, THREE.AnimationClip>
  /** 走路片段的速度（cm / 秒，按这个模型的髋高换算） */
  walkSpeed: number
  /** 坐好时髋部相对脚底原点的位置（cm，模型自己的朝向：+z 向前） */
  sitHip: THREE.Vector3
}

/**
 * 按模型的骨骼换算动作。hipY：站立时髋高（cm）；scale：模型的放大倍数（标准化骨骼的位置是 VRM 自己的米制单位）。
 * 手指没有逐帧数据，这里直接摆成放松微弯的固定姿势。
 */
export function buildMotions(vrm: VRM, vrm0: boolean, hipY: number, scale: number, data: MotionData): Motions {
  const h = vrm.humanoid
  const node = (b: string) => h.getNormalizedBoneNode(b as VRMHumanBoneName)
  const flip = (q: THREE.Quaternion) => {
    if (vrm0) {
      q.x = -q.x
      q.z = -q.z
    }
    return q
  }
  for (const [b, q] of Object.entries(data.fingers)) node(b)?.quaternion.copy(flip(new THREE.Quaternion().fromArray(q)))
  const hips = node('hips')!
  const hipRest = hips.position.clone()
  const hipM = hipY / scale
  const clips = {} as Record<ClipId, THREE.AnimationClip>
  const qa = new THREE.Quaternion()
  const qb = new THREE.Quaternion()
  for (const [id, c] of Object.entries(data.clips) as [ClipId, ClipData][]) {
    const n = c.hips.length / 3
    const times = Float32Array.from({ length: n }, (_, i) => i / c.fps)
    const tracks: THREE.KeyframeTrack[] = []
    for (const b of Object.keys(c.bones) as VRMHumanBoneName[]) {
      const me = node(b)
      if (!me) continue
      let par = PARENT[b]
      while (par && !node(par)) par = PARENT[par]
      const own = c.bones[b]
      const up = par ? c.bones[par] : null
      const values = new Float32Array(n * 4)
      for (let i = 0; i < n; i++) {
        qb.fromArray(own, i * 4)
        if (up) qb.premultiply(qa.fromArray(up, i * 4).invert())
        flip(qb).toArray(values, i * 4)
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${me.name}.quaternion`, times, values))
    }
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const s = vrm0 ? -1 : 1
      pos[i * 3] = hipRest.x + c.hips[i * 3] * hipM * s
      pos[i * 3 + 1] = hipRest.y + c.hips[i * 3 + 1] * hipM
      pos[i * 3 + 2] = hipRest.z + c.hips[i * 3 + 2] * hipM * s
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, pos))
    clips[id] = new THREE.AnimationClip(id, c.duration, tracks)
  }
  const sit = data.clips.sitIdle.hips
  return {
    clips,
    walkSpeed: (data.clips.walk.speed ?? 1) * hipY,
    sitHip: new THREE.Vector3(sit[0] * hipY, hipY * (1 + sit[1]), sit[2] * hipY),
  }
}
