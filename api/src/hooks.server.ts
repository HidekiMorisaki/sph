import type { Handle, HandleServerError } from '@sveltejs/kit';
import { isHttpError, json } from '@sveltejs/kit';

import { failure } from '$lib/server/api/response';
import { beginRequestDiagnostic, recordRequestError, finishRequestDiagnostic } from '$lib/server/api/request-diagnostics';
import { authenticateRequest } from '$lib/server/auth/request';
import { SESSION_COOKIE_NAME } from '$lib/server/auth/session';
import { granularOperationForRoute } from '$lib/server/auth/route-operation';
import { ownBranchOperations, hasPermissionOperation, hasOwnBranchPermissionOperation } from '$lib/server/auth/permissions';
import { startSystemMetrics } from '$lib/server/system-metrics';
import { startEmployeeDeletions } from '$lib/server/api/employee-offboarding';

export const init = () => { startSystemMetrics(); startEmployeeDeletions(); };

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
			const body = error.body as { status?: string; responseCode?: number };
			response = body.status === 'error' && body.responseCode === error.status
				? json(error.body, { status: error.status })
				: failure(error.status, 'INVALID_REQUEST', 'The request could not be completed.');
		} else response = failure(500, 'INTERNAL_ERROR', 'The request could not be completed.');
	}
	const headers = new Headers(response.headers);
	headers.set('x-request-id', finishRequestDiagnostic(context.event, response.status));
	headers.set('cache-control', 'private, no-store');
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};

export const handleError: HandleServerError = ({ status, error, event }) => {
	recordRequestError(event, error);
	const responseCode = status >= 400 && status <= 599 ? status : 500;
	const message = responseCode >= 500 ? 'The request could not be completed.' : 'The requested API resource was not found.';
	return {
		message,
		status: 'error',
		responseCode,
		error: {
			code: responseCode >= 500 ? 'INTERNAL_ERROR' : 'NOT_FOUND',
			message,
			details: []
		}
	};
};
