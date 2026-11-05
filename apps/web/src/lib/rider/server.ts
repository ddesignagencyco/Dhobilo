import "server-only";

import { redirect } from "next/navigation";
import { ApiError } from "../api/errors";
import { type ApiResult, type RequestOptions, apiFetch } from "../api/fetch";
import { readRiderSession } from "./session";

export class RiderSessionRequiredError extends Error {
  constructor() {
    super("No rider session");
    this.name = "RiderSessionRequiredError";
  }
}

export async function fetchRiderApi<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const session = await readRiderSession();
  if (!session) throw new RiderSessionRequiredError();
  return apiFetch<T>(path, { ...options, accessToken: session.accessToken });
}

export async function fetchForRiderPage<T>(
  path: string,
  options: RequestOptions & { locale: string; returnTo?: string } = {
    locale: "en",
  },
): Promise<ApiResult<T>> {
  const { locale, returnTo, ...rest } = options;
  try {
    return await fetchRiderApi<T>(path, rest);
  } catch (error) {
    if (
      error instanceof RiderSessionRequiredError ||
      (error instanceof ApiError && error.isSessionExpired)
    ) {
      redirect(riderLoginPath(locale, returnTo));
    }
    throw error;
  }
}

export function riderLoginPath(locale: string, returnTo?: string): string {
  const base = `/${locale}/login`;
  return returnTo ? `${base}?next=${encodeURIComponent(returnTo)}` : base;
}

export async function currentRider() {
  const session = await readRiderSession();
  return session?.user || null;
}
