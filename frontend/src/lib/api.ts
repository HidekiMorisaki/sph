export type ApiSuccess<T> = {
	status: 'success';
	responseCode: number;
	data: T;
	meta?: Record<string, unknown>;
};

export async function apiData<T>(response: Response): Promise<T> {
	const payload = (await response.json()) as ApiSuccess<T>;
	return payload.data;
}
