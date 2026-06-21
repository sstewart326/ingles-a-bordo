import { PinnedLink } from '../types/interfaces';

export type PinnedLinkIconType = 'youtube' | 'google' | 'pdf' | 'generic';

const URL_TRUNCATE_LENGTH = 60;

export function normalizePinnedLinkUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
}

export function getPinnedLinkHostname(url: string): string {
  try {
    const hostname = new URL(normalizePinnedLinkUrl(url)).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url.trim();
  }
}

export function getPinnedLinkIconType(url: string): PinnedLinkIconType {
  const normalized = normalizePinnedLinkUrl(url).toLowerCase();

  try {
    const { hostname, pathname } = new URL(normalized);
    const host = hostname.replace(/^www\./, '');

    if (host === 'youtu.be' || host.endsWith('youtube.com')) {
      return 'youtube';
    }

    if (
      host.endsWith('google.com') ||
      host.endsWith('google.com.br') ||
      host.endsWith('docs.google.com') ||
      host.endsWith('drive.google.com')
    ) {
      return 'google';
    }

    if (pathname.endsWith('.pdf') || host.includes('pdf')) {
      return 'pdf';
    }
  } catch {
    // fall through to generic
  }

  return 'generic';
}

export function getPinnedLinkDisplayTitle(item: PinnedLink): string {
  const title = item.title?.trim();
  if (title) return title;

  const url = item.url.trim();
  return url.length > URL_TRUNCATE_LENGTH ? `${url.slice(0, URL_TRUNCATE_LENGTH)}…` : url;
}

export function hasPinnedLinkCustomTitle(item: PinnedLink): boolean {
  return Boolean(item.title?.trim());
}

export function filterValidPinnedLinks(links: PinnedLink[] | undefined): PinnedLink[] {
  return (links || []).filter((item) => (item?.url || '').trim() !== '');
}
