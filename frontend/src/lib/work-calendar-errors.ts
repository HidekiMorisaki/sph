/** Translate stable REST error codes without displaying server messages. */
export async function calendarErrorKey(response: Response) {
 const payload = await response.clone().json().catch(() => null) as { error?: { code?: string; details?: { field?: string }[] } } | null;
 if (response.status === 401) return 'authRequired' as const;
 if (response.status === 403) return 'forbidden' as const;
 if (response.status === 404) return 'notFound' as const;
 switch (payload?.error?.code) {
  case 'DUPLICATE_VALUE': return payload.error.details?.some(detail => detail.field === 'workDate') ? 'duplicateDate' as const : 'duplicateName' as const;
  case 'INVALID_EMPLOYEE': return 'invalidEmployee' as const;
  case 'INVALID_REQUEST': return 'invalidRequest' as const;
  case 'HOLIDAY_IMPORT_FAILED': return 'holidayFailed' as const;
  default: return 'unknown' as const;
 }
}
