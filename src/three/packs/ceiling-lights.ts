// 吸顶灯 / 吊灯素材：房间主灯的各款造型（three/lightFixtures.ts，和自动摆的房间灯是同一份模型）。
// 每款一个系列：标准（居室主灯）、小（卫浴玄关的小吸顶灯，有这个尺寸的款才有）、餐桌吊灯（吊低到餐桌上方）。
// 挂在天花板下（ceiling = 用途），mount 是灯具最低点离地多高；摆进房间后这个房间不再自动摆主灯（lights.ts）。

import * as THREE from 'three'
import type { AssetDef, StyleTag } from '../kit'
import type { RoomLightSpec } from '../lights'
import { CEILING, SHAPES, STYLE_SHAPES, applyShape, ceilingAssetId, fixtureModel, type FixtureShape, type MainKind } from '../lightFixtures'
import { define } from '../packkit'
import { centerXZInPlace } from '../geo'

/** 造型、用途对应的房间灯规格：缺省高度同 lights.ts roomSpecsInto（餐桌吊灯按桌面 72 + 78），再套上造型 */
function ceilingSpec(shape: FixtureShape | undefined, kind: MainKind): RoomLightSpec {
  const fy = kind === 'pendant' ? 150 : CEILING - (kind === 'small' ? 6 : 8)
  const s: RoomLightSpec = { roomId: '', kind, x: 0, y: 0, h: kind === 'pendant' ? fy + 6 : CEILING - 5, fy, intensity: 1, distance: 300, primary: true, ry: 0 }
  if (shape) applyShape(s, shape)
  return s
}

const NAMES: Record<FixtureShape | 'basic', string> = {
  basic: '圆形吸顶灯',
  'washi-square': '方形和纸灯',
  bamboo: '竹编吊灯',
  ph: 'PH 吊灯',
  'wood-ring': '木圈吸顶灯',
  'led-disc': 'LED 圆盘吸顶灯',
  'led-line': 'LED 线形吊灯',
  'metal-dome': '金属罩吊灯',
  cage: '铁笼灯',
  'milk-glass': '乳白玻璃灯',
  tiffany: '蒂芙尼吊灯',
  cloud: '云朵灯',
  star: '星星吸顶灯',
  lattice: '木格吸顶灯',
  palace: '宫灯',
  chandelier: '水晶吊灯',
  'crystal-flush': '水晶吸顶灯',
  'wagon-wheel': '车轮吊灯',
  'hex-lantern': '六角灯笼吊灯',
  cylinder: '筒形吊灯',
}

/** 各款适合的风格（STYLE_SHAPES 反查；通用款算现代） */
function stylesOf(shape: FixtureShape | undefined): StyleTag[] {
  if (!shape) return ['modern']
  const out = (Object.keys(STYLE_SHAPES) as StyleTag[]).filter((s) => {
    const t = STYLE_SHAPES[s]
    return t.ceiling.includes(shape) || t.small === shape || t.pendant === shape
  })
  return out.length ? out : ['modern']
}
/** 做餐桌吊灯尺寸的款：哪个风格拿它当吊灯，加上通用款 */
const pendantShape = (shape: FixtureShape | undefined) => !shape || Object.values(STYLE_SHAPES).some((t) => t.pendant === shape)

/** 建模：灯具底面在 y = fy（fixtureModel 原点在底面中心），水平居中；描边交给家具模板统一加 */
function build(spec: RoomLightSpec) {
  return () => {
    const { obj } = fixtureModel(spec, { outline: false })
    obj.position.y = spec.fy
    const g = new THREE.Group()
    g.add(centerXZInPlace(obj))
    return g
  }
}

/** 包围盒（宽、深、高从模型量）和最低点（流苏、水晶垂饰会比灯具底面低一点：mount 取最低点） */
function measure(spec: RoomLightSpec) {
  const g = build(spec)()
  g.updateMatrixWorld(true)
  const b = new THREE.Box3().setFromObject(g)
  const up = (v: number) => Math.ceil(v * 10) / 10
  const mount = Math.floor(b.min.y * 10) / 10
  return { dims: [up(b.max.x - b.min.x), up(b.max.z - b.min.z), up(b.max.y - mount)] as [number, number, number], mount }
}

const SIZE_LABEL: Record<MainKind, string> = { ceiling: '标准', small: '小', pendant: '餐桌吊灯' }

function variants(shape: FixtureShape | undefined): AssetDef[] {
  const kinds: MainKind[] = ['ceiling']
  if (!shape || SHAPES[shape].small !== undefined) kinds.push('small')
  if (pendantShape(shape)) kinds.push('pendant')
  const styles = stylesOf(shape)
  return kinds.map((kind) => {
    const spec = ceilingSpec(shape, kind)
    const m = measure(spec)
    return define(ceilingAssetId(shape, kind), NAMES[shape ?? 'basic'], 'lighting', m.dims, [[styles[0], '#fff6e6']], build(spec), {
      mount: m.mount,
      ceiling: kind,
      styles,
      type: 'ceiling-light',
      series: ceilingAssetId(shape, 'ceiling'),
      sizeLabel: SIZE_LABEL[kind],
      tags: ['light', 'ceiling-light'],
    })
  })
}

export const CEILING_LIGHTS: AssetDef[] = [undefined, ...(Object.keys(SHAPES) as FixtureShape[])].flatMap(variants)
