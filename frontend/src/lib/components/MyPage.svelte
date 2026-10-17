<script lang="ts">
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { roleNames, type SessionUser } from '$lib/auth';
	import { formatEmployeeName, localization } from '$lib/localization';
	import MasterPageHeader from './MasterPageHeader.svelte';
	import StatusNotice from './StatusNotice.svelte';
	import { onMount } from 'svelte';
	import { apiData } from '$lib/api';

	let { user }: { user: SessionUser } = $props();
	let pageText = $derived(localeMessages[$localization.displayLanguage].myPage);
	let noticeDismissed = $state(false);
	type Widget = { code: string; enabled: boolean; sortOrder: number };
	type BookNotice = { id: number; title: string; copyCode: string; dueOn: string; kind: 'overdue' | 'due_soon' };
	type BookLoan = { id: number; dueOn: string; returnedOn: string | null; copy: { copyCode: string; title: { name: string } } };
	let widgets = $state<Widget[]>([]);
	let notices = $state<BookNotice[]>([]);
	let loans = $state<BookLoan[]>([]);
	let widgetError = $state(false);
	let saving = $state(false);
	let labels = $derived($localization.displayLanguage === 'ja' ? { widgets: 'ウィジェット', book_notices: 'お知らせ', book_loans: '貸出中の書籍', account: 'アカウント', hide: '非表示', show: '表示', up: '上へ', down: '下へ', overdue: '期限超過', dueSoon: '返却期限間近', dueOn: '返却予定日', noNotices: 'お知らせはありません。', noLoans: '貸出中の書籍はありません。', loadFailed: '書籍ウィジェットを読み込めませんでした。' } : { widgets: 'Widgets', book_notices: 'Notices', book_loans: 'Books on loan', account: 'Account', hide: 'Hide', show: 'Show', up: 'Move up', down: 'Move down', overdue: 'Overdue', dueSoon: 'Due soon', dueOn: 'Due date', noNotices: 'No notices.', noLoans: 'No books on loan.', loadFailed: 'Unable to load book widgets.' });
	onMount(() => { void loadWidgets(); });
	async function loadWidgets() {
		try {
			const responses = await Promise.all([fetch('/v1/employees/me/widgets'), fetch('/v1/book-notices/me'), fetch('/v1/book-loans/me?limit=100')]);
			if (responses.some(response => !response.ok)) throw new Error('load');
			widgets = await apiData<Widget[]>(responses[0]);
			notices = await apiData<BookNotice[]>(responses[1]);
			loans = (await apiData<BookLoan[]>(responses[2])).filter(loan => !loan.returnedOn);
			widgetError = false;
		} catch { widgetError = true; }
	}
	async function saveWidgets(next: Widget[]) {
		saving = true;
		try {
			const response = await fetch('/v1/employees/me/widgets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
			if (!response.ok) throw new Error('save');
			widgets = await apiData<Widget[]>(response);
			widgetError = false;
		} catch { widgetError = true; } finally { saving = false; }
	}
	function toggle(code: string) { void saveWidgets(widgets.map(widget => widget.code === code ? { ...widget, enabled: !widget.enabled } : widget)); }
	function move(code: string, direction: number) {
		const next = [...widgets].sort((a, b) => a.sortOrder - b.sortOrder);
		const index = next.findIndex(widget => widget.code === code);
		const destination = index + direction;
		if (index < 0 || destination < 0 || destination >= next.length) return;
		[next[index], next[destination]] = [next[destination], next[index]];
		void saveWidgets(next.map((widget, sortOrder) => ({ ...widget, sortOrder })));
	}
</script>

<div aria-labelledby="my-page-title"><MasterPageHeader title={pageText.title} titleId="my-page-title" />
{#if !noticeDismissed}<StatusNotice message={pageText.underDevelopment} tone="info" onDismiss={() => noticeDismissed = true} />{/if}
{#if widgetError}<StatusNotice message={labels.loadFailed} tone="error" onDismiss={() => widgetError = false} />{/if}
<section class="panel widget-config"><h2>{labels.widgets}</h2><div class="widget-controls">{#each [...widgets].sort((a, b) => a.sortOrder - b.sortOrder) as widget}<div><strong>{labels[widget.code as keyof typeof labels] ?? widget.code}</strong><button type="button" disabled={saving} onclick={() => toggle(widget.code)}>{widget.enabled ? labels.hide : labels.show}</button><button type="button" disabled={saving || widget.sortOrder === 0} aria-label={`${labels.up}: ${widget.code}`} onclick={() => move(widget.code, -1)}>↑</button><button type="button" disabled={saving || widget.sortOrder === widgets.length - 1} aria-label={`${labels.down}: ${widget.code}`} onclick={() => move(widget.code, 1)}>↓</button></div>{/each}</div></section>
<div class="cards">{#each [...widgets].filter(widget => widget.enabled).sort((a, b) => a.sortOrder - b.sortOrder) as widget}
	{#if widget.code === 'book_notices'}<article><small>{labels.book_notices}</small>{#if notices.length}<ul>{#each notices as notice}<li><strong>{notice.kind === 'overdue' ? labels.overdue : labels.dueSoon}</strong> · {notice.title} ({notice.copyCode}) · {labels.dueOn}: {notice.dueOn.slice(0, 10)}</li>{/each}</ul>{:else}<span>{labels.noNotices}</span>{/if}</article>
	{:else if widget.code === 'book_loans'}<article><small>{labels.book_loans}</small>{#if loans.length}<ul>{#each loans as loan}<li>{loan.copy.title.name} ({loan.copy.copyCode}) · {labels.dueOn}: {loan.dueOn.slice(0, 10)}</li>{/each}</ul>{:else}<span>{labels.noLoans}</span>{/if}</article>
	{:else if widget.code === 'account'}<article><small>{labels.account}</small><b>{roleNames(user)}</b><span>{user.email ?? pageText.emailUnset}</span></article>{/if}
{/each}</div><section class="panel"><h2>{pageText.management}</h2><p>{pageText.sidebarHelp}</p></section></div>

<style>
  h2,p{margin:0}
  .cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:2px 0 26px}
  .cards article,.panel{padding:18px;background:var(--surface);border:1px solid var(--border);border-radius:7px;box-shadow:var(--shadow)}
  .cards small{display:block;margin-bottom:8px;color:var(--muted);font-size:var(--font-size-support);font-weight:700;letter-spacing:.07em}.cards b{display:block;margin:8px 0 4px;font-size:20px}.cards span,.panel p{color:var(--muted);font-size:var(--font-size-body)}.panel h2{margin-bottom:7px;font-size:var(--font-size-section)}
	.widget-config{margin-bottom:16px}.widget-controls{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.widget-controls>div{display:flex;align-items:center;gap:7px;padding:8px;border:1px solid var(--border);border-radius:8px}.widget-controls button{border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text);padding:4px 8px;font:inherit}.cards ul{padding-left:20px;margin:10px 0 0}.cards li{margin:6px 0;line-height:1.6}
	@media(max-width:760px){.cards{grid-template-columns:1fr}}
</style>
