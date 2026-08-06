# Firebase同期の初回設定

## 1. Firebaseプロジェクトを作る

1. Firebase Consoleを開く
2. 「プロジェクトを作成」
3. プロジェクト名は任意。例：`roumu-time`
4. Google Analyticsは不要なら無効でも構いません

## 2. Webアプリを登録

1. プロジェクトの概要で `</>`（ウェブ）を選択
2. アプリ名を入力
3. Firebase Hostingは今回は選択不要
4. 表示された `firebaseConfig` を控える
5. このZIPの `firebase-config.js` を開き、`PASTE_...`部分を置き換える

例：

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "roumu-time.firebaseapp.com",
  projectId: "roumu-time",
  storageBucket: "roumu-time.firebasestorage.app",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:..."
};
```

FirebaseのWeb構成値はクライアントアプリに置く前提の識別情報です。アクセス保護はFirestoreルールで行います。

## 3. Googleログインを有効化

1. Firebase Console → Authentication
2. 「始める」
3. Sign-in method → Google
4. 有効にする
5. サポートメールを選択して保存

## 4. GitHub Pagesのドメインを許可

Authentication → Settings → Authorized domains に以下を追加します。

```text
あなたのGitHubユーザー名.github.io
```

URLが `https://example.github.io/time/` でも、登録するのは `example.github.io` です。

## 5. Cloud Firestoreを作成

1. Firebase Console → Firestore Database
2. 「データベースを作成」
3. 本番環境モード
4. リージョンを選択
5. 作成後「ルール」タブを開く
6. ZIP内の `firestore.rules` の内容へ置き換え
7. 「公開」

このルールでは、ログインした利用者は自分のUID配下だけを読み書きできます。

## 6. GitHubへアップロード

次のファイルをすべてリポジトリ直下へ上書きします。

- `index.html`
- `styles.css`
- `app.js`
- `firebase-config.js`
- `cloud-sync.js`
- `manifest.webmanifest`
- `sw.js`
- `icon.svg`

`firestore.rules` とこの手順書はGitHubへ置いても構いませんが、アプリ動作には不要です。

## 7. 初回同期

1. PCでv6.0を開く
2. 設定 → PC・スマホ同期
3. 「Googleで同期開始」
4. 既存のPCデータがクラウドへ送られる
5. スマホでも同じURLを開き、同じGoogleアカウントで同期開始
6. PCのデータがスマホへ表示される

以後、保存後おおむね数秒以内に他端末へ反映されます。

## 注意

- GitHub Pages自体は公開ですが、勤怠データはFirestoreの本人専用領域に保存されます。
- `firebase-config.js`の値だけでは他人が勤怠データを読めません。Firestoreルールが重要です。
- PCとスマホで同じGoogleアカウントを使用してください。
- 初回同期前にJSONバックアップを保存しておくと安全です。
