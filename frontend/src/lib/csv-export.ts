import type { SearchState } from './search';

export type CsvColumn<Row> = { header: string; value: (row: Row) => unknown };
type ServerColumn = { key: string; columnName: string; comment: string | null };
type SearchExport<Row> = {
	endpoint: string;
	searchState: SearchState;
	columns?: ReadonlyArray<CsvColumn<Row>>;
	serverColumns?: boolean;
};

export function csvCell(value: unknown): string {
	let text = value == null ? '' : String(value);
	if (/^[\s\uFEFF]*[=+\-@]/u.test(text)) text = `'${text}`;
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvContent<Row>(rows: Row[], columns: ReadonlyArray<CsvColumn<Row>>): string {
	return '\uFEFF' + [columns.map(column => csvCell(column.header)).join(','),
		...rows.map(row => columns.map(column => csvCell(column.value(row))).join(','))].join('\r\n');
}

export async function searchCsv<Row extends object>(options: SearchExport<Row>, fetcher: typeof fetch = fetch): Promise<string> {
	// Svelte state can contain proxies. Serialize once before the first await so
	// edits, sorting and saved-filter changes cannot alter later export requests.
	const snapshot = JSON.parse(JSON.stringify({ definition: { ...options.searchState.definition, limit: 500 },
		visibleSearch: options.searchState.visibleSearch, searchLocale: options.searchState.searchLocale }));
	const rows: Row[] = [];
	let columns = options.columns;
	let offset = 0, total = 0;
	do {
		const response = await fetcher(options.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ...snapshot, offset, ...(options.serverColumns ? { includeColumns: offset === 0 } : {}) }) });
		if (!response.ok) throw new Error('CSV export request failed');
		const payload = await response.json() as { data: Row[]; meta: { total: number; columns?: ServerColumn[] } };
		if (!Array.isArray(payload.data) || !Number.isSafeInteger(payload.meta?.total) || payload.meta.total < 0) throw new Error('Invalid CSV export response');
		if (offset === 0) {
			total = payload.meta.total;
			if (options.serverColumns) columns = payload.meta.columns?.map(column => ({ header: column.comment?.trim() || column.columnName,
				value: (row: Row) => (row as Record<string, unknown>)[column.key] }));
		}
		if (!columns?.length) throw new Error('CSV export columns unavailable');
		if (!payload.data.length && offset < total) throw new Error('CSV export ended before all rows were retrieved');
		rows.push(...payload.data); offset += payload.data.length;
	} while (offset < total);
	return csvContent(rows, columns!);
}

export function downloadCsv(content: string, filename: string): void {
	const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
	const anchor = document.createElement('a');
	anchor.href = url; anchor.download = filename; document.body.appendChild(anchor);
	try { anchor.click(); } finally { anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }
}

export function csvFilename(prefix: string, date = new Date()): string {
	return `${prefix}-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}.csv`;
}
