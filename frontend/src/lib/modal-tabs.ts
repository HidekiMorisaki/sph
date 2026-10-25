import { localeMessages } from '$lib/locale-messages';
import { bookPurchaseMessages } from '$lib/book-purchase-messages';
import { scheduleText } from '$lib/schedule-text';

export type ModalTabKind = 'basic' | 'asset' | 'employee' | 'branch' | 'client' | 'team' | 'contract' | 'book' | 'role' | 'schedule';
export type ModalTabDefinition = { id: string; label: string };

/** One vocabulary and order for the read and write views of each resource. */
export function modalTabs(kind: ModalTabKind, language: 'ja' | 'en'): ModalTabDefinition[] {
	const m = localeMessages[language], c = m.common;
	const definitions: Record<ModalTabKind, () => Array<[string, string]>> = {
        schedule: () => { const s=scheduleText[language];return [['scope',s.scope],['basic',s.title],['attendees',s.attendees],['room',s.location],['repeat',s.repeat],['availability',s.availability]]; },
		basic: () => [['basic', c.basicInformation]],
		asset: () => [['basic', m.assets.basic], ['hardware', m.assets.hardware], ['location', m.assets.location], ['network', c.detailNetworkCredentials]],
		employee: () => [['basic', m.employees.basic], ['employment', m.employees.employment], ['participations', m.employees.participationsTab], ['skills', m.workforce.skills], ['system', m.employees.system]],
		branch: () => [['basic', m.masters.basicInformation], ['contact', c.detailContactInformation]],
		client: () => [['basic', m.workforce.information], ['contact', c.detailContactInformation]],
		team: () => [['basic', m.teams.information], ['members', m.teams.members]],
		contract: () => [['basic', c.detailContractInformation], ['purchase', m.software.purchaseDetails], ['terms', m.software.usageTerms], ['usage', c.detailUsageInformation], ['keys', m.software.key]],
		book: () => [['basic', c.detailBookInformation], ['purchase', bookPurchaseMessages[language].heading], ['copies', c.detailCopyLoans]],
		role: () => [['basic', c.basicInformation], ['permissions', m.systemSettings.permissionHeading]]
	};
	return definitions[kind]().map(([id, label]) => ({ id, label }));
}

let pendingEditorTab = 'basic';
export function prepareEditorTab(trigger: HTMLElement): void {
	const dialog = trigger.closest('dialog');
	const selected = dialog?.querySelector<HTMLElement>('[data-detail-tabs-root]')?.dataset.active
		?? dialog?.querySelector<HTMLElement>('.employee-detail-tabs [aria-selected=true]')?.dataset.pageTab;
	pendingEditorTab = selected && selected !== 'history' ? selected : 'basic';
}
export function initialEditorTab(): string {
	const tab = pendingEditorTab;
	pendingEditorTab = 'basic';
	return tab;
}
