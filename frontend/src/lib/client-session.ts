import { apiData } from '$lib/api';
import type { SessionUser } from '$lib/auth';

export async function readSessionUser(fetcher: typeof fetch = fetch): Promise<SessionUser | null> {
	const response = await fetcher('/v1/auth/session', { cache: 'no-store' });
	if (response.status === 401) return null;
	if (!response.ok) throw new Error('Unable to load session.');
	return (await apiData<{ user: SessionUser }>(response)).user;
}
