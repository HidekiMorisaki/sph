<script lang="ts">
	import { onMount, tick, untrack, type Snippet } from 'svelte';
	import '$lib/styles/page-size-picker.css';
	import '$lib/styles/action-menu.css';

	type Row = { id: number; [key: string]: any };
	type Permission = boolean | ((item: Row) => boolean);
	type Column = { key: string; label: string; value?: (item: any) => string | number | null | undefined; cell?: Snippet<[any]>; width?: number; primary?: boolean; sortable?: boolean };
	let { endpoint, columns, title, listHeading, description = 'Sortable, searchable, paginated.', initialSortBy = 'code', pageSizeStorageKey, minTableWidth = 720, actionWidth = 5, searchParam = 'search', edgePagination = false, canManage = false, canDetail, canEdit, canDelete, actionLabel, headerActions, loadingLabel = 'Loading...', emptyLabel = 'No items found.', onDetail, onEdit, onDelete }: {
		endpoint: string; columns: Column[]; title: string; listHeading?: string; description?: string; initialSortBy?: string; pageSizeStorageKey?: string; minTableWidth?: number; actionWidth?: number; searchParam?: string; edgePagination?: boolean; canManage?: boolean; canDetail?: Permission; canEdit?: Permission; canDelete?: Permission; actionLabel?: (item: Row) => string; headerActions?: Snippet; loadingLabel?: string; emptyLabel?: string;
		onDetail?: (item: Row, trigger: HTMLButtonElement | null) => void;
		onEdit?: (item: Row, trigger: HTMLButtonElement | null) => void;
		onDelete?: (item: Row) => Promise<void> | void;
	} = $props();
	let showActions = $derived(Boolean(onDetail || canManage || canDetail !== undefined || canEdit !== undefined || canDelete !== undefined));
	let storageKey = $derived(pageSizeStorageKey ?? `master-size:${endpoint}`);
	let items = $state<Row[]>([]);
	let total = $state(0);
	let search = $state('');
	let appliedSearch = $state('');
	let page = $state(1);
	let pageSize = $state(10);
	let sortBy = $state('');
	let activeSortBy = $derived(sortBy || initialSortBy);
	let sortOrder = $state<'asc' | 'desc'>('asc');
	let loading = $state(false);
	let error = $state('');
	let sizeOpen = $state(false);
	let sizeTrigger=$state<HTMLButtonElement>();
	let menuItem = $state<Row | null>(null);
	let menuTop = $state(0);
	let menuLeft = $state(0);
	let menuTrigger: HTMLButtonElement | null = null;
	let timer: number;
	let controller: AbortController | null = null;
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
	function closeMenu(focus = false) { menuItem = null; if (focus) menuTrigger?.focus(); }
	function openMenu(event: MouseEvent, item: Row) {
		if (menuItem?.id === item.id) { closeMenu(true); return; }
		menuTrigger = event.currentTarget as HTMLButtonElement;
		const rect = menuTrigger.getBoundingClientRect();
		const menuHeight = 132;
		menuTop = rect.bottom + menuHeight + 4 <= window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4);
		menuLeft = Math.max(8, Math.min(rect.right - 160, window.innerWidth - 168));
		menuItem = item;
		void tick().then(()=>document.querySelector<HTMLButtonElement>('.master-menu [role="menuitem"]:not(:disabled)')?.focus());
	}
	export async function refresh() {
		closeMenu();
		controller?.abort();
		const current = new AbortController(); controller = current;
		loading = true; error = '';
		const params = new URLSearchParams({ offset: String((page - 1) * pageSize), limit: String(pageSize), sortBy: activeSortBy, sortOrder });
		if (appliedSearch) params.set(searchParam, appliedSearch);
		try {
			const response = await fetch(`${endpoint}?${params}`, { signal: current.signal });
			if (!response.ok) throw new Error(response.status===401?'Please sign in to continue.':'Unable to load data.');
			const payload = await response.json() as { data: Row[]; meta: { total: number } };
			items = payload.data; total = payload.meta.total;
			if (page > Math.max(1, Math.ceil(total / pageSize))) { page = Math.max(1, Math.ceil(total / pageSize)); void refresh(); }
		} catch (cause) {
			if (!(cause instanceof DOMException && cause.name === 'AbortError')) error = cause instanceof Error?cause.message:'Unable to load data.';
		} finally { if (controller === current) loading = false; }
	}
	function searchChanged(event: Event) {
		search = (event.currentTarget as HTMLInputElement).value;
		clearTimeout(timer);
		timer = window.setTimeout(() => { appliedSearch = search.trim(); page = 1; void refresh(); }, 350);
	}
	function changeSort(key: string) { sortOrder = activeSortBy === key && sortOrder === 'asc' ? 'desc' : 'asc'; sortBy = key; page = 1; void refresh(); }
	function changePage(next: number) { if (next < 1 || next > pageCount || next === page) return; page = next; void refresh(); }
	function changeSize(next: number) { pageSize = next; page = 1; sizeOpen = false; localStorage.setItem(storageKey, String(next));sizeTrigger?.focus(); void refresh(); }
	function focusSize(index:number){void tick().then(()=>document.querySelectorAll<HTMLButtonElement>('.page-size-options button')[Math.max(0,Math.min(index,sizes.length-1))]?.focus());}
	function sizeTriggerKeydown(event:KeyboardEvent){if(['Enter',' ','ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();sizeOpen=true;focusSize(Math.max(0,sizes.indexOf(pageSize)));}}
	function sizeOptionKeydown(event:KeyboardEvent,index:number){if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();focusSize(event.key==='Home'?0:event.key==='End'?sizes.length-1:event.key==='ArrowDown'?index+1:index-1);}else if(event.key==='Escape'){event.preventDefault();sizeOpen=false;sizeTrigger?.focus();}else if(event.key==='Tab'){sizeOpen=false;}}
	$effect(() => { endpoint; initialSortBy; storageKey; searchParam; if (typeof window !== 'undefined') { page = 1; search = ''; appliedSearch = ''; sortBy = initialSortBy; sortOrder = 'asc'; const stored = Number(localStorage.getItem(storageKey)); pageSize = sizes.includes(stored) ? stored : 10; untrack(() => void refresh()); } });
	onMount(() => {
		const outside = (event: MouseEvent) => { if (!(event.target as Element).closest('.master-menu,.master-kebab,.page-size-picker')) { closeMenu(); sizeOpen = false; } };
		const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { if(menuItem)closeMenu(true);else if(sizeOpen)sizeTrigger?.focus();sizeOpen = false; } };
		const scroll = () => closeMenu();
		document.addEventListener('click', outside); document.addEventListener('keydown', key); window.addEventListener('scroll', scroll, true);
		return () => { document.removeEventListener('click', outside); document.removeEventListener('keydown', key); window.removeEventListener('scroll', scroll, true); clearTimeout(timer); controller?.abort(); };
	});
</script>

<div class="master-list">
<header class="master-header"><div><h2>{listHeading ?? `All ${title.toLowerCase()}`}</h2><p>{description}</p></div>{#if headerActions}<div class="master-header-actions">{@render headerActions()}</div>{/if}</header>
<div class="master-toolbar">
	<label class="search-box"><span class="sr-only">Search {endpoint.split('/').at(-1)}</span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="7" cy="7" r="5" /><path d="M11 11l3.5 3.5" /></svg><input type="search" value={search} placeholder="Search..." oninput={searchChanged} /></label>
	<div class="page-size">Show <div class="page-size-picker"><button bind:this={sizeTrigger} class="page-size-trigger" type="button" aria-haspopup="listbox" aria-expanded={sizeOpen} onclick={() => sizeOpen = !sizeOpen} onkeydown={sizeTriggerKeydown}><span>{pageSize}</span><svg viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" /></svg></button>{#if sizeOpen}<div class="page-size-options" role="listbox" aria-label="Entries per page">{#each sizes as size,index}<button type="button" role="option" aria-selected={pageSize === size} class:selected={pageSize === size} onclick={() => changeSize(size)} onkeydown={(event)=>sizeOptionKeydown(event,index)}>{size}</button>{/each}</div>{/if}</div> entries</div>
</div>
<div class="master-scroll" onscroll={() => closeMenu()}>
	<table style={`min-width:${minTableWidth}px`}>
		<colgroup>{#each columns as column}<col style={`width:${column.width ?? (showActions ? 100 - actionWidth : 100) / columns.length}%`} />{/each}{#if showActions}<col style={`width:${actionWidth}%`} />{/if}</colgroup>
		<thead><tr>{#each columns as column}<th aria-sort={column.sortable === false ? undefined : activeSortBy === column.key ? sortOrder === 'asc' ? 'ascending' : 'descending' : 'none'}>{#if column.sortable === false}<span class="column-label">{column.label}</span>{:else}<button type="button" class="sort-button" onclick={() => changeSort(column.key)}>{column.label}<span class="sort-indicator" class:ascending={activeSortBy === column.key && sortOrder === 'asc'} class:descending={activeSortBy === column.key && sortOrder === 'desc'} aria-hidden="true"></span></button>{/if}</th>{/each}{#if showActions}<th><span class="sr-only">Row actions</span></th>{/if}</tr></thead>
		<tbody>{#if loading}<tr><td class="empty" colspan={columns.length + (showActions ? 1 : 0)}>{loadingLabel}</td></tr>{:else if error}<tr><td class="empty" colspan={columns.length + (showActions ? 1 : 0)}>{error}</td></tr>{:else if !items.length}<tr><td class="empty" colspan={columns.length + (showActions ? 1 : 0)}>{emptyLabel}</td></tr>{:else}{#each items as item (item.id)}<tr>{#each columns as column}<td>{#if column.cell}{@render column.cell(item)}{:else if column.primary}<strong>{column.value?.(item) ?? ''}</strong>{:else}{column.value?.(item) ?? ''}{/if}</td>{/each}{#if showActions}<td class="actions-cell"><button class="kebab-button master-kebab" type="button" aria-label={`Actions for ${actionLabel?.(item) ?? item.name ?? item.displayName ?? item.code ?? item.id}`} aria-haspopup="menu" aria-expanded={menuItem?.id === item.id} onclick={(event) => openMenu(event, item)}><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg></button></td>{/if}</tr>{/each}{/if}</tbody>
	</table>
</div>
<footer class="master-footer"><p>Showing {first}–{last} of {total}</p><nav aria-label={`${title} pages`}><button type="button" aria-label="First page" disabled={page === 1} onclick={() => changePage(1)}>&lt;&lt;</button><button type="button" aria-label="Previous page" disabled={page === 1} onclick={() => changePage(page - 1)}>&lt;</button>{#each pageNumbers as number}{#if number === 'ellipsis'}<span class="pagination-ellipsis" aria-hidden="true">…</span>{:else}<button type="button" aria-current={number === page ? 'page' : undefined} onclick={() => changePage(number)}>{number}</button>{/if}{/each}<button type="button" aria-label="Next page" disabled={page === pageCount} onclick={() => changePage(page + 1)}>&gt;</button><button type="button" aria-label="Last page" disabled={page === pageCount} onclick={() => changePage(pageCount)}>&gt;&gt;</button></nav></footer>
</div>
{#if menuItem}<div class="menu-popover master-menu" role="menu" style={`top:${menuTop}px;left:${menuLeft}px`}><button type="button" role="menuitem" disabled={!onDetail || !permitted(canDetail, Boolean(onDetail), menuItem)} onclick={() => { const item = menuItem; const trigger = menuTrigger; closeMenu(); if (item && permitted(canDetail, Boolean(onDetail), item)) onDetail?.(item, trigger); }}>Detail</button><button type="button" role="menuitem" disabled={!onEdit || !permitted(canEdit, canManage, menuItem)} onclick={() => { const item = menuItem; const trigger = menuTrigger; closeMenu(); if (item && permitted(canEdit, canManage, item)) onEdit?.(item, trigger); }}>Edit</button><div class="menu-separator"></div><button type="button" class="delete-item" role="menuitem" disabled={!onDelete || !permitted(canDelete, canManage, menuItem)} onclick={() => { const item = menuItem; closeMenu(); if (item && permitted(canDelete, canManage, item)) void onDelete?.(item); }}>Delete</button></div>{/if}

<style>
	.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
	.master-list{display:flex;min-width:0;max-height:calc(100dvh - 200px);flex-direction:column;overflow:hidden;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}
	.master-header{display:flex;flex:none;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border-light)}
	.master-header h2{margin:0;color:var(--text);font-size:14px}
	.master-header p{margin:1px 0 0;color:var(--muted);font-size:11.5px}
	.master-header-actions{display:flex;align-items:center;gap:8px}
	.master-toolbar{display:flex;flex:none;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-light)}
	.search-box{position:relative;display:block;width:220px}
	.search-box svg{position:absolute;top:50%;left:9px;width:14px;height:14px;color:var(--muted);pointer-events:none;transform:translateY(-50%)}
	.search-box input{width:100%;height:32px;padding:0 10px 0 32px;background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:13px;outline:none}
	.search-box input:focus{border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14)}
	.search-box input::placeholder{color:#c0c7cf}
	:global(html[data-theme='dark']) .search-box input::placeholder{color:#5a6473}
	.master-scroll{min-height:0;overflow:auto}
	table{width:100%;min-width:720px;table-layout:fixed;border-collapse:collapse;font-size:13px}
	th{position:sticky;top:0;z-index:2;padding:8px 16px;background:var(--surface-secondary);color:var(--muted);font-size:11px;font-weight:700;letter-spacing:.3px;text-align:left;text-transform:uppercase}
	td{padding:8px 16px;color:var(--text-secondary);font-size:13px;vertical-align:middle;border-bottom:1px solid var(--border-light);overflow-wrap:anywhere}
	td strong{color:var(--text);font-weight:600}
	.empty{height:96px;color:var(--muted);text-align:center}
	.column-label{text-transform:uppercase}
	tbody tr:hover{background:var(--surface-secondary)}
	tbody tr:last-child td{border-bottom:0}
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
	.master-footer p{margin:0;color:var(--muted);font-size:12px}
	.master-footer nav{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
	.pagination-ellipsis{padding:0 4px;color:var(--muted)}
	.master-footer button{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;margin:0;padding:0 8px;background:var(--surface)!important;color:var(--text-secondary)!important;border:1px solid var(--border);border-radius:4px;font-size:12px;font-weight:500}
	.master-footer button:hover:not(:disabled):not([aria-current='page']){background:var(--surface-secondary)!important;color:var(--text)!important}
	.master-footer button[aria-current='page']{background:#1abb9c!important;color:#fff!important;border-color:#169f85}
	.master-footer button:disabled{cursor:not-allowed;opacity:.5}
	.master-footer button:focus-visible{outline:2px solid #1abb9c;outline-offset:2px}
	@media(max-width:700px){.master-list{max-height:calc(100dvh - 180px)}.master-header,.master-toolbar,.master-footer{align-items:stretch;flex-direction:column}.master-header-actions,.search-box{width:100%}}
</style>
