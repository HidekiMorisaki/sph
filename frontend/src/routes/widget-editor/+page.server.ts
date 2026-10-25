import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
 if (!locals.canManageDevelopment) error(403, 'System administrator access is required.');
 return {};
};
