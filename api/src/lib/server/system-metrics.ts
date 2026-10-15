import { env } from '$env/dynamic/private';
import { readFile, statfs } from 'node:fs/promises';
import { cpus, freemem, totalmem, uptime } from 'node:os';
import { getPrisma } from './prisma';

export const MINUTE = 60_000;
export const HISTORY_SLOTS = 7 * 24 * 60;
export const metricsEnabled = () => env.SPH_SYSTEM_METRICS === 'docker';
export type Measurement = {
	cpuPercent: number | null; memoryUsed: number | null; memoryTotal: number | null;
	apiMemory: number | null;
	diskAvailable: number | null; diskTotal: number | null; databaseBytes: number | null;
};
type CpuCounter = { total: number; idle: number };
export function parseCpuCounter(content: string): CpuCounter | null {
	const line = content.split('\n').find(line => /^cpu\s/.test(line));
	if (!line) return null;
	// guest/guest_nice are already included in user/nice.
	const values = line.trim().split(/\s+/).slice(1, 9).map(Number);
	if (values.length !== 8 || values.some(value => !Number.isFinite(value) || value < 0)) return null;
	return { total: values.reduce((a, b) => a + b, 0), idle: values[3] + values[4] };
}
export function cpuPercentage(previous: CpuCounter | null, current: CpuCounter | null): number | null {
	if (!previous || !current || current.total <= previous.total || current.idle < previous.idle) return null;
	return Math.min(100, Math.max(0, (1 - (current.idle - previous.idle) / (current.total - previous.total)) * 100));
}
export const historySlot = (at: Date) => Math.floor(at.getTime() / MINUTE) % HISTORY_SLOTS;
const emptyMeasurement = (): Measurement => ({ cpuPercent: null, memoryUsed: null, memoryTotal: null, apiMemory: null, diskAvailable: null, diskTotal: null, databaseBytes: null });
let previousCpu: CpuCounter | null = null;
let storage: Pick<Measurement, 'diskAvailable' | 'diskTotal' | 'databaseBytes'> = { diskAvailable: null, diskTotal: null, databaseBytes: null };
let storageAt = 0;

async function measure(now: number): Promise<Measurement> {
	const result = emptyMeasurement();
	const current = await readFile('/proc/stat', 'utf8').then(parseCpuCounter).catch(() => null);
	result.cpuPercent = cpuPercentage(previousCpu, current);
	previousCpu = current;
	const total = totalmem();
	// /proc reports the Docker Linux kernel's memory, not the Windows/macOS host.
	const available = await readFile('/proc/meminfo', 'utf8').then(content => {
		const match = content.match(/^MemAvailable:\s+(\d+)\s+kB$/m);
		return match ? Number(match[1]) * 1024 : freemem();
	}).catch(() => freemem());
	result.memoryTotal = total > 0 ? total : null;
	result.memoryUsed = total > 0 ? Math.max(0, total - available) : null;
	result.apiMemory = process.memoryUsage.rss();
	if (now - storageAt >= 5 * MINUTE) {
		const [disk, database] = await Promise.allSettled([
			statfs('/monitor/database', { bigint: true }),
			getPrisma().$queryRaw<Array<{ bytes: bigint }>>`SELECT pg_database_size(current_database()) AS bytes`
		]);
		storage = {
			diskAvailable: disk.status === 'fulfilled' ? Number(disk.value.bavail * disk.value.bsize) : null,
			diskTotal: disk.status === 'fulfilled' ? Number(disk.value.blocks * disk.value.bsize) : null,
			databaseBytes: database.status === 'fulfilled' ? Number(database.value[0].bytes) : null
		};
		storageAt = now;
	}
	return { ...result, ...storage };
}

let started = false;
let busy = false;
export async function collectSystemMetrics(): Promise<void> {
	if (!metricsEnabled() || busy) return;
	busy = true;
	try {
		const at = new Date(Math.floor(Date.now() / MINUTE) * MINUTE);
		const slot = historySlot(at);
		await getPrisma().$transaction(async tx => {
			const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(735021, 1) AS acquired`;
			if (!lock.acquired) return;
			const previous = await tx.systemMetricSample.findUnique({ where: { slot } });
			if (previous && previous.measuredAt >= at) return;
			const measurement = await measure(Date.now());
			await tx.systemMetricSample.upsert({ where: { slot }, create: { slot, measuredAt: at, measurement }, update: { measuredAt: at, measurement, deletedAt: null } });
		}, { timeout: 15_000 });
	} finally { busy = false; }
}

export function startSystemMetrics(): void {
	if (started || !metricsEnabled()) return;
	started = true;
	const tick = () => { void collectSystemMetrics().catch(() => console.warn('System metrics collection unavailable.')); };
	tick();
	setInterval(tick, MINUTE).unref();
}

export const metricFields = Object.keys(emptyMeasurement()) as Array<keyof Measurement>;
function readMeasurement(value: unknown): Measurement {
	const source = value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
	const result = emptyMeasurement();
	// Only return supported fields, including when reading older stored samples.
	for (const field of metricFields) {
		const number = source[field];
		if (typeof number === 'number' && Number.isFinite(number)) result[field] = number;
	}
	return result;
}
export function aggregateMetrics(rows: Array<{ measuredAt: Date; measurement: unknown }>, from: number, to: number, bucketMs: number) {
	const buckets = new Map<number, Measurement[]>();
	for (const row of rows) {
		const time = row.measuredAt.getTime();
		if (time < from || time > to) continue;
		const at = Math.floor(time / bucketMs) * bucketMs;
		const values = buckets.get(at) ?? [];
		values.push(readMeasurement(row.measurement)); buckets.set(at, values);
	}
	const result = [];
	for (let at = Math.floor(from / bucketMs) * bucketMs; at <= to; at += bucketMs) {
		const rows = buckets.get(at) ?? [];
		const average = emptyMeasurement(); const maximum = emptyMeasurement();
		for (const field of metricFields) {
			const values = rows.map(row => row[field]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
			if (values.length) { average[field] = values.reduce((a, b) => a + b, 0) / values.length; maximum[field] = Math.max(...values); }
		}
		result.push({ at: new Date(at).toISOString(), samples: rows.length, average, maximum });
	}
	return result;
}

export async function readSystemMetrics(period: '1h' | '24h' | '7d') {
	if (!metricsEnabled()) return { supported: false as const };
	const duration = { '1h': 60 * MINUTE, '24h': 24 * 60 * MINUTE, '7d': HISTORY_SLOTS * MINUTE }[period];
	const bucketMs = { '1h': MINUTE, '24h': 5 * MINUTE, '7d': 30 * MINUTE }[period];
	const now = Date.now();
	const db = getPrisma();
	const [rows, latest] = await Promise.all([
		db.systemMetricSample.findMany({ where: { deletedAt: null, measuredAt: { gte: new Date(now - duration), lte: new Date(now) } }, select: { measuredAt: true, measurement: true }, orderBy: { measuredAt: 'asc' } }),
		db.systemMetricSample.findFirst({ where: { deletedAt: null, measuredAt: { gte: new Date(now - HISTORY_SLOTS * MINUTE), lte: new Date(now) } }, select: { measuredAt: true, measurement: true }, orderBy: { measuredAt: 'desc' } })
	]);
	const cpu = cpus();
	return {
		supported: true as const, period, bucketMinutes: bucketMs / MINUTE,
		from: new Date(now - duration).toISOString(), to: new Date(now).toISOString(),
		cpuModel: cpu[0]?.model ?? null, logicalCores: cpu.length || null,
		runtimeUptimeSeconds: uptime(),
		latest: latest ? { at: latest.measuredAt.toISOString(), ...readMeasurement(latest.measurement) } : null,
		history: aggregateMetrics(rows, now - duration, now, bucketMs)
	};
}
