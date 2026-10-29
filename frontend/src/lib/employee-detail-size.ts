import {tabNavigationHeight} from './tab-navigation-height';
/** Keep the employee dialog sized for its largest panel, including history subtabs. */
export function employeeDetailSize(host: HTMLElement): { destroy: () => void } {
	let frame = 0;
	let dialog: HTMLDialogElement | null = null;
	let disposed = false;
	const schedule = () => {
		if (!disposed && !frame) frame = requestAnimationFrame(measure);
	};
	const resize = new ResizeObserver(schedule);
	function measure() {
		frame = 0;
		const current = host.querySelector<HTMLDialogElement>('.employee-detail-modal');
		if (current !== dialog) {
			resize.disconnect();
			dialog = current;
			if (dialog){resize.observe(dialog);for(const panel of dialog.querySelectorAll<HTMLElement>('[data-employee-panel]'))resize.observe(panel);}
		}
		if (!dialog || !dialog.clientWidth) return;
		const body = dialog.querySelector<HTMLElement>('.app-detail-body');
		const panels = body?.querySelector<HTMLElement>('.employee-detail-panels');
		const card = body?.querySelector<HTMLElement>('.employee-detail-card');
		if (!body || !panels || !card) return;
		const primaryTabs = body.querySelector<HTMLElement>('.employee-detail-tabs');
		const historyTabs = body.querySelector<HTMLElement>('.employee-history-tabs');
		const historyPanels = panels.querySelector<HTMLElement>('.employee-history-panels');
		const previousHeight = historyPanels?.style.height ?? '';
		dialog.dataset.employeeSizing = '';
		try {
			if (historyPanels) {
				const heights = [...historyPanels.querySelectorAll<HTMLElement>('[data-history-panel]')].map(panel => panel.getBoundingClientRect().height);
				historyPanels.style.height = `${Math.max(0, ...heights)}px`;
			}
			if(primaryTabs)tabNavigationHeight(primaryTabs);
			if(historyTabs)tabNavigationHeight(historyTabs);
			const historyTabHeight = historyTabs?.getBoundingClientRect().height ?? 0;
			const largestPanel = Math.max(0, ...[...panels.querySelectorAll<HTMLElement>('[data-employee-panel]')].map(panel => panel.getBoundingClientRect().height + (panel.contains(historyPanels) ? historyTabHeight : 0)));
			const bodyStyle = getComputedStyle(body);
			const dialogStyle = getComputedStyle(dialog);
			const cardStyle = getComputedStyle(card);
			const number = (value: string) => parseFloat(value) || 0;
			const otherRows = [...body.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element !== card && element !== panels && getComputedStyle(element).display !== 'none');
			const chrome = [...dialog.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element !== body);
			const height = largestPanel + otherRows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0)
				+ (primaryTabs?.getBoundingClientRect().height ?? 0) + number(cardStyle.borderTopWidth) + number(cardStyle.borderBottomWidth)
				+ number(bodyStyle.rowGap) * (otherRows.length + 1) + number(bodyStyle.paddingTop) + number(bodyStyle.paddingBottom)
				+ chrome.reduce((sum, element) => sum + element.getBoundingClientRect().height, 0)
				+ number(dialogStyle.borderTopWidth) + number(dialogStyle.borderBottomWidth);
			// The existing max-height caps this at the viewport's available height.
			const next = `${Math.ceil(height)}px`;
			if (dialog.style.height !== next) dialog.style.height = next;
		} finally {
			if (historyPanels) historyPanels.style.height = previousHeight;
			delete dialog.dataset.employeeSizing;
		}
	}
	const mutations = new MutationObserver(schedule);
	mutations.observe(host, { childList: true, characterData: true, subtree: true, attributes:true,attributeFilter:['hidden','aria-busy','aria-expanded'] });
	host.addEventListener('load',schedule,true);
	document.fonts.addEventListener('loadingdone',schedule);
	window.addEventListener('resize', schedule);
	void document.fonts.ready.then(schedule);
	schedule();
	return { destroy: () => {
		disposed = true;
		cancelAnimationFrame(frame);
		resize.disconnect();
		mutations.disconnect();
		window.removeEventListener('resize', schedule);host.removeEventListener('load',schedule,true);document.fonts.removeEventListener('loadingdone',schedule);
	} };
}
