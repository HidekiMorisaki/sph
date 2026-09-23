import { error as httpError, json } from '@sveltejs/kit';

export type ApiErrorDetail = {
	field?: string;
	reason: string;
};

export function throwApiError(
	responseCode: number,
	code: string,
	message: string,
	details: ApiErrorDetail[] = []
): never {
	return httpError(responseCode, {
		message,
		status: 'error',
		responseCode,
		error: { code, message, details }
	});
}

export function success<T>(data: T, responseCode = 200, meta?: Record<string, unknown>) {
	return json(
		{
			status: 'success',
			responseCode,
			data,
			...(meta ? { meta } : {})
		},
		{ status: responseCode }
	);
}

export function failure(
	responseCode: number,
	code: string,
	message: string,
	details: ApiErrorDetail[] = []
) {
	return json(
		{
			status: 'error',
			responseCode,
			error: { code, message, details }
		},
		{ status: responseCode }
	);
}
