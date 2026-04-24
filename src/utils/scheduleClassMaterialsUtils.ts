/**
 * Helpers for merging class materials (multiple Firestore docs per class/date)
 * and deriving display names from Firebase Storage download URLs.
 */

import { getBaseClassId, ClassSession } from './scheduleUtils';
import { ClassMaterial } from '../types/interfaces';

/** Returns true if the material belongs to the given calendar date (midnight comparison). */
export function isMaterialForDate(material: ClassMaterial, date: Date): boolean {
  if (!material.classDate) return true; // no date = legacy; show everywhere
  const md = material.classDate instanceof Date ? material.classDate : new Date(material.classDate);
  return (
    md.getFullYear() === date.getFullYear() &&
    md.getMonth() === date.getMonth() &&
    md.getDate() === date.getDate()
  );
}

/**
 * Class materials for a row on the schedule: same base class as the session, and
 * either whole-class (no / empty studentEmails) or at least one targeted student
 * in this session. Matches getStudentClassMaterials semantics for per-student docs.
 */
export function filterMaterialsForClassSession(
  materials: ClassMaterial[] | undefined,
  classSession: ClassSession
): ClassMaterial[] {
  if (!materials?.length) return [];
  const rowBase = getBaseClassId(classSession.id);
  const sessionEmails = classSession.studentEmails || [];

  return materials.filter((m) => {
    if (!m.classId) return false;
    if (getBaseClassId(m.classId) !== rowBase) return false;
    const targets = m.studentEmails;
    if (!targets || targets.length === 0) return true;
    return targets.some((email) => sessionEmails.includes(email));
  });
}

export interface MaterialWithSlidesAndLinks {
  classDate?: string;
  slides?: string[];
  links?: string[];
}

/** Merge slides and links from every material row matching the calendar day (YYYY-MM-DD). */
export function mergeClassMaterialsForDate<T extends MaterialWithSlidesAndLinks>(
  materials: T[] | undefined,
  dateStr: string
): { slides: string[]; links: string[] } | null {
  if (!materials?.length) return null;

  const matching = materials.filter((m) => {
    const materialDateStr = m.classDate?.split('T')[0] || '';
    return materialDateStr === dateStr;
  });

  if (matching.length === 0) return null;

  const slides: string[] = [];
  const links: string[] = [];
  const seenSlides = new Set<string>();
  const seenLinks = new Set<string>();

  for (const m of matching) {
    for (const s of m.slides || []) {
      if (s && !seenSlides.has(s)) {
        seenSlides.add(s);
        slides.push(s);
      }
    }
    for (const l of m.links || []) {
      if (l && !seenLinks.has(l)) {
        seenLinks.add(l);
        links.push(l);
      }
    }
  }

  return { slides, links };
}

/**
 * Best-effort label from a Firebase Storage download URL (path often ends with
 * YYYY-MM-DD_timestamp_originalFileName).
 */
export function getSlideDisplayNameFromUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';

  try {
    const u = new URL(url);
    const pathMatch = u.pathname.match(/\/o\/(.+)/);
    if (pathMatch?.[1]) {
      const decoded = decodeURIComponent(pathMatch[1].replace(/\+/g, ' '));
      const segments = decoded.split('/');
      const last = segments[segments.length - 1] || '';
      const uploadPattern = /^\d{4}-\d{2}-\d{2}_\d+_(.+)$/;
      const m = last.match(uploadPattern);
      if (m?.[1]) return m[1];
      if (last) return last;
    }
  } catch {
    /* fall through */
  }

  try {
    const noQuery = url.split('?')[0];
    const part = noQuery.split('/').pop();
    if (part) return decodeURIComponent(part);
  } catch {
    /* ignore */
  }

  return url;
}
