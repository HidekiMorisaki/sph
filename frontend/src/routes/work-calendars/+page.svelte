<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { apiData, type ApiSuccess } from '$lib/api';
	import AddButton from '$lib/components/AddButton.svelte';
	import CountryFlag from '$lib/components/CountryFlag.svelte';
	import AssetManagementShell from '$lib/components/AssetManagementShell.svelte';
	import DetailModal from '$lib/components/DetailModal.svelte';
	import DiscardChangesDialog from '$lib/components/DiscardChangesDialog.svelte';
	import FormSection from '$lib/components/FormSection.svelte';
	import MasterPageHeader from '$lib/components/MasterPageHeader.svelte';
	import MenuItemIcon from '$lib/components/MenuItemIcon.svelte';
	import ModalBackdrop from '$lib/components/ModalBackdrop.svelte';
	import SearchSelect from '$lib/components/SearchSelect.svelte';
	import StatusNotice from '$lib/components/StatusNotice.svelte';
	import WorkCalendarEntryModal, { type WorkCalendarEntry } from '$lib/components/WorkCalendarEntryModal.svelte';
	import { calendarNoteTooltip } from '$lib/calendar-note-tooltip';
	import { holidayDisplayName } from '$lib/holiday-display-name';
	import '$lib/styles/calendar-note-tooltip.css';
	import { calendarErrorKey } from '$lib/work-calendar-errors';
	import { localeMessages, formatLocaleTemplate } from '$lib/locale-messages';
	import { formSnapshot } from '$lib/modalForm';
	import { DISPLAY_LANGUAGES, formatMonthYear, formatTimestamp, localization, weekdayLabels as localizedWeekdays } from '$lib/localization';
	import '$lib/styles/action-menu.css';

	type WorkCalendar = { id: number; name: string; calendarYear: number; countryCode: 'JP' | 'US'; scheduledWorkMinutesPerDay: number; description: string | null; employeeCount: number; entryCount: number };
	type EmployeeReference = { id: number; name: string };
	type CalendarEmployee = { id: number; branch: EmployeeReference; departmentRef: EmployeeReference | null; group: EmployeeReference | null };
	type DateAttribute = { id: number; calendarDate: string; kind: 'sunday' | 'saturday' | 'public_holiday'; name: string };
	type HolidayImport = { id: number; status: 'success' | 'failed'; completedAt: string; importedCount: number; rangeStart: string | null; rangeEnd: string | null };
	const selectedCalendarStorageKey = 'work-calendars-selected-id';

	let text = $derived(localeMessages[$localization.displayLanguage].workCalendars);
	let common = $derived(localeMessages[$localization.displayLanguage].common);
	function t(key: keyof typeof text, ...values: (string | number)[]) { return formatLocaleTemplate(text[key], ...values); }

	let calendars = $state<WorkCalendar[]>([]); let selectedId = $state<number | null>(null);
	let expandedCalendarYears = $state<number[]>([]);
	let entries = $state<WorkCalendarEntry[]>([]); let dateAttributes = $state<DateAttribute[]>([]);
	let employeeOptions = $state<CalendarEmployee[]>([]); let selectedEmployeeIds = $state<number[]>([]);
	let canManage = $state(false); let canAssignCalendars = $state(false); let loading = $state(true); let detailLoading = $state(false); let assignmentLoading = $state(false); let assignmentReady = $state(false); let assignmentError = $state(''); let saving = $state(false); let importing = $state(false);
	let message = $state(''); let error = $state(''); let showCalendarForm = $state(false); let editingCalendar = $state<WorkCalendar | null>(null);
	let calendarName = $state(''); let calendarYear = $state(''); let calendarCountry = $state<'JP' | 'US'>('JP'); let calendarHours = $state('7.75'); let calendarDescription = $state('');
	let calendarNameError = $state(''); let calendarYearError = $state(''); let calendarHoursError = $state(''); let calendarFormError = $state('');
	let selectedDate = $state(''); let selectedEntry = $state<WorkCalendarEntry | null>(null); let entryReturnFocus = $state<HTMLElement | null>(null);
	let visibleMonth = $state(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); let latestImport = $state<HolidayImport | null>(null);
	let calendarDialog = $state<HTMLDialogElement>(); let calendarNameInput = $state<HTMLInputElement>(); let calendarReturnFocus = $state<HTMLElement | null>(null); let addCalendarButton = $state<HTMLButtonElement>();
	let calendarInitialSnapshot = $state(''); let confirmingCalendarDiscard = $state(false);
	let calendarActionMenuOpen = $state(false); let calendarActionMenuTop = $state(0); let calendarActionMenuLeft = $state(0); let calendarActionTrigger = $state<HTMLButtonElement>();
	let showHolidayHelp = $state(false); let holidayHelpTrigger = $state<HTMLButtonElement>();
	let calendarRequestVersion = 0;
	let employeeOptionsLoaded = false;
	const currentYear = new Date().getFullYear();
	const calendarYearOptions = Array.from({ length: currentYear + 20 - 2011 + 1 }, (_, index) => ({ value: String(currentYear + 20 - index), label: String(currentYear + 20 - index) }));
	let calendarCountryOptions = $derived([{ value: 'JP', label: text.countryJapan }, { value: 'US', label: text.countryUsFederal }]);

	let selectedCalendar = $derived(calendars.find((item) => item.id === selectedId) ?? null);
	let calendarGroups = $derived.by(() => {
		const groups = new Map<number, WorkCalendar[]>();
		for (const calendar of calendars) groups.set(calendar.calendarYear, [...(groups.get(calendar.calendarYear) ?? []), calendar]);
		return [...groups.entries()].sort(([left], [right]) => right - left).map(([year, items]) => ({ year, items }));
	});
	let assignmentBranches = $derived.by(() => {
		const branches = new Map<number, { id: number; name: string; employees: CalendarEmployee[] }>();
		for (const employee of employeeOptions) {
			const branch = branches.get(employee.branch.id) ?? { ...employee.branch, employees: [] as CalendarEmployee[] };
			branch.employees.push(employee); branches.set(branch.id, branch);
		}
		return [...branches.values()].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
	});
	let assignmentDepartments = $derived.by(() => {
		const departments = new Map<number | null, { id: number | null; name: string; employees: CalendarEmployee[] }>();
		for (const employee of employeeOptions) {
			const id = employee.departmentRef?.id ?? null;
			const department = departments.get(id) ?? { id, name: employee.departmentRef?.name ?? text.noDepartment, employees: [] as CalendarEmployee[] };
			department.employees.push(employee); departments.set(id, department);
		}
		return [...departments.values()].sort((left, right) => left.id === null ? 1 : right.id === null ? -1 : left.name.localeCompare(right.name, undefined, { numeric: true }));
	});
	let assignmentGroups = $derived.by(() => {
		const groups = new Map<string, { key: string; name: string; departmentName: string; employees: CalendarEmployee[] }>();
		for (const employee of employeeOptions) {
			const key = `${employee.departmentRef?.id ?? 'none'}:${employee.group?.id ?? 'none'}`;
			const group = groups.get(key) ?? { key, name: employee.group?.name ?? text.noGroup, departmentName: employee.departmentRef?.name ?? text.noDepartment, employees: [] as CalendarEmployee[] };
			group.employees.push(employee); groups.set(key, group);
		}
		return [...groups.values()].sort((left, right) => left.departmentName.localeCompare(right.departmentName, undefined, { numeric: true }) || left.name.localeCompare(right.name, undefined, { numeric: true }));
	});
	let selectedEmployeeIdSet = $derived(new Set(selectedEmployeeIds));
	let monthLabel = $derived(formatMonthYear(visibleMonth.getFullYear(), visibleMonth.getMonth(), $localization));
	let weekdayLabels = $derived(localizedWeekdays('short', $localization));
	let calendarCells = $derived.by(() => {
		const year = visibleMonth.getFullYear(); const month = visibleMonth.getMonth(); const calendarScopeYear = selectedCalendar?.calendarYear ?? year; const start = new Date(year, month, 1 - new Date(year, month, 1).getDay()); const today = localDateIso(new Date());
		const entryMap = new Map(entries.map((entry) => [entry.workDate.slice(0, 10), entry])); const attributeMap = new Map<string, DateAttribute[]>();
		for (const attribute of dateAttributes) { const key = attribute.calendarDate.slice(0, 10); attributeMap.set(key, [...(attributeMap.get(key) ?? []), attribute]); }
		return Array.from({ length: 42 }, (_, index) => {
			const date = new Date(start); date.setDate(start.getDate() + index); const iso = localDateIso(date); const cellAttributes = attributeMap.get(iso) ?? []; const entry = entryMap.get(iso) ?? null;
			const holiday = cellAttributes.find((item) => item.kind === 'public_holiday'); const isSunday = cellAttributes.some((item) => item.kind === 'sunday') || date.getDay() === 0; const isSaturday = cellAttributes.some((item) => item.kind === 'saturday') || date.getDay() === 6;
			const isWorkingDay = entry?.entryType === 'working_day';
			const isRed = !isWorkingDay && Boolean(holiday || isSunday || entry?.entryType === 'company_holiday');
			return { iso, day: date.getDate(), inMonth: date.getMonth() === month, inCalendarYear: date.getFullYear() === calendarScopeYear, isToday: iso === today, entry, holiday, holidayName: holiday ? holidayDisplayName(selectedCalendar?.countryCode ?? 'JP', holiday.name, $localization.displayLanguage) : null, isWorkingDay, isRed, isBlue: !isWorkingDay && !isRed && isSaturday };
		});
	});
	let visibleEntryCount = $derived(calendarCells.filter((cell) => cell.inMonth && cell.entry).length);
	let calendarSummary = $derived.by(() => {
		if (!selectedCalendar) return { holidays: 0, workingDays: 0, annualMinutes: 0, weeklyMinutes: 0 };
		const year = selectedCalendar.calendarYear;
		const totalDays = Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000);
		const holidayDates = new Set(dateAttributes.map((attribute) => attribute.calendarDate.slice(0, 10)));
		const entryMap = new Map(entries.map((entry) => [entry.workDate.slice(0, 10), entry.entryType]));
		let workingDays = 0;
		for (let index = 0; index < totalDays; index += 1) {
			const date = new Date(Date.UTC(year, 0, index + 1));
			const iso = date.toISOString().slice(0, 10);
			const entryType = entryMap.get(iso);
			if (entryType === 'working_day' || (entryType !== 'company_holiday' && !holidayDates.has(iso) && date.getUTCDay() !== 0 && date.getUTCDay() !== 6)) workingDays += 1;
		}
		const annualMinutes = workingDays * selectedCalendar.scheduledWorkMinutesPerDay;
		return { holidays: totalDays - workingDays, workingDays, annualMinutes, weeklyMinutes: annualMinutes * 7 / totalDays };
	});
	let canMovePrevious = $derived(Boolean(selectedCalendar && visibleMonth > new Date(selectedCalendar.calendarYear, 0, 1)));
	let canMoveNext = $derived(Boolean(selectedCalendar && visibleMonth < new Date(selectedCalendar.calendarYear, 11, 1)));
	let canShowToday = $derived(selectedCalendar?.calendarYear === currentYear);
	let hasCalendarDraftChanges = $derived(calendarInitialSnapshot !== '' && formSnapshot({ name: calendarName, year: calendarYear, country: calendarCountry, hours: calendarHours, description: calendarDescription }) !== calendarInitialSnapshot);
	let hasUnsavedCalendarChanges = $derived(Boolean(editingCalendar) && hasCalendarDraftChanges);

	function localDateIso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
	function countryName(countryCode: WorkCalendar['countryCode']) { return countryCode === 'JP' ? text.countryJapan : text.countryUs; }
	function formatHoursAndMinutes(minutes: number) { const totalMinutes = Math.round(minutes); const hours = Math.floor(totalMinutes / 60); const remainingMinutes = totalMinutes % 60; const locale = DISPLAY_LANGUAGES.find(language => language.value === $localization.displayLanguage)!.locale; return `${new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: 'long' }).format(hours)} ${new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(remainingMinutes)}`; }
	function indeterminate(node: HTMLInputElement, value: boolean) { node.indeterminate = value; return { update(nextValue: boolean) { node.indeterminate = nextValue; } }; }
	function selectionState(employees: CalendarEmployee[]) { const selectedCount = employees.reduce((count, employee) => count + Number(selectedEmployeeIdSet.has(employee.id)), 0); return { selectedCount, all: employees.length > 0 && selectedCount === employees.length, some: selectedCount > 0 && selectedCount < employees.length }; }
	function storedCalendarId() { const value = Number(localStorage.getItem(selectedCalendarStorageKey)); return Number.isSafeInteger(value) && value > 0 ? value : null; }
	function rememberSelectedCalendar(id: number | null) { if (id) localStorage.setItem(selectedCalendarStorageKey, String(id)); else localStorage.removeItem(selectedCalendarStorageKey); }
	class CalendarRequestError extends Error {}
	async function errorMessage(response: Response, fallback: string) { const key = await calendarErrorKey(response); return key === 'unknown' ? fallback : text[key]; }
	async function fetchAll<T>(baseUrl: string): Promise<T[]> { const items: T[] = []; let offset = 0; for (;;) { const separator = baseUrl.includes('?') ? '&' : '?'; const response = await fetch(`${baseUrl}${separator}offset=${offset}&limit=500`); if (!response.ok) throw new CalendarRequestError(await errorMessage(response, text.loadFailed)); const payload = await response.json() as ApiSuccess<T[]>; items.push(...payload.data); if (!payload.meta?.hasMore) return items; offset += payload.data.length; } }

	async function loadCalendars(preferredId: number | null = selectedId) {
		const listUrl = canManage ? '/v1/work-calendars?sortBy=name&sortOrder=asc' : '/v1/work-calendars?assignedToMe=true&sortBy=name&sortOrder=asc';
		calendars = await fetchAll<WorkCalendar>(listUrl);
		selectedId = preferredId && calendars.some((item) => item.id === preferredId) ? preferredId : calendars[0]?.id ?? null;
		rememberSelectedCalendar(selectedId);
		const availableYears = new Set(calendars.map((calendar) => calendar.calendarYear));
		expandedCalendarYears = expandedCalendarYears.filter((year) => availableYears.has(year));
		const selectedYear = calendars.find((calendar) => calendar.id === selectedId)?.calendarYear;
		if (selectedYear !== undefined && !expandedCalendarYears.includes(selectedYear)) expandedCalendarYears = [...expandedCalendarYears, selectedYear];
	}
	async function loadAttributes(version = calendarRequestVersion) {
		const calendar = selectedCalendar;
		if (!calendar) { dateAttributes = []; return; }
		const year = calendar.calendarYear;
		const attributes = await fetchAll<DateAttribute>(`/v1/calendar-date-attributes?countryCode=${calendar.countryCode}&from=${year}-01-01&to=${year}-12-31&sortBy=calendarDate&sortOrder=asc`);
		if (version === calendarRequestVersion) dateAttributes = attributes;
	}
	async function loadImportStatus(version = calendarRequestVersion) {
		const calendar = selectedCalendar;
		if (!calendar) { latestImport = null; return; }
		try {
			const response = await fetch(`/v1/calendar-holiday-imports?countryCode=${calendar.countryCode}&calendarYear=${calendar.calendarYear}&status=success&sortBy=completedAt&sortOrder=desc&limit=1`);
			if (!response.ok) throw new CalendarRequestError(await errorMessage(response, text.loadFailed));
			const imports = await apiData<HolidayImport[]>(response);
			if (version === calendarRequestVersion) latestImport = imports[0] ?? null;
		} catch (caught) { if (version === calendarRequestVersion) error = caught instanceof CalendarRequestError ? caught.message : text.loadFailed; }
	}
	async function loadAssignments(version = calendarRequestVersion) {
		const calendarId = selectedId;
		if (!canAssignCalendars || !calendarId) { assignmentLoading = false; return; }
		assignmentLoading = true; assignmentError = '';
		try {
			const [options, assigned] = await Promise.all([
				employeeOptionsLoaded ? Promise.resolve(employeeOptions) : fetchAll<CalendarEmployee>('/v1/employees?sortBy=employee&sortOrder=asc'),
				fetchAll<CalendarEmployee>(`/v1/work-calendars/${calendarId}/employees?sortBy=employee&sortOrder=asc`)
			]);
			if (version !== calendarRequestVersion || calendarId !== selectedId) return;
			employeeOptions = options; employeeOptionsLoaded = true;
			selectedEmployeeIds = assigned.map((employee) => employee.id);
			assignmentReady = true;
		} catch (caught) { if (version === calendarRequestVersion) { assignmentReady = false; assignmentError = caught instanceof CalendarRequestError ? caught.message : text.calendarLoadFailed; } }
		finally { if (version === calendarRequestVersion) assignmentLoading = false; }
	}
	async function loadCalendarContent(startInJanuary = false, preferredDate = '') {
		const calendar = selectedCalendar;
		const calendarId = selectedId;
		const version = ++calendarRequestVersion;
		entries = []; dateAttributes = []; latestImport = null; selectedEmployeeIds = []; assignmentReady = false; assignmentError = '';
		if (!calendar || !calendarId) { detailLoading = false; assignmentLoading = false; loading = false; return; }
		detailLoading = true; assignmentLoading = canAssignCalendars; error = '';
		try {
			const year = calendar.calendarYear;
			const [nextEntries, nextAttributes] = await Promise.all([
				fetchAll<WorkCalendarEntry>(`/v1/work-calendars/${calendarId}/entries?sortBy=workDate&sortOrder=asc`),
				fetchAll<DateAttribute>(`/v1/calendar-date-attributes?countryCode=${calendar.countryCode}&from=${year}-01-01&to=${year}-12-31&sortBy=calendarDate&sortOrder=asc`)
			]);
			if (version !== calendarRequestVersion) return;
			entries = nextEntries; dateAttributes = nextAttributes;
			const today = new Date();
			const prefix = `${year}-${String(today.getMonth() + 1).padStart(2, '0')}`;
			const relevant = startInJanuary ? null : nextEntries.find((entry) => entry.workDate.startsWith(prefix)) ?? nextEntries[0];
			const month = preferredDate ? new Date(`${preferredDate.slice(0, 10)}T00:00:00`).getMonth() : relevant ? new Date(`${relevant.workDate.slice(0, 10)}T00:00:00`).getMonth() : year === currentYear && !startInJanuary ? today.getMonth() : 0;
			visibleMonth = new Date(year, month, 1);
			void loadAssignments(version);
			void loadImportStatus(version);
		} catch (caught) { if (version === calendarRequestVersion) { error = caught instanceof CalendarRequestError ? caught.message : text.calendarLoadFailed; assignmentLoading = false; } }
		finally { if (version === calendarRequestVersion) { detailLoading = false; loading = false; } }
	}
	async function chooseCalendar(id: number) { closeCalendarActionMenu(); selectedId = id; rememberSelectedCalendar(id); selectedDate = ''; await loadCalendarContent(); }
	function toggleCalendarYear(year: number) { expandedCalendarYears = expandedCalendarYears.includes(year) ? expandedCalendarYears.filter((item) => item !== year) : [...expandedCalendarYears, year]; }
	async function moveMonth(offset: number) { if (!selectedCalendar) return; const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1); if (next.getFullYear() !== selectedCalendar.calendarYear) return; visibleMonth = next; }
	async function showToday() { if (!canShowToday) return; const today = new Date(); visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1); }

	function selectCalendarCell(cell: (typeof calendarCells)[number], event: MouseEvent) { if (!canManage || !selectedId || !cell.inCalendarYear) return; selectedDate = cell.iso; selectedEntry = cell.entry; entryReturnFocus = event.currentTarget as HTMLElement; }
	function closeEntryModal() { selectedDate = ''; selectedEntry = null; }
	async function entrySaved(date: string, action: 'created' | 'updated' | 'deleted') { closeEntryModal(); await loadCalendars(selectedId); await loadCalendarContent(false, date); message = action === 'deleted' ? text.entryDeleted : action === 'updated' ? text.entryUpdated : text.entryAdded; void tick().then(() => entryReturnFocus?.focus()); }

	function openCalendarForm(calendar: WorkCalendar | null, event?: MouseEvent, returnFocus?: HTMLElement | null) { editingCalendar = calendar; calendarName = calendar?.name ?? ''; calendarYear = String(calendar?.calendarYear ?? currentYear); calendarCountry = calendar?.countryCode ?? 'JP'; calendarHours = String((calendar?.scheduledWorkMinutesPerDay ?? 465) / 60); calendarDescription = calendar?.description ?? ''; calendarNameError = ''; calendarYearError = ''; calendarHoursError = ''; calendarFormError = ''; calendarInitialSnapshot = formSnapshot({ name: calendarName, year: calendarYear, country: calendarCountry, hours: calendarHours, description: calendarDescription }); confirmingCalendarDiscard = false; calendarReturnFocus = returnFocus ?? (event?.currentTarget as HTMLElement | undefined) ?? addCalendarButton ?? null; showCalendarForm = true; message = ''; error = ''; void tick().then(() => calendarNameInput?.focus()); }
	function closeCalendarActionMenu(focus = false) { calendarActionMenuOpen = false; if (focus) calendarActionTrigger?.focus(); }
	function toggleCalendarActionMenu(event: MouseEvent) {
		if (calendarActionMenuOpen) { closeCalendarActionMenu(true); return; }
		calendarActionTrigger = event.currentTarget as HTMLButtonElement;
		const rect = calendarActionTrigger.getBoundingClientRect(); const menuHeight = 86;
		calendarActionMenuTop = rect.bottom + menuHeight + 4 <= window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4);
		calendarActionMenuLeft = Math.max(8, Math.min(rect.right - 160, window.innerWidth - 168));
		calendarActionMenuOpen = true;
		void tick().then(() => document.querySelector<HTMLButtonElement>('.calendar-action-menu [role="menuitem"]')?.focus());
	}
	function editCalendarFromMenu() { const trigger = calendarActionTrigger; closeCalendarActionMenu(); if (selectedCalendar) openCalendarForm(selectedCalendar, undefined, trigger); }
	function deleteCalendarFromMenu() { closeCalendarActionMenu(true); void deleteCalendar(); }
	function closeCalendarFormImmediately() { if (saving) return; confirmingCalendarDiscard = false; showCalendarForm = false; calendarInitialSnapshot = ''; void tick().then(() => calendarReturnFocus?.focus()); }
	function requestCloseCalendarForm() { if (saving) return; if (hasUnsavedCalendarChanges) { confirmingCalendarDiscard = true; return; } closeCalendarFormImmediately(); }
	async function saveCalendar() {
		const scheduledWorkMinutesPerDay = Math.round(Number(calendarHours) * 60);
		calendarNameError = calendarName.trim() ? '' : text.nameRequired; calendarYearError = calendarYear ? '' : text.yearRequired; calendarHoursError = Number.isFinite(Number(calendarHours)) && scheduledWorkMinutesPerDay >= 15 && scheduledWorkMinutesPerDay <= 1440 && scheduledWorkMinutesPerDay % 15 === 0 ? '' : text.hoursInvalid; calendarFormError = '';
		if (!canManage || calendarNameError || calendarYearError || calendarHoursError) { await tick(); (calendarNameError ? calendarNameInput : calendarDialog?.querySelector<HTMLElement>('[aria-invalid="true"]'))?.focus(); return; }
		saving = true;
		try {
			message = ''; error = '';
			const response = await fetch(editingCalendar ? `/v1/work-calendars/${editingCalendar.id}` : '/v1/work-calendars', { method: editingCalendar ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: calendarName.trim(), calendarYear: Number(calendarYear), countryCode: calendarCountry, scheduledWorkMinutesPerDay, description: calendarDescription.trim() || null }) });
			if (!response.ok) {
				calendarFormError = await errorMessage(response, text.saveFailed);
				const payload = await response.clone().json().catch(() => null) as { error?: { details?: Array<{ field?: string }> } } | null;
				if (payload?.error?.details?.some((detail) => detail.field === 'name')) { calendarNameError = calendarFormError; await tick(); calendarNameInput?.focus(); }
			}
			else {
				const wasEditing = Boolean(editingCalendar);
				const saved = await apiData<WorkCalendar>(response);
				let holidayImportError = '';
				if (!wasEditing) {
					try {
						const holidayResponse = await fetch('/v1/calendar-holiday-imports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workCalendarId: saved.id }) });
						if (!holidayResponse.ok) holidayImportError = await errorMessage(holidayResponse, text.importFailed);
					} catch { holidayImportError = text.importFailed; }
				}
				showCalendarForm = false;
				await loadCalendars(saved.id);
				await loadCalendarContent(!wasEditing);
				message = wasEditing ? text.calendarUpdated : holidayImportError ? text.createdWithoutHolidays : t('createdWithHolidays', saved.calendarYear);
				if (holidayImportError) error = t('importRetry', holidayImportError);
			}
		} catch { calendarFormError = text.saveFailed; } finally { saving = false; }
	}
	async function deleteCalendar() { if (!canManage || !selectedCalendar || !confirm(t('deleteConfirm', selectedCalendar.name))) return; saving = true; error = ''; message = ''; try { const response = await fetch(`/v1/work-calendars/${selectedCalendar.id}`, { method: 'DELETE' }); if (!response.ok) error = await errorMessage(response, text.deleteFailed); else { await loadCalendars(null); await loadCalendarContent(); message = text.calendarDeleted; } } catch { error = text.deleteFailed; } finally { saving = false; } }
	async function refreshHolidays() { const target = selectedCalendar; if (!canManage || !target || importing) return; if (!confirm(target.countryCode === 'JP' ? text.refreshConfirmJapan : text.refreshConfirmUs)) return; importing = true; error = ''; message = ''; try { const response = await fetch('/v1/calendar-holiday-imports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workCalendarId: target.id }) }); if (!response.ok) error = await errorMessage(response, text.refreshFailed); else { await Promise.all([loadAttributes(), loadImportStatus()]); message = t('refreshed', target.calendarYear); } } catch { error = text.refreshFailed; } finally { importing = false; } }
	function toggleEmployees(employees: CalendarEmployee[]) { const ids = employees.map((employee) => employee.id); const selected = new Set(selectedEmployeeIds); if (ids.every((id) => selected.has(id))) ids.forEach((id) => selected.delete(id)); else ids.forEach((id) => selected.add(id)); selectedEmployeeIds = [...selected]; }
	async function saveAssignments() { if (!canAssignCalendars || !selectedId || assignmentLoading || !assignmentReady || assignmentError) return; saving = true; error = ''; message = ''; try { const response = await fetch(`/v1/work-calendars/${selectedId}/employees`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeIds: selectedEmployeeIds }) }); if (!response.ok) error = await errorMessage(response, text.assignFailed); else { await Promise.all([loadAssignments(), loadCalendars(selectedId)]); message = text.assignUpdated; } } catch { error = text.assignFailed; } finally { saving = false; } }
	function calendarModalKeydown(event: KeyboardEvent) { if (event.key === 'Escape' && calendarActionMenuOpen) { event.preventDefault(); closeCalendarActionMenu(true); return; } if (!showCalendarForm || confirmingCalendarDiscard || !calendarDialog || event.defaultPrevented) return; if (event.key === 'Escape') { event.preventDefault(); if (!editingCalendar && hasCalendarDraftChanges && !saving) confirmingCalendarDiscard = true; else requestCloseCalendarForm(); return; } if (event.key !== 'Tab') return; const controls = [...calendarDialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled])')].filter((item) => item.getClientRects().length); const first = controls[0]; const last = controls.at(-1); if (!first || !last) return; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }

	onMount(() => { void (async () => { try { const response = await fetch('/v1/auth/session'); if (!response.ok) throw new CalendarRequestError(text.authRequired); const capabilities = (await apiData<{ user: { capabilities: { canManageSystemSettings: boolean; canAssignCalendars: boolean } } }>(response)).user.capabilities; canManage = capabilities.canManageSystemSettings; canAssignCalendars = capabilities.canAssignCalendars; await loadCalendars(storedCalendarId()); await loadCalendarContent(); } catch (caught) { error = caught instanceof CalendarRequestError ? caught.message : text.pageLoadFailed; } finally { loading = false; } })(); });
	onMount(() => { const outside = (event: MouseEvent) => { if (!(event.target as Element).closest('.calendar-action-menu,.calendar-kebab')) closeCalendarActionMenu(); }; const scroll = () => closeCalendarActionMenu(); document.addEventListener('click', outside); window.addEventListener('scroll', scroll, true); return () => { document.removeEventListener('click', outside); window.removeEventListener('scroll', scroll, true); }; });
</script>

<svelte:window onkeydown={calendarModalKeydown} />
<AssetManagementShell title={text.title}>
	<div class="calendar-page">
		<MasterPageHeader title={text.title} description={text.description}>{#snippet actions()}{#if canManage}<AddButton bind:element={addCalendarButton} label={text.addCalendar} onclick={(event) => openCalendarForm(null, event)} />{/if}{/snippet}</MasterPageHeader>
		{#if !loading && !error && !calendars.length}<div class="unassigned-notice" role="status">{canManage ? text.empty : text.unassigned}</div>{/if}
		{#if message}<StatusNotice message={message} tone="success" onDismiss={() => message = ''} />{/if}{#if error}<StatusNotice message={error} tone="error" onDismiss={() => error = ''} />{/if}
		{#if loading}<section class="empty">{text.loading}</section>{:else if calendars.length}<div class="layout">
			<section class="calendar-list" aria-label={text.title}><header><h2>{text.calendars}</h2><span hidden>{calendars.length}</span></header>{#if !calendars.length}<p>{text.empty}</p>{:else}<div class="calendar-groups">{#each calendarGroups as group}{@const expanded = expandedCalendarYears.includes(group.year)}<section class="calendar-year-group"><button class="calendar-year-toggle" type="button" aria-expanded={expanded} aria-controls={`calendar-year-${group.year}`} onclick={() => toggleCalendarYear(group.year)}><span>{group.year}</span><span class="calendar-year-count" aria-label={t(group.items.length === 1 ? 'calendarCountOne' : 'calendarCountMany', group.items.length)}>{group.items.length}</span><svg class:expanded viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg></button><div class="calendar-items" id={`calendar-year-${group.year}`} hidden={!expanded}>{#each group.items as calendar}<button type="button" class:active={calendar.id === selectedId} onclick={() => void chooseCalendar(calendar.id)}><span class="calendar-name-row"><CountryFlag countryCode={calendar.countryCode} countryName={countryName(calendar.countryCode)} /><strong>{calendar.name}</strong></span><span class="calendar-item-details">{t('counts', calendar.entryCount, calendar.employeeCount)}</span></button>{/each}</div></section>{/each}</div>{/if}</section>
			{#if selectedCalendar}<div class="details" class:busy={detailLoading}>
				<section class="summary"><div class="summary-main"><p class="calendar-year">{selectedCalendar.calendarYear}</p><h2 class="calendar-name-row"><CountryFlag countryCode={selectedCalendar.countryCode} countryName={countryName(selectedCalendar.countryCode)} /><span>{selectedCalendar.name}</span></h2><p class="calendar-description">{selectedCalendar.description || text.noDescription}</p></div>{#if canManage}<button bind:this={calendarActionTrigger} class="kebab-button calendar-kebab calendar-action-trigger" type="button" aria-label={formatLocaleTemplate(common.actionsFor, selectedCalendar.name)} aria-haspopup="menu" aria-expanded={calendarActionMenuOpen} onclick={toggleCalendarActionMenu}><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1.4"/><circle cx="8" cy="8" r="1.4"/><circle cx="13" cy="8" r="1.4"/></svg></button>{/if}<div class="summary-side"><dl class="calendar-stats"><div><dt>{text.annualHolidays}</dt><dd>{t('days', calendarSummary.holidays)}</dd></div><div><dt>{text.annualWorkingDays}</dt><dd>{t('days', calendarSummary.workingDays)}</dd></div><div><dt>{text.dailyHours}</dt><dd>{formatHoursAndMinutes(selectedCalendar.scheduledWorkMinutesPerDay)}</dd></div><div><dt>{text.annualHours}</dt><dd>{formatHoursAndMinutes(calendarSummary.annualMinutes)}</dd></div><div><dt>{text.weeklyHours}</dt><dd>{formatHoursAndMinutes(calendarSummary.weeklyMinutes)}</dd></div></dl></div></section>
				<section class="panel calendar-panel"><header class="calendar-toolbar"><div><h3>{t('calendarYear', selectedCalendar.calendarYear)}</h3><p>{t('monthEntries', visibleEntryCount, monthLabel)}{#if canManage} {text.clickDate}{/if}</p></div><div class="calendar-actions">{#if canManage}<div class="holiday-refresh-actions"><button class="secondary-action refresh" type="button" disabled={importing} onclick={() => void refreshHolidays()}>{importing ? text.refreshing : text.refresh}</button><button bind:this={holidayHelpTrigger} class="holiday-help-button" type="button" aria-label={text.helpTitle} title={text.helpTitle} onclick={() => showHolidayHelp = true}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r="0.5" fill="currentColor"/></svg></button></div>{/if}<div class="month-controls"><button type="button" disabled={!canMovePrevious} aria-label={text.previousMonth} onclick={() => void moveMonth(-1)}>‹</button><button type="button" disabled={!canShowToday} onclick={() => void showToday()}>{text.today}</button><strong aria-live="polite">{monthLabel}</strong><button type="button" disabled={!canMoveNext} aria-label={text.nextMonth} onclick={() => void moveMonth(1)}>›</button></div></div></header>
					{#if latestImport}<p class="import-status">{t('importStatus', selectedCalendar.calendarYear, formatTimestamp(latestImport.completedAt, $localization), latestImport.importedCount)}</p>{/if}
					<div class="month-scroll"><div class="month-grid" aria-label={t('monthCalendar', monthLabel)}>{#each weekdayLabels as weekday, index}<div class="weekday" class:sunday={index===0} class:saturday={index===6}>{weekday}</div>{/each}{#each calendarCells as cell (cell.iso)}<div class="day-cell-container" use:calendarNoteTooltip={{ note: cell.entry?.note, label: text.note, id: `calendar-note-${cell.iso}` }}><button type="button" class="day-cell" class:outside={!cell.inMonth || !cell.inCalendarYear} class:today={cell.isToday} class:red-day={cell.isRed} class:blue-day={cell.isBlue} class:working-day={cell.isWorkingDay} class:has-entry={Boolean(cell.entry)} disabled={(!canManage || !cell.inCalendarYear) && !cell.entry?.note?.trim()} aria-disabled={!canManage || !cell.inCalendarYear} aria-label={`${cell.iso}${cell.holidayName ? `, ${cell.holidayName}` : ''}${cell.entry ? `, ${cell.entry.title}` : ''}`} onclick={(event) => selectCalendarCell(cell,event)}><span class="day-number">{cell.day}</span>{#if cell.holidayName}<span class="holiday-name">{cell.holidayName}</span>{/if}{#if cell.entry}<span class:holiday-entry={cell.entry.entryType==='company_holiday'} class="entry-type">{cell.entry.entryType==='company_holiday'?text.companyHoliday:text.workingDay}</span><small>{cell.entry.title}</small>{/if}</button></div>{/each}</div></div>
				</section>
				{#if canAssignCalendars}<section class="panel"><header><div><h3>{text.calendarAssignments}</h3><p>{text.oneCalendar}</p></div><button class="app-primary-action" type="button" disabled={saving || assignmentLoading || !assignmentReady || Boolean(assignmentError)} onclick={() => void saveAssignments()}>{text.saveAssignments}</button></header>
						{#if assignmentLoading}<p class="assignment-state">{common.loading}</p>
						{:else if assignmentError}<div class="assignment-state" role="alert">{assignmentError}<button class="secondary-action" type="button" onclick={() => void loadAssignments()}>{text.retryAssignments}</button></div>
						{:else}
							<section class="selection-section" aria-labelledby="branch-assignment-title"><div class="selection-heading"><h4 id="branch-assignment-title">{text.assignByBranch}</h4><p>{text.branchHint}</p></div><div class="assignment-grid">{#each assignmentBranches as branch (branch.id)}{@const state = selectionState(branch.employees)}<label class="assignment-option"><input type="checkbox" checked={state.all} use:indeterminate={state.some} onchange={() => toggleEmployees(branch.employees)} /><span><strong>{branch.name}</strong><small>{t('selectedCount', state.selectedCount, branch.employees.length)}</small></span></label>{:else}<p>{text.emptyBranches}</p>{/each}</div></section>
							<section class="selection-section" aria-labelledby="department-assignment-title"><div class="selection-heading"><h4 id="department-assignment-title">{text.assignByDepartment}</h4><p>{text.departmentHint}</p></div><div class="assignment-grid">{#each assignmentDepartments as department (department.id)}{@const state = selectionState(department.employees)}<label class="assignment-option"><input type="checkbox" checked={state.all} use:indeterminate={state.some} onchange={() => toggleEmployees(department.employees)} /><span><strong>{department.name}</strong><small>{t('selectedCount', state.selectedCount, department.employees.length)}</small></span></label>{:else}<p>{text.emptyDepartments}</p>{/each}</div></section>
							<section class="selection-section" aria-labelledby="group-assignment-title"><div class="selection-heading"><h4 id="group-assignment-title">{text.assignByGroup}</h4><p>{text.groupHint}</p></div><div class="assignment-grid">{#each assignmentGroups as group (group.key)}{@const state = selectionState(group.employees)}<label class="assignment-option"><input type="checkbox" checked={state.all} use:indeterminate={state.some} onchange={() => toggleEmployees(group.employees)} /><span><strong>{group.name}</strong><small>{group.departmentName} · {t('selectedCount', state.selectedCount, group.employees.length)}</small></span></label>{:else}<p>{text.emptyGroups}</p>{/each}</div></section>
						{/if}
				</section>{/if}
			</div>{:else}<section class="empty detail-empty">{text.selectCalendar}</section>{/if}
		</div>{/if}
	</div>
	{#if calendarActionMenuOpen && selectedCalendar}<div class="menu-popover calendar-action-menu" role="menu" style={`top:${calendarActionMenuTop}px;left:${calendarActionMenuLeft}px`}><button type="button" role="menuitem" onclick={editCalendarFromMenu}><MenuItemIcon name="edit" />{common.edit}</button><div class="menu-separator"></div><button type="button" class="delete-item" role="menuitem" disabled={saving} onclick={deleteCalendarFromMenu}><MenuItemIcon name="delete" />{common.delete}</button></div>{/if}
	{#if showHolidayHelp}<DetailModal title={text.helpTitle} titleId="holiday-refresh-help-title" closeLabel={text.closeHelp} returnFocus={holidayHelpTrigger} compact dialogClass="holiday-help-dialog" onClose={() => showHolidayHelp = false}><div class="holiday-help-content"><p>{selectedCalendar?.countryCode === 'US' ? text.helpIntroUs : text.helpIntroJapan}</p><section class="app-detail-section"><h3>{text.updates}</h3><ul><li>{text.helpRecords}</li><li>{text.helpNames}</li><li>{text.helpStats}</li></ul></section><section class="app-detail-section"><h3>{text.important}</h3><ul><li>{selectedCalendar?.countryCode === 'US' ? text.usFederalOnly : text.japanOnly}</li><li>{text.helpOtherYears}</li><li>{text.helpShared}</li><li>{text.helpCompany}</li><li>{text.helpOverride}</li><li>{text.helpFailure}</li></ul></section></div></DetailModal>{/if}
	{#if selectedDate && selectedId}<WorkCalendarEntryModal calendarId={selectedId} workDate={selectedDate} entry={selectedEntry} returnFocus={entryReturnFocus} onClose={closeEntryModal} onSaved={entrySaved} />{/if}
	{#if showCalendarForm}
		<ModalBackdrop>
			<dialog bind:this={calendarDialog} class="app-modal app-modal--compact calendar-dialog" open aria-modal="true" aria-labelledby="calendar-form-title">
				<header><h2 id="calendar-form-title">{editingCalendar ? text.editCalendar : text.addCalendar}</h2><button class="app-modal-close" type="button" aria-label={text.closeCalendar} disabled={saving} onclick={requestCloseCalendarForm}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
				<form class="app-modal-form" novalidate onsubmit={(event) => { event.preventDefault(); void saveCalendar(); }}>
					<div class="app-modal-form-body calendar-form-body">
						{#if calendarFormError}<StatusNotice title={text.saveCalendarHeading} message={calendarFormError} tone="error" onDismiss={() => calendarFormError = ''} />{/if}
						<FormSection title={text.calendarDetails} columns={2} framed>
							<label><span>{text.name} <span class="required" aria-hidden="true">*</span></span><input bind:this={calendarNameInput} required maxlength="128" bind:value={calendarName} class:invalid={Boolean(calendarNameError)} aria-invalid={Boolean(calendarNameError)} aria-describedby={calendarNameError ? 'calendar-name-error' : undefined} oninput={() => { calendarNameError = ''; calendarFormError = ''; }} />{#if calendarNameError}<small id="calendar-name-error" class="field-error" role="alert">{calendarNameError}</small>{/if}</label>
							<SearchSelect label={text.year} field="calendarYear" value={calendarYear} options={calendarYearOptions} required disabled={Boolean(editingCalendar)} error={calendarYearError} onSelect={(value) => { calendarYear = value; calendarYearError = ''; calendarFormError = ''; }} />
							<SearchSelect label={text.holidayCountry} field="countryCode" value={calendarCountry} options={calendarCountryOptions} required disabled={Boolean(editingCalendar)} onSelect={(value) => { calendarCountry = value as 'JP' | 'US'; calendarFormError = ''; }} />
							<label><span>{text.scheduledHours} <span class="required" aria-hidden="true">*</span></span><input type="number" min="0.25" max="24" step="0.25" required bind:value={calendarHours} class:invalid={Boolean(calendarHoursError)} aria-invalid={Boolean(calendarHoursError)} aria-describedby={calendarHoursError ? 'calendar-hours-error' : 'calendar-hours-hint'} oninput={() => { calendarHoursError = ''; calendarFormError = ''; }} />{#if calendarHoursError}<small id="calendar-hours-error" class="field-error" role="alert">{calendarHoursError}</small>{:else}<small id="calendar-hours-hint" class="field-hint">{text.hoursHint}</small>{/if}</label>
							<label class="wide"><span>{text.calendarDescription}</span><textarea maxlength="1000" rows="4" bind:value={calendarDescription}></textarea></label>
						</FormSection>
					</div>
					<footer class="app-modal-footer"><button class="secondary" type="button" disabled={saving} onclick={requestCloseCalendarForm}>{common.cancel}</button><button class="app-primary-action" type="submit" disabled={saving || (Boolean(editingCalendar) && !hasUnsavedCalendarChanges)}>{saving ? common.saving : editingCalendar ? common.saveChanges : text.addCalendar}</button></footer>
				</form>
			</dialog>
		</ModalBackdrop>
		{#if confirmingCalendarDiscard}<DiscardChangesDialog onContinue={() => confirmingCalendarDiscard = false} onDiscard={closeCalendarFormImmediately} />{/if}
	{/if}
</AssetManagementShell>

<style>
	.calendar-items>button strong{max-width:100%;overflow-wrap:anywhere}
	.calendar-name-row{display:inline-flex;align-items:baseline;gap:8px;min-width:0;max-width:100%}
	.calendar-name-row>strong,.calendar-name-row>span:last-child{min-width:0;overflow-wrap:anywhere}
	.calendar-items>button .calendar-item-details{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;max-width:100%;margin-top:5px}
	.calendar-page{min-width:0}.unassigned-notice{margin:0 0 16px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--action-primary) 34%,var(--border));border-radius:5px;background:color-mix(in srgb,var(--action-primary) 9%,var(--surface));color:var(--action-primary);font-size:var(--font-size-support);line-height:1.6}:global([data-theme='dark']) .unassigned-notice{color:#8dc6f5}.layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:18px;align-items:start}.calendar-list,.summary,.panel,.empty{background:var(--surface);border:1px solid var(--border);border-radius:6px;box-shadow:var(--shadow)}.calendar-list{position:sticky;top:72px;overflow:hidden}.calendar-list>header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--border)}.calendar-list h2{margin:0;font-size:var(--font-size-section)}.calendar-list header span{color:var(--muted);font-size:var(--font-size-support)}.calendar-list>p{padding:8px 16px;color:var(--muted);font-size:var(--font-size-body)}.calendar-year-group:not(:last-child){border-bottom:1px solid var(--border)}.calendar-year-toggle{display:grid;grid-template-columns:1fr auto 14px;align-items:center;gap:8px;width:100%;height:38px;margin:0;padding:0 12px;background:var(--surface-secondary)!important;color:var(--text)!important;border:0;border-radius:0;text-align:left}.calendar-year-toggle:hover{background:var(--border-light)!important}.calendar-year-toggle>span:first-child{font-size:var(--font-size-body);font-weight:700}.calendar-year-count{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:20px;padding:0 6px;background:rgba(51,122,183,.12);color:#337ab7!important;border:1px solid rgba(51,122,183,.28);border-radius:999px;font-size:var(--font-size-support)!important;font-weight:700}.calendar-year-toggle svg{width:14px;height:14px;transition:transform .16s ease}.calendar-items>button{display:flex;flex-direction:column;align-items:flex-start;width:100%;margin:0;padding:12px 16px;background:transparent;color:var(--text);border:0;border-bottom:1px solid var(--border-light);border-radius:0;text-align:left}.calendar-items>button:last-child{border-bottom:0}.calendar-items>button:hover,.calendar-items>button.active{background:var(--surface-secondary)}.calendar-items>button.active{box-shadow:inset 3px 0 var(--primary)}.calendar-list strong{font-size:var(--font-size-body)}.calendar-items>button span{color:var(--muted);font-size:var(--font-size-support)}.details{display:grid;gap:18px;min-width:0}.details.busy{opacity:.7}.summary{position:relative;display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap;padding:18px 56px 18px 18px}.summary-main{min-width:0;max-width:70ch;flex:1 1 240px}.calendar-year{margin:0;color:var(--primary);font-size:var(--font-size-support);font-weight:700}.summary h2{margin:3px 0;font-size:var(--font-size-section);overflow-wrap:anywhere}.calendar-description{margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;color:var(--muted);font-size:var(--font-size-body);line-height:1.6}.summary-side{min-width:0;max-width:100%;flex:0 1 auto;align-self:flex-end}.calendar-stats{display:grid;grid-template-columns:repeat(5,max-content);width:max-content;max-width:100%;gap:1px;margin:0;overflow:hidden;background:var(--border-light);border:1px solid var(--border-light);border-radius:5px}.calendar-stats div{min-width:0;padding:8px 10px;background:var(--surface-secondary)}.calendar-stats dt{white-space:nowrap;color:var(--muted);font-size:var(--font-size-support);line-height:1.25}.calendar-stats dd{margin:4px 0 0;color:var(--text);font-size:var(--font-size-body);font-weight:700;white-space:nowrap}.calendar-actions,.month-controls{display:flex;align-items:center;gap:6px}.secondary-action{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;height:32px;margin:0;padding:0 12px;border-radius:4px;font-size:var(--font-size-body);font-weight:500;line-height:1}.secondary-action{background:var(--surface)!important;color:var(--text-secondary)!important;border:1px solid var(--border);box-shadow:var(--shadow)}.panel{min-width:0;padding:18px}.panel>header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.panel h3{margin:0;font-size:var(--font-size-subsection)}.panel header p{margin:3px 0 0;color:var(--muted);font-size:var(--font-size-support)}.calendar-toolbar{align-items:center!important}.month-controls button{min-width:34px;height:32px;margin:0;padding:0 9px;background:var(--surface)!important;color:var(--text)!important;border:1px solid var(--border);border-radius:4px;font-size:var(--font-size-body)}.month-controls button:hover:not(:disabled){background:var(--surface-secondary)!important}.month-controls button:disabled{opacity:.45}.month-controls strong{min-width:130px;font-size:var(--font-size-body);text-align:center}.import-status{margin:-6px 0 10px;color:var(--muted);font-size:var(--font-size-support);text-align:right}.month-scroll{overflow-x:auto;border:1px solid var(--border);border-radius:6px}.month-grid{display:grid;grid-template-columns:repeat(7,minmax(86px,1fr));min-width:602px;background:var(--border);gap:1px}.weekday{padding:8px;background:var(--surface-secondary);color:var(--muted);font-size:var(--font-size-support);font-weight:700;text-align:center;text-transform:uppercase}.weekday.sunday{color:#d9534f}.weekday.saturday{color:#337ab7}.day-cell{position:relative;display:flex;flex-direction:column;align-items:flex-start;min-height:104px;margin:0;padding:8px;background:var(--surface)!important;color:var(--text)!important;border:0;border-radius:0;text-align:left;overflow:hidden}.day-cell:not(:disabled):hover{background:var(--surface-secondary)!important}.day-cell:disabled{cursor:default;opacity:1}.day-cell.outside{background:var(--surface-secondary)!important;color:var(--muted)!important}.day-cell.today{background:#1abb9c18!important}.day-cell.today:not(:disabled):hover{background:#1abb9c26!important}.day-cell.red-day .day-number{color:#d9534f}.day-cell.blue-day .day-number{color:#337ab7}.day-cell.has-entry{box-shadow:inset 3px 0 var(--primary)}.day-cell.has-entry.red-day{box-shadow:inset 3px 0 #d9534f}.day-number{font-size:var(--font-size-body);font-weight:700}.holiday-name{display:block;max-width:100%;margin-top:4px;overflow:hidden;color:#c74743;font-size:var(--font-size-support);font-weight:600;text-overflow:ellipsis;white-space:nowrap}.day-cell.working-day .holiday-name{color:var(--text-secondary)}.entry-type{margin-top:6px;padding:2px 5px;background:#1abb9c20;color:#168b76;border-radius:3px;font-size:var(--font-size-support);font-weight:700}.entry-type.holiday-entry{background:#d9534f1c;color:#c74743}.day-cell small{display:block;max-width:100%;margin-top:4px;overflow:hidden;color:var(--text-secondary);font-size:var(--font-size-support);text-overflow:ellipsis;white-space:nowrap}.assignment-state{display:flex;align-items:center;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:var(--font-size-body)}.empty{padding:28px;color:var(--muted);font-size:var(--font-size-body);text-align:center}.calendar-dialog{width:min(100%,680px)}.calendar-form-body{grid-template-columns:1fr;padding-top:16px}.wide{grid-column:1/-1}
	.summary-main{max-width:none}
	.selection-section{container-name:employee-selection;container-type:inline-size;padding:12px;background:var(--surface-secondary);border:1px solid var(--border-light);border-radius:6px}.selection-section+.selection-section{margin-top:14px}.selection-heading{margin-bottom:10px}.selection-heading h4{margin:0;font-size:var(--font-size-subsection)}.selection-heading p{margin:3px 0 0;color:var(--muted);font-size:var(--font-size-support)}.assignment-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.assignment-option{display:flex;align-items:center;gap:9px;min-width:0;padding:10px;background:var(--surface);border:1px solid var(--border);border-radius:5px;cursor:pointer}.assignment-option:hover{background:var(--border-light)}.assignment-option>span{display:flex;flex-direction:column;min-width:0}.assignment-option strong{overflow-wrap:anywhere;font-size:var(--font-size-body)}.assignment-option small{color:var(--muted);font-size:var(--font-size-support);overflow-wrap:anywhere}.selection-section input{flex:none;width:15px;height:15px}
	@container employee-selection (max-width:1279px){.assignment-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
	@container employee-selection (max-width:1079px){.assignment-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
	@container employee-selection (max-width:759px){.assignment-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
	@container employee-selection (max-width:519px){.assignment-grid{grid-template-columns:1fr}}
	.day-cell-container{min-width:0}.day-cell-container .day-cell{width:100%;height:100%}.day-cell-container .day-cell:focus-visible{outline:2px solid var(--action-primary);outline-offset:-2px}.day-cell-container .day-cell:disabled{pointer-events:none}
	.calendar-action-trigger{position:absolute;z-index:1;top:14px;right:14px}
	.calendar-actions{gap:20px}.holiday-refresh-actions{display:flex;align-items:center;gap:6px}.holiday-refresh-actions>button{margin:0}.holiday-help-button{display:grid;place-items:center;width:32px;height:32px;padding:7px;background:transparent!important;color:var(--text-secondary)!important;border:0;border-radius:4px}.holiday-help-button svg{width:18px;height:18px}.holiday-help-button:hover{background:var(--surface-secondary)!important;color:var(--text)!important}.holiday-help-button:focus-visible{outline:2px solid var(--action-primary);outline-offset:2px}:global(.holiday-help-dialog){width:min(100%,620px)}.holiday-help-content{display:grid;gap:16px;color:var(--text-secondary);font-size:var(--font-size-body);line-height:1.6}.holiday-help-content>p{margin:0}.holiday-help-content ul{display:grid;gap:7px;margin:0;padding-left:20px}.holiday-help-content li{padding-left:2px}
	@media(max-width:1280px){.summary-side{width:100%}.calendar-stats{grid-template-columns:repeat(3,max-content)}}
	@media(max-width:1040px){.calendar-toolbar{align-items:flex-start!important}.calendar-actions{align-items:flex-end;flex-direction:column;gap:10px}.calendar-stats{grid-template-columns:repeat(2,max-content)}}
	@media(max-width:900px){.layout{grid-template-columns:1fr}.calendar-list{position:static}.calendar-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.calendar-year-group{border-bottom:1px solid var(--border)}.calendar-year-group:nth-child(odd){border-right:1px solid var(--border)}}
	@media(max-width:620px){.calendar-groups{grid-template-columns:1fr}.calendar-year-group:nth-child(odd){border-right:0}.summary,.panel>header{flex-direction:column}.summary-main{width:100%;flex:none}.summary-side{min-width:0;width:100%}.calendar-stats{grid-template-columns:repeat(2,max-content)}.calendar-actions{width:100%;align-items:stretch}.refresh{flex:1}.month-controls{width:100%}.month-controls strong{flex:1;min-width:0}.import-status{text-align:left}.calendar-toolbar{align-items:stretch!important}}
	@media(max-width:440px){.calendar-stats{grid-template-columns:max-content}}
</style>
