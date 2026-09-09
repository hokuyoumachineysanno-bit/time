# 勤怠管理 v8.1 × 社内業務ポータル 実統合テスト版

このZIPは、ユーザー提供の `attendance-v8.1-inline-edit(1).zip` をそのまま母艦にして、
予定管理 v1.1 を `/portal/` に組み込んだものです。

## 今回確認できたv8.1実構造
- localStorage KEY: `attendancePwaV6`
- state.version: 8.1
- `state.records` は `{ "YYYY-MM-DD": record }` のオブジェクト
- `state.calendar` は `{ "YYYY-MM-DD": holiday }` のオブジェクト
- `persist()` 後に `attendance-local-change` イベントを発火
- Firebase受信時に `attendance-cloud-state` イベントを発火

そのため、ポーリングではなくイベントでportalへ反映します。

## URL
- `/time/` 勤怠 v8.1
- `/time/portal/` 予定・案件
- `/time/tools/integration-inspector.html` 共通ストア診断

## 重要：社員ID
v8.1は現在、勤怠レコード自体に社員IDを持ちません。
そのため `time-v81-bridge.js` の

`const TIME_EMPLOYEE_ID="EMP-001";`

で「この勤怠台帳は誰のものか」を指定しています。

portal社員マスタで該当社員をEMP-001にしてください。

## 連携
勤怠v8.1で
- 勤務区分
- 出退勤
- 有休
- 法定休日
- 所定休日

を保存すると、共通ストア `hokuyou.portal.v1` が更新されます。
portalを開き直すと同じ日付・休日・休暇が反映されます。

## 次の段階
複数社員の勤怠を本当に統合するには、
v8.1のデータ構造を `employeeId + date` に拡張するか、
Firestoreを社員別ドキュメント構造に変更する必要があります。
