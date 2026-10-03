import type { Action } from 'svelte/action';

export type CalendarNoteOptions = { note: string | null | undefined; label: string; id: string };

/** Keep a floating note inside the viewport, including near the bottom edge. */
export function calendarNotePosition(anchor: { left: number; top: number; bottom: number }, size: { width: number; height: number }, viewport: { width: number; height: number }) {
	const margin = 8;
	const left = Math.max(margin, Math.min(anchor.left, viewport.width - size.width - margin));
	const below = anchor.bottom + margin;
	const top = below + size.height <= viewport.height - margin ? below : Math.max(margin, anchor.top - size.height - margin);
	return { left, top };
}

/** A hoverable, dismissible note shared by editable and read-only day cells. */
export const calendarNoteTooltip: Action<HTMLElement, CalendarNoteOptions> = (node, initialOptions) => {
	let options = initialOptions;
	let popup: HTMLDivElement | null = null;
	let hovered = false;
	let popupHovered = false;
	let focused = false;
	let dismissed = false;
	let closeTimer: ReturnType<typeof setTimeout> | undefined;
	let describedElement: HTMLElement | null = null;
	let previousDescription: string | null = null;

	function cancelClose() { clearTimeout(closeTimer); closeTimer = undefined; }
	function hide() {
		cancelClose();
		popup?.remove(); popup = null; popupHovered = false;
		if (describedElement) {
			if (previousDescription === null) describedElement.removeAttribute('aria-describedby');
			else describedElement.setAttribute('aria-describedby', previousDescription);
		}
		describedElement = null;
	}
	function show() {
		cancelClose();
		if (popup || dismissed || !options.note?.trim()) return;
		popup = document.createElement('div');
		popup.className = 'calendar-note-tooltip';
		popup.id = options.id;
		popup.setAttribute('role', 'tooltip');
		const heading = document.createElement('strong'); heading.textContent = options.label;
		const body = document.createElement('div'); body.textContent = options.note;
		popup.append(heading, body);
		// Mount outside the calendar's scrolling container so overflow cannot clip it.
		document.body.append(popup);
		popup.addEventListener('pointerenter', () => { popupHovered = true; cancelClose(); });
		popup.addEventListener('pointerleave', () => { popupHovered = false; scheduleClose(); });
		describedElement = node.querySelector('button');
		if (describedElement) {
			previousDescription = describedElement.getAttribute('aria-describedby');
			describedElement.setAttribute('aria-describedby', [previousDescription, options.id].filter(Boolean).join(' '));
		}
		const position = calendarNotePosition(node.getBoundingClientRect(), popup.getBoundingClientRect(), { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight });
		popup.style.left = `${position.left}px`; popup.style.top = `${position.top}px`;
	}
	function scheduleClose() { cancelClose(); if (!hovered && !popupHovered && !focused) closeTimer = setTimeout(hide, 120); }
	function enter(event: PointerEvent) { if (event.pointerType === 'touch') return; hovered = true; dismissed = false; show(); }
	function leave() { hovered = false; scheduleClose(); }
	function focus() { focused = true; dismissed = false; show(); }
	function blur(event: FocusEvent) { if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return; focused = false; scheduleClose(); }
	function dismiss() { dismissed = true; hide(); }
	function keydown(event: KeyboardEvent) { if (event.key === 'Escape' && popup) { event.preventDefault(); event.stopPropagation(); dismiss(); } }
	function scroll(event: Event) { if (popup && event.target instanceof Node && popup.contains(event.target)) return; dismiss(); }

	node.addEventListener('pointerenter', enter);
	node.addEventListener('pointerleave', leave);
	node.addEventListener('focusin', focus);
	node.addEventListener('focusout', blur);
	node.addEventListener('click', dismiss);
	window.addEventListener('keydown', keydown);
	window.addEventListener('scroll', scroll, true);
	window.addEventListener('resize', dismiss);
	return {
		update(nextOptions) { hide(); options = nextOptions; if (hovered || focused) show(); },
		destroy() {
			hide();
			node.removeEventListener('pointerenter', enter);
			node.removeEventListener('pointerleave', leave);
			node.removeEventListener('focusin', focus);
			node.removeEventListener('focusout', blur);
			node.removeEventListener('click', dismiss);
			window.removeEventListener('keydown', keydown);
			window.removeEventListener('scroll', scroll, true);
			window.removeEventListener('resize', dismiss);
		}
	};
};
