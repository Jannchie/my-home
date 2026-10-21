<script setup lang="ts">
// 3D 沙盘的操作感增强（挂在 Sandbox3D 的视口里，通过 sandboxBridge 拿镜头 / 拾取）：
//   - 选中家具时，在它头顶浮一条迷你工具条（旋转 / 复制 / 删除 / 聚焦），拖动、转视角时暂时收起；
//   - 右键（没拖动）家具弹出快捷菜单，右键空地弹出场景菜单；
//   - 双击家具：镜头平滑聚焦过去；
//   - 方向键按视角方向微移选中的家具（壁挂物只沿墙走），连按只记一步撤销；
//   - 在画布里点选家具时，侧栏（已切到「属性」页）滚回顶部；
//   - 触屏：长按（Sandbox3D 判定）通过 sandboxBridge.menu 弹出同一个菜单；工具条按钮放大到 44px，手机上多一个「属性」按钮。
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'
import { JIcon } from '@jannchie/icons-vue'
import ContextMenu, { type MenuEntry } from './ContextMenu.vue'
import { ICONS, WALL_MODE_ICONS } from '../ui/icons'
import { sandboxBridge } from '../ui/sandboxBridge'
import { runBusy } from '../ui/feedback'
import { toast } from '../saved'
import { ASSET_MAP } from '../three/assets'
import { displayName, sameTypeVariants, siblings, variantLabel } from '../three/catalog'
import { propsOn } from '../surface'
import { isTyping } from '../dom'
import { t } from '../i18n'
import { overlays } from '../ui/feedback'
import { saved } from '../saved'
import { device } from '../ui/device'
import { FIXTURES, STAIRS_VARIANTS, type Fixture } from '../model'
import { stairsVariant } from '../stairs'
import { DEFAULT_STAIR_STYLE, STAIR_STYLES } from '../stairStyles'
import {
  WALL_MODES,
  checkpoint,
  deleteSelection,
  duplicateSelection,
  findFixture,
  findFurniture,
  mutate,
  placing,
  plan,
  redecorate,
  rotateSelectedFixture,
  rotateSelectedFurniture,
  sandbox,
  selection,
  setStairsVariant,
  swapFurnitureAsset,
  swapFurnitureVariant,
} from '../store'

const editing = computed(() => sandbox.mode === 'edit')
const selId = computed(() => (selection.value?.type === 'furniture' ? selection.value.id : null))
const selDef = computed(() => {
  const f = selId.value ? findFurniture(selId.value) : undefined
  return f ? ASSET_MAP.get(f.asset) ?? null : null
})

// ---------- 浮动工具条：每帧把家具头顶投影到屏幕 ----------

const bar = ref<{ x: number; y: number } | null>(null)
/** 指针在画布上按下（拖家具 / 转视角）期间收起工具条 */
const pressing = ref(false)
let raf = 0
const v3 = new THREE.Vector3()

function track() {
  raf = requestAnimationFrame(track)
  const b = sandboxBridge.value
  const id = selId.value
  const f = id ? findFurniture(id) : undefined
  const o = id ? b?.object(id) : undefined
  if (!b || !f || !o || !editing.value || placing.value) {
    if (bar.value) bar.value = null
    return
  }
  const def = ASSET_MAP.get(f.asset)
  v3.set(o.position.x, o.position.y + (def?.h ?? 60) + 6, o.position.z).project(b.camera)
  const r = b.canvas.getBoundingClientRect()
  const x = ((v3.x + 1) / 2) * r.width
  const y = ((1 - v3.y) / 2) * r.height
  // 镜头背后或跑出画布：不显示
  if (v3.z > 1 || x < 0 || x > r.width || y < 0 || y > r.height) {
    if (bar.value) bar.value = null
    return
  }
  const nx = Math.round(x)
  const ny = Math.round(Math.max(48, y))
  if (!bar.value || bar.value.x !== nx || bar.value.y !== ny) bar.value = { x: nx, y: ny }
}
raf = requestAnimationFrame(track)

// ---------- 画布事件（桥接好之后再挂） ----------

let rDown: { x: number; y: number } | null = null
/** 这次右键按下后拖过（按最远距离算，拖出去又拖回原处也算） */
let rDragged = false
/** 最近一次在画布上按下的时间：区分「在场景里点选」和「从家具栏放下」 */
let lastCanvasDown = 0
/** 最近一次按下是手指：安卓长按会发 contextmenu，触屏的菜单由 Sandbox3D 的长按判定负责，这里忽略 */
let lastTouch = false

function onDown(e: PointerEvent) {
  lastCanvasDown = performance.now()
  lastTouch = e.pointerType !== 'mouse'
  menu.value = null
  if (e.button === 2) (rDown = { x: e.clientX, y: e.clientY }), (rDragged = false)
  pressing.value = true
}
function onUp() {
  pressing.value = false
}
function onMove(e: PointerEvent) {
  if (!rDown || !(e.buttons & 2) || Math.hypot(e.clientX - rDown.x, e.clientY - rDown.y) <= 6) return
  rDragged = true
  // 右键按下就弹菜单的平台（macOS）：一拖就当平移，把菜单收起
  menu.value = null
}
function onContext(e: MouseEvent) {
  const b = sandboxBridge.value
  if (!b || !editing.value || placing.value || lastTouch) return
  // 右键拖动是平移视角：拖过了就不弹菜单
  if (rDragged || (rDown && Math.hypot(e.clientX - rDown.x, e.clientY - rDown.y) > 6)) return
  const id = b.pick(e)
  if (id) selection.value = { type: 'furniture', id }
  openMenu(e.clientX, e.clientY, id)
}
function onDbl(e: MouseEvent) {
  const b = sandboxBridge.value
  if (!b || placing.value) return
  const id = b.pick(e)
  if (id) focusOn(id)
}

let bound: HTMLCanvasElement | null = null
function bind(c: HTMLCanvasElement | null) {
  if (bound === c) return
  if (bound) {
    bound.removeEventListener('pointerdown', onDown, true)
    bound.removeEventListener('contextmenu', onContext)
    bound.removeEventListener('dblclick', onDbl)
  }
  bound = c
  if (c) {
    // 捕获阶段：要比 Sandbox3D 自己的 pointerdown（会立即改选中）先记下「按在画布上」
    c.addEventListener('pointerdown', onDown, true)
    c.addEventListener('contextmenu', onContext)
    c.addEventListener('dblclick', onDbl)
  }
}
watch(() => sandboxBridge.value?.canvas ?? null, bind, { immediate: true })
// 触屏长按弹菜单的入口
watch(
  sandboxBridge,
  (b) => {
    if (b) b.menu = (x, y, id) => openMenu(x, y, id)
  },
  { immediate: true },
)
window.addEventListener('pointerup', onUp)
window.addEventListener('pointercancel', onUp)
window.addEventListener('pointermove', onMove)

// ---------- 聚焦：镜头平滑移到家具前 ----------

let anim = 0
function focusOn(id: string) {
  const b = sandboxBridge.value
  const f = findFurniture(id)
  const o = b?.object(id)
  if (!b || !f || !o) return
  const def = ASSET_MAP.get(f.asset)
  const size = def ? Math.max(def.w, def.d, def.h) : 80
  const center = new THREE.Vector3(o.position.x, o.position.y + (def?.h ?? 60) / 2, o.position.z)
  const dir = b.camera.position.clone().sub(b.controls.target).normalize()
  const dist = THREE.MathUtils.clamp(size * 4.5, Math.max(b.controls.minDistance, 320), 1400)
  const fromT = b.controls.target.clone()
  const fromP = b.camera.position.clone()
  const toP = center.clone().addScaledVector(dir, dist)
  const t0 = performance.now()
  cancelAnimationFrame(anim)
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 450)
    const e = 1 - Math.pow(1 - k, 3)
    b.controls.target.lerpVectors(fromT, center, e)
    b.camera.position.lerpVectors(fromP, toP, e)
    b.controls.update()
    b.redraw()
    if (k < 1) anim = requestAnimationFrame(step)
  }
  anim = requestAnimationFrame(step)
}

// ---------- 方向键微移 ----------

let lastNudge = 0
function onKey(e: KeyboardEvent) {
  if (!e.key.startsWith('Arrow') || e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return
  if (overlays.help || saved.panelOpen || saved.confirm) return
  const b = sandboxBridge.value
  const id = selId.value
  const f = id ? findFurniture(id) : undefined
  if (!b || !f || !editing.value || placing.value) return
  e.preventDefault()
  // 镜头朝向投到地面，取最接近的轴：↑ 是「离开镜头」的方向
  const fw = b.controls.target.clone().sub(b.camera.position)
  const up = Math.abs(fw.x) > Math.abs(fw.z) ? { x: Math.sign(fw.x), y: 0 } : { x: 0, y: Math.sign(fw.z) }
  const right = { x: -up.y, y: up.x }
  const k = { ArrowUp: [up, 1], ArrowDown: [up, -1], ArrowRight: [right, 1], ArrowLeft: [right, -1] }[e.key] as [{ x: number; y: number }, number] | undefined
  if (!k) return
  const step = e.shiftKey ? 25 : 5
  let dx = k[0].x * k[1] * step
  let dy = k[0].y * k[1] * step
  const def = ASSET_MAP.get(f.asset)
  if ((def?.mount || def?.stick) && !def.ceiling) {
    // 壁挂物：只沿墙面方向移动（吸顶灯 / 吊灯在天花板下随便挪）（背面朝墙，墙的方向 = 朝向旋转 90°）
    const a = (f.rot * Math.PI) / 180
    const along = { x: Math.cos(a), y: Math.sin(a) }
    const d = dx * along.x + dy * along.y
    dx = along.x * d
    dy = along.y * d
  }
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return
  // 连按（含按住不放）只记一步撤销
  const now = performance.now()
  if (now - lastNudge > 800) checkpoint()
  lastNudge = now
  const kids = propsOn(plan.value, f)
  const r1 = (v: number) => Math.round(v * 10) / 10
  f.x = r1(f.x + dx)
  f.y = r1(f.y + dy)
  for (const c of kids) {
    c.x = r1(c.x + dx)
    c.y = r1(c.y + dy)
  }
}
window.addEventListener('keydown', onKey)

// ---------- 右键菜单 ----------

const menu = ref<{ x: number; y: number; items: MenuEntry[]; title?: string } | null>(null)

async function decorateAll() {
  await runBusy(t('正在布置家具…'), redecorate)
  toast(t('已布置 {n} 件家具', { n: plan.value.furniture.length }))
}

function cycleWall() {
  const i = WALL_MODES.findIndex((m) => m.id === sandbox.wallMode)
  sandbox.wallMode = WALL_MODES[(i + 1) % WALL_MODES.length].id
}

/** 楼梯的快捷菜单：形式、样式、上楼方向（和检查器里的选项一样），旋转、删除 */
function stairsMenu(x: number, y: number, s: Fixture) {
  const v = stairsVariant(s)
  const style = s.stairStyle ?? DEFAULT_STAIR_STYLE
  const turn = s.turn ?? 'left'
  const check = (on: boolean) => (on ? ' ✓' : '')
  menu.value = {
    x,
    y,
    title: t(FIXTURES.stairs.label),
    items: [
      { label: t('旋转 90°'), icon: ICONS.rotateCw, action: rotateSelectedFixture },
      'sep',
      { header: t('形式') },
      ...Object.entries(STAIRS_VARIANTS).map(([k, label]) => ({ label: t(label) + check(k === v), disabled: k === v, action: () => setStairsVariant(s, k as typeof v) })),
      'sep',
      { header: t('样式') },
      ...Object.entries(STAIR_STYLES).map(([k, st]) => ({
        label: t(st.label) + check(k === style),
        disabled: k === style,
        action: () => mutate(() => (k === DEFAULT_STAIR_STYLE ? delete s.stairStyle : (s.stairStyle = k))),
      })),
      ...(v !== 'straight'
        ? ([
            'sep',
            { header: t('上楼方向') },
            ...(['left', 'right'] as const).map((k) => ({ label: t(k === 'left' ? '往左拐' : '往右拐') + check(k === turn), disabled: k === turn, action: () => mutate(() => (s.turn = k)) })),
          ] as MenuEntry[])
        : []),
      'sep',
      { label: t('删除'), icon: ICONS.delete, keys: 'Del', danger: true, action: deleteSelection },
    ],
  }
}

function openMenu(x: number, y: number, id: string | null) {
  const b = sandboxBridge.value
  const f = id ? findFurniture(id) : undefined
  const def = f ? ASSET_MAP.get(f.asset) : undefined
  // 没点中家具时看看是不是楼梯
  const sid = !f && b ? b.pickStairs({ clientX: x, clientY: y }) : null
  const stairs = sid ? findFixture(sid) : undefined
  if (stairs) {
    selection.value = { type: 'fixture', id: stairs.id }
    stairsMenu(x, y, stairs)
  } else if (f && def) {
    const sizes = siblings(def)
    // 同类换款：上一款 / 下一款（和 [ / ] 键一样在同类各款里轮）
    const variants = sameTypeVariants(def)
    const vi = variants.findIndex((v) => v.id === def.id)
    const stepTo = (dir: number) => swapFurnitureVariant(f.id, variants[(vi + dir + variants.length) % variants.length].id)
    menu.value = {
      x,
      y,
      title: displayName(def),
      items: [
        { label: t('逆时针旋转 90°'), icon: ICONS.rotateCcw, keys: 'Q', action: () => rotateSelectedFurniture(-90) },
        { label: t('顺时针旋转 90°'), icon: ICONS.rotateCw, keys: 'E', action: () => rotateSelectedFurniture(90) },
        { label: t('聚焦'), icon: ICONS.focus, action: () => focusOn(f.id) },
        ...(variants.length > 1
          ? (['sep', { label: t('上一款'), icon: ICONS.prevItem, keys: '[', action: () => stepTo(-1) }, { label: t('下一款'), icon: ICONS.nextItem, keys: ']', action: () => stepTo(1) }] as MenuEntry[])
          : []),
        ...(sizes.length > 1
          ? (['sep', { header: t('规格') }, ...sizes.map((s) => ({ label: variantLabel(s) + (s.id === def.id ? ' ✓' : ''), disabled: s.id === def.id, action: () => swapFurnitureAsset(f.id, s.id) }))] as MenuEntry[])
          : []),
        'sep',
        { label: t('复制'), icon: ICONS.duplicate, keys: 'Ctrl D', action: duplicateSelection },
        { label: t('删除'), icon: ICONS.delete, keys: 'Del', danger: true, action: deleteSelection },
      ],
    }
  } else {
    const nextWall = WALL_MODES[(WALL_MODES.findIndex((m) => m.id === sandbox.wallMode) + 1) % WALL_MODES.length]
    menu.value = {
      x,
      y,
      items: [
        { label: t('一键布置家具'), icon: ICONS.autoFurnish, action: decorateAll },
        { label: t('重置视角'), icon: ICONS.resetView, keys: 'F', action: () => b?.resetView() },
        { label: t('墙体显示：{mode}', { mode: t(nextWall.label) }), icon: WALL_MODE_ICONS[nextWall.id], keys: 'C', action: cycleWall },
        { label: t('预览'), icon: ICONS.modePreview, keys: 'P', action: () => (sandbox.mode = 'preview') },
      ],
    }
  }
}

// ---------- 侧栏：在场景里点选家具时滚回顶部（属性区已排到第一位） ----------

watch(selId, (id, old) => {
  if (!id || id === old || performance.now() - lastCanvasDown > 600) return
  const panel = sandboxBridge.value?.canvas.closest('.sandbox')?.querySelector<HTMLElement>('.panel .bs-body')
  if (panel && panel.scrollTop > 0) panel.scrollTo({ top: 0, behavior: 'smooth' })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  cancelAnimationFrame(anim)
  bind(null)
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onUp)
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div
    v-if="bar && selDef && !pressing && !menu"
    class="fbar"
    :style="{ left: bar.x + 'px', top: bar.y + 'px' }"
    @pointerdown.stop
    @contextmenu.prevent
  >
    <span class="fname">{{ displayName(selDef) }}</span>
    <button class="icon-only" :title="t('逆时针旋转 90°') + ' (Q)'" :aria-label="t('逆时针旋转 90°')" @click="rotateSelectedFurniture(-90)"><JIcon :icon="ICONS.rotateCcw" :size="15" /></button>
    <button class="icon-only" :title="t('顺时针旋转 90°') + ' (E)'" :aria-label="t('顺时针旋转 90°')" @click="rotateSelectedFurniture(90)"><JIcon :icon="ICONS.rotateCw" :size="15" /></button>
    <button class="icon-only" :title="t('聚焦') + ' · ' + t('双击家具')" :aria-label="t('聚焦')" @click="selId && focusOn(selId)"><JIcon :icon="ICONS.focus" :size="15" /></button>
    <button class="icon-only" :title="t('复制') + ' (Ctrl D)'" :aria-label="t('复制')" @click="duplicateSelection"><JIcon :icon="ICONS.duplicate" :size="15" /></button>
    <button class="icon-only danger" :title="t('删除') + ' (Del)'" :aria-label="t('删除')" @click="deleteSelection"><JIcon :icon="ICONS.delete" :size="15" /></button>
    <button v-if="device.compact" class="icon-only" :title="t('属性')" :aria-label="t('属性')" @click="sandboxBridge?.showProps?.()"><JIcon :icon="ICONS.generateOptions" :size="15" /></button>
  </div>
  <ContextMenu v-if="menu" :x="menu.x" :y="menu.y" :items="menu.items" :title="menu.title" @close="menu = null" />
</template>

<style scoped>
.fbar {
  position: absolute;
  z-index: 2;
  transform: translate(-50%, calc(-100% - 10px));
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  animation: fbar-in 0.14s ease-out;
}
.fname {
  max-width: 160px;
  padding: 0 6px 0 8px;
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.fbar button {
  width: 28px;
  height: 28px;
  padding: 0;
  border-color: transparent;
  background: transparent;
}
.fbar button:hover:not(:disabled) {
  background: var(--hover);
  border-color: transparent;
}
@keyframes fbar-in {
  from {
    opacity: 0;
    transform: translate(-50%, calc(-100% - 4px));
  }
}
/* 触屏：按钮 44px；名字在手机上省掉，给按钮腾地方 */
:root.coarse .fbar button {
  width: 44px;
  height: 44px;
}
:root.compact .fname {
  display: none;
}
</style>
