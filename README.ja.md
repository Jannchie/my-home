<p align="center">
  <img src="public/icon-512.png" width="88" alt="" />
  <h1 align="center">My Home</h1>
  <p align="center">
    <a href="https://home.jannchie.com/ja/"><b>オンラインで試す</b></a>
  </p>
  <p align="center">
    <a href="README.md">中文</a> · 日本語 · <a href="README.en.md">English</a>
  </p>
  <p align="center">
    <a href="https://github.com/Jannchie/my-home/releases/latest"><img src="https://img.shields.io/github/v/release/Jannchie/my-home" alt="release" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/Jannchie/my-home" alt="license" /></a>
  </p>
</p>

ブラウザで動く間取りエディタと 3D トゥーンジオラマ。間取りを生成し、住人の設定に合わせて家具を自動配置して 3D で確認できます。

![](docs/hero-ja.webp)

- 間取り生成：日本（1K–3LDK）、中国、欧米。間取り図での手描き、建具・設備の配置にも対応
- おまかせ配置：家族構成・職業・性格・趣味に応じて家具と小物を配置。チェックリストで不足を補完
- 2600 点以上のプロシージャル素材、9 スタイルの配色、ファブリック柄の変更
- 3D ジオラマ：5 種類の壁表示、時刻・日付・都市による日照計算、12 種類の画面エフェクト、ペットとロボットの移動
- タッチ操作と PWA（オフライン）対応。UI は日・中・英

サーバー・アカウント不要。データはブラウザ内（localStorage、IndexedDB）に保存され、JSON で書き出せます。

## 開発

```sh
pnpm install
pnpm dev
pnpm test
pnpm build      # vue-tsc + vite build → dist/
pnpm gen:dims   # 素材寸法表の再生成
```

素材はすべてコードでモデリングしています（`src/three/packs/`）。規約は [`src/three/kit.ts`](src/three/kit.ts) の冒頭を参照。

## License

[MIT](LICENSE)
