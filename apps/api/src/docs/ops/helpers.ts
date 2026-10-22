/** `{ data }` envelope used by every successful response. */
export const ok = (data: unknown) => ({ data });

/** Paged list: `data` is the page, `meta.nextCursor` is passed back as `?cursor=` for the next page (null = last page). */
export const page = (data: unknown[], nextCursor: string | null = null) => ({ data, meta: { nextCursor } });

export const empty = { data: null };

/** Documentation for the paging parameters shared by every list endpoint. */
export const PAGING_PARAMS = {
  cursor: { description: 'Opaque value from the previous page’s `meta.nextCursor`. Leave out for the first page.' },
  limit: { example: 20, description: 'Page size, 1 to 50 (default 20).' },
};
