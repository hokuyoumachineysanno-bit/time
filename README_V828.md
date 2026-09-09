# v8.2.8 固定構成版

今後この配置で固定します。

## 公開URL
- 社内業務ポータル
  `https://hokuyoumachineysanno-bit.github.io/time/`

- 勤怠TIME
  `https://hokuyoumachineysanno-bit.github.io/time/attendance/`

- EMP-004 の 2026/09/09 を直接編集
  `https://hokuyoumachineysanno-bit.github.io/time/attendance/?emp=EMP-004&date=2026-09-09&edit=1`

## フォルダ
time/
├─ index.html              # 社内業務ポータル
├─ app.js
├─ style.css
├─ shared-store.js
├─ attendance/
│  ├─ index.html           # 勤怠TIME
│  ├─ app.js
│  ├─ styles.css
│  ├─ cloud-sync.js
│  ├─ time-v82-bridge.js
│  └─ ...
└─ tools/
   └─ layout-check.html

## リンク
- ポータル「勤怠TIME」 → `/time/attendance/`
- ポータル勤怠「TIMEで編集」 → `/time/attendance/?emp=...&date=...&edit=1`
- TIME「社内業務ポータル」 → `/time/`

## GitHub反映
ZIPを展開し、timeリポジトリのルートへ中身をそのまま上書きしてください。
`attendance` フォルダは必ずフォルダのまま保持してください。
