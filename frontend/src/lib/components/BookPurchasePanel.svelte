<script lang="ts">
 import { onMount } from 'svelte';
 import { localization } from '$lib/localization';
 import { apiData } from '$lib/api';
 import { bookPurchaseMessages, type PurchaseRequest, type PurchaseOrder } from '$lib/book-purchase-messages';
 import BookPurchaseFields from './BookPurchaseFields.svelte';
 import ModalActionButton from './ModalActionButton.svelte';
 import StatusNotice from './StatusNotice.svelte';
 let { titleId, branchId, canRequest = false, requestOpen = false, onChanged, onReceive }: { titleId?: number; branchId?: number; canRequest?: boolean; requestOpen?: boolean; onChanged?: () => void; onReceive?: (order: PurchaseOrder) => void } = $props();
 let text = $derived(bookPurchaseMessages[$localization.displayLanguage]);
 let requests = $state<PurchaseRequest[]>([]), orders = $state<PurchaseOrder[]>([]);
 let busy = $state(false), loading = $state(true), history = $state(false), ready = $state(false);
 let quantity = $state(1), reason = $state(''), error = $state(''), notice = $state('');
 let selected = $state<number[]>([]);
 let planned = $state<Record<string, number>>({}), reasons = $state<Record<string, string>>({});
 let groups = $derived.by(() => {
  const map = new Map<string, { key: string; titleId: number; branchId: number; title: string; branch: string; requests: PurchaseRequest[] }>();
  for (const item of requests.filter(item => item.canManage && item.status === 'pending')) {
   const key = `${item.titleId}:${item.branchId}`;
   if (!map.has(key)) map.set(key, { key, titleId: item.titleId, branchId: item.branchId, title: item.title.name, branch: item.branch.name, requests: [] });
   map.get(key)!.requests.push(item);
  }
  return [...map.values()];
 });
 const stateLabel = (status: string) => text[status as 'pending'] ?? status;
 async function all<T>(endpoint: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
   const response = await fetch(`${endpoint}?limit=500&offset=${offset}${titleId ? `&titleId=${titleId}` : ''}`);
   if (!response.ok) throw new Error('load');
   const page = await apiData<T[]>(response); rows.push(...page); if (page.length < 500) return rows;
  }
 }
 async function load() { loading = true; try { [requests, orders] = await Promise.all([all<PurchaseRequest>('/v1/book-purchase-requests'), all<PurchaseOrder>('/v1/book-purchase-orders')]); selected = []; } catch { error = text.failed; } finally { loading = false; } }
 onMount(() => { void load(); });
 async function send(endpoint: string, method: string, body: unknown) {
  if (busy) return; busy = true; error = ''; notice = '';
  try {
   const response = await fetch(endpoint, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
   if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const code = payload.error?.code;
    error = code === 'PURCHASE_ALREADY_REQUESTED' ? text.duplicate : code === 'PURCHASE_STATE_CONFLICT' ? text.conflict : response.status === 403 ? text.forbidden : payload.error?.details?.some((detail: { reason: string }) => detail.reason === 'ADDITIONAL_REASON_REQUIRED') ? text.reasonRequired : text.failed;
    return;
   }
   notice = text.updated; await load(); onChanged?.();
  } catch { error = text.failed; } finally { busy = false; }
 }
 async function submit() { if (!ready || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) { error = text.quantityRequired; return; } await send('/v1/book-purchase-requests', 'POST', { titleId, quantity, reason }); }
 async function decide(group: typeof groups[number], status: 'approved' | 'rejected') {
  const ids = group.requests.filter(item => selected.includes(item.id)).map(item => item.id);
  if (!ids.length) return;
  if (status === 'rejected' && !reasons[group.key]?.trim()) { error = text.reasonRequired; return; }
  const count = planned[group.key] ?? 1;
  if (status === 'approved' && (!Number.isInteger(count) || count < 1 || count > 100)) { error = text.quantityRequired; return; }
  await send('/v1/book-purchase-orders', 'POST', { titleId: group.titleId, branchId: group.branchId, requestIds: ids, status, quantity: count, decisionReason: reasons[group.key] });
 }
</script>
<section class="purchases" aria-label={text.heading}>
 {#if error}<StatusNotice message={error} tone="error" onDismiss={() => error = ''} />{/if}
 {#if notice}<StatusNotice message={notice} tone="success" onDismiss={() => notice = ''} />{/if}
 {#if titleId && canRequest && !requests.some(item => item.own && item.branchId === branchId && ['pending','approved','ordered'].includes(item.status))}
  <details class="request-form" open={requestOpen}><summary>{text.request}</summary><form onsubmit={(event) => { event.preventDefault(); void submit(); }}><BookPurchaseFields {titleId} {branchId} bind:quantity bind:reason bind:ready /><ModalActionButton type="submit" label={text.submit} disabled={busy || !ready} /></form></details>
 {/if}
 {#if loading}<p role="status">{text.loading}</p>{/if}
 {#each groups as group (group.key)}
  <section class="purchase-card"><h4>{group.title} · {group.branch}</h4>
   <fieldset disabled={busy}><legend>{text.selected}</legend>
    <label class="check"><input type="checkbox" checked={group.requests.every(item => selected.includes(item.id))} onchange={(event) => { selected = event.currentTarget.checked ? [...new Set([...selected, ...group.requests.map(item => item.id)])] : selected.filter(id => !group.requests.some(item => item.id === id)); }} />{text.all}</label>
    {#each group.requests as item (item.id)}<label class="check"><input type="checkbox" value={item.id} bind:group={selected} /><span>{item.employee ? [item.employee.firstName,item.employee.middleName,item.employee.lastName].filter(Boolean).join(' ') : text.other} · {item.quantity} · {item.kind === 'additional' ? text.extra : text.new}{#if item.reason}<span class="reason">{item.reason}</span>{/if}</span></label>{/each}
    <label>{text.planned}<input type="number" min="1" max="100" step="1" value={planned[group.key] ?? 1} oninput={(event) => planned[group.key] = Number(event.currentTarget.value)} /></label>
    <label>{text.decisionReason}<textarea maxlength="5000" rows="2" bind:value={reasons[group.key]}></textarea></label>
   </fieldset>
   <div class="actions"><ModalActionButton label={text.approve} disabled={busy || !group.requests.some(item => selected.includes(item.id))} onclick={() => void decide(group, 'approved')} /><ModalActionButton label={text.reject} variant="danger" disabled={busy || !group.requests.some(item => selected.includes(item.id))} onclick={() => void decide(group, 'rejected')} /></div>
  </section>
 {/each}
 <label class="check"><input type="checkbox" bind:checked={history} />{text.history}</label>
 {#if !requests.length && !loading}<p>{text.empty}</p>{/if}
 <ul class="request-list">{#each requests.filter(item => history || ['pending','approved','ordered'].includes(item.status)) as item (item.id)}<li>
  <strong>{item.title.name}</strong><span>{item.branch.name} · {item.own ? text.own : text.other} · {item.kind === 'additional' ? text.extra : text.new} · {item.quantity} · {stateLabel(item.status)}</span>
  {#if item.employee}<span>{text.requester}: {[item.employee.firstName,item.employee.middleName,item.employee.lastName].filter(Boolean).join(' ')}</span>{/if}
  <span>{text.date}: {new Date(item.createdAt).toLocaleString($localization.displayLanguage)}</span>
  {#if item.reason}<p>{item.reason}</p>{/if}{#if item.decisionReason}<p>{text.decisionReason}: {item.decisionReason}</p>{/if}
  {#if item.canCancel}<ModalActionButton label={text.cancel} variant="secondary" disabled={busy} onclick={() => void send(`/v1/book-purchase-requests/${item.id}`, 'PATCH', { status: 'cancelled' })} />{/if}
 </li>{/each}</ul>
 {#if orders.some(item => history || ['approved','ordered'].includes(item.status))}<h4>{text.orders}</h4>{/if}
 {#each orders.filter(item => history || ['approved','ordered'].includes(item.status)) as item (item.id)}<section class="purchase-card"><h4>{item.title.name} · {item.branch.name}</h4><p>{stateLabel(item.status)} · {text.planned}: {item.quantity} · {text.received}: {item.received}</p>
  {#if item.decisionReason}<p>{text.decisionReason}: {item.decisionReason}</p>{/if}
  {#if item.canManage && item.status === 'approved'}<label>{text.decisionReason}<textarea maxlength="5000" rows="2" bind:value={reasons[`order:${item.id}`]}></textarea></label><div class="actions"><ModalActionButton label={text.order} disabled={busy} onclick={() => void send(`/v1/book-purchase-orders/${item.id}`, 'PATCH', { status: 'ordered' })} /><ModalActionButton label={text.reject} variant="danger" disabled={busy} onclick={() => { const reason = reasons[`order:${item.id}`]; if (!reason?.trim()) { error = text.reasonRequired; return; } void send(`/v1/book-purchase-orders/${item.id}`, 'PATCH', { status: 'rejected', decisionReason: reason }); }} /></div>{/if}
  {#if item.status === 'ordered' && onReceive}<ModalActionButton label={text.receive} variant="secondary" disabled={busy} onclick={() => onReceive?.(item)} />{/if}
 </section>{/each}
</section>
<style>
 .purchases{display:grid;gap:16px;min-width:0;color:var(--text-secondary)}h4,p{margin:0}.purchase-card,.request-list li{display:grid;gap:10px;padding:14px;border:1px solid var(--border);border-radius:6px;overflow-wrap:anywhere}.request-list{display:grid;gap:12px;margin:0;padding:0;list-style:none}.actions{display:flex;flex-wrap:wrap;gap:8px}fieldset{display:grid;gap:12px;min-width:0;border:0;padding:0}legend{margin-bottom:8px}label{display:grid;gap:6px}.check{display:flex;align-items:flex-start;gap:8px}.check input{flex:none;width:16px;height:16px;margin-top:3px}.reason{display:block;white-space:pre-wrap}input,textarea{box-sizing:border-box;width:100%;min-width:0;padding:8px 10px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font:inherit}textarea{resize:vertical}.request-form summary{cursor:pointer;font-weight:600;color:var(--accent)}.request-form form{display:grid;gap:12px;margin-top:12px}
</style>
