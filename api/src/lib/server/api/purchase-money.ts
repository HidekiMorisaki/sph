import { throwApiError } from './response';

/** Decimal strings avoid rounding money through binary floating point. */
export function purchaseMoney(body: Record<string, unknown>, amountField = 'purchaseAmount', currencyField = 'purchaseCurrency', prefix = '') {
	const raw = body[amountField];
	const amount = typeof raw === 'number' && Number.isSafeInteger(raw) ? String(raw) : raw;
	if (typeof amount !== 'string' || !/^\d{1,14}(?:\.\d{1,2})?$/.test(amount))
		throwApiError(422, 'INVALID_FIELD', 'Enter a tax-inclusive purchase amount of zero or more, with at most two decimal places.', [{ field: prefix + amountField, reason: 'INVALID_PURCHASE_AMOUNT' }]);
	const currency = body[currencyField];
	if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency))
		throwApiError(422, 'INVALID_FIELD', 'Select a purchase currency.', [{ field: prefix + currencyField, reason: 'INVALID_PURCHASE_CURRENCY' }]);
	return { amount, currency };
}
