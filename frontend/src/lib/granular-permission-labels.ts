const resources: Record<string, [string, string]> = {
 clients: ['取引先', 'Clients'],
 search_filters: ['個人用保存フィルター', 'Personal saved filters'],
	skills: ['スキル', 'Skills'], projects: ['案件', 'Projects'],
	teams: ['チーム', 'Teams'],
	books: ['書籍', 'Books'], employees: ['社員', 'Employees'], masters: ['マスターデータ', 'Master data'], branches: ['拠点', 'Branches'],
	rooms: ['部屋', 'Rooms'], storage: ['保管場所', 'Storage'], assets: ['IT資産', 'IT assets'],
	calendars: ['勤務カレンダー', 'Work calendars'], financial: ['経営状況', 'Financial data'],
	roles: ['ロール', 'Roles'], system: ['外部リンク', 'External links'], software: ['ソフトウェアライセンス', 'Software licenses']
};

const nouns: Record<string, [string, string]> = {
	skills: ['従業員スキル', 'employee skills'], participations: ['案件参画期間', 'project participations'], members: ['チームメンバー', 'team members'],
	purchases: ['購入依頼', 'purchase requests'], titles: ['書誌', 'book titles'], copies: ['現物', 'book copies'], reservations: ['予約', 'reservations'], loans: ['貸出', 'loans'], covers: ['カバー', 'covers'], credentials: ['認証情報', 'credentials'], entries: ['日付', 'entries'], holidays: ['祝日', 'holidays'],
	settings: ['設定', 'settings'], rates: ['為替レート', 'exchange rates'], links: ['外部リンク', 'external links'],
	products: ['ソフトウェア製品', 'software products'], contracts: ['契約', 'contracts'], keys: ['プロダクトキー', 'product keys'], assignments: ['割当', 'assignments'], installations: ['インストール記録', 'installation records'], usage: ['利用者記録', 'user records']
};

const actions: Record<string, [string, string]> = {
	add: ['追加', 'add'], remove: ['所属解除', 'remove'],
	manage: ['管理', 'manage'], cancel: ['取消', 'cancel'], create: ['追加', 'create'], update: ['変更', 'update'], delete: ['削除', 'delete'],
	reorder: ['並べ替え', 'reorder'], assign: ['割当', 'assign'], return: ['返却', 'return'],
	view: ['閲覧', 'view'], access: ['アクセス', 'access'], import: ['取込', 'import'],
	read: ['閲覧', 'read'], preview: ['プレビュー', 'preview'], publish: ['公開', 'publish'],
	refresh: ['更新', 'refresh'], invite: ['招待', 'invite'], release: ['解除', 'release'], reveal: ['開示', 'reveal'], end: ['終了', 'end']
};

export function granularPermissionLabel(code: string, language: 'ja' | 'en'): string {
	const parts = code.split('.');
	const index = language === 'ja' ? 0 : 1;
	const resource = resources[parts[0]]?.[index];
	const action = actions[parts.at(-1) ?? '']?.[index];
	if (!resource || !action) return code;
	const subject = parts.length === 3 ? nouns[parts[1]]?.[index] : undefined;
	if (language === 'ja') return `${subject ?? resource}の${action}`;
	return `${action.charAt(0).toUpperCase()}${action.slice(1)} ${subject ?? resource}`;
}
