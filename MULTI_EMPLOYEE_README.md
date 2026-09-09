# 勤怠管理 v8.2 EMP別TIME版

## データ移行
初回起動時、従来の `attendancePwaV6` を **EMP-004** へコピーします。

- 元データ `attendancePwaV6` は削除しません
- さらに `attendancePwaV82MigrationBackup` に移行時バックアップを保存
- 新しい本体は `attendancePwaV82ByEmployee`

新構造:

```json
{
  "EMP-001": { "records": {}, "calendar": {}, "settings": {} },
  "EMP-002": { "records": {}, "calendar": {}, "settings": {} },
  "EMP-003": { "records": {}, "calendar": {}, "settings": {} },
  "EMP-004": { "records": { "従来データ": "ここへ" }, "calendar": {}, "settings": {} },
  "EMP-005": { "records": {}, "calendar": {}, "settings": {} }
}
```

## 使い方
TIME上部の「勤怠対象」から社員を選択します。

- EMP-001 社長
- EMP-002 専務
- EMP-003 山田
- EMP-004 佐藤
- EMP-005 鈴木

切り替えるとTIME全体（月間・今日・集計・休日・編集）がその社員の台帳に切り替わります。

## Firebase
Firestoreも社員別に保存します。

- shared/attendance-EMP-001
- shared/attendance-EMP-002
- ...
- shared/attendance-EMP-005

`firestore.rules` も更新しています。Firebase Consoleで新ルールへ更新してください。

## portalとの関係
`time-v82-bridge.js` は全EMPの勤怠を `hokuyou.portal.v1` へ集約します。

予定の日フォーカスでは、
- EMP-003の予定
- EMP-003の勤怠
- EMP-003の有休

のように社員IDで一致させられます。

## 注意
EMP-004は現在portal初期社員マスタ上では「佐藤」です。
旧TIMEデータを別の人にしたい場合は、社員マスタの表示名を変更するか、
移行先EMPを変更してください。
