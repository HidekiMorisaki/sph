import { createHash } from 'node:crypto';
import { Prisma } from '$lib/server/generated/prisma/client';
import { failure, type ApiErrorDetail } from './response';

export class BookInputError extends Error {
	constructor(public details: ApiErrorDetail[]) { super('Invalid book input.'); }
}

export function bookErrorResponse(error: unknown) {
	if (error instanceof BookInputError) return failure(422, 'VALIDATION_ERROR', 'Check the book fields.', error.details);
	if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002' && JSON.stringify('meta' in error ? error.meta : '').includes('isbn')) return failure(409, 'DUPLICATE_BOOK_ISBN', 'This ISBN is already registered.', [{ field: 'isbn', reason: 'DUPLICATE_VALUE' }]);
	if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return failure(409, 'DUPLICATE_BOOK_CODE', 'A book code already exists.');
	return null;
}

export function objectBody(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BookInputError([{ reason: 'INVALID_OBJECT' }]);
	return value as Record<string, unknown>;
}

export function requiredText(value: unknown, field: string, max: number): string {
	if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new BookInputError([{ field, reason: 'REQUIRED_OR_TOO_LONG' }]);
	return value.trim();
}

export function optionalText(value: unknown, field: string, max: number): string | null {
	if (value == null || value === '') return null;
	if (typeof value !== 'string' || value.trim().length > max) throw new BookInputError([{ field, reason: 'INVALID_OR_TOO_LONG' }]);
	return value.trim() || null;
}

export function positiveId(value: unknown, field: string): number {
	if (!Number.isSafeInteger(value) || (value as number) < 1) throw new BookInputError([{ field, reason: 'INVALID_ID' }]);
	return value as number;
}

export function dateField(value: unknown, field: string, required = false): Date | null {
	if (value == null || value === '') {
		if (required) throw new BookInputError([{ field, reason: 'REQUIRED' }]);
		return null;
	}
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BookInputError([{ field, reason: 'INVALID_DATE' }]);
	const date = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BookInputError([{ field, reason: 'INVALID_DATE' }]);
	return date;
}

export async function nextBookCode(tx: Prisma.TransactionClient, sequence: 'book_catalog_code_seq' | 'book_copy_code_seq' | 'book_reservation_code_seq' | 'book_loan_code_seq', prefix: string): Promise<string> {
	const rows = await tx.$queryRaw<Array<{ value: string }>>(Prisma.sql`SELECT nextval(${sequence}::regclass)::text AS value`);
	return `${prefix}-${rows[0].value.padStart(6, '0')}`;
}

export function contentHash(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export async function recordBookChange(tx: Prisma.TransactionClient, actorId: number, resource: string, resourceId: number, action: string, changes: Prisma.InputJsonValue) {
	await tx.bookChangeHistory.create({ data: { actorId, resource, resourceId, action, changes } });
}
