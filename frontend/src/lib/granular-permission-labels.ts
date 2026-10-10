const resources: Record<string, [string, string]> = {
	employees: ['社員', 'Employees'], masters: ['マスターデータ', 'Master data'], branches: ['拠点', 'Branches'],
	rooms: ['部屋', 'Rooms'], storage: ['保管場所', 'Storage'], assets: ['IT資産', 'IT assets'],
	calendars: ['勤務カレンダー', 'Work calendars'], financial: ['経営状況', 'Financial data'],
	roles: ['ロール', 'Roles'], system: ['外部リンク', 'External links']
};

const nouns: Record<string, [string, string]> = {
	credentials: ['認証情報', 'credentials'], entries: ['日付', 'entries'], holidays: ['祝日', 'holidays'],
	settings: ['設定', 'settings'], rates: ['為替レート', 'exchange rates'], links: ['外部リンク', 'external links']
};

const actions: Record<string, [string, string]> = {
	create: ['追加', 'create'], update: ['変更', 'update'], delete: ['削除', 'delete'],
	reorder: ['並べ替え', 'reorder'], assign: ['割当', 'assign'], return: ['返却', 'return'],
	view: ['閲覧', 'view'], access: ['アクセス', 'access'], import: ['取込', 'import'],
	read: ['閲覧', 'read'], preview: ['プレビュー', 'preview'], publish: ['公開', 'publish'],
	refresh: ['更新', 'refresh'], invite: ['招待', 'invite']
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
