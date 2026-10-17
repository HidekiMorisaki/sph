import { writable } from 'svelte/store';
import { apiData } from '$lib/api';

export const avatarImage = writable<string | null>(null);
let loadedFor: number | null = null;
let revision = 0;

export async function loadAvatarFor(employeeId: number, force = false) {
	if (!force && loadedFor === employeeId) return;
	const current = ++revision;
	const response = await fetch('/v1/employees/me/avatar', { cache: 'no-store' });
	if (!response.ok) throw new Error('Unable to load avatar.');
	const data = await apiData<{ image: string | null }>(response);
	if (current === revision) {
		loadedFor = employeeId;
		avatarImage.set(data.image);
	}
}

export function setAvatar(image: string | null) {
	++revision;
	avatarImage.set(image);
}

export function clearAvatar() {
	++revision;
	loadedFor = null;
	avatarImage.set(null);
}
