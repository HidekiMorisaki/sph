import { localeMessages, type MessageLanguage } from './locale-messages';

export function localizedReleaseText(messageId: string, language: MessageLanguage): string {
	const messages = localeMessages[language].systemReleases;
	return messages[messageId as keyof typeof messages] ?? localeMessages[language].systemSettings.informationFailed;
}
