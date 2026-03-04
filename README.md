# speechbubble

同人誌制作向けの **手動吹き出し編集ツール** です。  
AI顔認識に依存せず、ユーザーが位置・大きさ・しっぽ先・文字を直接調整できます。

## 主な機能

- 画像読み込み（PNG/JPEG/WEBP）
- 吹き出し追加（楕円 / 角丸）
- しっぽ先の手動調整
- テキストオブジェクト追加
- ドラッグ移動 / リサイズ
- レイヤー順変更
- Undo / Redo
- PNG書き出し
- プロジェクトJSON保存・再読込

## ローカル起動

```bash
python -m pip install -e .
python -m uvicorn speechbubble.api:app --host 127.0.0.1 --port 8000
```

ブラウザで:

- `http://127.0.0.1:8000/`

## Vercelデプロイ

```bash
npm i -g vercel
vercel login
vercel --prod
```

デプロイ後:

- `https://<your-domain>/` : 手動エディタ
- `https://<your-domain>/health` : health check

## APIエンドポイント

- `GET /` : 手動エディタUI
- `GET /editor` : 手動エディタUI
- `GET /assets/manual_editor.js` : フロントエンドロジック
- `GET /health` : health check
- `POST /v1/process` : 旧自動配置API（410 Deprecated）

## 補足

- 現在の本番は「手動編集ファースト」です。
- `face_hints` はこの運用では不要です。
- 旧AIパイプラインのコードはリポジトリに残っていますが、デフォルト運用では使いません。
