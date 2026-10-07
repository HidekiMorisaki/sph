export type OperatingSystemParts = {
	vendor: { name: string };
	product: string;
	version: string;
	edition?: string | null;
	architecture?: string | null;
};

export function operatingSystemName(item: OperatingSystemParts): string {
	const base = [item.vendor.name, item.product, item.version, item.edition].filter(Boolean).join(' ');
	return item.architecture ? `${base} (${item.architecture})` : base;
}
