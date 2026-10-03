<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData } from '$lib/api';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import SocialLinkIcon from '$lib/components/SocialLinkIcon.svelte';
	import { socialLinkPlatforms, type EmployeeProfile, type EmployeeSocialLink, type SocialLinkPlatform } from '$lib/employees';
	import { localization as appliedLocalization, applyLocalization, DEFAULT_LOCALIZATION, displayLanguageOptions, genderOptions, personNameFields, type DisplayLanguage, type LocalizationSettings } from '$lib/localization';

	import { localeMessages } from '$lib/locale-messages';
	import { settingsFieldError, settingsSaveError } from '$lib/settings-messages';
	const text = $derived(localeMessages[$appliedLocalization.displayLanguage].settings);
	const nameFields = $derived(personNameFields($appliedLocalization));
	const fieldError = (reason: string) => settingsFieldError(reason, $appliedLocalization.displayLanguage);
	type ApiErrorPayload = { error?: { code?: string; message?: string; details?: Array<{ field?: string; reason: string }> } };
	type ProfileForm = Omit<EmployeeProfile, 'id' | 'birthDate'> & { birthDate: string };
	type ProfileField = keyof ProfileForm;
	type SocialLinkValues = Record<SocialLinkPlatform, string>;
	type SettingsSection = 'profile' | 'social-links' | 'localization' | 'password';
	const settingsSections: SettingsSection[] = ['profile', 'social-links', 'localization', 'password'];
	const bloodTypes = ['A', 'B', 'AB', 'O'].map((value) => ({ value, label: value }));
	const languageOptions = displayLanguageOptions();
	const fallbackTimeZones = ['Asia/Tokyo', 'UTC', 'America/Los_Angeles', 'America/New_York', 'Europe/London', 'Europe/Paris'];
	const supportedValuesOf = (Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] }).supportedValuesOf;
	const timeZoneOptions = (supportedValuesOf?.('timeZone') ?? fallbackTimeZones).map((value) => ({ value, label: value.replaceAll('_', ' '), searchTerms: [value] }));
	const blankProfile = (): ProfileForm => ({ firstName: '', middleName: null, lastName: '', nameKana: null, birthDate: '', gender: '', bloodType: null, postalCode: null, prefecture: null, city: null, streetAddress: null, buildingName: null, mobilePhone: null, email: '' });
	const profileForm = (saved: EmployeeProfile): ProfileForm => { const { id: _id, birthDate, ...fields } = saved; return { ...fields, birthDate: birthDate.slice(0, 10) }; };
	const blankSocialLinks = (): SocialLinkValues => Object.fromEntries(socialLinkPlatforms.map(({ value }) => [value, ''])) as SocialLinkValues;

	let loading = $state(true);
	let loadError = $state('');
	let profile = $state(blankProfile());
	let profileSaving = $state(false);
	let profileMessage = $state('');
	let profileErrors = $state<Record<string, string>>({});
	let birthDateOpen = $state(false);
	let localization = $state<LocalizationSettings>({ ...DEFAULT_LOCALIZATION });
	let genders = $derived(genderOptions($appliedLocalization));
	let localizationSaving = $state(false);
	let localizationMessage = $state('');
	let localizationErrors = $state<Record<string, string>>({});
	let socialLinks = $state<SocialLinkValues>(blankSocialLinks());
	let socialLinksSaving = $state(false);
	let socialLinksMessage = $state('');
	let socialLinkErrors = $state<Partial<Record<SocialLinkPlatform, string>>>({});
	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmation = $state('');
	let passwordSaving = $state(false);
	let passwordMessage = $state('');
	let passwordErrors = $state<Record<string, string>>({});
	let currentPasswordInput = $state<HTMLInputElement>();
	let activeSection = $state<SettingsSection>('profile');
	let scrollFrame: number | null = null;
	let navigationLockUntil = 0;

	const passwordRules = $derived([
		{ text: text.ruleLength, met: newPassword.length >= 12 },
		{ text: text.ruleUpper, met: /[A-Z]/.test(newPassword) },
		{ text: text.ruleLower, met: /[a-z]/.test(newPassword) },
		{ text: text.ruleNumber, met: /\d/.test(newPassword) }
	]);

	function nullable(value: string | null) { const trimmed = value?.trim() ?? ''; return trimmed || null; }
	function profilePayload() {
		return { ...profile, firstName: profile.firstName.trim(), middleName: nullable(profile.middleName), lastName: profile.lastName.trim(), nameKana: nullable(profile.nameKana), bloodType: nullable(profile.bloodType), postalCode: nullable(profile.postalCode), prefecture: nullable(profile.prefecture), city: nullable(profile.city), streetAddress: nullable(profile.streetAddress), buildingName: nullable(profile.buildingName), mobilePhone: nullable(profile.mobilePhone), email: profile.email.trim() };
	}
	function setApiErrors(body: ApiErrorPayload | null) { return Object.fromEntries((body?.error?.details ?? []).flatMap((detail) => detail.field ? [[detail.field, detail.reason]] : [])); }
	function clearProfileError(field: ProfileField) { if (!profileErrors[field]) return; const next = { ...profileErrors }; delete next[field]; profileErrors = next; }
	function updateProfile(field: ProfileField, value: string) { profile[field] = value; clearProfileError(field); profileMessage = ''; }
	function focusProfile(field: string) {
		window.setTimeout(() => {
			const input = document.querySelector<HTMLElement>(field === 'birthDate' ? '[data-field="birthDate"] .date-trigger' : field === 'gender' || field === 'bloodType' ? `[data-field="${field}"] .form-select-trigger` : `[name="${field}"]`);
			input?.focus({ preventScroll: true });
			input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}, 50);
	}
	function updateActiveSection() {
		scrollFrame = null;
		if (window.performance.now() < navigationLockUntil) return;
		const marker = 104;
		let next: SettingsSection = 'profile';
		for (const section of settingsSections) {
			const element = document.getElementById(section);
			if (element && element.getBoundingClientRect().top <= marker) next = section;
		}
		if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) next = 'password';
		activeSection = next;
	}
	function scheduleActiveSectionUpdate() {
		if (scrollFrame === null) scrollFrame = window.requestAnimationFrame(updateActiveSection);
	}
	function selectSection(event: MouseEvent, section: SettingsSection) {
		event.preventDefault();
		activeSection = section;
		navigationLockUntil = window.performance.now() + 1200;
		document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}
	async function initializeSectionNavigation() {
		await tick();
		const hashSection = window.location.hash.slice(1);
		if (settingsSections.includes(hashSection as SettingsSection)) {
			activeSection = hashSection as SettingsSection;
			document.getElementById(activeSection)?.scrollIntoView({ block: 'start' });
			window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
		} else updateActiveSection();
	}

	async function load() {
		try {
			const [profileResponse, settingsResponse, socialLinksResponse] = await Promise.all([fetch('/v1/employees/me'), fetch('/v1/settings'), fetch('/v1/settings/social-links')]);
			if ([profileResponse, settingsResponse, socialLinksResponse].some((response) => response.status === 401)) { window.location.assign('/'); return; }
			if (!profileResponse.ok || !settingsResponse.ok || !socialLinksResponse.ok) throw new Error();
			const savedProfile = await apiData<EmployeeProfile>(profileResponse);
			profile = profileForm(savedProfile);
			localization = await apiData<LocalizationSettings>(settingsResponse);
			const savedLinks = await apiData<EmployeeSocialLink[]>(socialLinksResponse);
			socialLinks = { ...blankSocialLinks(), ...Object.fromEntries(savedLinks.map(({ platform, url }) => [platform, url])) };
			await applyLocalization(localization);
		} catch { loadError = 'loadFailed'; }
		finally { loading = false; await initializeSectionNavigation(); }
	}

	async function saveProfile() {
		profileMessage = ''; profileErrors = {};
		if (!profile.firstName.trim()) profileErrors.firstName = 'firstNameRequired';
		if (!profile.lastName.trim()) profileErrors.lastName = 'lastNameRequired';
		if (!profile.birthDate) profileErrors.birthDate = 'birthDateRequired';
		if (!profile.gender) profileErrors.gender = 'genderRequired';
		const postalCode = profile.postalCode?.trim() ?? '';
		if (postalCode && !/^\d{3}-?\d{4}$/.test(postalCode)) profileErrors.postalCode = 'postalCodeInvalid';
		const mobilePhone = profile.mobilePhone?.trim() ?? '';
		if (mobilePhone && !/^[+0-9][0-9 ()-]{6,31}$/.test(mobilePhone)) profileErrors.mobilePhone = 'phoneInvalid';
		const email = profile.email.trim();
		if (!email) profileErrors.email = 'emailRequired';
		else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) profileErrors.email = 'emailInvalid';
		const firstError = Object.keys(profileErrors)[0];
		if (firstError) { await tick(); focusProfile(firstError); return; }
		profileSaving = true;
		try {
			const response = await fetch('/v1/employees/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profilePayload()) });
			if (!response.ok) {
				const body = await response.json().catch(() => null) as ApiErrorPayload | null;
				const errors = setApiErrors(body);
				profileErrors = errors; profileMessage = settingsSaveError(body?.error?.code, response.status, 'profileFailed');
				const field = Object.keys(errors)[0]; if (field) { await tick(); focusProfile(field); }
				return;
			}
			const saved = await apiData<EmployeeProfile>(response);
			profile = profileForm(saved);
			window.dispatchEvent(new CustomEvent('profile-updated', { detail: { firstName: saved.firstName, middleName: saved.middleName, lastName: saved.lastName } }));
			profileMessage = 'profileSaved';
		} catch { profileMessage = 'profileConnectionFailed'; }
		finally { profileSaving = false; }
	}

	async function saveLocalization() {
		localizationMessage = ''; localizationErrors = {}; localizationSaving = true;
		try {
			const response = await fetch('/v1/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(localization) });
			if (!response.ok) { const body = await response.json().catch(() => null) as ApiErrorPayload | null; localizationErrors = setApiErrors(body); localizationMessage = settingsSaveError(body?.error?.code, response.status, 'localizationFailed'); return; }
			localization = await apiData<LocalizationSettings>(response); await applyLocalization(localization); localizationMessage = 'localizationSaved';
		} catch { localizationMessage = 'localizationConnectionFailed'; }
		finally { localizationSaving = false; }
	}

	function updateSocialLink(platform: SocialLinkPlatform, value: string) {
		socialLinks[platform] = value;
		if (socialLinkErrors[platform]) { const next = { ...socialLinkErrors }; delete next[platform]; socialLinkErrors = next; }
		socialLinksMessage = '';
	}

	async function saveSocialLinks() {
		socialLinksMessage = ''; socialLinkErrors = {};
		const links = socialLinkPlatforms.flatMap(({ value: platform }) => {
			const url = socialLinks[platform].trim();
			if (!url) return [];
			try {
				const parsed = new URL(url);
				if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || !parsed.hostname) throw new Error();
			} catch { socialLinkErrors[platform] = 'urlInvalid'; }
			return [{ platform, url }];
		});
		if (Object.keys(socialLinkErrors).length) { await tick(); document.querySelector<HTMLInputElement>('.social-links-grid input[aria-invalid="true"]')?.focus(); return; }
		socialLinksSaving = true;
		try {
			const response = await fetch('/v1/settings/social-links', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ links }) });
			if (!response.ok) {
				const body = await response.json().catch(() => null) as ApiErrorPayload | null;
				for (const detail of body?.error?.details ?? []) {
					const match = detail.field?.match(/^links\.(\d+)\.url$/);
					const platform = match ? links[Number(match[1])]?.platform : undefined;
					if (platform) socialLinkErrors[platform] = detail.reason;
				}
				socialLinksMessage = settingsSaveError(body?.error?.code, response.status, 'socialFailed');
				return;
			}
			const saved = await apiData<EmployeeSocialLink[]>(response);
			socialLinks = { ...blankSocialLinks(), ...Object.fromEntries(saved.map(({ platform, url }) => [platform, url])) };
			socialLinksMessage = 'socialSaved';
		} catch { socialLinksMessage = 'socialConnectionFailed'; }
		finally { socialLinksSaving = false; }
	}

	function clearPasswordError(field: string) { if (passwordErrors[field]) { const next = { ...passwordErrors }; delete next[field]; passwordErrors = next; } passwordMessage = ''; }
	async function changePassword() {
		passwordMessage = ''; passwordErrors = {};
		if (!currentPassword) passwordErrors.currentPassword = 'currentPasswordRequired';
		if (!passwordRules.every((rule) => rule.met)) passwordErrors.newPassword = 'passwordRequirementsUnmet';
		if (confirmation !== newPassword) passwordErrors.confirmation = 'passwordMismatch';
		if (Object.keys(passwordErrors).length) { await tick(); (passwordErrors.currentPassword ? currentPasswordInput : document.querySelector<HTMLInputElement>(passwordErrors.newPassword ? '[name="newPassword"]' : '[name="confirmation"]'))?.focus(); return; }
		passwordSaving = true;
		try {
			const response = await fetch('/v1/auth/password', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ currentPassword, newPassword, confirmation }) });
			if (!response.ok) { const body = await response.json().catch(() => null) as ApiErrorPayload | null; passwordErrors = setApiErrors(body); passwordMessage = settingsSaveError(body?.error?.code, response.status, 'passwordFailed'); const field = Object.keys(passwordErrors)[0]; await tick(); document.querySelector<HTMLInputElement>(`[name="${field}"]`)?.focus(); return; }
			currentPassword = ''; newPassword = ''; confirmation = ''; passwordMessage = 'passwordChanged'; window.setTimeout(() => window.location.assign('/'), 900);
		} catch { passwordMessage = 'passwordConnectionFailed'; }
		finally { passwordSaving = false; }
	}

	onMount(() => {
		window.addEventListener('scroll', scheduleActiveSectionUpdate, { passive: true });
		window.addEventListener('resize', scheduleActiveSectionUpdate);
		void load();
		return () => {
			window.removeEventListener('scroll', scheduleActiveSectionUpdate);
			window.removeEventListener('resize', scheduleActiveSectionUpdate);
			if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
		};
	});
</script>


<AssetManagementShell title={text.title}>
	<div class="settings-page">
		<MasterPageHeader title={text.title} description={text.description} />
		{#if loading}<div class="page-state">{text.loading}</div>
		{:else if loadError}<div class="page-state error" role="alert">{fieldError(loadError)}</div>
		{:else}
			<div class="settings-layout">
				<nav class="settings-nav" aria-label={text.sections}><a class:active={activeSection === 'profile'} href="#profile" aria-current={activeSection === 'profile' ? 'location' : undefined} onclick={(event) => selectSection(event, 'profile')}>{text.profile}</a><a class:active={activeSection === 'social-links'} href="#social-links" aria-current={activeSection === 'social-links' ? 'location' : undefined} onclick={(event) => selectSection(event, 'social-links')}>{text.socialLinks}</a><a class:active={activeSection === 'localization'} href="#localization" aria-current={activeSection === 'localization' ? 'location' : undefined} onclick={(event) => selectSection(event, 'localization')}>{text.localization}</a><a class:active={activeSection === 'password'} href="#password" aria-current={activeSection === 'password' ? 'location' : undefined} onclick={(event) => selectSection(event, 'password')}>{text.password}</a></nav>
				<div class="settings-content">
					<section id="profile" class="settings-card" aria-labelledby="profile-title">
						<header><div><h2 id="profile-title">{text.profile}</h2><p>{text.profileDescription}</p></div></header>
						<form novalidate onsubmit={(event) => { event.preventDefault(); void saveProfile(); }}>
							<div class="form-body">
								{#if profileMessage}<p class:success={profileMessage === 'profileSaved'} class="form-message" role={profileMessage === 'profileSaved' ? 'status' : 'alert'}>{fieldError(profileMessage)}</p>{/if}
								<FormSection title={text.basic} framed columns={2}>
									{#each nameFields as field (field)}
										<label><span>{text[field]} {#if field !== 'middleName'}<i>*</i>{/if}</span><input name={field} value={profile[field] ?? ''} maxlength="128" aria-invalid={!!profileErrors[field]} aria-describedby={profileErrors[field] ? `${field}-error` : undefined} oninput={(event) => updateProfile(field, event.currentTarget.value)} />{#if profileErrors[field]}<small id={`${field}-error`}>{fieldError(profileErrors[field])}</small>{/if}</label>
									{/each}
									<label><span>{text.nameKana}</span><input name="nameKana" value={profile.nameKana ?? ''} maxlength="255" aria-invalid={!!profileErrors.nameKana} aria-describedby={profileErrors.nameKana ? 'nameKana-error' : undefined} oninput={(event) => updateProfile('nameKana', event.currentTarget.value)} />{#if profileErrors.nameKana}<small id="nameKana-error">{fieldError(profileErrors.nameKana)}</small>{/if}</label>
									<DatePicker label={text.birthDate} field="birthDate" value={profile.birthDate} required error={profileErrors.birthDate ? fieldError(profileErrors.birthDate) : ''} open={birthDateOpen} onToggle={() => birthDateOpen = !birthDateOpen} onSelect={(value) => { updateProfile('birthDate', value); birthDateOpen = false; }} />
									<SearchSelect label={text.gender} field="gender" value={profile.gender} options={genders} required error={profileErrors.gender ? fieldError(profileErrors.gender) : ''} onSelect={(value) => updateProfile('gender', value)} />
									<SearchSelect label={text.bloodType} field="bloodType" value={profile.bloodType ?? ''} options={[{ value: '', label: '-' }, ...bloodTypes]} error={profileErrors.bloodType ? fieldError(profileErrors.bloodType) : ''} onSelect={(value) => updateProfile('bloodType', value)} />
								</FormSection>
								<FormSection title={text.contact} framed columns={2}>
									<label><span>{text.postalCode}</span><input name="postalCode" value={profile.postalCode ?? ''} maxlength="8" placeholder={text.postalExample} aria-invalid={!!profileErrors.postalCode} aria-describedby={`postalCode-hint${profileErrors.postalCode ? ' postalCode-error' : ''}`} oninput={(event) => updateProfile('postalCode', event.currentTarget.value)} /><small id="postalCode-hint" class="field-hint">{text.postalHint}</small>{#if profileErrors.postalCode}<small id="postalCode-error" class="field-error">{fieldError(profileErrors.postalCode)}</small>{/if}</label>
									<label><span>{text.prefecture}</span><input name="prefecture" value={profile.prefecture ?? ''} maxlength="64" placeholder={text.prefectureExample} aria-invalid={!!profileErrors.prefecture} aria-describedby={`prefecture-hint${profileErrors.prefecture ? ' prefecture-error' : ''}`} oninput={(event) => updateProfile('prefecture', event.currentTarget.value)} /><small id="prefecture-hint" class="field-hint">{text.prefectureHint}</small>{#if profileErrors.prefecture}<small id="prefecture-error" class="field-error">{fieldError(profileErrors.prefecture)}</small>{/if}</label>
									<label><span>{text.city}</span><input name="city" value={profile.city ?? ''} maxlength="128" placeholder={text.cityExample} aria-invalid={!!profileErrors.city} aria-describedby={`city-hint${profileErrors.city ? ' city-error' : ''}`} oninput={(event) => updateProfile('city', event.currentTarget.value)} /><small id="city-hint" class="field-hint">{text.cityHint}</small>{#if profileErrors.city}<small id="city-error" class="field-error">{fieldError(profileErrors.city)}</small>{/if}</label>
									<label><span>{text.streetAddress}</span><input name="streetAddress" value={profile.streetAddress ?? ''} maxlength="255" placeholder={text.streetExample} aria-invalid={!!profileErrors.streetAddress} aria-describedby={`streetAddress-hint${profileErrors.streetAddress ? ' streetAddress-error' : ''}`} oninput={(event) => updateProfile('streetAddress', event.currentTarget.value)} /><small id="streetAddress-hint" class="field-hint">{text.addressHint}</small>{#if profileErrors.streetAddress}<small id="streetAddress-error" class="field-error">{fieldError(profileErrors.streetAddress)}</small>{/if}</label>
									<label><span>{text.buildingName}</span><input name="buildingName" value={profile.buildingName ?? ''} maxlength="255" placeholder={text.buildingExample} aria-invalid={!!profileErrors.buildingName} aria-describedby={`buildingName-hint${profileErrors.buildingName ? ' buildingName-error' : ''}`} oninput={(event) => updateProfile('buildingName', event.currentTarget.value)} /><small id="buildingName-hint" class="field-hint">{text.addressHint}</small>{#if profileErrors.buildingName}<small id="buildingName-error" class="field-error">{fieldError(profileErrors.buildingName)}</small>{/if}</label>
									<label><span>{text.mobilePhone}</span><input name="mobilePhone" value={profile.mobilePhone ?? ''} maxlength="32" type="tel" placeholder={text.phoneExample} aria-invalid={!!profileErrors.mobilePhone} aria-describedby={`mobilePhone-hint${profileErrors.mobilePhone ? ' mobilePhone-error' : ''}`} oninput={(event) => updateProfile('mobilePhone', event.currentTarget.value)} /><small id="mobilePhone-hint" class="field-hint">{text.phoneHint}</small>{#if profileErrors.mobilePhone}<small id="mobilePhone-error" class="field-error">{fieldError(profileErrors.mobilePhone)}</small>{/if}</label>
									<label class="wide"><span>{text.email} <i>*</i></span><input name="email" value={profile.email} maxlength="254" type="email" placeholder={text.emailExample} aria-invalid={!!profileErrors.email} aria-describedby={`email-hint${profileErrors.email ? ' email-error' : ''}`} oninput={(event) => updateProfile('email', event.currentTarget.value)} /><small id="email-hint" class="field-hint">{text.emailHint}</small>{#if profileErrors.email}<small id="email-error" class="field-error">{fieldError(profileErrors.email)}</small>{/if}</label>
								</FormSection>
							</div>
							<footer><button class="app-primary-action" type="submit" disabled={profileSaving}>{profileSaving ? text.saving : text.saveProfile}</button></footer>
						</form>
					</section>

					<section id="social-links" class="settings-card" aria-labelledby="social-links-title">
						<header><div><h2 id="social-links-title">{text.socialLinks}</h2><p>{text.socialDescription}</p></div></header>
						<form novalidate onsubmit={(event) => { event.preventDefault(); void saveSocialLinks(); }}><div class="form-body social-links-grid">
							{#if socialLinksMessage}<p class:success={socialLinksMessage === 'socialSaved'} class="form-message" role={socialLinksMessage === 'socialSaved' ? 'status' : 'alert'}>{fieldError(socialLinksMessage)}</p>{/if}
							{#each socialLinkPlatforms as site}
								<label><span class="social-link-label"><SocialLinkIcon platform={site.value} size={17} />{site.value === 'website' ? text.website : site.value === 'blog' ? text.blog : site.label}</span><input name={`socialLink-${site.value}`} value={socialLinks[site.value]} maxlength="2048" type="url" inputmode="url" autocomplete="url" placeholder="https://" aria-invalid={!!socialLinkErrors[site.value]} aria-describedby={socialLinkErrors[site.value] ? `socialLink-${site.value}-error` : undefined} oninput={(event) => updateSocialLink(site.value, event.currentTarget.value)} />{#if socialLinkErrors[site.value]}<small id={`socialLink-${site.value}-error`}>{fieldError(socialLinkErrors[site.value] ?? '')}</small>{/if}</label>
							{/each}
						</div><footer><button class="app-primary-action" type="submit" disabled={socialLinksSaving}>{socialLinksSaving ? text.saving : text.saveSocialLinks}</button></footer></form>
					</section>

					<section id="localization" class="settings-card localization-card" aria-labelledby="localization-title">
						<header><div><h2 id="localization-title">{text.localization}</h2><p>{text.localizationDescription}</p></div></header>
						<form novalidate onsubmit={(event) => { event.preventDefault(); void saveLocalization(); }}><div class="form-body compact-grid">
							{#if localizationMessage}<p class:success={localizationMessage === 'localizationSaved'} class="form-message" role={localizationMessage === 'localizationSaved' ? 'status' : 'alert'}>{fieldError(localizationMessage)}</p>{/if}
							<SearchSelect label={text.timeZone} field="timeZone" value={localization.timeZone} options={timeZoneOptions} required error={localizationErrors.timeZone ? fieldError(localizationErrors.timeZone) : ''} onSelect={(value) => { localization.timeZone = value; localizationMessage = ''; }} />
							<SearchSelect label={text.displayLanguage} field="displayLanguage" value={localization.displayLanguage} options={languageOptions} required error={localizationErrors.displayLanguage ? fieldError(localizationErrors.displayLanguage) : ''} onSelect={(value) => { localization.displayLanguage = value as DisplayLanguage; localizationMessage = ''; }} />
						</div><footer><button class="app-primary-action" type="submit" disabled={localizationSaving}>{localizationSaving ? text.saving : text.saveLocalization}</button></footer></form>
					</section>

					<section id="password" class="settings-card" aria-labelledby="password-title">
						<header><div><h2 id="password-title">{text.password}</h2><p>{text.passwordDescription}</p></div></header>
						<form novalidate onsubmit={(event) => { event.preventDefault(); void changePassword(); }}><div class="form-body password-grid">
							{#if passwordMessage}<p class:success={passwordMessage === 'passwordChanged'} class="form-message" role={passwordMessage === 'passwordChanged' ? 'status' : 'alert'}>{fieldError(passwordMessage)}</p>{/if}
							<label><span>{text.currentPassword} <i>*</i></span><input bind:this={currentPasswordInput} name="currentPassword" bind:value={currentPassword} type="password" autocomplete="current-password" aria-invalid={!!passwordErrors.currentPassword} aria-describedby={passwordErrors.currentPassword ? 'currentPassword-error' : undefined} oninput={() => clearPasswordError('currentPassword')} />{#if passwordErrors.currentPassword}<small id="currentPassword-error">{fieldError(passwordErrors.currentPassword)}</small>{/if}</label>
							<label><span>{text.newPassword} <i>*</i></span><input name="newPassword" bind:value={newPassword} type="password" autocomplete="new-password" aria-invalid={!!passwordErrors.newPassword} aria-describedby="password-requirements newPassword-error" oninput={() => clearPasswordError('newPassword')} />{#if passwordErrors.newPassword}<small id="newPassword-error">{fieldError(passwordErrors.newPassword)}</small>{/if}</label>
							<label><span>{text.confirmation} <i>*</i></span><input name="confirmation" bind:value={confirmation} type="password" autocomplete="new-password" aria-invalid={!!passwordErrors.confirmation} aria-describedby={passwordErrors.confirmation ? 'confirmation-error' : undefined} oninput={() => clearPasswordError('confirmation')} />{#if passwordErrors.confirmation}<small id="confirmation-error">{fieldError(passwordErrors.confirmation)}</small>{/if}</label>
							<div id="password-requirements" class="password-requirements"><strong>{text.passwordRequirements}</strong><ul>{#each passwordRules as rule}<li class:met={rule.met}><span aria-hidden="true">{rule.met ? '✓' : '○'}</span><span>{rule.text}</span><span class="sr-only">: {rule.met ? text.met : text.notMet}</span></li>{/each}</ul></div>
						</div><footer><button class="app-primary-action" type="submit" disabled={passwordSaving}>{passwordSaving ? text.changing : text.changePassword}</button></footer></form>
					</section>
				</div>
			</div>
		{/if}
	</div>
</AssetManagementShell>

<style>
	.settings-page{width:100%}.settings-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:20px;align-items:start}.settings-nav{position:sticky;top:72px;z-index:2;display:flex;align-self:start;flex-direction:column;gap:1px;padding:6px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow);isolation:isolate}.settings-nav a{display:flex;align-items:center;min-height:32px;padding:7px 10px;color:var(--text-secondary);border-radius:4px;font-size:13px;font-weight:500;text-decoration:none;transition:background 120ms,color 120ms}.settings-nav a:hover,.settings-nav a:focus-visible{background:var(--surface-secondary);color:var(--text)}.settings-nav a:focus-visible{outline:2px solid #1abb9c;outline-offset:1px}.settings-nav a.active{background:rgba(51,122,183,.14);color:var(--action-primary)}.settings-content{display:flex;min-width:0;flex-direction:column;gap:20px;isolation:isolate;container:settings-content / inline-size}.settings-card{position:relative;scroll-margin-top:72px;background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}.localization-card{z-index:2}.settings-card>header{padding:14px 16px;border-bottom:1px solid var(--border-light);border-radius:6px 6px 0 0}.settings-card h2,.settings-card p{margin:0}.settings-card h2{font-size:14px}.settings-card header p{margin-top:4px;color:var(--muted);font-size:11.5px}.form-body{display:grid;gap:16px;padding:16px;background:var(--bg)}.form-body :global(.app-form-section-grid){grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}.form-body label{display:grid;width:100%;max-width:480px;gap:6px;min-width:0;color:var(--text);font-size:12px;font-weight:500}.form-body label span i{color:var(--danger);font-style:normal}.form-body input{width:100%;max-width:480px;height:36px;padding:0 12px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;font-size:13px}.form-body :global(.form-select-field),.form-body :global(.custom-date){width:100%;max-width:480px}.form-body :global(.form-select-options){visibility:hidden}.form-body input::placeholder{color:#c0c7cf}.form-body input:hover{border-color:var(--text-secondary)}.form-body input:focus{outline:0;border-color:#1abb9c;box-shadow:0 0 0 3px rgba(26,187,156,.14)}.form-body input[aria-invalid='true']{border-color:var(--danger);box-shadow:0 0 0 1px color-mix(in srgb,var(--danger) 25%,transparent)}.form-body label small{color:var(--danger);font-size:11px;font-weight:400;line-height:1.35}.form-body label .field-hint{color:var(--muted)}.form-body label .field-error{font-weight:500}.wide{grid-column:auto}.compact-grid,.social-links-grid,.password-grid{grid-template-columns:repeat(5,minmax(0,1fr))}.social-link-label{display:flex;align-items:center;gap:7px}.social-link-label :global(.social-link-icon){color:var(--text-secondary)}.password-grid{align-items:start}.form-message{grid-column:1/-1;margin:0;padding:10px 12px;color:var(--danger);background:color-mix(in srgb,var(--danger) 9%,transparent);border:1px solid color-mix(in srgb,var(--danger) 28%,transparent);border-radius:5px;font-size:12px}.form-message.success{color:#168b76;background:rgba(26,187,156,.08);border-color:rgba(26,187,156,.28)}.settings-card footer{display:flex;justify-content:flex-end;padding:14px 16px;background:var(--surface);border-top:1px solid var(--border-light);border-radius:0 0 6px 6px}.password-requirements{grid-row:auto;grid-column:auto;padding:12px;background:var(--surface-secondary);border:1px solid var(--border);border-radius:5px}.password-requirements strong{font-size:12px}.password-requirements ul{display:grid;gap:6px;margin:9px 0 0;padding:0;list-style:none}.password-requirements li{display:flex;gap:7px;color:var(--muted);font-size:11.5px}.password-requirements li.met{color:#168b76}.page-state{padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--muted)}.page-state.error{color:var(--danger)}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
	.settings-card footer .app-primary-action{width:100%}
	.password-requirements{display:grid;grid-template-columns:1fr;grid-column:1/-1;align-items:start;gap:6px;padding:0;background:transparent;border:0;border-radius:0}.password-requirements strong{font-weight:500}.password-requirements ul{grid-template-columns:repeat(4,minmax(0,1fr));gap:6px 16px;margin:0;padding:10px 12px;background:var(--surface-secondary);border:1px solid var(--border);border-radius:5px}.password-requirements li{align-items:center}
	:global(html[data-theme='dark']) .form-body input::placeholder{color:#5a6473}
	@container settings-content (max-width:1200px){.form-body :global(.app-form-section-grid),.compact-grid,.social-links-grid,.password-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
	@container settings-content (max-width:960px){.form-body :global(.app-form-section-grid),.compact-grid,.social-links-grid,.password-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.password-requirements ul{grid-template-columns:repeat(2,minmax(0,1fr))}}
	@container settings-content (max-width:720px){.form-body :global(.app-form-section-grid),.compact-grid,.social-links-grid,.password-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
	@container settings-content (max-width:480px){.form-body :global(.app-form-section-grid),.compact-grid,.social-links-grid,.password-grid{grid-template-columns:minmax(0,1fr)}.password-requirements{grid-template-columns:1fr}.password-requirements ul{grid-template-columns:1fr}}
	@media(max-width:900px){.settings-layout{grid-template-columns:1fr}.settings-nav{position:static;display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}.settings-nav a{justify-content:center;text-align:center}}
	@media(max-width:700px){.settings-layout{gap:16px}.settings-nav{grid-template-columns:1fr}.settings-nav a{justify-content:flex-start;text-align:left}.settings-card>header,.form-body,.settings-card footer{padding-left:16px;padding-right:16px}}
</style>
