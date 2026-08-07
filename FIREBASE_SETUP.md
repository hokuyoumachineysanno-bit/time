# 勤怠管理 v7.1 Firebase設定

## Authentication

Firebase Console → Authentication → ログイン方法

Googleを有効にします。

Authentication → 設定 → 承認済みドメインに、GitHub Pagesのドメインを登録します。

例：

```text
hokuyoumachineysanno-bit.github.io
```

## Firestoreルール

Firestore Database → ルール

ZIP内の `firestore.rules` の内容へ置き換えて公開します。

共有台帳の保存先は次です。

```text
shared/attendance-main
```

ログイン済み利用者だけが読み書きできます。

## 既存データ

すでにv7.0で `shared/attendance-main` へ移行済みなら、追加のデータ移行は不要です。

PCとスマホで同じGoogleアカウントへログインしてください。
