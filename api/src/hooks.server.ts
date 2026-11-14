import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { isHttpError, json } from '@sveltejs/kit';

import { failure } from '#lib/server/api/response.js';
import { beginRequestDiagnostic, recordRequestError, finishRequestDiagnostic } from '#lib/server/api/request-diagnostics.js';
import { authenticateRequest } from '#lib/server/auth/request.js';
import { SESSION_COOKIE_NAME } from '#lib/server/auth/session.js';
import { granularOperationForRoute } from '#lib/server/auth/route-operation.js';
import { ownBranchOperations, hasPermissionOperation, hasOwnBranchPermissionOperation } from '#lib/server/auth/permissions.js';
import { startSystemMetrics } from '#lib/server/system-metrics.js';
import { isEmployeeMasterResource } from '#lib/server/api/employee-masters.js';
import { isItAssetMasterResource } from '#lib/server/api/it-asset-masters.js';
import { startEmployeeDeletions } from '#lib/server/api/employee-offboarding.js';

export const init = () => { startSystemMetrics(); startEmployeeDeletions(); };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Kit 3's public App.Error has a numeric status. Keep that internal convention
// while retaining the existing REST status:'error'/responseCode contract.
function apiErrorBody(value: unknown, status: number): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null;
    const body = value as Record<string, unknown>;
    if (body.responseCode !== status || (body.status !== 'error' && body.status !== status)) return null;
    if (!body.error || typeof body.error !== 'object') return null;
    const detail = body.error as Record<string, unknown>;
    if (typeof detail.code !== 'string' || typeof detail.message !== 'string' || !Array.isArray(detail.details)) return null;
    return {...body, status:'error', responseCode:status};
}


const handleRequest: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('//')) return failure(400, 'INVALID_REQUEST', 'Invalid request path.');
	if (event.url.pathname.startsWith('/v1/') && !SAFE_METHODS.has(event.request.method)) {
		const origin = event.request.headers.get('origin');
		if (origin !== event.url.origin) {
			return failure(403, 'INVALID_ORIGIN', 'The request origin is not allowed.');
		}
	}

	const principal = await authenticateRequest({ sessionToken: event.cookies.get(SESSION_COOKIE_NAME) });
	event.locals.principal = principal;
	event.locals.user = principal?.user ?? null;
	event.locals.session = principal
		? { id: principal.authentication.credentialId, expiresAt: principal.authentication.expiresAt }
		: null;
	if (event.url.pathname.startsWith('/v1/') && event.route.id === null) {
		return failure(404, 'NOT_FOUND', 'The requested API resource was not found.');
	}
	if ((event.route.id === '/v1/[master]' || event.route.id === '/v1/[master]/[id]') &&
		!isEmployeeMasterResource(event.params.master ?? '') && !isItAssetMasterResource(event.params.master ?? '')) {
		return failure(404, 'NOT_FOUND', 'The requested API resource was not found.');
	}
	const granularOperation = granularOperationForRoute(event.route.id, event.request.method, event.params);
	if (granularOperation) {
		if (!event.locals.user) return failure(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
		event.locals.user.activeOperation = granularOperation;
		if (!hasPermissionOperation(event.locals.user, granularOperation) &&
			!(ownBranchOperations.has(granularOperation) && hasOwnBranchPermissionOperation(event.locals.user, granularOperation))) {
			return failure(403, 'PERMISSION_REQUIRED', 'Permission is required.');
		}
	}

	const response = await resolve(event);
	if (event.url.pathname.startsWith('/v1/') && response.status >= 400) {
		let hasEnvelope = false;
		if (response.headers.get('content-type')?.includes('application/json')) {
			const body = await response.clone().json().catch(() => null) as Record<string, unknown> | null;
            hasEnvelope = body?.status === 'error' && body.responseCode === response.status;
            if (!hasEnvelope) {
                const envelope = apiErrorBody(body, response.status);
                if (envelope) {
                    const headers = new Headers(response.headers);
                    headers.delete('content-length');
                    return json(envelope, {status:response.status, headers});
                }
            }
		}
		if (hasEnvelope) return response;

		const messages: Record<number, [string, string]> = {
			400: ['INVALID_REQUEST', 'The request is invalid.'],
			401: ['AUTHENTICATION_REQUIRED', 'Authentication is required.'],
			403: ['FORBIDDEN', 'Access to this resource is forbidden.'],
			404: ['NOT_FOUND', 'The requested API resource was not found.'],
			405: ['METHOD_NOT_ALLOWED', 'The HTTP method is not allowed for this resource.'],
			413: ['PAYLOAD_TOO_LARGE', 'The request payload is too large.'],
			422: ['INVALID_REQUEST', 'The request is invalid.']
		};
		const [code, message] = messages[response.status] ?? ['INTERNAL_ERROR', 'The request could not be completed.'];
		return failure(response.status, code, message);
	}
	return response;
};

export const handle: Handle = async context => {
	if (!context.event.url.pathname.startsWith('/v1/')) return handleRequest(context);
	beginRequestDiagnostic(context.event);
	let response: Response;
	try { response = await handleRequest(context); }
	catch (error) {
		recordRequestError(context.event, error);
		if (isHttpError(error)) {
            const body = apiErrorBody(error.body, error.status);
            response = body ? json(body, {status:error.status})
                : failure(error.status, 'INVALID_REQUEST', 'The request could not be completed.');
		} else response = failure(500, 'INTERNAL_ERROR', 'The request could not be completed.');
	}
	const headers = new Headers(response.headers);
	headers.set('x-request-id', finishRequestDiagnostic(context.event, response.status));
	headers.set('cache-control', 'private, no-store');
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export const handleError: HandleServerError = ({ kind, error, event }) => {
	recordRequestError(event, error);
	if (kind === 'app' && apiErrorBody(error, error.status)) return error;
	const status = kind === 'unknown' ? 500 : error.status;
	const responseCode = status >= 400 && status <= 599 ? status : 500;
	const message = responseCode >= 500 ? 'The request could not be completed.' : 'The requested API resource was not found.';
	return {
		message,
		status: responseCode,
		responseCode,
		error: {
			code: responseCode >= 500 ? 'INTERNAL_ERROR' : 'NOT_FOUND',
			message,
			details: []
		}
	};
};
