# SME Portal Hub ( SPH )

[English](./README.md)

[![GitHub リリース](https://img.shields.io/github/v/release/HidekiMorisaki/sph)](https://github.com/HidekiMorisaki/sph/releases) [![ライセンス](https://img.shields.io/github/license/HidekiMorisaki/sph)](https://github.com/HidekiMorisaki/sph/blob/main/LICENSE)

![ダッシュボード](./docs/gallery/Dashboard_ja.png)

SME Portal Hub ( 略称：SPH ) は、中小企業が社内向けのポータルサイトを構築できる Web システムです。従業員管理、社内カレンダーの作成・公開、IT 資産管理などを通じて、社内業務の効率化と情報の集約を支援することを目指して開発しています。

> [!NOTE]
> SPH は現在、開発中です。
インストールして評価できますが、一部の機能は未完成です。既存機能も今後のアップデートで大幅に変更される可能性があります。

| 目的 | 参照するセクション |
| --- | --- |
| インストール・試用・利用する | [利用者向けクイックスタート](#quick-start-for-users) |
| 他の PC から利用できるようにサーバーへインストールする | [サーバーまたは別の PC へのインストール](#installing-on-a-server-or-another-pc) |
| インストール時の問題を調べる | [クイックスタートのトラブルシューティング](#quick-start-troubleshooting) |
| インストール済みのシステムを起動・停止する | [システムの起動と停止](#starting-and-stopping-the-system) |
| インストール済みのシステムを更新する | [最新バージョンへの更新](#upgrading-to-the-latest-version) |

本システムには、次の機能があります。

- 従業員管理とロールに基づくアクセス制御
- 社内カレンダーの作成・公開
- 拠点・部屋・保管場所の管理
- IT 資産の登録・割当・返却・変更履歴
- 従業員とIT資産に関するマスターデータ
- 従業員分析と公開済み経営状況の推移、ユーザー設定
- システム管理者向けの拠点・年度別の経営状況管理

経営状況のドル／円換算には、[日本銀行時系列統計データ検索サイト](https://www.stat-search.boj.or.jp/) の API（FXERM07）を利用します。取得した月別レートは DB に保存され、自動改訂しません。SPH をインストールして外部に公開する場合は、公開する前に [日本銀行の API 利用上の注意](https://www.stat-search.boj.or.jp/info/api_notice.pdf) を確認し、必要なサービス利用の連絡を行ってください。画面には出典を表示しています。
オプションのインストール用サンプルには、公開済みの経営状況と、サンプル専用であることを明示した架空の為替レートを含みます。

<a id="quick-start-for-users"></a>

## 利用者向けクイックスタート

### 1. 事前準備

インストールするには Git、Docker、Docker Compose が必要です。事前にインストールして正常に動作することを確認してください。
ローカル限定インストールでは既定でホストのポート`3000`を使用します（インストーラーで変更可能）。HTTPS インストールでは`80`と`443`、社内 HTTP では選択した Web ポートを使用します。PostgreSQL はホストのループバック用ポート`5432`で待ち受けます。必要なポートが空いていることを確認してください。

### 2. ダウンロード

```bash
git clone https://github.com/HidekiMorisaki/sph.git
cd sph
```

### 3. インストーラーの実行

| プラットフォーム | ダウンロードしたフォルダーでの実行方法 |
| --- | --- |
| Windows | `install.bat`をダブルクリック、または PowerShell で`.\install.ps1`を実行 |
| macOS / Linux | ターミナルで`bash ./install.sh`を実行 |

インストーラーは英語と日本語に対応しています。表示言語を選択した後は、対話形式でインストールを行います。画面の案内に従ってインストールを行ってください。インストーラーがシステムをビルドして起動し、URL とログイン方法を表示します。

> [!NOTE]
> "架空のサンプルデータ（任意）" で "2：追加する" を選択することで、選択した言語に合わせたサンプルデータを自動的に追加することができます。SPH の評価にお役立てください。

<a id="installing-on-a-server-or-another-pc"></a>

## サーバーまたは別の PC へのインストール

システムを稼働させるコンピューターで、ダウンロードとインストーラーの実行を行ってください。インストーラーで接続方式を選びます。

| 方式 | URL と証明書 | ネットワークと信頼設定 |
| --- | --- | --- |
| ローカル限定 | 既定は`http://localhost:3000` | SPH をインストールした PC のみから利用可能。Web ポートはインストールした PC のループバックにのみ公開されます。 |
| 社内 HTTP | サーバーのプライベート IPv4 アドレスを使う`http://` URL | ローカルエリアネットワーク上の端末のみからアクセスを許可します。パスワード、セッション Cookie、社員・資産情報を含む全通信が暗号化されない代わりに、サーバー証明書は不要です。 |
| 社内 HTTPS | 指定した社内`https://`ホスト名。内蔵 Caddy CA が証明書を発行・更新します。 | ローカルエリアネットワーク上の端末のみからアクセスを許可します。利用端末からサーバーの TCP `443`へ到達できるようにする必要があります。管理者が公開 CA ルート証明書を各端末へ安全に配布し、信頼設定を行ってください。 |
| 公開ドメイン | 指定した`https://`ドメイン。内蔵 gateway が Let's Encrypt の証明書を自動取得・更新します。 | 公開 DNS をサーバーへ向け、インターネットから TCP `80` と `443` に到達できるようにしてください。インストール中に ACME 連絡先メールアドレスの入力と Let's Encrypt の利用規約への同意が必要です。 |

社内 HTTPS 方式では、公開 CA ルート証明書を `.runtime/ca/root.crt` ファイルへ出力します。サーバー上で証明書の同一性を確認してから、組織の証明書管理手順に沿って利用端末へ配布してください。CA 秘密鍵は Docker の `gateway_data` ボリュームに保存されています。`gateway_data` ボリュームはバックアップに含めてください。失うと CA が変わり、既存の信頼設定が無効になります。CA データが保持されている間は証明書が自動更新されます。

公開ドメイン方式では、インストール前に DNS とファイアウォールを確認してください。証明書の取得には、インターネットから到達可能なドメインとポート`80`/`443`が必要です。インストーラーは DNS を確認し、HTTPS のヘルスチェックを待ちます。停止した場合は`docker compose logs gateway`を確認し、到達性を修正してから下記の復旧手順を実施してください。[Let's Encrypt の利用規約](https://letsencrypt.org/repository/)が適用されます。

接続設定は`.env`の`GATEWAY_TLS_MODE`、`GATEWAY_HTTP_PUBLISH`、`GATEWAY_HTTPS_PUBLISH`、`APP_ORIGIN`、`HTTP_PORT`、`CORS_ALLOWED_ORIGINS`（公開ドメインでは`ACME_EMAIL`も）に保存されます。変更した場合は`node scripts/install-maintenance.mjs gateway-config`で`.runtime/gateway/Caddyfile`を再生成し、`docker compose up -d --build --no-deps api frontend gateway`を実行します。生成された Caddyfile だけを独立して編集しないでください。

<a id="quick-start-troubleshooting"></a>

## クイックスタートのトラブルシューティング

### インストーラーが停止した場合

インストーラーは新規インストール専用です。既存の`.env`ファイル、SPH のコンテナー、または`sph-db-data`ボリュームがある場合は、それらを置き換えずに停止します。インストール済みの環境では、通常の起動・更新・復旧手順を使用してください。

インストールに失敗した場合は、停止した工程、失敗した操作または検出した状態、次に確認する事項を表示します。Docker の出力には認証情報が含まれる可能性があるため、そのまま表示することはありません。詳細な原因が不明な場合は、その旨を明示します。表示する確認事項は、原因を断定したものではありません。

新規インストールが`.env`の保存後に失敗した場合は、そのファイル、`.runtime/gateway/Caddyfile`、データベース保存領域、`gateway_data`ボリュームを保持してください。事前条件や起動時の問題を解消してから、製品リポジトリのルートで`docker compose up -d --build --wait --wait-timeout 300`を実行し、後述のサービス状態を確認してください。Caddyfile がない場合は、先に`node scripts/install-maintenance.mjs gateway-config`で再生成します。社内限定方式では`docker cp sph-gateway:/data/caddy/pki/authorities/local/root.crt .runtime/ca/root.crt`で公開 CA ルートを再出力します。設定ファイルも SPH の保存領域も作成されていない場合は、インストーラーを再実行します。暗号化済みデータに対して、暗号化キーを新しく生成して置き換えないでください。`.env`は安全に保管し、データベースとは別にバックアップしてください。

起動を復旧した後は、初期設定用の認証情報の除去も完了させてください。データベースのパスワードと暗号化キーを保持したまま、`.env`から`INITIAL_ADMIN_*`の行だけを削除します。`docker compose up -d --no-build --no-deps --force-recreate --wait --wait-timeout 300 db api`で`db`と`api`を再作成し、`docker compose rm -f migration`で完了した migration コンテナーを削除してから、後述のアプリケーションの応答を確認してください。`.env.install-clean`が残っている場合は、復旧が完了するまで保護し、完了後にこの一時ファイルを安全に削除してください。認証情報が含まれる可能性があります。

### インストール結果の確認

一度だけ実行される migration コンテナーも含め、すべてのコンテナーを表示します。

```bash
docker compose ps -a
```

次の状態になっていることを確認してください。

- `db`、`api`、`frontend`、`gateway`が稼働している。
- 一度だけ実行される`migration`コンテナーが存在する場合は、終了コード`0`で終了している。

起動処理がまだ続いている場合やサービスが失敗した場合は、ログを確認します。

```bash
docker compose logs migration
docker compose logs api frontend gateway db
```

gateway 経由で API を確認します（ポートを変更した場合は、例のポート番号を置き換えてください）。

```bash
curl http://localhost:3000/v1/health
```

Windows の PowerShell では、次のコマンドを使用できます。

```powershell
Invoke-RestMethod http://localhost:3000/v1/health
```

成功した場合は、`equipment-api`サービスが正常であることを示す応答が返ります。HTTPS 方式では、設定した`https://`のアプリ URL で確認してください。社内限定方式では、確認端末で`.runtime/ca/root.crt`を信頼してから確認します。

### Web ページが開かない場合

常時稼働するサービスがすべて起動し、正常な状態であることを確認してください。

```bash
docker compose ps -a
docker compose logs gateway frontend api
```

選択した Web ポートが、他のアプリケーションで使用されていないことも確認してください。

### migrationコンテナーが失敗した場合

ログを確認してください。

```bash
docker compose logs migration
```

よくある原因には、`INITIAL_ADMIN_*`の値の不足・不正、強度要件を満たさない初期パスワード、初期マスターデータと一致しない雇用形態名や拠点名があります。

`.env`を修正してから、次のコマンドを再実行してください。

```bash
docker compose up -d --build
```

### ポートが既に使用されている場合

ローカル方式では既定で gateway をホストのループバック用ポート`3000`に、HTTPS 方式では`80`と`443`に、社内 HTTP 方式ではサーバーのプライベート IPv4 アドレス上の選択したポートに公開します。PostgreSQL はホストのループバック用ポート`5432`だけに公開します。必要なポートを空けてください。既存のローカル環境でポートを変更する場合は、`.env`の`HTTP_PORT`、`GATEWAY_HTTP_PUBLISH`、`APP_ORIGIN`、`CORS_ALLOWED_ORIGINS`を一緒に変更し、上記の手順で gateway 設定を再生成します。

### バインドマウントが機能しない場合

Docker の環境によっては、リムーバブルドライブ上のプロジェクトを正常にバインドマウントできないことがあります。リポジトリを`C:\projects\sph`などの内蔵ドライブへ移動し、システムを再度起動してください。

<a id="starting-and-stopping-the-system"></a>

## システムの起動と停止

サービスの状態を表示します。

```bash
docker compose ps -a
```

ログを継続して表示します。

```bash
docker compose logs -f
```

アプリケーションを再起動します。

```bash
docker compose restart
```

データベースのデータを保持したまま、コンテナーを停止・削除します。

```bash
docker compose down
```

インストール済みの環境を再度起動します。

```bash
docker compose up -d
```

データベースのデータは、名前付き Docker ボリューム`sph-db-data`に保存され、`docker compose down`を実行しても保持されます。データの永久削除を意図し、適切なバックアップがある場合を除き、`--volumes`オプションを追加しないでください。

<a id="upgrading-to-the-latest-version"></a>

## 最新バージョンへの更新

インストール済みの環境を更新する場合は、リポジトリのルートから使用中の OS に対応するコマンドを実行してください。更新スクリプトがサービスを停止し、検証付きバックアップを作成してから、ソースの取得・再起動を行います。事前に Git の作業ツリーをクリーンにし、追跡先のブランチを設定してください。

### v0.3.0 以上から更新する場合

Windows PowerShell:

```powershell
.\scripts\update.ps1
```

macOS／Linux:

```bash
./scripts/update.sh
```

### v0.2.1 から更新する場合

公開済みの元の v0.2.1 に含まれる PowerShell スクリプトは Windows PowerShell 5.1 に対応していません。先に v0.2.1 向け保守修正を取得し、その後、追跡先を v0.3.0 のリリースブランチに設定してください。v0.3.0 が `main` に公開されたら、リポジトリのルートで次を実行します。

```powershell
git fetch origin
git pull --ff-only origin bugfix/v0.2.1
git branch --set-upstream-to=origin/main
.\scripts\update.ps1
```

macOS／Linux では同じ Git コマンドを実行し、最後のコマンドを `./scripts/update.sh` に置き換えてください。更新スクリプトは v0.3.0 のソースを取得する前に、データベースのバックアップを作成・検証します。ローカルに変更がある場合は事前に内容を確認して解消し、更新のために無断で破棄しないでください。

バックアップ先の指定や復旧方法は[バックアップ・更新・復元手順](./docs/Backup_Update_and_Restore_JA.md)を参照してください。

## ギャラリー

### ダッシュボード
![ダッシュボード](./docs/gallery/Dashboard_ja.png)

### PDF エクスポート結果
![年代別従業員数・男女比](./docs/gallery/Dashboard_Exported_PDF_ja_1.png)
![年別従業員数の推移](./docs/gallery/Dashboard_Exported_PDF_ja_2.png)
![年別入社・退職・離職率](./docs/gallery/Dashboard_Exported_PDF_ja_3.png)

## 従業員リスト
![従業員リスト](./docs/gallery/EmployeeList_ja.png)

## 勤務カレンダー
![勤務カレンダー](./docs/gallery/WorkCalendars_ja.png)

## 謝辞

SPH の UI デザインは、[Gentelella v4 - Free Admin Dashboard Template](https://github.com/colorlibhq/gentelella) を参考にさせていただきました。Gentelella の貢献者の皆様、そして高品質なデザインテンプレートを無償でコミュニティに公開してくださるすべての開発者の皆様に感謝します。
