const resources: Record<string, [string, string]> = {
 projects:['プロジェクト','Projects'],
 workflows:['ワークフロー','Workflows'],
 schedule:['スケジュール','Schedules'],notifications:['通知','Notifications'],
 widgets: ['ウィジェット', 'Widgets'],
 clients: ['取引先', 'Clients'],
 search_filters: ['個人用保存フィルター', 'Personal saved filters'],
	skills: ['スキル', 'Skills'], engagements: ['案件', 'Engagements'],
	teams: ['チーム', 'Teams'],
	books: ['書籍', 'Books'], employees: ['社員', 'Employees'], masters: ['マスターデータ', 'Master data'], branches: ['拠点', 'Branches'],
	rooms: ['部屋', 'Rooms'], storage: ['保管場所', 'Storage'], assets: ['IT資産', 'IT assets'],
	calendars: ['勤務カレンダー', 'Work calendars'], financial: ['経営状況', 'Financial data'],
	roles: ['ロール', 'Roles'], system: ['外部リンク', 'External links'], software: ['ソフトウェアライセンス', 'Software licenses']
};

const nouns: Record<string, [string, string]> = {
 tickets:['チケット','tickets'],comments:['コメント','comments'],time:['工数','time entries'],attachments:['添付','attachments'],
 payments:['金銭の受渡し','cash transfers'],templates:['ワークフローテンプレート','workflow templates'],
 preferences:['予定表の表示設定','calendar preferences'],
 drafts:['開発用下書き','development drafts'],
 records: ['保存データ', 'saved records'],
 layout: ['ウィジェット配置', 'widget layout'],
	skills: ['従業員スキル', 'employee skills'], participations: ['案件参画期間', 'engagement participations'], members: ['チームメンバー', 'team members'],
	purchases: ['購入依頼', 'purchase requests'], titles: ['書誌', 'book titles'], copies: ['現物', 'book copies'], reservations: ['予約', 'reservations'], loans: ['貸出', 'loans'], covers: ['カバー', 'covers'], credentials: ['認証情報', 'credentials'], entries: ['日付', 'entries'], holidays: ['祝日', 'holidays'],
	settings: ['設定', 'settings'], rates: ['為替レート', 'exchange rates'], links: ['外部リンク', 'external links'],
	products: ['ソフトウェア製品', 'software products'], contracts: ['契約', 'contracts'], keys: ['プロダクトキー', 'product keys'], assignments: ['割当', 'assignments'], installations: ['インストール記録', 'installation records'], usage: ['利用者記録', 'user records']
};

const actions: Record<string, [string, string]> = {
 submit:['提出','submit'],approve:['承認','approve'],comment:['コメント追加','comment'],confirm:['受領確認','confirm receipt'],
 reserve:['予約','reserve'],respond:['出欠回答','respond'],
	add: ['追加', 'add'], remove: ['所属解除', 'remove'],
	manage: ['管理', 'manage'], cancel: ['取消', 'cancel'], create: ['追加', 'create'], update: ['変更', 'update'], delete: ['削除', 'delete'],
	reorder: ['並べ替え', 'reorder'], assign: ['割当', 'assign'], return: ['返却', 'return'],
	view: ['閲覧', 'view'], access: ['アクセス', 'access'], import: ['取込', 'import'],
	read: ['閲覧', 'read'], preview: ['プレビュー', 'preview'], publish: ['公開', 'publish'],
	refresh: ['更新', 'refresh'], invite: ['招待', 'invite'], release: ['解除', 'release'], reveal: ['開示', 'reveal'], end: ['終了', 'end']
};

export function granularPermissionLabel(code: string, language: 'ja' | 'en'): string {
 const markdown:Record<string,[string,string]>={
  'projects.financial.read':['プロジェクトの金額・EVMの閲覧','View project monetary data and EVM'],
  'projects.financial.manage':['プロジェクトの予算・原価の管理','Manage project budgets and actual costs'],
  'projects.baselines.confirm':['プロジェクトの基準計画の確定','Confirm project baselines'],
  'projects.evm.confirm':['プロジェクトの月次EVM報告の確定','Confirm monthly project EVM reports'],
  'projects.images.read':['Markdown画像の閲覧','View Markdown images'],
  'projects.images.create':['Markdown画像の追加','Add Markdown images'],
  'projects.images.delete':['未保存Markdown画像の削除','Delete draft Markdown images'],
  'projects.diagrams.render':['プロジェクト本文の図の描画','Render diagrams in project text']
 };
 if(markdown[code])return markdown[code][language==='ja'?0:1];
 if(code==='projects.preferences.update')return language==='ja'?'チケット一覧の個人表示設定を変更':'Edit personal ticket columns';
 if(code==='projects.members.manage')return language==='ja'?'プロジェクト参加者の管理':'Manage project members';
 if(code==='projects.admin')return language==='ja'?'全プロジェクトの管理':'Administer all projects';
 if(code==='workflows.delete')return language==='ja'?'未提出の下書きの削除':'Delete unsubmitted drafts';
	const parts = code.split('.');
	const index = language === 'ja' ? 0 : 1;
	const resource = resources[parts[0]]?.[index];
	const action = actions[parts.at(-1) ?? '']?.[index];
	if (!resource || !action) return code;
	const subject = parts.length === 3 ? nouns[parts[1]]?.[index] : undefined;
	if (language === 'ja') return `${subject ?? resource}の${action}`;
	return `${action.charAt(0).toUpperCase()}${action.slice(1)} ${subject ?? resource}`;
}
