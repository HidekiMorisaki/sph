import {tabNavigationHeight} from './tab-navigation-height';
/** Measure retained panels without mounting duplicate content or issuing requests. */
export function detailTabsSize(host: HTMLElement): { destroy: () => void } {
	const dialog = host.closest('dialog');
	const originalHeight=dialog?.style.height??'';
	let frame = 0;
	let disposed = false;
	const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(measure); };
	function measure() {
		frame = 0;
		if (!dialog?.clientWidth) return;
		const body = dialog.querySelector<HTMLElement>('.app-detail-body');
		const navigation = host.querySelector<HTMLElement>('.detail-tabs-card');
		const panels = host.querySelector<HTMLElement>('.detail-tabs-panels');
		if (!body || !navigation || !panels) return;
		host.dataset.measuring = '';
		try {
			tabNavigationHeight(navigation);
			const largest = Math.max(0, ...[...panels.children].map(panel => panel.getBoundingClientRect().height));
			const number = (value: string) => parseFloat(value) || 0;
			const style = getComputedStyle(body);
			const rootStyle = getComputedStyle(host);
			const dialogStyle = getComputedStyle(dialog);
			const otherRows = [...body.children].filter(element => !element.contains(host) && getComputedStyle(element).display !== 'none');
			const chrome = [...dialog.children].filter(element => element !== body);
			const height = largest + navigation.getBoundingClientRect().height + number(rootStyle.rowGap)
				+ number(style.paddingTop) + number(style.paddingBottom) + number(style.rowGap) * otherRows.length
				+ otherRows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0)
				+ chrome.reduce((sum, element) => sum + element.getBoundingClientRect().height, 0)
				+ number(dialogStyle.borderTopWidth) + number(dialogStyle.borderBottomWidth);
			const next = `${Math.ceil(height)}px`;
			if (dialog.style.height !== next) dialog.style.height = next;
		} finally { delete host.dataset.measuring; }
	}
	const resize = new ResizeObserver(schedule);
	for(const panel of host.querySelectorAll<HTMLElement>('.detail-tab-panel'))resize.observe(panel);
	if (dialog) resize.observe(dialog);
	const mutations = new MutationObserver(schedule);
	mutations.observe(host, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-expanded', 'aria-busy'] });
	host.addEventListener('load',schedule,true);
	document.fonts.addEventListener('loadingdone',schedule);
	window.addEventListener('resize', schedule);
	void document.fonts.ready.then(schedule);
	schedule();
	return { destroy: () => {
		disposed = true;if(dialog)dialog.style.height=originalHeight;
		cancelAnimationFrame(frame);
		resize.disconnect(); mutations.disconnect();
		window.removeEventListener('resize', schedule);host.removeEventListener('load',schedule,true);document.fonts.removeEventListener('loadingdone',schedule);
	} };
}
