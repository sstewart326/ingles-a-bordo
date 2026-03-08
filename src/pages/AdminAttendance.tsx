import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '../hooks/useAdmin';
import { useLanguage } from '../hooks/useLanguage';
import { useTranslation } from '../translations';
import { getCachedCollection } from '../utils/firebaseUtils';
import { getAttendanceForClass } from '../utils/attendanceUtils';
import { getAllClassesForMonth } from '../services/calendarService';
import { Class, User } from '../types/interfaces';
import { styles } from '../styles/styleUtils';
import { where } from 'firebase/firestore';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

type DateRangePreset = 'last7' | 'last30' | 'last90' | 'all';

interface StudentRow {
  id: string;
  email: string;
  name?: string;
}

function getDateRange(preset: DateRangePreset): { from?: Date; to?: Date } {
  if (preset === 'all') return {};
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  if (preset === 'last7') from.setDate(from.getDate() - 7);
  else if (preset === 'last30') from.setDate(from.getDate() - 30);
  else if (preset === 'last90') from.setDate(from.getDate() - 90);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export const AdminAttendance = () => {
  const { isAdmin } = useAdmin();
  const { language } = useLanguage();
  const t = useTranslation(language);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('last30');
  const [attendanceRecords, setAttendanceRecords] = useState<Awaited<ReturnType<typeof getAttendanceForClass>>>([]);
  const [resolvedStudentList, setResolvedStudentList] = useState<StudentRow[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [classLabels, setClassLabels] = useState<Record<string, string>>({});
  const [calculatedSessionDates, setCalculatedSessionDates] = useState<string[]>([]);
  const [loadingSessionDates, setLoadingSessionDates] = useState(false);

  const selectedClass = useMemo(() => classes.find((c) => c.id === selectedClassId), [classes, selectedClassId]);

  useEffect(() => {
    if (!isAdmin) return;
    setLoadingClasses(true);
    getCachedCollection<Class>('classes', [], { bypassCache: true })
      .then((list) => {
        setClasses(list);
        if (list.length > 0 && !selectedClassId) setSelectedClassId(list[0].id);
      })
      .finally(() => setLoadingClasses(false));
  }, [isAdmin]);

  // Resolve all classes' student emails to names for dropdown labels (courseType + student names)
  useEffect(() => {
    if (classes.length === 0) {
      setClassLabels({});
      return;
    }
    const allEmails = Array.from(
      new Set(classes.flatMap((c) => c.studentEmails ?? []))
    );
    if (allEmails.length === 0) {
        setClassLabels(
          Object.fromEntries(classes.map((c) => [c.id, `${c.courseType ?? c.id} (0 students)`]))
      );
      return;
    }
    const emailToName = new Map<string, string>();
    const batchSize = 10;
    (async () => {
      try {
        for (let i = 0; i < allEmails.length; i += batchSize) {
          const chunk = allEmails.slice(i, i + batchSize);
          const users = await getCachedCollection<User>('users', [where('email', 'in', chunk)], { bypassCache: true });
          users.forEach((u) => {
            const email = u.email ?? '';
            if (email && u.name) emailToName.set(email.toLowerCase(), u.name);
          });
        }
        const labels: Record<string, string> = {};
        const maxNames = 4;
        for (const c of classes) {
          const emails = c.studentEmails ?? [];
          const names = emails.map((e) => emailToName.get(e.toLowerCase()) ?? e);
          labels[c.id] = names.length > maxNames
            ? `${names.slice(0, maxNames).join(', ')}…`
            : names.join(', ');
        }
        setClassLabels(labels);
      } catch {
        setClassLabels(
          Object.fromEntries(classes.map((c) => [c.id, `${c.courseType ?? c.id} (${c.studentEmails?.length ?? 0} students)`]))
        );
      }
    })();
  }, [classes]);

  // Resolve student list: use class.studentIds when available, else resolve emails -> UIDs (and names) from users
  useEffect(() => {
    if (!selectedClass) {
      setResolvedStudentList([]);
      return;
    }
    const emails = selectedClass.studentEmails ?? [];
    const ids = selectedClass.studentIds ?? [];
    const hasIds = ids.length > 0 && ids.length === emails.length;
    if (hasIds) {
      setResolvedStudentList(
        ids.map((id, i) => ({ id, email: emails[i] ?? id, name: undefined }))
      );
      return;
    }
    if (emails.length === 0) {
      setResolvedStudentList([]);
      return;
    }
    setLoadingStudents(true);
    const batchSize = 10;
    const emailToUser = new Map<string, { uid: string; name?: string }>();
    (async () => {
      try {
        for (let i = 0; i < emails.length; i += batchSize) {
          const chunk = emails.slice(i, i + batchSize);
          const users = await getCachedCollection<User>('users', [where('email', 'in', chunk)], { bypassCache: true });
          users.forEach((u) => {
            const email = u.email ?? '';
            if (!email) return;
            const uid = u.uid ?? u.id;
            if (uid) emailToUser.set(email.toLowerCase(), { uid, name: u.name });
          });
        }
        const list: StudentRow[] = emails.map((e) => {
          const resolved = emailToUser.get(e.toLowerCase());
          return {
            id: resolved?.uid ?? '',
            email: e,
            name: resolved?.name,
          };
        });
        setResolvedStudentList(list);
      } catch {
        setResolvedStudentList(emails.map((e) => ({ id: '', email: e })));
      } finally {
        setLoadingStudents(false);
      }
    })();
  }, [selectedClass?.id, selectedClass?.studentEmails, selectedClass?.studentIds]);

  const { from: fromDate, to: toDate } = useMemo(() => getDateRange(dateRangePreset), [dateRangePreset]);

  // Resolve date range for "all" using class start/end
  const effectiveRange = useMemo(() => {
    if (dateRangePreset !== 'all' && fromDate && toDate) return { from: fromDate, to: toDate };
    if (!selectedClass) return null;
    const start = selectedClass.startDate?.toDate?.() ?? new Date(new Date().getFullYear(), 0, 1);
    let end = selectedClass.endDate?.toDate?.();
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (!end || end > today) end = today;
    if (start > end) return null;
    return { from: start, to: end };
  }, [dateRangePreset, fromDate, toDate, selectedClass]);

  // Fetch calculated session dates from calendar API (same logic as Dashboard)
  useEffect(() => {
    if (!selectedClassId || !selectedClass || !effectiveRange) {
      setCalculatedSessionDates([]);
      return;
    }
    setLoadingSessionDates(true);
    const { from, to } = effectiveRange;
    const monthsToFetch: { month: number; year: number }[] = [];
    const cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const endMonth = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cur <= endMonth) {
      monthsToFetch.push({ month: cur.getMonth(), year: cur.getFullYear() });
      cur.setMonth(cur.getMonth() + 1);
    }
    Promise.all(
      monthsToFetch.map(({ month, year }) =>
        getAllClassesForMonth(month, year, { bypassCache: true })
      )
    )
      .then((responses) => {
        const mergedMap: Record<string, { id: string }[]> = {};
        responses.forEach((res) => {
          const map = res?.dailyClassMap ?? {};
          Object.keys(map).forEach((dateStr) => {
            if (!mergedMap[dateStr]) mergedMap[dateStr] = [];
            const entries = Array.isArray(map[dateStr]) ? map[dateStr] : [];
            mergedMap[dateStr].push(...entries.filter((e: { id?: string }) => e?.id != null));
          });
        });
        const toLocalDateStr = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };
        const fromStr = toLocalDateStr(from);
        const toStr = toLocalDateStr(to);
        const sessionDates = Object.keys(mergedMap)
          .filter((dateStr) => {
            if (dateStr < fromStr || dateStr > toStr) return false;
            return (mergedMap[dateStr] ?? []).some((e: { id: string }) => e.id === selectedClassId);
          })
          .sort();
        setCalculatedSessionDates(sessionDates);
      })
      .catch(() => setCalculatedSessionDates([]))
      .finally(() => setLoadingSessionDates(false));
  }, [selectedClassId, selectedClass?.id, effectiveRange]);

  useEffect(() => {
    if (!selectedClassId || !selectedClass) {
      setAttendanceRecords([]);
      return;
    }
    const from = effectiveRange?.from;
    const to = effectiveRange?.to;
    setLoadingAttendance(true);
    getAttendanceForClass(selectedClassId, from, to)
      .then(setAttendanceRecords)
      .finally(() => setLoadingAttendance(false));
  }, [selectedClassId, selectedClass?.id, effectiveRange]);

  const { sessionDates, byDate, summary, tableRows } = useMemo(() => {
    const dates = [...calculatedSessionDates].sort((a, b) => b.localeCompare(a));
    const byDate = new Map<string, Set<string>>();
    attendanceRecords.forEach((r) => {
      byDate.set(r.classDate, new Set(r.absentStudentIds));
    });
    const studentList = resolvedStudentList;
    const totalCells = studentList.length * dates.length;
    let presentCount = 0;
    const missedByStudent = new Map<string, number>();
    studentList.forEach(({ id }) => {
      let missed = 0;
      dates.forEach((d) => {
        const absent = id ? byDate.get(d)?.has(id) : false;
        if (absent) missed++;
        else presentCount++;
      });
      missedByStudent.set(id, missed);
    });
    const attendancePercent = totalCells > 0 ? Math.round((presentCount / totalCells) * 100) : 100;
    const summary = {
      sessions: dates.length,
      attendancePercent,
    };
    const rows = studentList
      .map((student) => ({
        ...student,
        missedCount: missedByStudent.get(student.id) ?? 0,
      }))
      .sort((a, b) => b.missedCount - a.missedCount);
    return { sessionDates: dates, byDate, summary, tableRows: rows };
  }, [calculatedSessionDates, attendanceRecords, resolvedStudentList]);

  if (!isAdmin) return null;

  if (loadingClasses) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="py-6 w-full max-w-6xl mx-auto px-4 sm:px-6">
      <div className="mb-6">
        <h1 className={styles.headings.h1}>{t.attendanceTitle}</h1>
        <p className="mt-2 text-sm text-gray-600">{t.attendanceDescription}</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">{t.selectClass}:</span>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="border border-gray-300 rounded-md pl-3 pr-8 py-1.5 text-sm appearance-none bg-[length:1rem_1rem] bg-[right_0.35rem_center] bg-no-repeat bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')]"
          >
            <option value="">—</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {classLabels[c.id]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-5">
          <span className="text-sm font-medium text-gray-700">{t.date}:</span>
          <select
            value={dateRangePreset}
            onChange={(e) => setDateRangePreset(e.target.value as DateRangePreset)}
            className="border border-gray-300 rounded-md pl-3 pr-8 py-1.5 text-sm appearance-none bg-[length:1rem_1rem] bg-[right_0.35rem_center] bg-no-repeat bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%236b7280%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')]"
          >
            <option value="last7">{t.last7Days}</option>
            <option value="last30">{t.last30Days}</option>
            <option value="last90">{t.last90Days}</option>
            <option value="all">{t.dateRangeAll}</option>
          </select>
        </label>
      </div>

      {!selectedClass && <p className="text-gray-500">{t.selectClass}</p>}

      {selectedClass && (
        <>
          {(loadingAttendance || loadingStudents || loadingSessionDates) ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="border border-gray-200 rounded-lg p-3 bg-white">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t.sessionsCount}</div>
                  <div className="text-xl font-semibold text-gray-900 mt-0.5">{summary.sessions}</div>
                </div>
                <div className="border border-gray-200 rounded-lg p-3 bg-white">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t.attendancePercent}</div>
                  <div className="text-xl font-semibold text-gray-900 mt-0.5">{summary.attendancePercent}%</div>
                </div>
              </div>

              {sessionDates.length === 0 ? (
                <div className="border border-gray-200 rounded-lg p-8 bg-white text-center">
                  <p className="text-gray-600 mb-3">{t.attendanceEmptyState}</p>
                  <Link
                    to="/"
                    className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700"
                  >
                    {t.attendanceEmptyCta}
                  </Link>
                </div>
              ) : (
                <>
                  <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                    <div className="max-h-[60vh] overflow-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead>
                          <tr>
                            <th
                              scope="col"
                              className="sticky left-0 top-0 z-20 bg-gray-50 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 shadow-[1px_0_0_0_theme(colors.gray.200)]"
                            >
                              {t.studentsLabel}
                            </th>
                            {sessionDates.map((d) => (
                              <th
                                key={d}
                                scope="col"
                                className="sticky top-0 z-10 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-500 whitespace-nowrap"
                              >
                                {formatShortDate(d, language)}
                              </th>
                            ))}
                            <th
                              scope="col"
                              className="sticky top-0 z-10 bg-gray-50 px-3 py-3 text-center text-xs font-medium text-gray-500 whitespace-nowrap"
                            >
                              {t.missed}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {tableRows.map((row) => (
                            <tr key={row.id || row.email} className="hover:bg-gray-50">
                              <td className="sticky left-0 z-10 bg-white px-4 py-2 text-sm text-gray-900 border-r border-gray-200 whitespace-nowrap">
                                {row.name ?? row.email}
                              </td>
                              {sessionDates.map((classDate) => {
                                const absent = byDate.get(classDate)?.has(row.id);
                                return (
                                  <td
                                    key={classDate}
                                    className="px-3 py-2 text-center whitespace-nowrap"
                                    aria-label={absent ? t.missed : t.attended}
                                  >
                                    {absent ? (
                                      <XMarkIcon className="h-5 w-5 text-red-500 inline-block" aria-hidden />
                                    ) : (
                                      <CheckIcon className="h-5 w-5 text-green-600 inline-block" aria-hidden />
                                    )}
                                  </td>
                                );
                              })}
                              <td className="px-3 py-2 text-center text-sm font-medium text-gray-900 whitespace-nowrap">
                                {row.missedCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

function formatShortDate(isoDate: string, language: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(language === 'pt-BR' ? 'pt-BR' : 'en-US', {
    month: 'short',
    day: 'numeric',
  });
}
