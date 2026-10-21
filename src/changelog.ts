// 更新日志：应用内「更新日志」面板与 GitHub Release 说明的共同来源（scripts/release-notes.mjs 从这里生成）。
// 最新的版本放最前面；第一条的 version 必须和 package.json 一致（test/changelog.spec.ts 检查）。
// 界面只显示当前语言的那一份。
import type { Lang } from './i18n'

export interface Release {
  version: string
  /** YYYY-MM-DD */
  date: string
  notes: Record<Lang, string[]>
}

export const CHANGELOG: Release[] = [
  {
    version: '1.15.0',
    date: '2026-10-22',
    notes: {
      zh: [
        '新门款式：「竖条玻璃门」（门板中间一条竖向窄玻璃）和「横条玻璃门」（中间一列横向窄玻璃）；门扇、侧窗和亮子的玻璃都可以选透明或磨砂',
        '默认层高按地区：日本保持 240 cm，中国和欧美默认 270 cm；「墙高」滑杆最高到当前楼层的层高，顶灯、吊灯、管道井和窗帘都跟着实际层高走',
        '「动画」下的金属更像金属：厨房台面、水槽、水龙头和拉手有分档的反光、两条细亮线，对着灯和太阳的地方会有晕开的高光',
        '「调整」里新增泛光色相和染色：只给泛光的光晕上色（比如偏橙红），画面本身的颜色不变',
        '修正餐具柜、食品柜偶尔一件东西都没摆上',
      ],
      ja: [
        '新しいドア：「縦スリットガラス戸」（扉の中央に縦長の細いガラス）と「横スリットガラス戸」（中央に横長の細いガラスが並ぶ）。扉、袖窓、欄間のガラスは透明とすりガラスから選べます',
        '既定の天井高を地域別に：日本は 240 cm のまま、中国・欧米は 270 cm。「壁の高さ」スライダーは今の階の天井高までになり、シーリングライト、ペンダントライト、PS、カーテンも実際の天井高に合わせます',
        '「アニメ」の金属をより金属らしく：キッチンの天板、シンク、蛇口、取っ手に段階のある映り込みと細い 2 本の光の線、照明や太陽を映すところににじむハイライト',
        '「調整」にブルームの色相と色の強さを追加：ブルームの光のにじみだけに色をつけ（たとえば赤みのあるオレンジ）、画面そのものの色は変わりません',
        '食器棚・食品棚に何も置かれないことがある問題を修正',
      ],
      en: [
        'New doors: Vertical glass strip (one narrow vertical pane down the middle) and Horizontal glass slits (a column of narrow horizontal panes); glass in leaves, sidelights and transoms can be clear or frosted',
        'Default ceiling height now depends on the region: 240 cm in Japan, 270 cm for China and the West; the Wall height slider goes up to the ceiling height of the current floor, and ceiling lights, pendants, pipe shafts and curtains follow the actual height',
        'Metal looks more like metal in Anime: kitchen counters, sinks, faucets and handles get banded reflections, two thin glint lines and highlights that bloom where they catch a lamp or the sun',
        'Adjust adds bloom hue and tint: color only the bloom glow (for example a warm orange-red) without changing the rest of the image',
        'Fixed dish and food cabinets sometimes ending up empty',
      ],
    },
  },
  {
    version: '1.14.0',
    date: '2026-10-21',
    notes: {
      zh: [
        '「写实」更像室内照片：按房间算的间接光让靠窗的地方亮、房间深处暗，地板、墙面的颜色会互相映染；鸟瞰时远处蒙一层淡淡的空气，天上换成有体积的积云，白天白亮、黄昏被照成金橙、夜里是深色的云和月光照亮的边',
        '画面效果的名字统一成两个字（自然、写实、动画、手办、微缩、暖阳、冷雾、胶片、粉彩、水彩、网点、漫画……）；「动画」的远处描边会逐渐变细，窗外和鸟瞰时不再糊成一片',
        '「调整」里新增暗部、亮部的色相和强度：暗部偏蓝紫、亮部偏暖这类分离色调可以自己调',
        '推拉门、阳台推拉窗可以单独推开任意一扇，漫游时推的是正对着的那扇；折叠门可以选三折或四折（两侧对开）',
        '自动放置的对讲机、热水器和浴室面板，以及房间的主灯、吊灯，点一下就变成家具：可以选中、拖动、换款式、删除，换上的灯照样照亮房间',
        '修正「动画」夜里灯下的浅色地板整片晕成一团白',
      ],
      ja: [
        '「リアル」がより室内写真らしく：部屋ごとに計算する間接光で窓際は明るく奥は暗く、床や壁の色が互いに映り込みます。俯瞰では遠くにうっすら空気感がかかり、空は立体的な積雲に。昼は白く輝き、夕方は金色に照らされ、夜は暗い雲の縁が月明かりで光ります',
        '画面エフェクトの名前を短く統一（ナチュラル、リアル、アニメ、フィギュア、ミニチュア、ウォーム、クールミスト、フィルム、パステル、水彩、網点、モノクロ漫画…）。「アニメ」では遠くの輪郭線がだんだん細くなり、窓の外や俯瞰でも線が潰れません',
        '「調整」にシャドウ・ハイライトの色相と強さを追加：影を青紫に、明部を暖かく、といったスプリットトーンを自分で調整できます',
        '引き戸やバルコニーの引き違い窓はどの戸でも個別に開けられ、ウォーク中は正面の戸が動きます。折れ戸は 3 枚折り・4 枚折り（両開き）を選べます',
        '自動で置かれるインターホン、給湯器・浴室のリモコン、部屋のシーリングライトやペンダントライトは、クリックで家具に変わります。選択・移動・デザイン変更・削除ができ、置き換えた照明もそのまま部屋を照らします',
        '「アニメ」の夜、照明の下の明るい床が一面白くにじむ問題を修正',
      ],
      en: [
        'Realistic looks more like an interior photo: per-room indirect light makes areas by the windows bright and the back of the room darker, with floor and wall colors bleeding onto each other; from above, distant parts fade into a light haze, and the sky gets volumetric cumulus clouds that are bright white by day, lit gold at dusk and dark with moonlit edges at night',
        'Look names are now short and consistent (Natural, Realistic, Anime, Figurine, Miniature, Warm, Cool mist, Film, Pastel, Watercolor, Halftone, Manga…); in Anime, distant outlines thin out so views out of the window and from above no longer turn muddy',
        'Adjust now has shadow and highlight hue and strength, so you can set split toning such as blue-violet shadows and warm highlights yourself',
        'Any leaf of a sliding door or balcony sliding window can be opened on its own, and in walk mode the leaf you face moves; folding doors can have 3 panels or 4 (a pair from each side)',
        'Auto-placed intercoms, water-heater and bath panels, and room ceiling lights and pendants turn into furniture with one click: select, drag, swap or delete them, and a replaced light still lights the room',
        'Fixed light floors under lamps blooming into a white blob at night in Anime',
      ],
    },
  },
  {
    version: '1.13.0',
    date: '2026-10-21',
    notes: {
      zh: [
        '「动画感」改用赛璐璐光照：两档明暗、带颜色的阴影，保留冷暖色调、环境光遮蔽和光柱；赛璐璐下的金属有了亮暗分明的反光和一道细高光',
        '描线更清楚：外轮廓统一用深色描边，粗细由「描边」控制；「转折线」只画物体内部的折角，不再和描边叠成两条线，也不再一调就换掉外轮廓的画法',
        '转视角、漫游时按帧率自动降低分辨率，停下后恢复清晰；省电画质关掉泛光、转动时不再频繁重画墙体阴影；背光面的阴影、磨砂玻璃、指南针也更省',
        '展开「画面效果」不再卡顿：各效果的着色器在后台编译，视角没变时缩略图直接复用',
        '修正悬停阳台推拉窗时整扇窗发白',
      ],
      ja: [
        '「アニメ調」をセルシェーディングのライティングに：2 段階の陰影と色のついた影に、寒暖の色味・アンビエントオクルージョン・光の筋はそのまま。セルシェーディングの金属に明暗のはっきりした映り込みと細いハイライト',
        '線をくっきりと：外側の輪郭はすべて濃い輪郭線で描き、太さは「輪郭線」で調整。「稜線」は物の内側の折れ目だけを描き、輪郭線と二重にならず、調整しても輪郭の描き方が切り替わりません',
        '視点の回転やウォーク中はフレームレートに応じて解像度を自動で下げ、止まると元の精細さに。省電力画質ではブルームをオフにし、回転中に壁の影を何度も描き直さないように。逆光側の影、すりガラス、方位磁針も軽く',
        '「画面エフェクト」を開いてもカクつかないように：各エフェクトのシェーダーをバックグラウンドでコンパイルし、視点が変わっていなければサムネイルを再利用',
        'バルコニーの引き違い窓にカーソルを乗せると窓全体が白飛びする問題を修正',
      ],
      en: [
        "The Anime look now uses cel-shaded lighting: two shading bands and colored shadows, keeping the warm and cool tints, ambient occlusion and light shafts; metal under cel shading gets crisp light and dark reflections plus a thin highlight",
        "Crisper lines: outer contours are always drawn with dark outlines whose width follows the Outline slider; Crease lines only draw folds inside objects, no longer doubling the outline or switching how contours are drawn",
        "Resolution drops automatically to keep the frame rate up while orbiting or walking and sharpens again when you stop; Battery saver turns off bloom and no longer keeps redrawing wall shadows while orbiting; back-facing shadows, frosted glass and the compass are cheaper too",
        "Opening the Look panel no longer stutters: shaders for each look compile in the background, and thumbnails are reused when the view has not changed",
        "Fixed balcony sliding windows turning white when hovered",
      ],
    },
  },
  {
    version: '1.12.0',
    date: '2026-10-20',
    notes: {
      zh: [
        '新增「写实」「手办」画面效果：PBR 材质带木纹、布料和绒毛，明暗与反光更柔和；手办是半光泽漆面加一圈柔光',
        '室内灯会投出影子：每层最显眼的几盏灯各自投影，两盏灯照同一个东西就有两块影子，影子是动画风格的硬边、浅色、略带蓝紫；新增「室外光」滑杆和灯光一键恢复默认',
        '描线改成后处理墨线，墙角、天花板交界、窗框都有线，凸起的棱边旁留一道高光；暗面分三档、阴影色更鲜；木地板改成长短错缝的木板',
        '漫游只画看得到的房间（透过门和楼梯洞口看得到的照常画），帧率明显提高；倒影、遮蔽等也更省',
        '平面图：选中房间后每条边中点有「+」，点一下加角点、按住拖到位，右键边也能加；门窗两端可以直接拖动改宽度，还有常用宽度一键切换',
        '厨房可以左右翻转（水槽和灶对调，台面上的东西跟着走）；右键家具可以换同类的上一款 / 下一款；F3 打开性能浮窗。修正灯全关后月光从天花板漏进来、楼梯口过亮',
      ],
      ja: [
        '「リアル」「フィギュア」の画面エフェクトを追加：木目・布・毛足のある PBR マテリアルで、陰影と反射がやわらかく。フィギュアは半光沢の塗装にやわらかなリムライト',
        '室内照明が影を落とすように：各階でいちばん目立つ数灯がそれぞれ影を落とし、2 灯に照らされた物には影が 2 つ。影はアニメ風のくっきりした、淡い、少し青紫の影です。「屋外の光」スライダーと照明の初期化ボタンを追加',
        '輪郭線をポストプロセスの墨線に：壁の隅、天井の境目、窓枠にも線が入り、出っ張った角の脇にハイライト。暗部は 3 段階、影の色はより鮮やかに。フローリングは長さの揃わない乱尺貼りに',
        'ウォーク中は見えている部屋だけを描画（ドアや階段の吹き抜け越しに見える部屋はそのまま）、フレームレートが大きく向上。反射やオクルージョンも軽く',
        '間取り図：部屋を選ぶと各辺の中点に「+」が出て、クリックで頂点を追加、ドラッグでそのまま位置決め。辺の右クリックからも追加できます。建具は両端をドラッグして幅を変えられ、よく使う幅もワンクリックで',
        'キッチンを左右反転（シンクとコンロを入れ替え、天板の小物も一緒に移動）。家具の右クリックで同じ種類の前 / 次のデザインに切り替え。F3 でパフォーマンス表示。照明をすべて消したときに天井から月明かりが漏れる問題と、階段まわりが明るすぎる問題を修正',
      ],
      en: [
        "New Realistic and Figure looks: PBR materials with wood grain, fabric and fuzz, softer shading and reflections; Figure adds a semi-gloss paint finish with a soft rim light",
        "Indoor lights cast shadows: the most prominent lamps on each floor each cast their own, so an object lit by two lamps gets two shadows; shadows are anime-style crisp, light and slightly blue-violet. New Outdoor light slider and a reset-to-defaults button for lighting",
        "Outlines are now post-processed ink lines, including room corners, ceiling edges and window frames, with a highlight beside raised edges; three shadow bands, richer shadow colors, and plank wood floors with staggered lengths",
        "The walkthrough only draws rooms you can see (rooms visible through doors and stair openings still show), for a much higher frame rate; reflections and ambient occlusion are cheaper too",
        "Floor plan: a selected room shows a + at each edge midpoint; click to add a corner or drag to place it, or right-click an edge. Drag either end of a door or window to resize it, or pick a common width",
        "Kitchens can be flipped left-right, swapping sink and hob with counter items following along; right-click furniture to switch to the previous or next design of the same type; F3 opens a performance overlay. Fixed moonlight leaking through the ceiling with all lights off, and overly bright stairwells",
      ],
    },
  },
  {
    version: '1.11.0',
    date: '2026-10-19',
    notes: {
      zh: [
        '画面效果改成可组合的参数：光照、风格化、镜头（移轴、显像管）、调色、泛光、描边、转折线、天空背景都能在预设上单独调；新增「动画感」和「显像管」，像素风更清晰',
        '默认用动画感光照：两档明暗、带颜色的阴影、明暗交界提饱和度、轮廓光、彩色描边，倒角和门缝也有转折线；可开新海诚风的蓝天白云和夜晚星空',
        '画面增强：环境光遮蔽、反射（打蜡地板和瓷砖地面、镜子、会动的水面）和漫游时窗口照进来的光柱，可分别设为关 / 仅漫游 / 始终',
        '内装面板：墙纸和木地板可以全屋一起设置、单间覆盖，边饰带预览；家具可以保持布局只换风格；每种风格至少四套配色',
        '门和抽屉可以逐个开合（带动画，漫游里也能点）；阳台的推拉窗也能开关；一键布置给单独的键盘配鼠标',
        '室内灯更亮、照得更远（新增照明范围滑杆，默认色温 4000K），修正房间接缝处的亮线和天花板过曝；窗户更容易点中，墙压低时影子跟着淡出',
      ],
      ja: [
        '画面エフェクトを組み合わせ可能なパラメータに：ライティング・スタイライズ・レンズ（ミニチュア、ブラウン管）・色調・ブルーム・輪郭線・稜線・空の背景をプリセットの上から個別に調整できます。「アニメ調」と「ブラウン管」を追加し、ドット絵をくっきりと',
        'アニメ調のライティングが標準に：2 段階の陰影、色のついた影、明暗の境目の彩度アップ、リムライト、色つきの輪郭線、面取りや隙間の稜線。新海誠風の青空と雲、夜の星空も表示できます',
        '画質強化：アンビエントオクルージョン、反射（ワックス仕上げの床やタイル床、鏡、揺れる水面）、ウォーク中に窓から差し込む光の筋を、それぞれオフ / ウォーク時 / 常に から選べます',
        '内装パネル：壁紙とフローリングを家全体でまとめて設定し、部屋ごとに上書き可能に。見切り・装飾はプレビュー付き。家具は配置そのままでスタイルだけ変えられます。各スタイルに配色を 4 種類以上',
        'ドアと引き出しを 1 つずつ開け閉め（アニメーション付き、ウォーク中もクリック可）。バルコニーの引き違い窓も開閉可能に。おまかせ配置で単体のキーボードにマウスを添えます',
        '室内照明を明るく、遠くまで届くように（照明範囲スライダーを追加、標準の色温は 4000K）。部屋の境目の光の線と天井の白飛びを修正。窓を選びやすくし、壁を下げると影も一緒に消えるように',
      ],
      en: [
        "Looks are now composable parameters: lighting, stylize, lens (tilt-shift, CRT), color grading, bloom, outlines, crease lines and a sky background can each be adjusted on top of a preset; new Anime and CRT looks, and crisper pixel art",
        "Anime lighting is the default: two-band shading, tinted shadows, saturated terminators, rim light, colored outlines and crease lines on bevels and gaps; an optional Shinkai-style sky with clouds by day and stars at night",
        "Effects settings for ambient occlusion, reflections (waxed or tiled floors, mirrors, animated water) and walkthrough light shafts, each Off / Walk only / Always",
        "Interior panel: set wallpaper and wood flooring for the whole home with per-room overrides, trim choices with previews, restyle furniture without moving it, and at least four palettes per style",
        "Open and close each door and drawer on its own, with animation and clicks in the walkthrough; balcony sash windows open too; auto-furnish adds a mouse next to loose keyboards",
        "Brighter indoor lights with a reach slider and a 4000K default; fixed glowing seams between rooms and blown-out ceilings; windows are easier to click and wall shadows fade with lowering walls",
      ],
    },
  },
  {
    version: '1.10.0',
    date: '2026-10-19',
    notes: {
      zh: [
        '3D 沙盘里能直接点选窗户、门、楼梯和设备；门可以换款式、颜色、把手，还能加侧窗和亮子；楼梯右键菜单可以改形状、样式和转向',
        '外观视图并入楼层显示选项，和全部楼层、只到当前层、分层拉开放在一起；门廊按门前空间定尺寸，并优先于围栏摆下',
        '第一人称漫游：楼梯和平地一样自由走，不再沿路线拉着走或自动转向；忽略鼠标锁定时的位移毛刺；修正楼梯间一楼和二楼之间透出的黑缝和接缝',
        '浴缸盖、浴缸置物架能吸附到浴缸边上；漫画全卷之类不再摆到床上，麻将台上的东西不再和麻将牌穿模；阳台外墙灯随墙一起隐藏',
        '选中高亮改成独立的覆盖层，取消选择后不会残留；修正较长标签和楼层显示选项溢出',
      ],
      ja: [
        '3D ジオラマで窓・ドア・階段・設備を直接選択できるように。ドアはデザイン・色・取っ手を変えられ、袖窓や欄間も追加可能。階段は右クリックメニューで形・スタイル・向きを変更できます',
        '外観ビューを階の表示オプションに統合し、全階・現在階まで・分解表示と並べました。ポーチは玄関前の広さに合わせて大きさを決め、塀より優先して配置',
        'ウォークスルー：階段も床と同じように自由に歩けるようになり、ルートに沿って引っぱられたり勝手に向きが変わったりしません。マウスロック中の視点の跳びを無視。階段室で 1 階と 2 階の間に見えていた黒い隙間とつなぎ目を修正',
        '風呂ふた・バスラックが浴槽の縁にスナップするように。漫画全巻などはベッドの上に置かず、麻雀卓の上の小物が牌にめり込まないように。バルコニーの外壁照明は壁と一緒に隠れます',
        '選択ハイライトを独立したオーバーレイにし、選択解除後に残らないように。長いラベルや階の表示オプションがはみ出す問題を修正',
      ],
      en: [
        'Select windows, doors, stairs and fixtures directly in the 3D sandbox; doors get styles, colors, handles, sidelights and transoms; a stairs context menu changes shape, style and turn',
        'The exterior view is now a floor display option next to all floors / up to current / exploded; the entrance porch is sized to the space in front of the door and takes priority over the fence',
        'Walkthrough: stairs are walked freely like the floor, with no path pulling or auto-turning; pointer-lock mouse spikes are ignored; fixed the dark gap and seam between floors in the stairwell',
        'Bath lids and tub caddies snap onto the bathtub rim; manga sets stay off beds and props no longer clip into mahjong tiles; balcony wall lamps hide with their wall',
        'Hover and selection highlights are an overlay that never lingers after deselecting; long labels and floor display options no longer overflow',
      ],
    },
  },
  {
    version: '1.9.0',
    date: '2026-10-18',
    notes: {
      zh: [
        '屋顶重做：L 形等复杂户型的双坡、四坡、单坡、平屋顶都是一整片，屋脊和天沟正确相交；新增和瓦、西班牙瓦、平板瓦、沥青瓦、石板瓦、金属板等屋面材料；公寓和复式在外观视图里也有屋顶',
        '窗户可以换款式：推拉、平开、上下提拉、固定、上悬、百叶、拱顶、圆窗等，另有窗框颜色、格条、窗台高度和百叶护窗板；生成的户型按地区配默认款式',
        '在 3D 里直接点车、围栏（外观视图里还有屋顶、外墙）就能弹出编辑卡片，各种款式用预览图挑选',
        '二楼阳台下面加了支柱，落在屋面或地面上；生成的户型里门不会再被楼梯、扶手或楼梯洞口挡住',
        '有厚度的家具选中时显示立体框；新增四种黑白漫画画面效果；修正外墙和屋面在某些角度透出内墙的问题',
      ],
      ja: [
        '屋根を作り直し：L 字などの複雑な間取りでも切妻・寄棟・片流れ・陸屋根が一枚につながり、棟と谷が正しく交わるように。和瓦・洋瓦（S 瓦）・平板瓦・アスファルトシングル・スレート・ガルバリウムなどの屋根材を追加。マンションやメゾネットにも外観ビューで屋根が付きます',
        '窓のタイプを選べるように：引き違い・開き窓・上げ下げ窓・FIX・すべり出し・ジャロジー・アーチ・丸窓など。サッシの色、格子、窓の高さ、外側の鎧戸も選べます。生成した間取りは地域に合った窓に',
        '3D で車や塀（外観ビューでは屋根・外壁も）をクリックすると編集カードが開き、各タイプをプレビュー画像から選べます',
        '2 階バルコニーの下に柱を追加し、屋根や地面で支えるように。生成した間取りでドアが階段・手すり・吹き抜けにふさがれないように',
        '厚みのある家具は立体の枠で選択表示。モノクロ漫画の画面エフェクトを 4 種類追加。角度によって外壁や屋根から内壁が透けて見える問題を修正',
      ],
      en: [
        'Rebuilt roofs: gable, hip, shed and flat roofs on L-shaped and other complex houses are one continuous surface with proper ridges and valleys; new roof coverings (kawara, Spanish tile, flat tile, asphalt shingle, slate, standing-seam metal and more); apartments and duplexes now get a roof in the exterior view',
        'Choose window styles: sliding, casement, double-hung, fixed, awning, jalousie, arched, round and more, with frame colors, grilles, sill heights and shutters; generated plans get region-appropriate windows',
        'Click a car or fence in 3D (and the roof or facade in the exterior view) to open an editing card, with preview tiles for every style',
        'Upper-floor balconies now stand on posts that reach the roof or ground below; generated doors are no longer blocked by stairs, handrails or stairwell openings',
        'Furniture with thickness gets a 3D box selection frame; four new black-and-white manga looks; inner walls no longer show through facades and roofs at some angles',
      ],
    },
  },
  {
    version: '1.8.0',
    date: '2026-10-18',
    notes: {
      zh: [
        '新增第一人称漫游（快捷键 V）：像 FPS 游戏一样用鼠标看四周、WASD 走动，能上下楼梯、走到阳台；带小地图，准星对着的东西会显示名字',
        '户型更多样：外轮廓会出现切角、L 形、凹阳台、凸窗和玄关凸出，房间排法、宽度和窗位有更多变化；日式厕所、欧美卫生间的尺寸更合理，中式公卫的玻璃淋浴房补齐了玻璃',
        '素材库按功能分类（座椅、收纳、灯具……），房间、风格作为筛选条件；详情里显示全部标签，点标签可以筛选同类，搜索也能按类型名找',
        '新中式、欧式古典、美式乡村各补了一套专属家具；装饰画、海报、相框、挂轴有 55 种可切换的画面；户建的屋顶、外墙、围墙和汽车可以在「外观」里调整',
        '一键布置更细致：玄关、洗面所、阳台门口留出通道，走廊、储藏间、院子和健身房等房间布置更完整；厨房柜子里放碗盘，马桶边放马桶刷和搋子，日式厕所马桶上方加吊柜',
        '便签、贴纸改为在贴着的面里旋转；落地补光灯高度修正；厨房灶台旋钮不再和柜门重叠',
      ],
      ja: [
        '一人称のウォークスルーを追加（ショートカット V）：FPS ゲームのようにマウスで見回し WASD で移動、階段の上り下りやベランダへの出入りも可能。ミニマップ付きで、照準の先にある物の名前を表示',
        '間取りのバリエーションを拡充：外形に欠け・L 字・凹んだバルコニー・出窓・玄関の張り出しが出るように。部屋の並び・幅・窓の位置もより多様に。日本のトイレと欧米のバスルームの寸法を見直し、中国式バスルームのシャワーブースのガラスも全面に',
        '素材ライブラリを機能別の分類に（椅子・収納・照明など）。部屋とスタイルは絞り込み条件に。詳細にすべてのタグを表示し、タグをクリックで同じタグの素材を表示。種類名でも検索可能に',
        '中国モダン・ヨーロピアンクラシック・アメリカンカントリーの専用家具をそれぞれ追加。絵・ポスター・写真立て・掛け軸に 55 種類の切り替え可能な絵柄。戸建ての屋根・外壁・塀・車は「外観」で変更可能に',
        'おまかせ配置をより丁寧に：玄関・洗面所・ベランダの出入口に通路を確保し、廊下・納戸・庭・ジムなどの部屋もより充実。キッチンの棚に食器を収納、トイレのそばにブラシとラバーカップ、日本のトイレには上部収納を追加',
        '付箋・ステッカーは貼った面の中で回転するように。床置きリングライトの高さを修正。コンロのつまみが扉と重ならないように',
      ],
      en: [
        'New first-person walk mode (shortcut V): look around with the mouse and move with WASD like an FPS, take the stairs and step onto the balcony; includes a minimap and shows the name of whatever is under the crosshair',
        'More varied floor plans: outlines now get notched corners, L shapes, recessed balconies, bay windows and entrance bump-outs, with more variety in room order, widths and window positions; Japanese toilets and Western bathrooms have realistic sizes, and Chinese shower enclosures have glass on every open side',
        'The asset library is organized by function (seating, storage, lighting…) with room and style as filters; the detail panel lists every tag, clicking a tag shows similar items, and search matches type names',
        'New dedicated furniture sets for Chinese, classic European and farmhouse styles; paintings, posters, photo frames and scrolls get 55 switchable artworks; house roofs, facades, fences and cars can be changed under Exterior',
        'More thoughtful auto-furnish: walkways stay clear at the entrance, washroom and balcony door, and halls, storage rooms, yards and gyms are furnished more fully; kitchen cabinets hold dishes, the toilet brush and plunger sit by the toilet, and Japanese toilets get a cabinet above the tank',
        'Sticky notes and stickers now rotate within the surface they are stuck to; the floor ring light has a realistic height; stove knobs no longer overlap the cabinet doors',
      ],
    },
  },
  {
    version: '1.7.0',
    date: '2026-10-18',
    notes: {
      zh: [
        '新增 3D 设计图模式（快捷键 B）：轴测线框、尺寸标注和标高，可导出 PNG',
        '一键布置更合理：大件家具按候选方案打分挑选，夫妻保留双人床，统一检查通道、门窗和碰撞；冰箱贴不再互相重叠',
        '墙体修正：丁字口和转角不再有接缝、缺角，内墙不会穿出外墙；和室榻榻米与地面齐平，接缝是凹槽',
        '墙上的东西更好选中：不会再选到藏起来的挂件或墙后面的家具，选中框改为立着贴在挂件正面',
        '渲染性能提升：家具合并为单一材质，整屋绘制调用减少约 45%；新增丝带花瓶，修正几件素材的屏幕位置和浮空台面；图标按钮改为正方形',
      ],
      ja: [
        '3D 設計図モードを追加（ショートカット B）：アイソメの線画、寸法線、レベル表示、PNG 書き出し',
        'おまかせ配置がより自然に：大型家具は候補レイアウトを採点して選び、夫婦はダブルベッドを維持、通路・建具・干渉をまとめてチェック。冷蔵庫のマグネットが重ならないように',
        '壁を修正：T 字や角の継ぎ目・欠けがなくなり、内壁が外壁を突き抜けないように。和室の畳は床と同じ高さになり、畳の境目は溝に',
        '壁掛けの物を選びやすく：隠れている壁掛けや壁の向こうの家具を選ばなくなり、選択枠は壁掛けの正面に立てて表示',
        '描画を高速化：家具を単一マテリアルにまとめ、描画コールを約 45% 削減。リボンの花瓶を追加し、一部素材の画面位置と浮いた天板を修正。アイコンボタンを正方形に',
      ],
      en: [
        'New 3D blueprint view (shortcut B): axonometric line drawing with dimensions and level marks, exportable as PNG',
        'Smarter auto-furnish: major furniture is chosen by scoring candidate layouts, couples keep a double bed, and paths, doors, windows and collisions are checked together; fridge magnets no longer overlap',
        "Wall fixes: no more seams or missing corners at T-junctions and corners, and inner walls no longer poke through outer walls; tatami now sits flush with the floor with grooved seams",
        "Wall items are easier to pick: hidden wall items and furniture behind walls are no longer selected, and the selection frame stands upright on the item's face",
        'Faster rendering: furniture is merged into a single material, cutting draw calls by about 45%; new ribbon vase, fixed screen positions and floating tops on a few assets; icon buttons are now square',
      ],
    },
  },
  {
    version: '1.6.0',
    date: '2026-10-17',
    notes: {
      zh: [
        '多层住宅统一分配房间：每人一间，夫妻同室，长辈优先住一楼，孩子和父母同层或相邻；住户面板显示每人所在楼层和房间',
        '一键布置按层协调：冰箱、洗衣机全户只放一台，每层都有垃圾桶，楼梯口和走廊留出通道，楼梯下做成储物角',
        '猫、狗、机器狗和人形机器人会走楼梯上下楼；扫地机器人等只在本层活动；人形机器人会走动了',
        '户建新增 L 形楼梯和客厅开放式楼梯；复式挑空边改为栏杆，从楼上能看到客厅；家具拖进院子时高度正确，院子物件也检查碰撞',
        '楼层淡入淡出改为整层均匀变淡，不再透出内墙和家具，过程更从容',
      ],
      ja: [
        '複数階の住まいで部屋を一括で割り当て：一人一部屋、夫婦は同室、高齢者は 1 階優先、子どもは親と同じ階か隣の階。住人パネルに各自の階と部屋を表示',
        'おまかせ配置を階ごとに調整：冷蔵庫・洗濯機は家に 1 台、各階にゴミ箱、階段の上り口と廊下は通路を確保、階段下は収納コーナーに',
        '猫・犬・ロボット犬・人型ロボットが階段で上り下りするように。ロボット掃除機などは同じ階だけで動きます。人型ロボットが歩くように',
        '戸建てに L 字階段とリビング階段を追加。メゾネットの吹き抜けは手すりになり、上の階からリビングが見えます。庭へ家具をドラッグしたときの高さを修正し、庭の物も干渉チェックの対象に',
        '階のフェードは階全体が均一に薄くなるように。内壁や家具が透けて見えず、変化もゆっくりに',
      ],
      en: [
        "Multi-floor homes assign rooms for the whole household: one room each, couples together, elders downstairs first, children on or next to their parents' floor; the household panel shows each person's floor and room",
        'Auto-furnish coordinates floors: one fridge and one washer per home, a bin on every floor, clear paths at stairs and hallways, and storage nooks under the stairs',
        'Cats, dogs, robot dogs and humanoid robots use the stairs; robot vacuums and the like stay on their floor; humanoid robots now walk around',
        'Houses can get L-shaped stairs and open stairs in the living room; duplex voids get railings so you can look down into the living room; furniture dragged into the yard sits at the right height and yard items are checked for collisions',
        'Floors now fade as one even layer, without inner walls and furniture showing through, and at a calmer pace',
      ],
    },
  },
  {
    version: '1.5.0',
    date: '2026-10-17',
    notes: {
      zh: [
        '画面右侧新增竖排楼层切换，平面图和 3D 都能直接切换楼层；楼层出现、消失时会淡入淡出',
        '放设备改为先在面板里挑选（按用途分组，标注尺寸），画面里有跟手的预览，靠近墙自动贴墙；手机上拖动预览后点"放下"确认，可连续放置',
        '室内灯光不再穿墙、穿楼板：灯只照亮所在房间和楼层，开放相连的房间、楼梯和挑空仍然相通',
        '楼梯新增样式：经典、楼梯下收纳、镂空木梯、现代玻璃栏板；靠墙一侧装靠墙扶手，踏步侧面不再出现竖线',
        '高柜顶上的摆件不再超出层高；修正衣柜里收纳箱碰到衣服下摆、墙上挂件碰到壁灯、搁板摆件顶到抽油烟机',
      ],
      ja: [
        '画面右側に縦並びの階切り替えを追加。間取り図と 3D のどちらでもすぐ階を切り替えられます。階の表示・非表示はフェードします',
        '設備の配置は、まずパネルから選ぶ方式に（用途別・サイズ表示）。画面にプレビューが表示され、壁の近くでは壁に沿わせます。スマホではプレビューをドラッグして「置く」で確定、連続配置も可能',
        '室内照明が壁や床を透過しないように。照明は同じ部屋・同じ階だけを照らし、つながった部屋や階段・吹き抜けは通します',
        '階段のスタイルを追加：クラシック、階段下収納、オープン階段、ガラス手すりのモダン。壁側には壁付け手すりが付き、段の側面に縦線が出なくなりました',
        '背の高い家具の上の小物が天井を突き抜けないように。収納ケースと衣類の裾、壁掛けと壁付け照明、棚の小物とレンジフードの干渉を修正',
      ],
      en: [
        'A vertical floor switcher on the right of both the plan and 3D views; floors fade in and out as they appear and hide',
        'Placing fixtures starts from a panel grouped by use with sizes; a live preview follows the pointer and snaps to walls. On phones, drag the preview and tap Place to confirm, with an option to keep placing',
        'Room lights no longer leak through walls or floors: each light only reaches its own room and floor, while open-plan rooms, stairs and voids stay connected',
        'Stair styles: classic, under-stair storage, open wooden and modern with glass rails; wall-side handrails, and no more vertical lines along the stair sides',
        'Decor on tall furniture stays below the ceiling; fixed storage boxes hitting hanging clothes, wall hangings hitting wall lamps and shelf items hitting range hoods',
      ],
    },
  },
  {
    version: '1.4.0',
    date: '2026-10-17',
    notes: {
      zh: [
        '可以生成两层户建：日式户建（含部分二阶）、欧美两层住宅、中式独栋别墅，楼梯上下对齐，二层卫生间叠在一层用水区上方',
        '可以生成复式：日式与中式复式，客厅上方挑空',
        '户建带屋顶（双坡、四坡、单坡、平顶）、外墙（板材、抹灰、砖）、门廊，以及院子、围栏和停车位；院子里会摆户外桌椅、菜园箱、自行车等',
        '3D 新增"外观"视图（快捷键 O），显示屋顶和完整外墙；布置时屋顶自动隐藏，俯视时会让开',
        '生成选项新增"住宅类型"：公寓、户建、复式或随机',
      ],
      ja: [
        '2 階建ての戸建てを生成可能に：日本の戸建て（部分二階を含む）、欧米の 2 階建て、中国の一戸建て。階段は上下でそろい、2 階の水回りは 1 階の水回りの真上',
        'メゾネットを生成可能に：日本・中国のメゾネット、リビング上部は吹き抜け',
        '戸建てには屋根（切妻・寄棟・片流れ・陸屋根）、外壁（サイディング・塗り壁・レンガ）、玄関ポーチ、庭・フェンス・駐車場が付きます。庭にはガーデンテーブルや菜園、自転車などを配置',
        '3D に「外観」表示（ショートカット O）を追加。屋根と外壁全体を表示します。配置中は屋根を自動で隠し、真上から見るときはよけます',
        '生成オプションに「住宅タイプ」（マンション・戸建て・メゾネット・ランダム）を追加',
      ],
      en: [
        'Generate two-story houses: Japanese houses (including partial second floors), Western two-story homes and Chinese villas, with stairs aligned between floors and upstairs bathrooms above the downstairs plumbing',
        'Generate duplexes: Japanese and Chinese duplex apartments with a double-height living room',
        'Houses get roofs (gable, hip, shed, flat), exterior walls (siding, stucco, brick), a porch, plus a yard, fence and parking; the yard is furnished with outdoor seating, planters, bikes and more',
        'New Exterior view in 3D (shortcut O) showing roofs and full exterior walls; the roof hides while you furnish and moves out of the way from above',
        'A building type option for generation: apartment, house, duplex or random',
      ],
    },
  },
  {
    version: '1.3.0',
    date: '2026-10-17',
    notes: {
      zh: [
        '支持多层户型：平面图可以新增、切换楼层，编辑上层时下层轮廓作为参考，可从下层复制外轮廓',
        '新增楼梯（直跑、L 形、U 形、旋转），放下后上层楼板自动开洞并加栏杆；支持挑空',
        '3D 可显示全部楼层、只显示到当前层，或把各层分开查看；拖动、摆放只作用于当前层',
        '一键布置、检查清单、宠物和户型分享都支持多层；我的户型列表显示楼层数和总面积',
      ],
      ja: [
        '複数階の間取りに対応：間取り図で階を追加・切り替えでき、上の階を編集するときは下の階の輪郭が表示されます。下の階の外形をコピーすることもできます',
        '階段（直階段・L 字・U 字・らせん）を追加。置くと上の階の床に開口と手すりが自動で付きます。吹き抜けにも対応',
        '3D では全階表示、現在の階まで表示、階を離して表示を切り替え可能。移動や配置は現在の階だけに作用します',
        'おまかせ配置、チェックリスト、ペット、共有リンクが複数階に対応。マイ間取りの一覧に階数と合計面積を表示',
      ],
      en: [
        'Multi-floor homes: add and switch floors in the plan editor, see the floor below as a guide while drawing, and copy its outline',
        'Stairs (straight, L, U and spiral) cut an opening with railings in the floor above; double-height voids are supported',
        'In 3D, show all floors, floors up to the current one, or an exploded view; moving and placing furniture affects the current floor only',
        'Auto-furnish, the checklist, pets and share links work with multiple floors; My Homes shows the floor count and total area',
      ],
    },
  },
  {
    version: '1.2.0',
    date: '2026-10-17',
    notes: {
      zh: [
        '内置收纳改为"收纳位 + 柜子"：柜子是普通家具，新增 43 款鞋柜、衣柜、食品柜，按尺寸放进收纳位',
        '素材库里 160 多款带门或抽屉的柜子都能打开，门里、抽屉里可以收纳东西；一键布置会往柜子里放衣物、鞋、碗盘、食品等日常用品，兴趣物件和收藏品留在外面',
        '一键布置的穿模大幅减少：不再嵌进墙里、不挡门和落地窗，墙上挂的东西、垂下的毛巾和窗帘不再插进下方的家具',
        '空调不再和衣柜、冰箱等高家具重叠',
        '3D 场景新增透视调节，可在接近等距视图和较强的近大远小之间切换',
        '修正伞架、月亮椅、刷牙杯等模型内部的零件穿插',
      ],
      ja: [
        '造り付け収納を「収納スペース + 家具」に変更。新しい靴箱・ワードローブ・パントリー 43 点をサイズに合わせて配置',
        '扉や引き出しのある家具 160 点以上を開けられるように。中に物を収納できます。おまかせ配置では衣類・靴・食器・食品などの日用品を中にしまい、趣味の物やコレクションは外に飾ります',
        'おまかせ配置のめり込みを大幅に削減：壁にめり込まない、ドアや掃き出し窓をふさがない、壁掛け・タオル・カーテンが下の家具に刺さらない',
        'エアコンがワードローブや冷蔵庫などの背の高い家具と重ならないように',
        '3D 表示にパース（画角）の調整を追加。平行投影に近い見え方から遠近感の強い見え方まで',
        '傘立て、ムーンチェア、歯ブラシコップなどモデル内部の部品のめり込みを修正',
      ],
      en: [
        'Built-in storage is now a storage spot plus a cabinet: cabinets are regular furniture, with 43 new shoe cabinets, wardrobes and pantries sized to fit',
        'Over 160 cabinets with doors or drawers can be opened and used for storage. Auto-furnish stores everyday items such as clothes, shoes, dishes and food inside, and keeps hobby items and collections on display',
        'Far fewer collisions when furnishing: nothing sinks into walls or blocks doors and balcony doors, and wall-mounted items, hanging towels and curtains no longer cut into furniture below',
        'Wall air conditioners no longer overlap wardrobes, fridges or other tall furniture',
        'Adjustable perspective in 3D, from nearly isometric to strong perspective',
        'Fixed parts clipping through each other inside models such as the umbrella stand, moon chair and toothbrush cups',
      ],
    },
  },
  {
    version: '1.1.0',
    date: '2026-10-17',
    notes: {
      zh: [
        '各风格新增 76 款落地灯、台灯和壁灯；天花板主灯随房间风格变化',
        '新增宠物摄像头、婴儿监视器、安防摄像头和可视门铃；新增军旗、斗兽棋、花札、双陆等 30 余种棋牌',
        '重做猫、狗和兔子的模型',
        '素材库可按细分类型筛选；不同造型不再合并在同一张卡片里',
        '平面图、3D、素材库有独立地址；户型（可含家具）可以生成链接分享',
        '柜子和内置收纳先选中容器本身，选中后半透明显示内部；内置收纳可在 3D 中开关柜门',
        '拖动家具需要先选中或拖过一段距离；指南针移到右上角',
        '地板、墙纸等贴图启用各向异性过滤；墙面边饰不再闪烁',
        '手机：顶栏放随机生成按钮，适配 iPhone 主屏幕应用的安全区',
        '修正按名称误判素材导致的布置错误，例如竹编灯被当作绿植',
      ],
      ja: [
        '各スタイルにフロアライト・テーブルランプ・壁付け照明を 76 点追加。天井照明は部屋のスタイルに合わせて変わります',
        'ペットカメラ、ベビーモニター、防犯カメラ、テレビドアホンを追加。軍棋、闘獣棋、花札、バックギャモンなどゲーム類を 30 点以上追加',
        '猫・犬・うさぎのモデルを作り直し',
        '素材ライブラリを種類で絞り込めるように。形の違う家具は別々のカードに',
        '間取り図・3D・素材ライブラリにそれぞれ URL を追加。間取り（家具込みも可）をリンクで共有可能に',
        '棚や収納はまず本体を選択し、選択中は半透明で中が見えるように。造り付け収納は 3D で扉を開け閉めできます',
        '家具は選択してから、または一定距離ドラッグしてから動くように。方位磁針を右上へ',
        '床や壁紙のテクスチャに異方性フィルタリングを適用。壁の見切り材のちらつきを修正',
        'スマホ：ヘッダーにランダム生成ボタンを配置。iPhone のホーム画面アプリのセーフエリアに対応',
        '名前で素材を判定していたことによる配置ミスを修正（竹編みランプが植物扱いされる など）',
      ],
      en: [
        '76 new floor, table and wall lamps across all styles; ceiling lights now match the room style',
        'Pet cameras, baby monitors, security cameras and video doorbells; 30+ new board and card games such as junqi, animal chess, hanafuda and backgammon',
        'Rebuilt cats, dogs and rabbits',
        'Filter the asset library by type; different designs no longer share one card',
        'Plan, 3D and library each have their own URL; share a plan (optionally with furniture) as a link',
        'Shelves and built-in storage select the container first and turn translucent to show what is inside; open and close built-in storage doors in 3D',
        'Furniture moves only after it is selected or dragged far enough; the compass moved to the top right',
        'Anisotropic filtering for floor, wallpaper and fabric textures; wall trims no longer flicker',
        'Mobile: random generate in the header; safe areas in the iPhone home-screen app',
        'Fixed furnishing mistakes caused by matching assets by name, such as a bamboo lamp treated as a plant',
      ],
    },
  },
  {
    version: '1.0.0',
    date: '2026-10-16',
    notes: {
      zh: [
        '首个版本',
        '日式、中式、欧美户型生成，也可以手绘户型',
        '按住户的家庭构成、风格偏好和兴趣等级一键布置家具',
        '2800+ 件素材、9 种风格配色',
        '3D 沙盘：墙体显示模式、按时间与城市计算的日照、室内灯光、画面效果、会走动的宠物和机器人',
        '支持触屏和离线使用；中文、日文、英文界面',
      ],
      ja: [
        '最初のリリース',
        '日本・中国・欧米の間取りを生成。手描きにも対応',
        '家族構成・好みのスタイル・趣味のレベルに合わせて家具をおまかせ配置',
        '2800 点以上の素材、9 種類のスタイル配色',
        '3D ジオラマ：壁の表示モード、時刻と都市による日照、室内照明、画面エフェクト、歩き回るペットとロボット',
        'タッチ操作とオフラインに対応。日本語・中国語・英語',
      ],
      en: [
        'First release',
        'Japanese, Chinese and Western floor plan generators, or draw your own',
        'Furnish every room from the household: family makeup, style taste and hobby levels',
        '2,800+ assets, 9 style palettes',
        '3D diorama: wall display modes, sunlight by time and city, room lighting, visual effects, wandering pets and robots',
        'Touch and offline support; Chinese, Japanese and English UI',
      ],
    },
  },
]

/** 当前版本（更新日志第一条） */
export const APP_VERSION = CHANGELOG[0].version
