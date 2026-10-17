<script lang="ts">
 import { localization } from '$lib/localization';
 import { apiData } from '$lib/api';
 import { bookPurchaseMessages } from '$lib/book-purchase-messages';
 let { titleId = null, branchId, quantity = $bindable(1), reason = $bindable(''), ready = $bindable(false) }: { titleId?: number | null; branchId?: number; quantity?: number; reason?: string; ready?: boolean } = $props();
 let text = $derived(bookPurchaseMessages[$localization.displayLanguage]);
 let counts = $state({ available: 0, loaned: 0, unavailable: 0 });
 let loading = $state(false), failed = $state(false);
 let total = $derived(counts.available + counts.loaned + counts.unavailable);
 $effect(() => {
  const id = titleId, branch = branchId; const controller = new AbortController();
  ready = false; loading = false; counts = { available: 0, loaned: 0, unavailable: 0 }; failed = false;
  if (!id) { ready = Boolean(branch); return; }
  loading = true;
  void (async () => {
   try {
    const next = { available: 0, loaned: 0, unavailable: 0 };
    for (let offset = 0; ; offset += 500) {
     const response = await fetch(`/v1/book-copies?titleId=${id}&limit=500&offset=${offset}`, { signal: controller.signal });
     if (!response.ok) throw new Error('inventory');
     const copies = await apiData<Array<{ status: string; onLoan: boolean; storage: { branchId: number } }>>(response);
     for (const copy of copies.filter(copy => copy.storage.branchId === branch)) { if (copy.onLoan) next.loaned++; else if (copy.status === 'available') next.available++; else next.unavailable++; }
     if (copies.length < 500) break;
    }
    if (!controller.signal.aborted) { counts = next; ready = Boolean(branch); }
   } catch { if (!controller.signal.aborted) failed = true; }
   finally { if (!controller.signal.aborted) loading = false; }
  })();
  return () => controller.abort();
 });
</script>
<div class="purchase-fields">
 {#if loading}<p role="status">{text.loading}</p>{:else if failed}<p role="alert">{text.staleInventory}</p>{:else if total}<p role="status">{text.inventory}: {total} ({text.available}: {counts.available} / {text.loaned}: {counts.loaned} / {text.unavailable}: {counts.unavailable})</p><p>{text.additionalHelp}</p>{:else}<p role="status">{text.none}</p>{/if}
 <label>{text.quantity}<input type="number" min="1" max="100" step="1" required bind:value={quantity} /></label>
 <label>{text.reason}{total ? ' *' : ''}<textarea rows="3" maxlength="5000" required={total > 0} bind:value={reason}></textarea></label>
</div>
<style>
 .purchase-fields{display:grid;gap:12px;min-width:0}.purchase-fields p{margin:0;color:var(--text-secondary)}label{display:grid;gap:6px;color:var(--text-secondary);font-size:var(--font-size-body)}input,textarea{box-sizing:border-box;width:100%;min-width:0;padding:8px 10px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);font:inherit}textarea{resize:vertical}
</style>
