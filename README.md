# 勤怠管理 v6.0

## v6.0
- Firebase AuthenticationによるGoogleログイン
- Cloud FirestoreによるPC・スマホ同期
- 保存後、他端末へリアルタイム反映
- localStorageをオフライン控えとして継続利用
- v5系データを自動引継ぎ
- 初回ログイン時、既存ローカルデータをクラウドへ移行
- 同期状態、ログインアカウント、最終同期時刻を表示
- 手動送信・手動再読込
- 利用者ごとにFirestore領域を分離

最初に `FIREBASE_SETUP.md` の手順を実施してください。
