# v8.2.3 リンク固定版

今回はGitHub Pagesの実URLに合わせてリンクを絶対パスで固定しています。

- 勤怠TIME: `/time/`
- 社内業務ポータル: `/time/portal/`

## 反映方法
このZIPを展開して、`time` リポジトリのルートへそのまま上書きしてください。

重要:
- root の `index.html` は勤怠TIME
- `portal/index.html` は社内業務ポータル
- portalフォルダは必ずフォルダのまま保持

## 確認
公開後:
- https://hokuyoumachineysanno-bit.github.io/time/
- https://hokuyoumachineysanno-bit.github.io/time/portal/

また `/time/link-check.html` で両方のリンクを確認できます。
