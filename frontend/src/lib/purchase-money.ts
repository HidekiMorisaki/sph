import type { MessageLanguage } from './locale-messages';
export const purchaseText = {
	ja: { amount: '購入金額（税込み）', currency: '通貨', unregistered: '未登録', apply: '購入金額と通貨をすべての現物に反映', referenceInfo: '参考価格について', invalidAmount: '0以上、小数2桁以内の金額を入力してください。', invalidCurrency: '通貨を選択してください。', loading: '書誌APIから参考価格を取得中…', missing: '参考価格を自動取得できませんでした。購入金額を入力してください。', automatic: 'APIの税込価格を参考に、実際の購入金額を確認してください。割引・譲渡の場合は金額を修正できます。', estimated: '参考価格：税抜{source} JPYから税率10%で換算した{amount} JPY（1円未満切り捨て）。実際の購入金額を確認し、割引・譲渡の場合は修正してください。' },
	en: { amount: 'Purchase amount (tax included)', currency: 'Currency', unregistered: 'Not registered', apply: 'Apply purchase amount and currency to all copies', referenceInfo: 'About the reference price', invalidAmount: 'Enter zero or more with at most two decimal places.', invalidCurrency: 'Select a currency.', loading: 'Looking up the book reference price…', missing: 'No reference price was available. Enter the purchase amount.', automatic: 'Check the actual purchase amount against the API tax-inclusive price. Adjust it for discounts or free transfers.', estimated: 'Reference estimate: {source} JPY excluding tax, converted to {amount} JPY at 10% tax (rounded down to whole yen). Check the actual purchase amount and adjust for discounts or free transfers.' }
};
export function validPurchaseAmount(value: string): boolean { return /^\d{1,14}(?:\.\d{1,2})?$/.test(value); }
export function displayPurchaseMoney(amount: string | null | undefined, currency: string | null | undefined, language: MessageLanguage): string {
	return amount === null || amount === undefined || amount === '' ? purchaseText[language].unregistered : `${amount} ${currency ?? ''}`.trim();
}
