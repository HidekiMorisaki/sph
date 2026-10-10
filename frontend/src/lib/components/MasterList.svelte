<script lang="ts">
	import { localization } from '$lib/localization';
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { onMount, tick, untrack, type Snippet } from 'svelte';
	import MenuItemIcon from '$lib/components/MenuItemIcon.svelte';
	import SearchInput from '$lib/components/SearchInput.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import '$lib/styles/page-size-picker.css';
	import '$lib/styles/action-menu.css';

	let commonText = $derived(localeMessages[$localization.displayLanguage].common);

	type Row = { id: number; [key: string]: any };
	type Permission = boolean | ((item: Row) => boolean);
	type Column = { key: string; label: string; value?: (item: any) => string | number | null | undefined; cell?: Snippet<[any]>; width?: number; sortable?: boolean; searchKeys?: string[] };
	type TreeParent = { id: number; label: string; order?: number; ancestor?: { id: number; label: string; order?: number } };
	type TreeGroup = { id: number; label: string; order?: number; children: Row[]; groups: TreeGroup[] };
	let { endpoint, columns, title, listHeading, description, initialSortBy = 'code', pageSizeStorageKey, sortStorageKey, minTableWidth = 720, actionWidth = 5, searchParam = 'search', queryParams = {}, edgePagination = true, unpaged = false, hideColumnHeaders = false, showNameIcon = false, treeParent, canManage = false, canDetail, canEdit, canDelete, actionLabel, usageLabel, headerActions, toolbarFilters, loadingLabel, emptyLabel, reorderEndpoint, reorderHint, reorderSavingLabel, onReorderError, onReordered, onDetail, onEdit, onDelete }: {
		endpoint: string; columns: Column[]; title: string; listHeading?: string; description?: string; initialSortBy?: string; pageSizeStorageKey?: string; sortStorageKey?: string; minTableWidth?: number; actionWidth?: number; searchParam?: string; queryParams?: Record<string, string | number | boolean>; edgePagination?: boolean; unpaged?: boolean; hideColumnHeaders?: boolean; showNameIcon?: boolean; treeParent?: (item: Row) => TreeParent | null; canManage?: boolean; canDetail?: Permission; canEdit?: Permission; canDelete?: Permission; actionLabel?: (item: Row) => string; usageLabel?: (count: number) => string; headerActions?: Snippet; toolbarFilters?: Snippet; loadingLabel?: string; emptyLabel?: string; reorderEndpoint?: string; reorderHint?: string; reorderSavingLabel?: string; onReorderError?: (reason: 'conflict' | 'forbidden' | 'failed') => void; onReordered?: (orderedIds: number[]) => void;
		onDetail?: (item: Row, trigger: HTMLElement | null) => void;
		onEdit?: (item: Row, trigger: HTMLButtonElement | null) => void;
		onDelete?: (item: Row) => Promise<void> | void;
	} = $props();
	let showActions = $derived(Boolean(onDetail || canManage || canDetail !== undefined || canEdit !== undefined || canDelete !== undefined));
	let visibleSearchKeys = $derived([...new Set(columns.flatMap((column) => column.searchKeys ?? []))].join(','));
	let visibleSearchSignature = $derived(`${visibleSearchKeys}|${$localization.displayLanguage}`);
	let searchSignatureReady = false;
	let storageKey = $derived(pageSizeStorageKey ?? `master-size:${endpoint}`);
	let persistedSortKey = $derived(sortStorageKey ?? '');
	let items = $state<Row[]>([]);
	let loadedEndpoint = '';
	let expandedParents = $state<string[]>([]);
	let treeGroups = $derived.by(() => {
		const groups = new Map<number, TreeGroup>();
		if (treeParent) for (const item of items) {
			const parent = treeParent(item);
			if (!parent) continue;
			const root = parent.ancestor ?? parent;
			if (!groups.has(root.id)) groups.set(root.id, { ...root, children: [], groups: [] });
			const group = groups.get(root.id)!;
			if (parent.ancestor) {
				let subgroup = group.groups.find((candidate) => candidate.id === parent.id);
				if (!subgroup) { subgroup = { ...parent, children: [], groups: [] }; group.groups.push(subgroup); }
				subgroup.children.push(item);
			} else group.children.push(item);
		}
		const byOrder = (left: TreeGroup, right: TreeGroup) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) || left.id - right.id;
		return [...groups.values()].sort(byOrder).map((group) => ({ ...group, groups: group.groups.sort(byOrder) }));
	});
	function toggleParent(key: string) { expandedParents = expandedParents.includes(key) ? expandedParents.filter((item) => item !== key) : [...expandedParents, key]; }
	let total = $state(0);
	let search = $state('');
	let appliedSearch = $state('');
	let page = $state(1);
	let pageSize = $state(10);
	let sortBy = $state('');
	let activeSortBy = $derived(sortBy || initialSortBy);
	let sortOrder = $state<'asc' | 'desc'>('asc');
	let loading = $state(false);
	let error = $state<'signInRequired' | 'loadFailed' | ''>('');
	let errorDismissed = $state(false);
	let sizeOpen = $state(false);
	let sizeTrigger=$state<HTMLButtonElement>();
	let menuItem = $state<Row | null>(null);
	let menuTop = $state(0);
	let menuLeft = $state(0);
	let menuTrigger: HTMLButtonElement | null = null;
	let draggedId = $state<number | null>(null);
	let dropTargetId = $state<number | null>(null);
	let dropAfter = $state(false);
	let reorderSaving = $state(false);
	let suppressMenuClick = false;
	let pointerStart: { id: number; pointerId: number; x: number; y: number } | null = null;
	let timer: number;
	let controller: AbortController | null = null;
	let queryParamsReady = false;
	let queryParamsKey = $derived(JSON.stringify(queryParams));
	const sizes = [10, 20, 30, 40, 50];
	let pageCount = $derived(Math.max(1, Math.ceil(total / pageSize)));
	let first = $derived(total ? (page - 1) * pageSize + 1 : 0);
	let last = $derived(Math.min(page * pageSize, total));
	let pageNumbers = $derived.by((): Array<number | 'ellipsis'> => {
		if (!edgePagination) return Array.from({ length: Math.min(5, pageCount) }, (_, i) => Math.max(1, Math.min(page - 2, pageCount - 4)) + i);
		if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
		const values: Array<number | 'ellipsis'> = [1];
		if (page > 4) values.push('ellipsis');
		for (let value = Math.max(2, page - 1); value <= Math.min(pageCount - 1, page + 1); value += 1) values.push(value);
		if (page < pageCount - 3) values.push('ellipsis');
		values.push(pageCount);
		return values;
	});
	const permitted = (permission: Permission | undefined, fallback: boolean, item: Row) => typeof permission === 'function' ? permission(item) : permission ?? fallback;
	const detailAllowed = (item: Row) => Boolean(onDetail) && permitted(canDetail, Boolean(onDetail), item);
	const itemLabel = (item: Row) => String(actionLabel?.(item) ?? item.name ?? item.displayName ?? item.code ?? item.id);
	const usageLabelFor = (count: number) => usageLabel?.(count) ?? formatLocaleTemplate(count === 1 ? commonText.usedOne : commonText.usedMany, count);
	function rowClick(event: MouseEvent, item: Row) {
		if (!detailAllowed(item)) return;
		const target = event.target;
		if (target instanceof Element && target.closest('button,a,input,select,textarea,label,[role="button"],[role="menuitem"],[contenteditable="true"]')) return;
		const row = event.currentTarget as HTMLTableRowElement;
		const selection = window.getSelection();
		if (selection && !selection.isCollapsed && selection.toString() && (row.contains(selection.anchorNode) || row.contains(selection.focusNode))) return;
		closeMenu();
		onDetail?.(item, row);
	}
	function rowKeydown(event: KeyboardEvent, item: Row) {
		if (!detailAllowed(item) || event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
		event.preventDefault();
		closeMenu();
		onDetail?.(item, event.currentTarget as HTMLTableRowElement);
	}
	function closeMenu(focus = false) { menuItem = null; if (focus) menuTrigger?.focus(); }
	function openMenu(event: MouseEvent, item: Row) {
		if (suppressMenuClick || reorderSaving) { event.preventDefault(); return; }
		if (menuItem?.id === item.id) { closeMenu(true); return; }
		menuTrigger = event.currentTarget as HTMLButtonElement;
		const rect = menuTrigger.getBoundingClientRect();
		const menuHeight = 132;
		menuTop = rect.bottom + menuHeight + 4 <= window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4);
		menuLeft = Math.max(8, Math.min(rect.right - 160, window.innerWidth - 168));
		menuItem = item;
		void tick().then(()=>document.querySelector<HTMLButtonElement>('.master-menu [role="menuitem"]:not(:disabled)')?.focus());
	}
	function pointerDown(event: PointerEvent, item: Row) {
		if (!reorderEndpoint || !canManage || reorderSaving || items.length < 2 || !event.isPrimary || event.button !== 0) return;
		pointerStart = { id: item.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
		(event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
	}
	function pointerMove(event: PointerEvent) {
		if (!pointerStart || pointerStart.pointerId !== event.pointerId) return;
		if (draggedId === null) {
			if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) < 5) return;
			closeMenu(); draggedId = pointerStart.id;
		}
		const button = event.currentTarget as HTMLButtonElement;
		const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLTableRowElement>('tr[data-row-id]');
		const source = items.find((item) => item.id === draggedId);
		const target = items.find((item) => item.id === Number(row?.dataset.rowId));
		if (!row || row.closest('.master-list') !== button.closest('.master-list') || !source || !target || target.id === draggedId || (treeParent && treeParent(source)?.id !== treeParent(target)?.id)) { dropTargetId = null; return; }
		dropTargetId = Number(row.dataset.rowId);
		const rect = row.getBoundingClientRect();
		dropAfter = event.clientY >= rect.top + rect.height / 2;
	}
	function pointerCancel() {
		pointerStart = null;
		draggedId = null; dropTargetId = null;
	}
	function pointerUp(event: PointerEvent) {
		if (!pointerStart || pointerStart.pointerId !== event.pointerId) return;
		const sourceId = draggedId;
		const targetId = dropTargetId;
		const after = dropAfter;
		pointerCancel();
		if (sourceId === null) return;
		suppressMenuClick = true;
		window.setTimeout(() => { suppressMenuClick = false; }, 150);
		if (targetId !== null) void moveItem(sourceId, targetId, after);
	}
	function reorderKeydown(event: KeyboardEvent, item: Row) {
		if (!reorderEndpoint || !canManage || reorderSaving || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
		event.preventDefault();
		const siblings = treeParent ? items.filter((row) => treeParent(row)?.id === treeParent(item)?.id) : items;
		const index = siblings.findIndex((row) => row.id === item.id);
		const target = siblings[index + (event.key === 'ArrowUp' ? -1 : 1)];
		if (target) void moveItem(item.id, target.id, event.key === 'ArrowDown');
	}
	async function moveItem(sourceId: number, targetId: number, after: boolean) {
		if (!reorderEndpoint || reorderSaving) return;
		const previous = items;
		const source = previous.find((row) => row.id === sourceId);
		const target = previous.find((row) => row.id === targetId);
		if (!source || !target || (treeParent && treeParent(source)?.id !== treeParent(target)?.id)) return;
		const siblings = treeParent ? previous.filter((row) => treeParent(row)?.id === treeParent(source)?.id) : previous;
		const reordered = siblings.filter((row) => row.id !== sourceId);
		const targetIndex = reordered.findIndex((row) => row.id === targetId);
		if (targetIndex < 0) return;
		reordered.splice(targetIndex + (after ? 1 : 0), 0, source);
		let siblingIndex = 0;
		const next = treeParent ? previous.map((row) => treeParent(row)?.id === treeParent(source)?.id ? reordered[siblingIndex++] : row) : reordered;
		if (next.every((row, index) => row.id === previous[index].id)) return;
		items = next;
		reorderSaving = true;
		try {
			const response = await fetch(reorderEndpoint, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedIds: previous.map((row) => row.id), orderedIds: next.map((row) => row.id) }) });
			if (!response.ok) { onReorderError?.(response.status === 409 ? 'conflict' : response.status === 403 ? 'forbidden' : 'failed'); items = previous; }
			else onReordered?.(next.map((row) => row.id));
			await refresh();
		} catch { items = previous; onReorderError?.('failed'); await refresh(); }
		finally { reorderSaving = false; }
	}
	export async function refresh() {
		closeMenu();
		controller?.abort();
		const current = new AbortController(); controller = current;
		loading = !unpaged || !items.length || loadedEndpoint !== endpoint; error = ''; errorDismissed = false;
		try {
			const collected: Row[] = [];
			let nextTotal = 0;
			do {
				const params = new URLSearchParams({ offset: String(unpaged ? collected.length : (page - 1) * pageSize), limit: String(unpaged ? 500 : pageSize), sortBy: activeSortBy, sortOrder });
				if (!unpaged && appliedSearch) params.set(searchParam, appliedSearch);
				if (!unpaged && appliedSearch && visibleSearchKeys) { params.set('visibleSearch', visibleSearchKeys); params.set('searchLocale', $localization.displayLanguage); }
				for (const [key, value] of Object.entries(queryParams)) params.set(key, String(value));
				const response = await fetch(`${endpoint}?${params}`, { signal: current.signal });
				if (!response.ok) throw new Error(response.status===401?'signInRequired':'loadFailed');
				const payload = await response.json() as { data: Row[]; meta: { total: number } };
				if (current.signal.aborted) throw new DOMException('Aborted', 'AbortError');
				if (unpaged && !payload.data.length && collected.length < payload.meta.total) throw new Error('loadFailed');
				collected.push(...payload.data);
				nextTotal = payload.meta.total;
			} while (unpaged && collected.length < nextTotal);
			items = collected; total = nextTotal; loadedEndpoint = endpoint;
			if (!unpaged && page > Math.max(1, Math.ceil(total / pageSize))) { page = Math.max(1, Math.ceil(total / pageSize)); void refresh(); }
		} catch (cause) {
			if (controller === current && !(cause instanceof DOMException && cause.name === 'AbortError')) error = cause instanceof Error && cause.message === 'signInRequired' ? 'signInRequired' : 'loadFailed';
		} finally { if (controller === current) loading = false; }
	}
	function searchChanged(value: string) {
		search = value;
		clearTimeout(timer);
		timer = window.setTimeout(() => { appliedSearch = search.trim(); page = 1; void refresh(); }, 350);
	}
	function changeSort(key: string) { const nextOrder = activeSortBy === key && sortOrder === 'asc' ? 'desc' : 'asc'; sortOrder = nextOrder; sortBy = key; if (persistedSortKey) localStorage.setItem(persistedSortKey, JSON.stringify({ field: key, order: nextOrder })); page = 1; void refresh(); }
	function changePage(next: number) { if (next < 1 || next > pageCount || next === page) return; page = next; void refresh(); }
	function changeSize(next: number) { pageSize = next; page = 1; sizeOpen = false; localStorage.setItem(storageKey, String(next));sizeTrigger?.focus(); void refresh(); }
	function focusSize(index:number){void tick().then(()=>document.querySelectorAll<HTMLButtonElement>('.page-size-options button')[Math.max(0,Math.min(index,sizes.length-1))]?.focus());}
	function sizeTriggerKeydown(event:KeyboardEvent){if(['Enter',' ','ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();sizeOpen=true;focusSize(Math.max(0,sizes.indexOf(pageSize)));}}
	function sizeOptionKeydown(event:KeyboardEvent,index:number){if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();focusSize(event.key==='Home'?0:event.key==='End'?sizes.length-1:event.key==='ArrowDown'?index+1:index-1);}else if(event.key==='Escape'){event.preventDefault();sizeOpen=false;sizeTrigger?.focus();}else if(event.key==='Tab'){sizeOpen=false;}}
	$effect(() => { endpoint; initialSortBy; storageKey; persistedSortKey; searchParam; unpaged; if (typeof window !== 'undefined') { page = 1; search = ''; appliedSearch = ''; let nextSortBy = initialSortBy; let nextSortOrder: 'asc' | 'desc' = 'asc'; if (persistedSortKey) { try { const storedSort = JSON.parse(localStorage.getItem(persistedSortKey) ?? 'null') as { field?: unknown; order?: unknown } | null; const allowed = untrack(() => columns.some((column) => column.key === storedSort?.field && column.sortable !== false)); if (storedSort && typeof storedSort.field === 'string' && allowed && (storedSort.order === 'asc' || storedSort.order === 'desc')) { nextSortBy = storedSort.field; nextSortOrder = storedSort.order; } else if (localStorage.getItem(persistedSortKey) !== null) localStorage.removeItem(persistedSortKey); } catch { localStorage.removeItem(persistedSortKey); } } sortBy = nextSortBy; sortOrder = nextSortOrder; if (!unpaged) { const stored = Number(localStorage.getItem(storageKey)); pageSize = sizes.includes(stored) ? stored : 10; } untrack(() => void refresh()); } });
	$effect(() => { queryParamsKey; if (typeof window !== 'undefined') { if (queryParamsReady) { page = 1; untrack(() => void refresh()); } else queryParamsReady = true; } });
	$effect(() => { visibleSearchSignature; if (typeof window !== 'undefined') { if (searchSignatureReady && untrack(() => appliedSearch)) { page = 1; untrack(() => void refresh()); } else searchSignatureReady = true; } });
	onMount(() => {
		const outside = (event: MouseEvent) => { if (!(event.target as Element).closest('.master-menu,.master-kebab,.page-size-picker')) { closeMenu(); sizeOpen = false; } };
		const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { if(menuItem)closeMenu(true);else if(sizeOpen)sizeTrigger?.focus();sizeOpen = false; } };
		const scroll = () => closeMenu();
		document.addEventListener('click', outside); document.addEventListener('keydown', key); window.addEventListener('scroll', scroll, true);
		return () => { document.removeEventListener('click', outside); document.removeEventListener('keydown', key); window.removeEventListener('scroll', scroll, true); clearTimeout(timer); controller?.abort(); };
	});
</script>

{#snippet paginationControls()}
	<button type="button" aria-label={commonText.firstPage} disabled={page === 1} onclick={() => changePage(1)}>&lt;&lt;</button>
	<button type="button" aria-label={commonText.previousPage} disabled={page === 1} onclick={() => changePage(page - 1)}>&lt;</button>
	<span class="pagination-numbers">{#each pageNumbers as number}{#if number === 'ellipsis'}<span class="pagination-ellipsis" aria-hidden="true">…</span>{:else}<button type="button" aria-current={number === page ? 'page' : undefined} onclick={() => changePage(number)}>{number}</button>{/if}{/each}</span>
	<button type="button" aria-label={commonText.nextPage} disabled={page === pageCount} onclick={() => changePage(page + 1)}>&gt;</button>
	<button type="button" aria-label={commonText.lastPage} disabled={page === pageCount} onclick={() => changePage(pageCount)}>&gt;&gt;</button>
{/snippet}

{#snippet itemRow(item: Row, treeDepth: 0 | 1 | 2)}
			{@const canOpenDetail = detailAllowed(item)}
			<tr data-row-id={item.id} class:detail-row={canOpenDetail} class:tree-child={treeDepth > 0} class:tree-grandchild={treeDepth === 2} class:drag-source={draggedId === item.id} class:drop-before={dropTargetId === item.id && !dropAfter} class:drop-after={dropTargetId === item.id && dropAfter} tabindex={canOpenDetail ? 0 : undefined} aria-label={canOpenDetail ? formatLocaleTemplate(commonText.viewDetails, itemLabel(item)) : undefined} onclick={(event) => rowClick(event, item)} onkeydown={(event) => rowKeydown(event, item)}>
				{#each columns as column, index}<td style:padding-left={index === 0 && treeDepth > 0 ? treeDepth === 2 ? '58px' : '38px' : undefined}>{#if column.cell}{@render column.cell(item)}{:else}{@const value = column.value?.(item) ?? ''}{#if showNameIcon && column.key === 'name'}<span class="name-with-icon">{#if reorderEndpoint && canManage && items.length > 1}<button class="name-reorder-handle" class:dragging={draggedId === item.id} type="button" disabled={reorderSaving} aria-label={`${reorderHint}: ${itemLabel(item)}`} title={reorderHint} onpointerdown={(event) => pointerDown(event, item)} onpointermove={pointerMove} onpointerup={pointerUp} onpointercancel={pointerCancel} onkeydown={(event) => reorderKeydown(event, item)}><svg class="name-hamburger-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg></button>{:else}<svg class="name-hamburger-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>{/if}<span class="name-icon-label">{value}</span>{#if typeof item.usageCount === 'number'}<span class="usage-badge" aria-label={usageLabelFor(item.usageCount)} title={usageLabelFor(item.usageCount)}>{item.usageCount}</span>{/if}</span>{:else if ['name', 'displayName'].includes(column.key) && typeof item.usageCount === 'number'}<span class="name-with-usage"><span>{value}</span><span class="usage-badge" aria-label={usageLabelFor(item.usageCount)} title={usageLabelFor(item.usageCount)}>{item.usageCount}</span></span>{:else}{value}{/if}{/if}</td>{/each}
				{#if showActions}<td class="actions-cell"><button class="kebab-button master-kebab" type="button" disabled={reorderSaving} aria-label={formatLocaleTemplate(commonText.actionsFor, itemLabel(item))} aria-haspopup="menu" aria-expanded={menuItem?.id === item.id} onclick={(event) => openMenu(event, item)}><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg></button></td>{/if}
			</tr>
{/snippet}

<div class="master-list">
<header class="master-header"><div><h2>{listHeading ?? formatLocaleTemplate(commonText.allItems, title.toLowerCase())}</h2>{#if description !== ''}<p>{description ?? commonText.description}</p>{/if}</div>{#if headerActions}<div class="master-header-actions">{@render headerActions()}</div>{/if}</header>
{#if !unpaged}
<div class="master-toolbar">
	<div class="master-toolbar-main">
	<div class="master-toolbar-filters"><SearchInput label={formatLocaleTemplate(commonText.searchLabel, title)} value={search} onValueChange={searchChanged} />{#if toolbarFilters}{@render toolbarFilters()}{/if}</div>
	<div class="page-size">{commonText.showPrefix} <div class="page-size-picker"><button bind:this={sizeTrigger} class="page-size-trigger" type="button" aria-haspopup="listbox" aria-expanded={sizeOpen} onclick={() => sizeOpen = !sizeOpen} onkeydown={sizeTriggerKeydown}><span>{pageSize}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg></button>{#if sizeOpen}<div class="page-size-options" role="listbox" aria-label={commonText.entriesPerPage}>{#each sizes as size,index}<button type="button" role="option" aria-selected={pageSize === size} class:selected={pageSize === size} onclick={() => changeSize(size)} onkeydown={(event)=>sizeOptionKeydown(event,index)}>{size}</button>{/each}</div>{/if}</div> {commonText.showSuffix}</div>
	</div>
	<div class="master-toolbar-pagination"><p>{formatLocaleTemplate(commonText.showing, first, last, total)}</p><nav aria-label={formatLocaleTemplate(commonText.pages, title)}>{@render paginationControls()}</nav></div>
</div>
{/if}
<div class="master-scroll" onscroll={() => closeMenu()}>
	<table style={`min-width:${minTableWidth}px`}>
		<colgroup>{#each columns as column}<col style={`width:${column.width ?? (showActions ? 100 - actionWidth : 100) / columns.length}%`} />{/each}{#if showActions}<col class="actions-column" style={`width:${actionWidth}%`} />{/if}</colgroup>
		<thead class:sr-only={hideColumnHeaders}><tr>{#each columns as column}<th aria-sort={hideColumnHeaders || column.sortable === false ? undefined : activeSortBy === column.key ? sortOrder === 'asc' ? 'ascending' : 'descending' : 'none'}>{#if hideColumnHeaders || column.sortable === false}<span class="column-label">{column.label}</span>{:else}<button type="button" class="sort-button" onclick={() => changeSort(column.key)}>{column.label}<span class="sort-indicator" class:ascending={activeSortBy === column.key && sortOrder === 'asc'} class:descending={activeSortBy === column.key && sortOrder === 'desc'} aria-hidden="true"></span></button>{/if}</th>{/each}{#if showActions}<th><span class="sr-only">{commonText.rowActions}</span></th>{/if}</tr></thead>
		<tbody>
			{#if loading}<tr><td class="empty" colspan={columns.length + (showActions ? 1 : 0)}>{loadingLabel ?? commonText.loading}</td></tr>
			{:else if error}<tr><td class="empty" colspan={columns.length + (showActions ? 1 : 0)}>{#if !errorDismissed}<StatusNotice message={commonText[error]} tone="error" onDismiss={() => errorDismissed = true} />{/if}</td></tr>
			{:else if !items.length}<tr><td class="empty" colspan={columns.length + (showActions ? 1 : 0)}>{emptyLabel ?? commonText.noItems}</td></tr>
			{:else if treeParent}
				{#each treeGroups as group (group.id)}
					{@const rootKey = `root:${group.id}`}
					<tr class="tree-parent-row"><td colspan={columns.length + (showActions ? 1 : 0)}><button type="button" class="tree-toggle" aria-expanded={expandedParents.includes(rootKey)} onclick={() => toggleParent(rootKey)}><span class="tree-chevron" aria-hidden="true"></span><span>{group.label}</span></button></td></tr>
					{#if expandedParents.includes(rootKey)}
						{#each group.children as item (item.id)}{@render itemRow(item, 1)}{/each}
						{#each group.groups as subgroup (subgroup.id)}
							{@const childKey = `child:${group.id}:${subgroup.id}`}
							<tr class="tree-parent-row tree-subparent-row"><td colspan={columns.length + (showActions ? 1 : 0)}><button type="button" class="tree-toggle" aria-expanded={expandedParents.includes(childKey)} onclick={() => toggleParent(childKey)}><span class="tree-chevron" aria-hidden="true"></span><span>{subgroup.label}</span></button></td></tr>
							{#if expandedParents.includes(childKey)}{#each subgroup.children as item (item.id)}{@render itemRow(item, 2)}{/each}{/if}
						{/each}
					{/if}
				{/each}
			{:else}{#each items as item (item.id)}{@render itemRow(item, 0)}{/each}{/if}
		</tbody>
	</table>
</div>
{#if !unpaged}<footer class="master-footer"><p>{formatLocaleTemplate(commonText.showing, first, last, total)}</p><nav aria-label={formatLocaleTemplate(commonText.pages, title)}>{@render paginationControls()}</nav></footer>{/if}
</div>
{#if reorderSaving}<span class="sr-only" role="status">{reorderSavingLabel}</span>{/if}
{#if menuItem}<div class="menu-popover master-menu" role="menu" style={`top:${menuTop}px;left:${menuLeft}px`}><button type="button" role="menuitem" disabled={!onDetail || !permitted(canDetail, Boolean(onDetail), menuItem)} onclick={() => { const item = menuItem; const trigger = menuTrigger; closeMenu(); if (item && permitted(canDetail, Boolean(onDetail), item)) onDetail?.(item, trigger); }}><MenuItemIcon name="detail" />{commonText.detail}</button><button type="button" role="menuitem" disabled={!onEdit || !permitted(canEdit, canManage, menuItem)} onclick={() => { const item = menuItem; const trigger = menuTrigger; closeMenu(); if (item && permitted(canEdit, canManage, item)) onEdit?.(item, trigger); }}><MenuItemIcon name="edit" />{commonText.edit}</button><div class="menu-separator"></div><button type="button" class="delete-item" role="menuitem" disabled={!onDelete || !permitted(canDelete, canManage, menuItem)} onclick={() => { const item = menuItem; closeMenu(); if (item && permitted(canDelete, canManage, item)) void onDelete?.(item); }}><MenuItemIcon name="delete" />{commonText.delete}</button></div>{/if}

<style>
	.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
	.master-list{display:flex;min-width:0;max-height:calc(100dvh - 200px);flex-direction:column;overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}
	.master-header{display:flex;flex:none;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border-light)}
	.master-header h2{margin:0;color:var(--text);font-size:var(--font-size-section)}
	.master-header p{margin:1px 0 0;color:var(--muted);font-size:var(--font-size-support)}
	.master-header-actions{display:flex;align-items:center;gap:8px}
	.master-toolbar{display:flex;flex:none;flex-direction:column;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-light)}
	.master-toolbar-main,.master-toolbar-pagination{display:flex;align-items:center;justify-content:space-between;gap:12px}
	.master-toolbar-filters{display:flex;min-width:0;align-items:center;gap:12px}
	.master-toolbar-pagination{padding-top:12px;border-top:1px solid var(--border-light)}
	.master-toolbar-pagination p{flex:none;margin:0;color:var(--muted);font-size:var(--font-size-support)}
	.master-toolbar-pagination nav{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-left:auto}
	.master-toolbar-pagination .pagination-numbers{display:contents}
	.master-scroll{min-height:0;overflow:auto}
	table{width:100%;min-width:720px;table-layout:fixed;border-collapse:collapse;font-size:var(--font-size-body)}
	th{position:sticky;top:0;z-index:2;padding:8px 16px;background:var(--surface-secondary);color:var(--muted);font-size:var(--font-size-support);font-weight:700;letter-spacing:.3px;text-align:left;text-transform:uppercase}
	td{padding:8px 16px;color:var(--text-secondary);font-size:var(--font-size-body);vertical-align:middle;border-bottom:1px solid var(--border-light);overflow-wrap:anywhere}
	.empty{height:96px;color:var(--muted);text-align:center}
	.column-label{text-transform:uppercase}
	tbody tr:hover{background:var(--surface-secondary)}
	tbody tr.detail-row{cursor:pointer}
	.tree-parent-row{background:color-mix(in srgb,var(--surface-secondary) 30%,var(--surface))}
	.tree-parent-row td{padding:0 12px!important}
	.tree-subparent-row td{padding-left:32px!important}
	.tree-subparent-row{background:color-mix(in srgb,var(--surface-secondary) 18%,var(--surface))}
	.tree-toggle{display:flex;width:100%;align-items:center;gap:9px;padding:10px 4px;background:transparent;border:0;color:var(--text-secondary);font:inherit;font-weight:400;text-align:left;cursor:pointer}
	.tree-toggle:focus-visible{outline:2px solid #1abb9c;outline-offset:-2px}
	.tree-chevron{width:8px;height:8px;flex:none;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(-45deg)}
	.tree-toggle[aria-expanded='true'] .tree-chevron{transform:rotate(45deg)}
	.tree-child td:first-child{position:relative;padding-left:38px}
	.tree-child td:first-child::before{position:absolute;top:0;left:20px;width:10px;height:50%;border-left:1px solid var(--border);border-bottom:1px solid var(--border);content:''}
	.tree-grandchild td:first-child{padding-left:58px}
	.tree-grandchild td:first-child::before{left:40px}
	tbody tr.drag-source{opacity:.45}
	tbody tr.drop-before td{box-shadow:inset 0 3px #1abb9c}
	tbody tr.drop-after td{box-shadow:inset 0 -3px #1abb9c}
	tbody tr.detail-row:focus-visible{position:relative;z-index:1;outline:2px solid #1abb9c;outline-offset:-2px}
	tbody tr:last-child td{border-bottom:0}
	.name-with-usage{display:flex;min-width:0;align-items:center;gap:7px}.name-with-usage>span:first-child{min-width:0;overflow-wrap:anywhere}.usage-badge{display:inline-flex;flex:none;align-items:center;justify-content:center;min-width:24px;min-height:24px;padding:2px 6px;background:rgba(51,122,183,.12);color:#337ab7;border:1px solid rgba(51,122,183,.28);border-radius:999px;font-size:var(--font-size-support);font-weight:700;line-height:1}
	.name-with-icon{display:flex;min-width:0;align-items:center;gap:9px}.name-hamburger-icon{width:16px;height:16px;flex:none;color:var(--muted)}.name-icon-label{min-width:0;flex:0 1 auto;overflow-wrap:anywhere}
	.name-reorder-handle{display:inline-flex;width:28px;height:28px;flex:none;align-items:center;justify-content:center;margin:-4px;padding:0;background:transparent!important;border:0;border-radius:4px;color:var(--muted)!important;touch-action:none;user-select:none}
	.name-reorder-handle:hover{background:var(--surface-secondary)!important;cursor:grab}
	.name-reorder-handle.dragging{cursor:grabbing}
	.name-reorder-handle:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
	.sort-button{display:inline-flex;align-items:center;gap:6px;margin:0;padding:0;background:transparent!important;color:var(--muted)!important;border:0;border-radius:2px;text-align:left;font:inherit;letter-spacing:inherit;text-transform:uppercase;cursor:pointer}
	.sort-button:focus-visible{outline:2px solid #1abb9c;outline-offset:3px}
	.sort-indicator{position:relative;flex:none;width:10px;height:14px;opacity:.75}
	.sort-indicator::before,.sort-indicator::after{position:absolute;left:1px;width:0;height:0;content:'';border-right:4px solid transparent;border-left:4px solid transparent}
	.sort-indicator::before{top:1px;border-bottom:4px solid var(--muted)}
	.sort-indicator::after{bottom:1px;border-top:4px solid var(--muted)}
	.sort-indicator.ascending::before{border-bottom-color:#1abb9c}
	.sort-indicator.ascending::after{opacity:.3}
	.sort-indicator.descending::before{opacity:.3}
	.sort-indicator.descending::after{border-top-color:#1abb9c}
	.actions-cell{text-align:right}
	.master-footer{display:flex;flex:none;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid var(--border-light)}
	.master-footer p{margin:0;color:var(--muted);font-size:var(--font-size-support)}
	.master-footer nav{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
	.master-footer .pagination-numbers{display:contents}
	.pagination-ellipsis{padding:0 4px;color:var(--muted)}
	.master-footer button,.master-toolbar-pagination button{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;margin:0;padding:0 8px;background:var(--surface)!important;color:var(--text-secondary)!important;border:1px solid var(--border);border-radius:4px;font-size:var(--font-size-body);font-weight:500}
	.master-footer button:hover:not(:disabled):not([aria-current='page']),.master-toolbar-pagination button:hover:not(:disabled):not([aria-current='page']){background:var(--surface-secondary)!important;color:var(--text)!important}
	.master-footer button[aria-current='page'],.master-toolbar-pagination button[aria-current='page']{background:#1abb9c!important;color:#fff!important;border-color:#169f85}
	.master-footer button:disabled,.master-toolbar-pagination button:disabled{cursor:not-allowed;opacity:.5}
	.master-footer button:focus-visible,.master-toolbar-pagination button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
	@media(max-width:700px){.master-list{max-height:none}.master-header,.master-toolbar-main,.master-toolbar-pagination,.master-footer,.master-toolbar-filters{align-items:stretch;flex-direction:column}.master-toolbar-pagination nav{margin-left:0}.master-header-actions{width:100%}.actions-column{width:18%!important}th:last-child,.actions-cell{padding-right:12px;padding-left:4px}}
</style>
