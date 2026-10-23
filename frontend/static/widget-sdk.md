# Widget SDK v1 / ウィジェット開発

SPHの「システム設定 → ウィジェット開発」(`/system-settings#widget-development`)で、独自のHTML・CSS・JavaScriptを編集できます。専用ページ(`/widget-editor`)からも同じエディターを利用できます。本体へのコード追加や再ビルドは不要です。下書きの保存には本人の開発操作権限が必要です。初期5ロールには付与され、独自ロールはシステム管理者が設定します。

## 開発から配布まで

1. 新規下書き、またはJSON取込から開始します。ウィジェットID・バージョンを設定し、「定義」で名前、提供元、開発者、サイズ、ライセンスを編集します。
2. HTML・CSS・JavaScriptを編集し、「保存」でSPHへ本人専用の下書きを保存します。未完成のコードも保存できます。同じ本人・ID・バージョンの下書きは1件です。削除した組合せは再利用せず、新しいバージョンを使用してください。
3. 「実行」でプレビューを開始します。言語・テーマ・宣言サイズを切り替え、エラーを確認します。「停止」で終了します。編集中のコードは自動実行されません。
4. 「JSON出力」で検証済みカタログを取得し、公開HTTPS URLで配布します。システム管理者がシステム設定のソースへ登録し、コード・要求機能・ライセンスを確認してその版の利用を許可します。
5. 利用者がマイページへ追加します。コード、設定定義、保存定義などを変更した配布物は、必ずバージョンを上げて再承認します。同じバージョンの差替えは拒否されます。

「JSON取込」は複数件カタログの先頭1件を編集対象にします。下書きの競合では編集内容を保持します。リロードする前にJSON出力やコードのコピーで内容を退避してください。エクスポート時のID・バージョンは画面上部の入力を正とします。

実例は `docs/examples/widget-calculator-sdk.json`、公式7種の編集用ソースは `api/widgets/official/` です。公式カタログは依存関係導入済みの開発環境で `node scripts/build-widget-catalogue.mjs` により生成します。TypeScriptの補助ロジックも配布JSON内のJavaScriptへ同梱されます。配布先にTypeScript・Svelte・npmは不要です。

## 定義形式

カタログの `schemaVersion` は2、`widgets` は最大100件です。各定義は `schemaVersion: 2`、`view: [{"type":"runtime"}]`、`capabilities: []`、`settings: {}` を指定します。`runtime` は `sdkVersion: 1` と文字列の `html`、`css`、`javascript` を持ちます。従来の名前・提供元・開発者・説明・ライセンス・`sizes`・`sizeLayouts` も必要です。サイズIDは既存と同じ半角の `行x列` です。

1定義はUTF-8で256 KiB、HTML/CSS/JavaScript各文字列は131,072 UTF-16単位まで、外部カタログの取得は4 MiBまでです。HTML描画は最大2,000ノード・深さ40・65,536 UTF-16単位です。SDKメッセージはUTF-8で128 KiB上限、1秒あたり200件、1回の画面更新は256項目、保存要求の同時実行は8件までです。下書きは本人あたり100件、HTTP本文512 KiBまでです。

## SDK

JavaScriptはDOMを持たないWorkerで動きます。`document` やSPHのCookieは使用できません。`sph` はSDKが用意するグローバル変数です。外部モジュールのimport、外部スクリプト、CDN、通信は使用せず、必要な処理をJavaScriptに同梱してください。

```js
sph.ready(context => {
  let value = 0;
  sph.ui.on('plus', 'click', () => {
    sph.ui.patch([{ id: 'result', text: String(++value) }]);
  });
});
```

| 呼出し | 内容 |
| --- | --- |
| `sph.ready(async context => {})` | 初期化。登録するコールバックは1件 |
| `sph.context()` | 最新の実行条件をPromiseで取得 |
| `sph.ui.measure(id)` | 指定要素のclientWidth/clientHeight/scrollWidth/scrollHeightをPromiseで取得 |
| `sph.ui.html(html)` | 許可されたHTMLでウィジェット内部を置換 |
| `sph.ui.patch([{id, text}])` | 指定IDのテキストを更新。HTMLとして解釈しない |
| `sph.ui.patch([{id, value}])` | input/textarea/selectの文字列値を更新 |
| `sph.ui.patch([{id, attribute, attributeValue}])` | 許可属性を更新。nullで除去 |
| `sph.ui.on(id, event, callback, keys?)` | click/input/change/keydownを購読。同一ID・イベントの登録は置換 |
| `sph.ui.on('$context','change',callback)` | 言語・テーマ・設定・幅等の変更通知 |
| `sph.expand(html?)` | 共通モーダルで全文のスナップショットを表示。元の処理状態は維持 |
| `sph.records.list(options?)` | 専用保存領域を取得。既定100件。limit/offset/sortBy/sortOrderに対応 |
| `sph.records.get(key)` | 1レコードを取得 |
| `sph.records.create(key, values)` | レコード作成 |
| `sph.records.update(key, revision, values)` | revision一致時のみ更新 |
| `sph.records.delete(key, revision)` | revision一致時のみ論理削除 |

イベントには `id,event,value,checked,key,repeat` が入ります。keydownの第4引数にキーの配列を指定すると、そのキーについてブラウザーの既定操作を抑止します。Ctrl/Meta/Alt付きのキーは横取りしません。コンテナーIDで登録すると子要素からのイベントも受け取れます。

contextには `language`、`timeZone`、`theme`、`configuration`、`size`、`width`、`height`、`scale`、`compact`、`expanded`、`preview` が入ります。本人のIDやセッション情報は渡しません。更新通知を受けたら必要な表示だけ更新してください。プレビューの保存領域は実行ごとに初期化され、実際の配置・レコードには書き込みません。

`compact` はスマホ・タッチ端末の横向き表示など、コンパクト表示であることを示します。ホストは標準テキストを表示上16px、ラベル・補足を14px、時刻・結果を18pxへ揃えます。セル倍率による文字の過大な拡大を抑え、全文表示にも元のカードの倍率を引き継ぎます。

表示値のコピーはHTMLの `<button data-copy="result">` で指定できます。利用者が実際に押した場合だけ、指定IDのテキストをSPH側がクリップボードへ書き込みます。クリップボードの読取りはできません。

画面更新で許可する属性は `class,disabled,aria-label,aria-pressed,transform,d,checked` です。HTMLは通常の表示要素、ラベル、入力、ボタン、表、描画用SVGに限定します。script、iframe、リンク遷移、イベント属性、外部参照、SVG foreignObjectは拒否します。CSSは隔離文書の中だけに適用され、外部画像・フォント・importはCSPで遮断されます。

色には `--text`, `--surface`, `--surface-secondary`, `--border`, `--primary`, `--primary-bg`, `--muted`, `--danger` が使えます。SPHのテーマ切替に追従します。iframe外の画面やスタイルを変更することはできません。

## 設定・個人保存

`configuration` は既存の保存フィールドと同じフィールド定義を使います。`fields`, `titleField`, `listFields`, `operations` を指定し、operationsはすべてfalseにします。配置ごとの設定フォームをSPHが生成し、初期値または保存値を `context.configuration` に渡します。文字列の `title` があればカード名へ補足表示します。

`storage` は [Widget_Storage.md](Widget_Storage.md) と同じ共有レコード形式です。レコードの参照はその配置の所有者だけに許可します。作成・変更・削除には、定義のoperationsと利用者の操作権限の両方が必要です。SPH側の制限を超えて保存できません。競合時は再取得するか入力を保持して利用者に再試行を案内してください。

追加画面では `initialRecords` の各フィールドを編集できます。既存配置の設定画面では、初期レコードが1件の場合にその内容も編集できます。複数レコードを持つウィジェットはSDKから一覧・編集画面を作成してください。

## 下書きREST APIと拡張

本人専用の `/v1/employees/me/widget-drafts` はGET/POST、`/{id}` はGET/PUT/DELETEに対応します。保存本文は `{widgetCode,version,content:{metadata,html,css,javascript},revision?}` です。更新・削除には取得時のrevisionが必要です。削除は論理削除です。一覧は共通のsortBy/sortOrder/offset/limitを使用します。全操作でサーバーが本人所有・操作権限を確認します。

`POST /v1/widget-validations` は定義1件を検証します。下書き閲覧権限が必要です。成功・失敗とも通常のJSON応答とHTTP状態を使用します。ウィジェットのSDKはこれらの任意APIを呼び出す機能を持ちません。

将来の業務API・外部サービス連携は、SDKの名前付き操作、宣言、管理者承認、サーバー側の権限・対象範囲確認を追加して実装します。初回のSDKはその要求を拒否します。任意URLを親画面に取得させる機能や、未実装の権限を先に許可する機能はありません。

応答しないWorkerは約5秒で停止し、再試行を表示します。ページのバックグラウンド休止は判定から除外します。停止された配布版は既存の60秒ごとの再確認で実行領域を破棄します。Workerとブラウザーの隔離はOSのCPU・メモリー上限を保証するものではありません。承認時にはソースと必要なライセンス・同梱通知も確認してください。
