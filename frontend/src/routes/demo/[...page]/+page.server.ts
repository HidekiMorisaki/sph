import { error } from '@sveltejs/kit';

const removedPages = new Set([
	'forms-general', 'forms-advanced-controls', 'forms-buttons', 'forms-upload', 'forms-validation', 'forms-wizard',
	'tables-static', 'tables-dynamic',
	'charts-chart-cards', 'charts-echarts-gallery', 'charts-svg-charts',
	'calendar', 'map',
	'contacts', 'user-management', 'help-center'
]);

export function load({ params }: import('./$types').PageServerLoadEvent) {
	if (removedPages.has(params.page)) error(404, 'Not found.');
}
