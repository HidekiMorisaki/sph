# バックアップ・更新・復元

`scripts/` の保守ツールは、インストール済みの SME Portal Hub を運用する管理者向けです。Git の作業ツリーと Docker Compose があるコンピューターのターミナルで実行してください。

## 重要な注意事項

- 通常の更新には、Windows では `update.ps1`、macOS／Linux では `update.sh` を使用します。
- 更新スクリプトは、`git pull --ff-only` やコンテナーの再ビルドより前に、データベース全体のバックアップを作成・検証します。
- 更新が成功した後に復元を行う必要はありません。復元すると、現在のデータが以前のバックアップ時点の状態に置き換わります。
- 復元は障害からの復旧操作です。既知のバックアップからの復旧が必要な場合にのみ行ってください。
- バックアップには社員情報、認証情報、セッション、履歴、論理削除済みデータが含まれます。機密データとしてアクセスを制限し、重要なバックアップは別の保護された場所にも保管してください。
- `.env` はバックアップに含まれません。設定と秘密情報は別途、安全に保管してください。
- HTTPS 環境では Docker の`gateway_data`ボリュームと`.runtime/gateway/Caddyfile`も別途バックアップします。データベースのダンプには証明書や社内 CA は含まれません。社内 CA を失った場合は、端末の信頼設定をやり直す必要があります。
- 保守ツールは Git のソースコードを自動的には戻しません。ソース取得後に更新が失敗した場合は、バックアップを保持し、原因を調べてからソースのリビジョンやデータの復元を判断してください。
- 更新時に `docker compose down --volumes` を使用しないでください。

## 事前準備

保守コマンドを実行する前に、次を確認してください。

1. Docker Desktop または Docker サービスを起動する。
2. `git`、`docker`、`docker compose` を使用できることを確認する。
3. リポジトリの `.env` を残しておく。
4. ローカルの Git 変更をコミットするか解消する。作業ツリーに変更がある場合、更新ツールは実行を拒否します。
5. 現在のブランチに追跡先のリモートブランチを設定する。更新ツールは取得先を推測しません。
6. PostgreSQL の完全ダンプと、その復元検証用データベースを作成できる空き容量を確保する。

既定のバックアップ先は、リポジトリと同じ親ディレクトリにある `sph-backups` です。例えばインストール先が `C:\projects\sph` の場合、`C:\projects\sph-backups` に保存します。Git リポジトリの内部はバックアップ先に指定できません。

## システムの更新

リポジトリのルートで、使用中の OS に対応するコマンドを実行します。

Windows PowerShell:

```powershell
.\scripts\update.ps1
```

macOS／Linux:

```bash
./scripts/update.sh
```

バックアップ先を変更する場合は、リポジトリの外にある保存先を最初の引数で指定します。

```powershell
.\scripts\update.ps1 -BackupRoot 'D:\Protected\sph-backups'
```

```bash
./scripts/update.sh /protected/sph-backups
```

更新ツールは次の順で処理します。

1. Docker Compose、`.env`、Git の作業ツリー、追跡先ブランチを確認する。
2. PostgreSQL が正常に稼働していることを確認する。
3. バックアップ中の書き込みを防ぐため、`gateway`、`frontend`、`api` を停止する。
4. データベース全体を PostgreSQL のカスタム形式でダンプする。
5. ダンプを専用の一時データベースへ復元し、テーブル数とマイグレーション数を比較する。SHA-256 チェックサムとマニフェストを書き込み、一時データベースを削除する。
6. `git pull --ff-only` を実行する。
7. `.env`から gateway 設定を生成してサービスを再ビルドする。検証済みデータベースが対応する旧マイグレーション履歴と一致するスキーマを持つ場合は統合済みベースラインへ移行し、サービスとマイグレーションジョブを起動する。
8. API とフロントエンドのヘルスチェックを待ち、`/v1/health` が `VERSION` と同じバージョンを返すことを確認する。

Git のリビジョンが変わる前に更新が失敗した場合、ツールは以前のアプリケーションコンテナーの再起動を試みます。検証済みバックアップがあれば、その保存先を表示して保持します。すぐに復元せず、先にエラーとコンテナーログを調べてください。

## 単独でバックアップを作成する

Windows PowerShell:

```powershell
.\scripts\backup.ps1
```

macOS／Linux:

```bash
./scripts/backup.sh
```

バックアップ先の引数は更新時と同じ方法で指定できます。作成に成功したバックアップディレクトリには、次のファイルが含まれます。

- `database.dump`: データベース全体の PostgreSQL カスタム形式ダンプ。
- `manifest.json`: 製品バージョン、ソースコミット、UTC の作成日時、データベースと PostgreSQL のバージョン、ダンプのチェックサム、復元検証結果。

ダンプには、アプリケーションの行、監査・変更履歴、論理削除済みの行、認証データ、Prisma のマイグレーション履歴が含まれます。`.env`、Docker イメージ、Git の作業ツリーは含まれません。

## 統合済み初期スキーマ

初期スキーマは単一のマイグレーション `20261003000000_initial_baseline` に統合されています。このマイグレーションは業務データを登録せず、完成したスキーマを作成します。`ALTER TABLE` を使うのは外部キー制約の追加だけです。列、キー、チェック制約、関数、インデックス、トリガーは最終形で作成します。必須の初期データと任意の言語別サンプルデータは、インストーラーのマイグレーションジョブが別途登録します。

既存データベースに初期スキーマの SQL を再実行してはいけません。更新・復元ツールは完全バックアップを検証し、現在のスキーマ全体と統合済みベースラインを比較してから、Prisma の基盤用マイグレーション履歴**のみ**を置き換えます。アプリケーションの行、論理削除済みの行、認証フィールド、シーケンス値は変更しません。対応する8件の旧マイグレーション名とチェックサムを確認し、未完了のマイグレーション、不明な履歴、スキーマの差異があれば処理を停止します。以前の履歴は、完全バックアップと同じ場所の `migration-history-before-baseline.json` に保存します。統合済みベースラインが既に登録されているデータベースは変更しません。

統合済みソースを既に配置した開発用チェックアウトを、管理者の監督下で移行する場合:

```powershell
docker compose stop gateway frontend api
./scripts/backup.ps1
docker compose build migration
# ホスト側のパスを、直前に作成した検証済みバックアップディレクトリに置き換える。
docker compose run --rm --no-deps --volume 'C:\protected\sph-backup:/baseline-backup' migration node scripts/baseline-existing.mjs /baseline-backup/manifest.json
docker compose run --rm --no-deps migration
docker compose start api frontend gateway
```

拒否されたベースラインに対処するために、データベースをリセットしたりチェックサムを手動変更したりしないでください。バックアップを保持し、差異の原因を調べ、対応する移行計画ができるまでアプリケーションサービスを停止したままにします。既存の完全バックアップは、互換性のあるソースのリビジョンを使用して復元できます。

## バックアップの復元

復元すると、設定されたデータベース内のすべての行とデータベースオブジェクトが置き換わります。置き換え前にアプリケーションサービスを停止します。復元後は現在のマイグレーションを適用し、復元されたセッション、パスワードリセットトークン、アカウント招待をすべて無効化します。ユーザーは再ログインが必要です。

Windows PowerShell:

```powershell
.\scripts\restore.ps1 -BackupPath 'C:\projects\sph-backups\sph-0.1.0-YYYYMMDDTHHMMSSZ'
```

macOS／Linux:

```bash
./scripts/restore.sh /path/to/sph-backups/sph-0.1.0-YYYYMMDDTHHMMSSZ
```

ツールは確認を求める前に、マニフェスト、ダンプのファイル名、SHA-256 チェックサム、PostgreSQL ダンプの内容一覧、設定されたデータベース名を検証します。続行するには、表示された確認文字列を正確に入力します（例: `RESTORE equipment_db`）。

管理者の監督下で自動実行する場合、想定するデータベース名を明示的に指定できます。ダンプやデータベースの検証は省略されません。

```powershell
.\scripts\restore.ps1 -BackupPath 'D:\Protected\sph-backups\sph-0.1.0-YYYYMMDDTHHMMSSZ' -ConfirmDatabaseName 'equipment_db'
```

```bash
./scripts/restore.sh /protected/sph-backups/sph-0.1.0-YYYYMMDDTHHMMSSZ equipment_db
```

データベースの置き換え開始後に復元が失敗した場合、アプリケーションサービスは意図的に再起動されません。バックアップを変更せず保持し、エラーと `docker compose logs` を確認して原因を解消してから、復旧を再試行してください。

## バックアップの保管期間

ツールは成功したバックアップを削除しません。データの機密性と量に応じて保管方針を定めてください。保護された別の環境で定期的に復元を試し、期限を過ぎたバックアップは組織のデータ取扱方針に従って安全に削除してください。
