import { formatMessage, installerText } from './install-i18n.mjs';

const messages = {
  en: {
    menu: '1. English / 2. 日本語', menuPrompt: 'Language / 言語 [1]', terminal: 'Run the installer in an interactive terminal.',
    intro: 'SPH on blitz.cloud. Create the multi-part app in the GitHub deployment wizard, then make an API key on https://dashboard.blitz.cloud/ai.',
    apiKey: 'blitz.cloud API key (hidden)', account: 'blitz.cloud account name (the part before .blitz.cloud)', app: 'App subdomain',
    verifyParts: 'blitz.cloud MCP does not expose the app Parts. In the app dashboard, check Settings → Parts: frontend at /, v1 at /v1, and migration before each new version.',
    verifyPrompt: 'Type VERIFY only after confirming all three Parts', verifyFailed: 'Parts were not confirmed. No administrator credentials were sent.',
    partsMissing: 'The deployment is missing frontend at /, v1 at /v1, or a pre-deploy migration. No administrator credentials were sent. Correct Parts in the blitz.cloud dashboard, then rerun this installer.',
    username: 'Administrator username', password: 'Administrator password (hidden)', confirmPassword: 'Confirm administrator password (hidden)', passwordMismatch: 'Passwords did not match. Please try again.',
    firstName: 'First name', lastName: 'Last name', birthDate: 'Birth date (YYYY-MM-DD)', gender: 'Gender (female/male/unspecified)', email: 'Email address', employeeCode: 'Employee code', hireDate: 'Hire date (YYYY-MM-DD)', employmentType: 'Employment type (Regular/Contract/Part Time/Temporary)', branch: 'Branch name', samples: 'Add fictional sample data? (yes/no)',
    noApp: 'No app exists at {1}. Create it from {2}, branch {3}, in the blitz.cloud GitHub deployment wizard. Set frontend at /, v1 at /v1, and migration as a pre-deploy step. Then rerun this installer.',
    wrongSource: 'An app already uses {1}, but its source is not {2}.', resume: 'Resuming {1}. Existing data and encryption settings will be kept.',
    nightly: 'Turn off nightly updates in the app Settings page before using it.', saved: 'Settings saved. Starting a build and waiting for /v1/health.',
    ready: 'SPH is ready at {1}. Sign in with the administrator account you entered.', stopped: 'No database or app was deleted. Correct the issue and rerun this installer to resume.',
    health: 'The app did not answer at /v1/health. Check the build, migration, and Parts paths in blitz.cloud.',
    nonJson: '{1} returned a non-JSON response. Check the v1 part and its /v1 route.', invalidApi: '{1} returned an invalid API response.',
    session: 'The unauthenticated session response was unexpected.', login: 'Administrator login failed. Check migration and the initial profile.', cookie: 'Administrator login did not set a session cookie.', sessionVerify: 'Administrator session verification failed.', logout: 'Administrator logout failed.', sessionActive: 'The administrator session remained active after logout.',
    unreadable: 'blitz.cloud returned an unreadable response.', rateLimit: 'blitz.cloud rate limit reached. Wait and rerun the installer.', keyRejected: 'The API key was refused. Issue a new key in blitz.cloud → AI tools.', http: 'blitz.cloud returned HTTP {1}.', refused: 'blitz.cloud refused the request.', missingTool: 'blitz.cloud does not offer {1}.', toolFailed: '{1} failed. Check the app in the blitz.cloud dashboard.', changedInput: 'blitz.cloud changed the input for {1}. Check the current API documentation.'
  },
  ja: {
    menu: '1. English / 2. 日本語', menuPrompt: 'Language / 言語 [1]', terminal: '対話型ターミナルでインストーラーを実行してください。',
    intro: 'blitz.cloud で SPH を公開します。GitHub 公開ウィザードで 3 パートのアプリを作成し、https://dashboard.blitz.cloud/ai で API キーを発行してください。',
    apiKey: 'blitz.cloud の API キー（入力は非表示）', account: 'blitz.cloud のアカウント名（.blitz.cloud の前の部分）', app: 'アプリのサブドメイン',
    verifyParts: 'blitz.cloud の管理 API からパート構成を取得できません。アプリの Settings → Parts で、frontend が /、v1 が /v1、migration が各公開前に実行されることを確認してください。',
    verifyPrompt: '3 パートをすべて確認したら VERIFY と入力', verifyFailed: 'パート構成を確認できませんでした。管理者の認証情報は送信していません。',
    partsMissing: 'frontend の /、v1 の /v1、または公開前の migration がありません。管理者の認証情報は送信していません。blitz.cloud の Parts を修正し、インストーラーを再実行してください。',
    username: '管理者ユーザー名', password: '管理者パスワード（入力は非表示）', confirmPassword: '管理者パスワードの確認（入力は非表示）', passwordMismatch: 'パスワードが一致しません。再入力してください。',
    firstName: '名', lastName: '姓', birthDate: '生年月日（YYYY-MM-DD）', gender: '性別（female/male/unspecified）', email: 'メールアドレス', employeeCode: '社員コード', hireDate: '入社日（YYYY-MM-DD）', employmentType: '雇用形態（Regular/Contract/Part Time/Temporary）', branch: '拠点名', samples: '架空のサンプルデータを追加しますか？（yes/no）',
    noApp: '{1} にアプリがありません。blitz.cloud の GitHub 公開ウィザードで {2} の {3} ブランチから作成してください。frontend を /、v1 を /v1、migration を公開前のジョブに設定し、インストーラーを再実行してください。',
    wrongSource: '{1} には既にアプリがありますが、公開元が {2} ではありません。', resume: '{1} の設定を再開します。既存データと暗号化設定は保持します。',
    nightly: '利用前にアプリの Settings で夜間の自動更新をオフにしてください。', saved: '設定を保存しました。ビルドを開始し、/v1/health の応答を待ちます。',
    ready: 'SPH を {1} に公開しました。入力した管理者アカウントでログインしてください。', stopped: 'データベースとアプリは削除していません。問題を修正してインストーラーを再実行してください。',
    health: 'アプリが /v1/health に応答しませんでした。blitz.cloud のビルド、migration、パートのパスを確認してください。',
    nonJson: '{1} が JSON 以外を返しました。v1 パートと /v1 の経路を確認してください。', invalidApi: '{1} の API 応答が不正です。',
    session: '未ログイン時のセッション応答が想定と異なります。', login: '管理者ログインに失敗しました。migration と初期管理者の設定を確認してください。', cookie: '管理者ログイン時にセッション Cookie が設定されませんでした。', sessionVerify: '管理者セッションの確認に失敗しました。', logout: '管理者ログアウトに失敗しました。', sessionActive: 'ログアウト後も管理者セッションが有効です。',
    unreadable: 'blitz.cloud の応答を読み取れませんでした。', rateLimit: 'blitz.cloud のリクエスト制限に達しました。時間をおいてインストーラーを再実行してください。', keyRejected: 'API キーが拒否されました。blitz.cloud の AI tools で新しいキーを発行してください。', http: 'blitz.cloud が HTTP {1} を返しました。', refused: 'blitz.cloud がリクエストを拒否しました。', missingTool: 'blitz.cloud に {1} がありません。', toolFailed: '{1} に失敗しました。blitz.cloud の管理画面でアプリを確認してください。', changedInput: 'blitz.cloud の {1} の入力仕様が変わりました。最新の API ドキュメントを確認してください。'
  }
};

export function blitzText(language) {
  const shared = installerText(language);
  return (key, ...values) => {
    if (Object.hasOwn(messages[language], key)) return formatMessage(messages[language][key], values);
    return shared(key, ...values);
  };
}
