<script setup lang="ts">
// 配色编辑：上半是按风格分组的预设配色，下半是逐槽自定义（色板点选 / 取色器 / 随机 / 重置）。
// colors 为自定义覆盖（undefined = 完全用预设）。拖动取色器时发 preview，松手发 commit，方便上层只记一次撤销。
import { computed, ref } from 'vue'
import { STYLE_LABELS, type AssetDef, type StyleTag } from '../three/assets'
import { allPalettes, type PaletteEntry } from '../three/stylePalettes'
import { SWATCHES, effectivePalette, randomColors, slotCount, slotLabel } from '../three/colors'
import { PATTERN_KINDS, randomPattern, type PatternKind, type PatternSpec } from '../three/patterns'
import { patternPreview } from '../three/fabric'
import { t } from '../i18n'
import { JIcon } from '@jannchie/icons-vue'
import { ICONS } from '../ui/icons'

const props = defineProps<{ def: AssetDef; color: number; colors?: string[]; patterns?: (PatternSpec | null)[]; sameCount?: number }>()
const emit = defineEmits<{
  preset: [i: number]
  preview: [colors: string[] | undefined]
  commit: [colors: string[] | undefined]
  patterns: [patterns: (PatternSpec | null)[] | undefined]
  applySame: []
}>()

/** 按风格分组：原生配色 + 缺原生配色的风格补一项派生配色（自动按该风格色板重新上色） */
const groups = computed(() => {
  const m = new Map<StyleTag, PaletteEntry[]>()
  for (const e of allPalettes(props.def)) m.set(e.style, [...(m.get(e.style) ?? []), e])
  return [...m.entries()]
})

const current = computed(() => effectivePalette(props.def, props.color, props.colors))
const slots = computed(() => Array.from({ length: slotCount(props.def) }, (_, i) => current.value[i] ?? current.value[0]))
const active = ref(0)
const custom = computed(() => !!props.colors?.length)
const open = ref(false)

function withSlot(i: number, c: string) {
  const next = [...slots.value]
  next[i] = c
  return next
}
function pick(c: string) {
  emit('commit', withSlot(active.value, c))
}
const grad = (p: string[]) => `linear-gradient(135deg, ${p[0]} 55%, ${p[1] ?? p[0]} 55%)`

// ---------- 花纹：给当前选中的颜色槽上花纹，花纹默认用这件家具自己的几种颜色来织 ----------

const patOpen = ref(false)
const slotPattern = computed(() => props.patterns?.[active.value] ?? null)
/** 织花纹用的颜色：选中的槽当底色，其余槽当花色；颜色不够就补白和深色 */
const weave = computed(() => {
  const base = slots.value[active.value]
  const others = slots.value.filter((_, i) => i !== active.value)
  const cs = [base, ...others]
  if (cs.length < 3) cs.push('#ffffff', '#5b5853')
  return cs
})
const kindSpec = (kind: PatternKind): PatternSpec => ({ ...(slotPattern.value ?? { scale: 12, density: 0.5, seed: 7 }), kind, colors: slotPattern.value?.colors ?? weave.value })
function setPattern(spec: PatternSpec | null) {
  const n = slotCount(props.def)
  const next = Array.from({ length: n }, (_, i) => props.patterns?.[i] ?? null)
  next[active.value] = spec
  emit('patterns', next.some(Boolean) ? next : undefined)
}
const patch = (p: Partial<PatternSpec>) => slotPattern.value && setPattern({ ...slotPattern.value, ...p })
const groupsOfKinds = computed(() => {
  const m = new Map<string, typeof PATTERN_KINDS>()
  for (const k of PATTERN_KINDS) m.set(k.group, [...(m.get(k.group) ?? []), k])
  return [...m.entries()]
})
</script>

<template>
  <div class="ce">
    <div v-for="[st, idx] in groups" :key="st" class="pal-row">
      <span class="pal-style" :title="t(STYLE_LABELS[st])">{{ t(STYLE_LABELS[st]) }}</span>
      <div class="swatches">
        <button
          v-for="e in idx"
          :key="e.index"
          class="sw"
          :class="{ on: !custom && color === e.index, auto: e.derived }"
          :title="e.derived ? t('自动派生（按本风格色板重新上色）') : undefined"
          :style="{ background: grad(e.colors) }"
          @click="emit('preset', e.index)"
        />
      </div>
    </div>

    <div class="custom-head">
      <button class="toggle" :class="{ on: open }" :aria-expanded="open" @click="open = !open"><JIcon :icon="ICONS.color" :size="14" />{{ t('自定义配色') }}<span v-if="custom" class="dot" /><JIcon :icon="open ? ICONS.collapse : ICONS.expand" :size="12" class="ico-muted" /></button>
      <span class="spacer" />
      <button class="mini" :title="t('从同一风格的色板随机挑一套')" @click="emit('commit', randomColors(def))"><JIcon :icon="ICONS.shuffle" :size="12" />{{ t('随机') }}</button>
      <button class="mini" :disabled="!custom" :title="t('回到预设配色')" @click="emit('commit', undefined)"><JIcon :icon="ICONS.reset" :size="12" />{{ t('重置') }}</button>
    </div>

    <template v-if="open">
      <div class="slots">
        <label v-for="(c, i) in slots" :key="i" class="slot" :class="{ on: active === i }" @click="active = i">
          <span class="chip" :style="{ background: c }">
            <input
              type="color"
              :value="c"
              :title="t('{slot}：点击取色', { slot: slotLabel(i) })"
              @input="emit('preview', withSlot(i, ($event.target as HTMLInputElement).value))"
              @change="emit('commit', withSlot(i, ($event.target as HTMLInputElement).value))"
            />
          </span>
          <span class="slot-name">{{ slotLabel(i) }}</span>
        </label>
      </div>
      <div v-for="g in SWATCHES" :key="g.label" class="sw-row">
        <span class="pal-style" :title="t(g.label)">{{ t(g.label) }}</span>
        <div class="tiny">
          <button v-for="c in g.colors" :key="c" :style="{ background: c }" :class="{ on: slots[active]?.toLowerCase() === c.toLowerCase() }" :title="c" @click="pick(c)" />
        </div>
      </div>
      <button v-if="sameCount && sameCount > 1" class="same" @click="emit('applySame')"><JIcon :icon="ICONS.duplicate" :size="14" />{{ t('把这套配色和花纹应用到同款（共 {n} 件）', { n: sameCount }) }}</button>
    </template>

    <div class="custom-head">
      <button class="toggle" :class="{ on: patOpen }" :aria-expanded="patOpen" @click="patOpen = !patOpen"><JIcon :icon="ICONS.pattern" :size="14" />{{ t('布艺花纹') }}<span v-if="patterns?.some(Boolean)" class="dot" /><JIcon :icon="patOpen ? ICONS.collapse : ICONS.expand" :size="12" class="ico-muted" /></button>
      <span class="spacer" />
      <button class="mini" :title="t('用这件家具的颜色随机织一种花纹')" @click="(patOpen = true), setPattern(randomPattern(weave))"><JIcon :icon="ICONS.shuffle" :size="12" />{{ t('随机花纹') }}</button>
      <button class="mini" :disabled="!slotPattern" @click="setPattern(null)">{{ t('去掉') }}</button>
    </div>
    <template v-if="patOpen">
      <div class="slots">
        <button v-for="(c, i) in slots" :key="i" class="slot" :class="{ on: active === i }" @click="active = i">
          <span class="chip" :style="{ background: c }"><img v-if="patterns?.[i]" class="chip-pat" :src="patternPreview(patterns[i]!, 30)" alt="" /></span>
          <span class="slot-name">{{ slotLabel(i) }}</span>
        </button>
      </div>
      <div v-for="[g, kinds] in groupsOfKinds" :key="g" class="pat-group">
        <span class="pal-style">{{ t(g) }}</span>
        <div class="pats">
          <button v-for="k in kinds" :key="k.id" :class="{ on: slotPattern?.kind === k.id }" :title="t(k.label)" @click="setPattern(kindSpec(k.id))">
            <img :src="patternPreview(kindSpec(k.id), 40)" alt="" />
          </button>
        </div>
      </div>
      <template v-if="slotPattern">
        <label class="prow"><span>{{ t('大小') }}</span><input type="range" min="3" max="40" step="1" :value="slotPattern.scale" @change="patch({ scale: +($event.target as HTMLInputElement).value })" /><span class="num">{{ slotPattern.scale }}</span></label>
        <label class="prow"><span>{{ t('密度') }}</span><input type="range" min="0.1" max="0.9" step="0.05" :value="slotPattern.density ?? 0.5" @change="patch({ density: +($event.target as HTMLInputElement).value })" /><span class="num">{{ Math.round((slotPattern.density ?? 0.5) * 100) }}</span></label>
        <div class="prow">
          <span>{{ t('方向') }}</span>
          <button v-for="a in [0, 45, 90] as const" :key="a" class="mini" :class="{ sel: (slotPattern.angle ?? 0) === a }" @click="patch({ angle: a })">{{ a }}°</button>
          <button class="mini" :title="t('换一种随机排布')" @click="patch({ seed: Math.floor(Math.random() * 1e6) })">{{ t('重排') }}</button>
        </div>
        <template v-if="slotPattern.kind === 'patchwork'">
          <label class="prow"><span>{{ t('素色') }}</span><input type="range" min="0" max="0.8" step="0.05" :value="slotPattern.plainRatio ?? 0.3" @change="patch({ plainRatio: +($event.target as HTMLInputElement).value })" /><span class="num">{{ Math.round((slotPattern.plainRatio ?? 0.3) * 100) }}</span></label>
          <div class="prow">
            <span>{{ t('布片') }}</span>
            <button v-for="n in [2, 3, 4, 6, 8]" :key="n" class="mini" :class="{ sel: (slotPattern.pieces ?? 4) === n }" @click="patch({ pieces: n })">{{ n }}</button>
          </div>
        </template>
        <button class="mini wide" @click="patch({ colors: weave })">{{ t('用当前配色重新织') }}</button>
      </template>
    </template>
  </div>
</template>

<style scoped>
.pal-row,
.sw-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}
.pal-style {
  width: 60px;
  flex: none;
  font-size: var(--fs-xs);
  color: var(--text-muted);
  /* 日文 / 英文的风格名可能更长：单行省略，完整名字在 title 里 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.swatches {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.sw {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--border);
}
.sw.on {
  box-shadow: 0 0 0 2px var(--accent);
}
/* 自动派生的配色：右下角一个小圆点作标记 */
.sw.auto {
  position: relative;
}
.sw.auto::after {
  content: '';
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  border: 1.5px solid var(--surface);
}
.custom-head {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 8px 0 6px;
}
.toggle {
  gap: 4px;
  border: none;
  background: none;
  padding: 2px 0;
  font-weight: 600;
  font-size: var(--fs-sm);
}
.toggle:hover {
  background: none !important;
}
.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  vertical-align: middle;
}
.spacer {
  flex: 1;
}
.mini {
  padding: 2px 8px;
  font-size: var(--fs-xs);
  gap: 4px;
}
.slots {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}
.slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
}
.slot.on {
  border-color: var(--accent);
  background: var(--surface);
}
.chip {
  position: relative;
  display: block;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}
.chip input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
  border: 0;
  padding: 0;
}
.slot-name {
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.tiny {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.tiny button {
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(0, 0, 0, 0.08);
}
.tiny button.on {
  box-shadow: 0 0 0 2px var(--accent);
}
.chip-pat {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.pat-group {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 5px;
}
.pats {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.pats button {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.pats button img {
  width: 100%;
  height: 100%;
  display: block;
}
.pats button.on {
  box-shadow: 0 0 0 2px var(--accent);
}
.prow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 4px 0;
  font-size: var(--fs-xs);
  color: var(--text-muted);
}
.prow > span:first-child {
  width: 28px;
}
.prow input[type='range'] {
  flex: 1;
  accent-color: var(--accent);
}
.mini.sel {
  background: var(--accent-weak);
  color: var(--accent-strong);
  border-color: var(--accent-ring);
  text-shadow: 0 0 0.6px currentColor; /* 假粗体：选中态不改字重，宽度不跳 */
}
.wide {
  width: 100%;
  margin-top: 4px;
}
.same {
  width: 100%;
  margin-top: 6px;
}
</style>
