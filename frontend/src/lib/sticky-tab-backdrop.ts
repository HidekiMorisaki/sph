/** Keep the sticky tab's upper backdrop clear of preceding notifications and action rows. */
export function stickyTabBackdrop(card: HTMLElement): { destroy: () => void } {
	const container = card.closest<HTMLElement>('.app-modal-form-body, .app-detail-body');
	if (!container) return { destroy() {} };
	const scroller: HTMLElement = container;
	let frame = 0;
	let disposed = false;
	const observed = new Set<HTMLElement>();
	const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(measure); };
	const resize = new ResizeObserver(schedule);
	function measure() {
		frame = 0;
		if (!card.checkVisibility()) return;
		const bounds = card.getBoundingClientRect();
		const obstacles = [...scroller.querySelectorAll<HTMLElement>('.status-notice, .book-edit-actions')].filter(obstacle =>
			obstacle.closest('.app-modal-form-body, .app-detail-body') === scroller
			&& Boolean(obstacle.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING)
			&& obstacle.checkVisibility() && obstacle.getBoundingClientRect().height > 0);
		for (const obstacle of observed) if (!obstacles.includes(obstacle)) { resize.unobserve(obstacle); observed.delete(obstacle); }
		for (const obstacle of obstacles) if (!observed.has(obstacle)) { resize.observe(obstacle); observed.add(obstacle); }
		let height = 24;
		for (const obstacle of obstacles) {
			const rect = obstacle.getBoundingClientRect();
			if (rect.left < bounds.right && rect.right > bounds.left) height = Math.min(height, Math.max(0, bounds.top - rect.bottom - 1));
		}
		const value = `${Math.floor(height * 100) / 100}px`;
		if (card.style.getPropertyValue('--sticky-tab-backdrop-height') !== value) card.style.setProperty('--sticky-tab-backdrop-height', value);
	}
	resize.observe(scroller);
	resize.observe(card);
	const mutations = new MutationObserver(schedule);
	mutations.observe(scroller, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class', 'aria-hidden'] });
	scroller.addEventListener('scroll', schedule, { passive: true });
	window.addEventListener('resize', schedule);
	void document.fonts.ready.then(schedule);
	schedule();
	return { destroy() {
		disposed = true;
		cancelAnimationFrame(frame);
		resize.disconnect();
		mutations.disconnect();
		scroller.removeEventListener('scroll', schedule);
		window.removeEventListener('resize', schedule);
		card.style.removeProperty('--sticky-tab-backdrop-height');
	} };
}
