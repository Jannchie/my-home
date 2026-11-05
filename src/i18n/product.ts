// 产品简介（页面「关于」区、SEO meta、README 共用）。单独成文件：seo.ts / 宣传片只要这两句，不必拉上整个界面词典。
// 按 ui.ts 的约定，key 就是中文原文：页面里写 t(PRODUCT_TAGLINE) / t(PRODUCT_INTRO)。

/** 一句话简介 */
export const PRODUCT_TAGLINE = '生成一个带有生活气息的家'
/** 一段 150 字左右的简介 */
export const PRODUCT_INTRO =
  'My Home 是在浏览器里运行的户型编辑器与 3D 卡通沙盘。户型可按日式（1K–3LDK）、中式（几室几厅）、欧美三种方式生成，也可以在平面图里手绘。一键布置会按住户的家庭构成、职业、性格与兴趣摆放家具和生活小物。3D 沙盘有五种墙体显示，按时刻、日期和城市计算日照与昼夜，提供 15 种画面效果，宠物和扫地机器人会走动。2900+ 程序化素材、9 种风格；支持触屏与 PWA 离线，中日英三语。免费、无需注册，数据只保存在浏览器本地。'

/** 上面两句的 [日本語, English]（并入 ui.ts 的界面词典） */
export const PRODUCT_TEXT: Record<string, [ja: string, en: string]> = {
  [PRODUCT_TAGLINE]: ['暮らしの気配がある家をつくる', 'Generate a home that feels lived-in'],
  [PRODUCT_INTRO]: [
    'My Home は、ブラウザで動く間取りエディタと 3D トゥーンジオラマです。間取りは日本（1K〜3LDK）・中国・欧米の 3 方式で生成でき、間取り図に手で描くこともできます。おまかせ配置は、住む人の家族構成・職業・性格・趣味に合わせて家具と生活小物を並べます。3D ジオラマには 5 種類の壁表示があり、時刻・日付・都市から日照と昼夜を計算し、15 種類の画面エフェクトを備えます。ペットやロボット掃除機も歩き回ります。素材 2900 点以上・9 つのテイスト。タッチ操作と PWA のオフライン利用、日中英の 3 言語に対応。無料・登録不要で、データはブラウザ内にだけ保存されます。',
    'My Home is a floor plan editor and toon-shaded 3D diorama that runs in your browser. It generates Japanese (1K–3LDK), Chinese and Western layouts, or lets you draw your own. One-click furnishing places furniture and everyday items based on the household, jobs, personalities and hobbies of the people living there. The 3D view offers five wall display modes, sunlight and day/night computed from time, date and city, 15 visual looks, and wandering pets and robot vacuums. 2,900+ procedural assets and 9 styles; touch and offline PWA support; Chinese, Japanese and English. Free, no sign-up — your data stays in your browser.',
  ],
}
