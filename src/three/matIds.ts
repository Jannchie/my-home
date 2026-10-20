// 材质类别的名单和编号（mats.ts 讲每种是什么）。单独一个不依赖别的模块的文件：toon.ts 合并网格时要写逐顶点编号，
// 而 mats.ts 依赖 kit.ts / toon.ts，放在一起会循环引用。

export const MATS = ['paint', 'wood', 'fabric', 'pile', 'leather', 'metal', 'plastic', 'glass', 'frosted', 'ceramic', 'stone', 'paper', 'plant', 'bedding', 'foliage'] as const
/**
 * paint 涂装 / 乳胶漆（哑光）；wood 木（木纹）；fabric 布面软包（沙发、靠垫：绷紧的，只有很浅的起伏和织纹、绒光）；
 * bedding 寝具（被褥、床单、枕头：顶面平缓起伏，垂下来的侧面有竖向垂褶）；pile 长绒（布 + 绒毛层：地毯、毛绒）；
 * leather 皮革（细皮纹、半哑光）；metal 金属；plastic 塑料（半光）；glass 透明玻璃；frosted 磨砂玻璃；
 * ceramic 陶瓷 / 釉面（亮）；stone 石材 / 混凝土（斑点）；paper 纸（很哑）；plant 植物叶子；
 * foliage 修剪过的灌木（绿篱这类整块的形体：纯色、完全哑光，不加边缘光和明暗交界的色带，不然像塑料）
 */
export type Mat = (typeof MATS)[number]
/** 着色器里的编号（MATS 的下标） */
export const MAT_ID = Object.fromEntries(MATS.map((m, i) => [m, i])) as Record<Mat, number>
