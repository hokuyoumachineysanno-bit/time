# v8.2.2 配置修正版

このZIPは `time` リポジトリ全体です。

## 正しい入口
- `/time/` = 勤怠TIME v8.2.2
- `/time/portal/` = 社内業務ポータル v1.1.2

## GitHub反映
1. ZIPをWindowsで展開
2. 展開先の中にあるファイルと `portal` / `tools` フォルダを確認
3. GitHubの `time` リポジトリで Add file → Upload files
4. **中身をフォルダ構造ごと**アップロード
5. Commit changes

`portal/index.html` をルートの `index.html` としてアップロードしないでください。

## 動作確認
- https://hokuyoumachineysanno-bit.github.io/time/
  → 「勤怠管理 v8.2.2」と表示
- https://hokuyoumachineysanno-bit.github.io/time/portal/
  → 「社内業務ポータル」と表示

portal側には「勤怠TIME」リンク、TIME側には「予定・案件」リンクがあります。
