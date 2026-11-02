import 'server-only';

import { type AdminRole, adminMayAccess } from '@dhoblio/shared';
import { fetchFromApi } from '../api/server';
import { NAV_BADGE_CAP, type NavBadge, type NavBadgeCounts } from './nav';

/**
 * The "how much work is waiting" badges in the sidebar.
 *
 * There is no count endpoint for these queues: every admin list is cursor-paginated and its `meta` carries
 * only `nextCursor`, no total. So a badge is built from a capped page — ask for `PROBE_LIMIT` rows and
 * count them. If the API hands back a cursor there are more, and the badge says `20+` rather than
 * inventing a number.
 *
 * Unassigned delivery jobs are the exception: /admin/delivery/summary returns exact counts per job status
 * in one cheap call, so that badge is precise.
 *
 * Every count is fetched in parallel and allowed to fail alone — a sidebar badge is never worth breaking
 * the shell for, so a failed probe simply renders no badge. Only the areas this admin's role can reach are
 * requested, so a FINANCE admin does not log a 403 on every page load just by having a sidebar.
 */

/** Shared with the sidebar so the cap and the "20+" label can never disagree. */
const PROBE_LIMIT = NAV_BADGE_CAP;

interface CursorMeta {
  nextCursor?: string | null;
}

async function probeQueue(path: string, query: Record<string, unknown>): Promise<number | undefined> {
  try {
    const { data, meta } = await fetchFromApi<unknown[]>(path, {
      query: { ...query, limit: PROBE_LIMIT },
      cache: 'no-store',
      retries: 0,
    });
    if (!Array.isArray(data)) return undefined;
    const hasMore = !!(meta as CursorMeta | undefined)?.nextCursor;
    // The sidebar renders anything at or over the cap as "20+", so the cap itself carries that meaning.
    return hasMore ? PROBE_LIMIT : data.length;
  } catch {
    return undefined;
  }
}

async function unassignedJobs(): Promise<number | undefined> {
  try {
    const { data } = await fetchFromApi<{ jobs?: Record<string, number> }>('/admin/delivery/summary', {
      cache: 'no-store',
      retries: 0,
    });
    return data?.jobs?.UNASSIGNED;
  } catch {
    return undefined;
  }
}

export async function fetchNavCounts(adminRole: AdminRole | null): Promise<NavBadgeCounts> {
  const probes: Array<[NavBadge, () => Promise<number | undefined>]> = [];

  if (adminMayAccess(adminRole, 'vendors')) {
    probes.push(['pendingVendors', () => probeQueue('/admin/vendors', { status: 'PENDING' })]);
  }
  if (adminMayAccess(adminRole, 'delivery')) {
    probes.push(['pendingRiders', () => probeQueue('/admin/riders', { status: 'PENDING' })]);
    probes.push(['unassignedJobs', unassignedJobs]);
  }
  if (adminMayAccess(adminRole, 'complaints')) {
    probes.push(['openComplaints', () => probeQueue('/admin/complaints', { status: 'OPEN' })]);
  }
  if (adminMayAccess(adminRole, 'finance')) {
    probes.push(['pendingPayouts', () => probeQueue('/admin/payouts', { status: 'REQUESTED' })]);
  }

  const results = await Promise.all(probes.map(([, run]) => run()));

  const counts: NavBadgeCounts = {};
  probes.forEach(([key], i) => {
    const value = results[i];
    if (value && value > 0) counts[key] = value;
  });
  return counts;
}
