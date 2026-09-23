export function load({ params }: { params: { resource: string } }) {
	return { resource: params.resource };
}
