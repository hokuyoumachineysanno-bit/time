# time v8.3 ポータル母艦版

## URL構成
- `/time/` → 社内業務ポータル
- `/time/attendance/` → 勤怠TIME v8.3

## フォルダ構成
time/
├─ index.html                # 社内業務ポータル
├─ app.js                    # portal app
├─ style.css                 # portal style
├─ portal-v81-adapter.js
├─ shared-store.js
├─ attendance/
│  ├─ index.html             # 勤怠TIME
│  ├─ app.js
│  ├─ styles.css
│  ├─ cloud-sync.js
│  ├─ firebase-config.js
│  ├─ time-v82-bridge.js
│  └─ ...
└─ tools/
   └─ layout-check.html

## ナビゲーション
- ポータル上部「勤怠TIME」 → `./attendance/`
- 勤怠TIME上部「社内業務ポータル」 → `../`

## EMP別TIME
EMP-001〜005はこれまで通り社員切替可能です。
旧TIMEデータはEMP-004へ移行する仕組みを維持しています。

## GitHub反映
このZIPを展開し、中身を `time` リポジトリのルートへそのまま上書きしてください。
`attendance` フォルダをルートへ出さないでください。
