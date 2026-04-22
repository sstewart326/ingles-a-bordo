/**
 * User birthdate is stored as MM-DD (padded or unpadded, see AdminUsers / calendar).
 * Aligns with local calendar day in calendarDayUtils.
 */
export function isBirthdayToday(
  birthdate: string | undefined,
  now: Date = new Date()
): boolean {
  if (!birthdate?.trim()) return false;
  const parts = birthdate.trim().split('-').map((s) => parseInt(s, 10));
  if (parts.length < 2) return false;
  const [month, day] = parts;
  if (Number.isNaN(month) || Number.isNaN(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  return now.getMonth() + 1 === month && now.getDate() === day;
}

export function getLocalYyyyMmDd(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function birthdayStorageKeyForUser(authUid: string): string {
  return `birthdayCelebration_${getLocalYyyyMmDd()}_${authUid}`;
}
