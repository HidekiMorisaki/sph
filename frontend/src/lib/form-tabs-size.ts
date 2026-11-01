import {tabNavigationHeight} from './tab-navigation-height';
/** Measure the original retained sections, including form/footer wrappers. */
export function formTabsSize(host: HTMLElement): { destroy: () => void } {
	const dialog = host.closest('dialog');
	const originalHeight=dialog?.style.height??'';
	let frame = 0;
	let disposed = false;
	const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(measure); };
	function measure() {
		frame = 0;
		if (!dialog?.clientWidth) return;
		const panels = host.querySelector<HTMLElement>('.form-tabs-panels');
		const navigation = host.querySelector<HTMLElement>('.form-tabs-card');
		if (!panels || !navigation) return;
		host.dataset.measuring = '';
		try {
			const number = (value: string) => parseFloat(value) || 0;
			tabNavigationHeight(navigation);
			const sections = [...panels.children].filter((element): element is HTMLElement => element instanceof HTMLElement && element.matches('[data-form-panel]'));
			const notices = [...panels.children].filter(element => !sections.includes(element as HTMLElement)
				&& !sections.some(section => element.contains(section)) && getComputedStyle(element).display !== 'none');
			let height = Math.max(0, ...sections.map(section => section.getBoundingClientRect().height))
				+ navigation.getBoundingClientRect().height + number(getComputedStyle(host).rowGap)
				+ notices.reduce((sum, element) => sum + element.getBoundingClientRect().height, 0)
				+ number(getComputedStyle(panels).rowGap) * notices.length;
			let child: HTMLElement = host;
			for (let parent = child.parentElement; parent; parent = parent.parentElement) {
				const style = getComputedStyle(parent);
				const siblings = [...parent.children].filter(element => element !== child && getComputedStyle(element).display !== 'none');
				height += siblings.reduce((sum, element) => sum + element.getBoundingClientRect().height, 0)
					+ number(style.paddingTop) + number(style.paddingBottom) + number(style.borderTopWidth) + number(style.borderBottomWidth)
					+ number(style.rowGap) * siblings.length;
				if (parent === dialog) break;
				child = parent;
			}
			const next = `${Math.ceil(height)}px`;
			if (dialog.style.height !== next) dialog.style.height = next;
		} finally { delete host.dataset.measuring; }
	}
	const observer = new MutationObserver(schedule);
	observer.observe(host, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-expanded', 'aria-invalid'] });
	const resize = new ResizeObserver(schedule);
	for(const panel of host.querySelectorAll<HTMLElement>('[data-form-panel]'))resize.observe(panel);
	if (dialog) resize.observe(dialog);
	host.addEventListener('load',schedule,true);
	document.fonts.addEventListener('loadingdone',schedule);
	window.addEventListener('resize', schedule);
	void document.fonts.ready.then(schedule);
	schedule();
	return { destroy: () => { disposed = true;if(dialog)dialog.style.height=originalHeight; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', schedule);host.removeEventListener('load',schedule,true);document.fonts.removeEventListener('loadingdone',schedule); } };
}
