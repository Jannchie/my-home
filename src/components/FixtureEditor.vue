<script setup lang="ts">
// 设备（厨房、浴缸、马桶、收纳位、楼梯…）的属性编辑：平面图检查器（variant="panel"）和 3D 沙盘点中设备浮出的卡片（variant="card"）共用。
// 每次改动一步撤销（store.mutate）；冰箱位、洗衣机位、收纳位上的家具跟着设备走的规则都在 store / cabinet 里，这里不另做。
import { computed } from 'vue'
import { DEFAULT_STAIR_STYLE, STAIR_STYLES } from '../stairStyles'
import { BUILTIN_TYPES, STAIRS_VARIANTS, TOILET_TYPES, fixtureDepth, type BuiltinType, type Fixture, type KitchenVariant, type Plan, type StairsVariant, type ToiletType } from '../model'
import { deleteSelection, mutate, plan, rotateSelectedFixture } from '../store'
import { floorAbove, floorOf, riseOf } from '../floors'
import { MAX_RISER, STAIRS_SIZE, stairsVariant } from '../stairs'
import { cabinetsOn, setOpen } from '../cabinet'
import { propsOn } from '../surface'
import { ASSET_MAP } from '../three/assets'
import { displayName } from '../three/catalog'
import { t } from '../i18n'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS } from '../ui/icons'

const props = withDefaults(defineProps<{ fixture: Fixture; variant?: 'panel' | 'card' }>(), { variant: 'panel' })
const card = computed(() => props.variant === 'card')

/** 改这个设备（按 id 在当前户型里找，撤销后 props 换了对象也不会改错） */
function edit(fn: (f: Fixture, p: Plan) => void) {
  const id = props.fixture.id
  mutate((p) => {
    const f = p.fixtures.find((x) => x.id === id)
    if (f) fn(f, p)
  })
}

/** 楼梯：通到哪一层、级数、踢面高 */
const stairInfo = computed(() => {
  const f = props.fixture
  if (f.kind !== 'stairs') return null
  const from = floorOf(plan.value, f)
  const rise = riseOf(plan.value, from)
  const n = Math.max(3, Math.ceil(rise / MAX_RISER))
  return { to: floorAbove(plan.value, from), rise, n, riser: rise / n }
})
/** 换楼梯形式：占地换成这种形式的默认尺寸（中心不动） */
function setStairs(v: StairsVariant) {
  edit((f) => {
    f.stairs = v
    f.w = STAIRS_SIZE[v].w
    f.d = STAIRS_SIZE[v].d
    if (v === 'straight') delete f.turn
    if (v !== 'l') delete f.run
    if (v !== 'straight' && v !== 'l') delete f.under
  })
}
/** 楼梯下的用法：'' = 按外观样式 */
function setUnder(v: string) {
  edit((f) => {
    if (v === 'open') f.under = v
    else delete f.under
  })
}
/** 换楼梯外观样式（经典 = 缺省，不写字段） */
function setStairStyle(v: string) {
  edit((f) => {
    if (v === DEFAULT_STAIR_STYLE) delete f.stairStyle
    else f.stairStyle = v
  })
}

const num = (e: Event) => Number((e.target as HTMLInputElement).value)
const str = (e: Event) => (e.target as HTMLInputElement).value

/** 嵌墙切换：收纳位沿正面方向挪一个位深（嵌墙时退到墙后，正面和墙面齐平）；位上的柜子和柜里的东西一起挪 */
function toggleRecessed() {
  edit((f, p) => {
    const a = (f.rot * Math.PI) / 180
    const k = (f.recessed ? 1 : -1) * fixtureDepth(f)
    const dx = Math.round(-Math.sin(a) * k)
    const dy = Math.round(Math.cos(a) * k)
    const cabs = cabinetsOn(p.furniture, f)
    for (const o of new Set([...cabs, ...cabs.flatMap((c) => propsOn(p, c))])) {
      o.x += dx
      o.y += dy
    }
    f.x += dx
    f.y += dy
    f.recessed = !f.recessed
  })
}

/** 收纳位上放着的、能开合的柜子（在收纳位的属性里开关柜门） */
const spotCabinets = computed(() => {
  const f = props.fixture
  return f.kind === 'builtin' ? cabinetsOn(plan.value.furniture, f).filter((c) => ASSET_MAP.get(c.asset)?.openable) : []
})
function setSpotOpen(open: boolean) {
  const ids = new Set(spotCabinets.value.map((c) => c.id))
  if (!ids.size || spotCabinets.value.every((c) => !!c.open === open)) return
  mutate((p) => {
    for (const c of p.furniture) if (ids.has(c.id)) setOpen(p, c, open)
  })
}
</script>

<template>
  <div class="fx-ed" :class="variant">
    <label v-if="fixture.kind === 'kitchen'"
      >{{ t('样式') }}
      <select :value="fixture.variant" @change="edit((f) => (f.variant = str($event) as KitchenVariant))">
        <option value="wall">{{ t('壁付け（台面贴墙）') }}</option>
        <option value="facing">{{ t('対面（背面柜 + 通道 + 主台面）') }}</option>
      </select>
    </label>
    <template v-if="fixture.kind === 'builtin'">
      <label
        >{{ t('类型') }}
        <select :value="fixture.builtinType ?? 'shoe'" @change="edit((f) => (f.builtinType = str($event) as BuiltinType))">
          <option v-for="(label, k) in BUILTIN_TYPES" :key="k" :value="k">{{ t(label) }}</option>
        </select>
      </label>
      <label class="inline"><input type="checkbox" :checked="!!fixture.recessed" @change="toggleRecessed" /> {{ t('嵌在墙里（不占房间）') }}</label>
      <label v-if="spotCabinets.length" class="inline"
        ><input type="checkbox" :checked="spotCabinets.every((c) => c.open)" @change="setSpotOpen(!spotCabinets.every((c) => c.open))" />
        {{ t('柜门打开（{name}）', { name: displayName(ASSET_MAP.get(spotCabinets[0].asset)!) }) }}</label
      >
      <p v-if="!card" class="hint">{{ t('收纳位只是预留的空间（嵌墙的是墙里的壁龛）。柜子本身是家具：一键布置会按位的尺寸放一件鞋柜 / 衣柜 / 食品柜，也可以在 3D 沙盘或素材库里自己换款式和颜色。') }}</p>
    </template>
    <template v-if="fixture.kind === 'stairs'">
      <label
        >{{ t('形式') }}
        <select :value="stairsVariant(fixture)" @change="setStairs(str($event) as StairsVariant)">
          <option v-for="(label, k) in STAIRS_VARIANTS" :key="k" :value="k">{{ t(label) }}</option>
        </select>
      </label>
      <label
        >{{ t('样式') }}
        <select :value="fixture.stairStyle ?? DEFAULT_STAIR_STYLE" @change="setStairStyle(str($event))">
          <option v-for="(st, k) in STAIR_STYLES" :key="k" :value="k">{{ t(st.label) }}</option>
        </select>
      </label>
      <label v-if="stairsVariant(fixture) !== 'straight'"
        >{{ t('上楼方向') }}
        <select :value="fixture.turn ?? 'left'" @change="edit((f) => (f.turn = str($event) as 'left' | 'right'))">
          <option value="left">{{ t('往左拐') }}</option>
          <option value="right">{{ t('往右拐') }}</option>
        </select>
      </label>
      <label v-if="stairsVariant(fixture) === 'l'"
        >{{ t('梯段宽 cm') }}<input type="number" step="5" min="60" max="150" :value="fixture.run ?? 90" @change="edit((f) => (f.run = Math.max(60, num($event))))"
      /></label>
      <label v-if="stairsVariant(fixture) === 'straight' || stairsVariant(fixture) === 'l'"
        >{{ t('楼梯下') }}
        <select :value="fixture.under ?? ''" @change="setUnder(str($event))">
          <option value="">{{ t('按外观样式') }}</option>
          <option value="open">{{ t('储物角（敞开）') }}</option>
        </select>
      </label>
      <dl v-if="stairInfo">
        <dt>{{ t('通到') }}</dt>
        <dd>{{ stairInfo.to?.name ?? t('（上面还没有楼层）') }}</dd>
        <dt>{{ t('级数') }}</dt>
        <dd class="num">{{ t('{n} 级 · 每级 {r} cm', { n: stairInfo.n, r: stairInfo.riser.toFixed(1) }) }}</dd>
      </dl>
      <p v-if="!card" class="hint">{{ t('楼梯放在下层，通到上面一层；上层对应的位置自动开出楼梯洞口。旋转 90° 改朝向，起步处是小圆、箭头指向上楼方向。') }}</p>
    </template>
    <template v-if="!card">
      <p v-if="fixture.kind === 'fridge'" class="hint">{{ t('冰箱位只是预留的空间。冰箱本身是家具：一键布置会按户型和住户风格放一台，也可以在 3D 沙盘或素材库里自己挑款式和颜色。') }}</p>
      <p v-if="fixture.kind === 'washer'" class="hint">{{ t('洗衣机位是防水盘和给排水口。洗衣机本身是家具：一键布置会按户型和住户风格放一台，也可以在 3D 沙盘或素材库里自己挑款式和颜色。') }}</p>
    </template>
    <label v-if="fixture.kind === 'toilet'"
      >{{ t('类型') }}
      <select :value="fixture.toiletType ?? 'washlet'" @change="edit((f) => (f.toiletType = str($event) as ToiletType))">
        <option v-for="(label, k) in TOILET_TYPES" :key="k" :value="k">{{ t(label) }}</option>
      </select>
    </label>
    <label v-if="fixture.kind === 'kitchen'"
      >{{ t('灶头') }}
      <select :value="fixture.burners ?? (fixture.w < 200 ? 2 : 3)" @change="edit((f) => (f.burners = Number(str($event)) as 2 | 3))">
        <option :value="2">{{ t('两口') }}</option>
        <option :value="3">{{ t('三口') }}</option>
      </select>
    </label>
    <div class="row">
      <label
        >{{ t('长 cm') }}<input type="number" step="5" min="20" :value="fixture.w" @change="edit((f) => (f.w = Math.max(20, num($event))))"
      /></label>
      <label v-if="fixture.kind !== 'kitchen'"
        >{{ t('深 cm') }}<input type="number" step="5" min="10" :value="fixtureDepth(fixture)" @change="edit((f) => (f.d = Math.max(10, num($event))))"
      /></label>
    </div>
    <div v-if="card" class="actions">
      <button class="rot" :title="t('逆时针旋转 90°')" :aria-label="t('逆时针旋转 90°')" @click="rotateSelectedFixture(-90)"><JIcon :icon="ICONS.rotateCcw" :size="14" /><span class="num">90°</span></button>
      <button class="rot" :title="t('顺时针旋转 90°')" :aria-label="t('顺时针旋转 90°')" @click="rotateSelectedFixture(90)"><JIcon :icon="ICONS.rotateCw" :size="14" /><span class="num">90°</span></button>
      <button class="danger" @click="deleteSelection"><JIcon :icon="ICONS.delete" :size="14" />{{ t('删除') }}</button>
    </div>
    <div v-else class="actions">
      <button @click="rotateSelectedFixture()"><JIcon :icon="ICONS.rotateCw" />{{ t('旋转 90°') }} <kbd>Q</kbd></button>
      <button class="danger" @click="deleteSelection"><JIcon :icon="ICONS.delete" />{{ t('删除') }} <kbd>Del</kbd></button>
    </div>
    <p v-if="!card && fixture.kind === 'kitchen'" class="hint">{{ t('日式间取り里厨房一般画在 LDK 内，面积计入 LDK 的帖数。要独立厨房，可以画一个「キッチン」类型的房间。') }}</p>
  </div>
</template>

<style scoped>
.fx-ed {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--fs-sm);
  color: var(--text-muted);
}
label.inline {
  flex-direction: row;
  align-items: center;
  gap: 6px;
}
.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}
input:not([type='checkbox']),
select {
  font: inherit;
  font-size: var(--fs-base);
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  height: var(--control-h);
  padding: 0 8px;
  min-width: 0;
  width: 100%;
}
input[type='number'] {
  font-variant-numeric: tabular-nums;
}
input:focus,
select:focus {
  outline: 2px solid var(--accent-ring);
  border-color: var(--accent);
}
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 12px;
  margin: 0;
  font-size: var(--fs-sm);
}
dt {
  color: var(--text-muted);
}
dd {
  margin: 0;
  text-align: right;
}
.num {
  font-variant-numeric: tabular-nums;
}
.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.actions button {
  min-height: var(--control-h);
}
.hint {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  line-height: 1.6;
  margin: 0;
}
/* 3D 卡片：紧凑一些（字小一号、间距收紧），按钮平分一行 */
.fx-ed.card {
  gap: 8px;
  font-size: var(--fs-sm);
}
.card label {
  font-size: var(--fs-xs);
}
.card input:not([type='checkbox']),
.card select {
  font-size: var(--fs-sm);
}
.card .actions {
  gap: 6px;
}
.card .actions button {
  flex: 1;
}
.card .actions button.rot {
  flex: 0 0 auto;
}
</style>
