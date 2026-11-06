"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { riderApiClient as apiClient } from "@/lib/api/client";
import { type DeliveryJob, riderQueryKeys } from "./use-rider-jobs";

const FALLBACK_POSITION = { lat: 31.5204, lng: 74.3587 };

/** The browser's position. Outside production a missing GPS falls back to central Lahore so dev works on a desktop. */
export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    const fallback = () =>
      process.env.NODE_ENV === "production"
        ? reject(new Error("LOCATION_UNAVAILABLE"))
        : resolve(FALLBACK_POSITION);
    if (typeof navigator === "undefined" || !navigator.geolocation)
      return fallback();
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      fallback,
      { timeout: 8000, maximumAge: 60_000 },
    );
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: riderQueryKeys.all });
  };
}

export function useRiderOnlineToggle() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ online }: { online: boolean }) => {
      if (online) {
        const position = await currentPosition();
        return (await apiClient.post("/rider/online", position)).data;
      }
      return (await apiClient.post("/rider/offline", {})).data;
    },
    onSuccess: invalidate,
  });
}

export type JobAction = "claim" | "accept" | "decline" | "start";

export function useRiderJobAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      jobId,
      action,
    }: {
      jobId: string;
      action: JobAction;
    }) =>
      (await apiClient.post<DeliveryJob>(`/rider/jobs/${jobId}/${action}`, {}))
        .data,
    onSuccess: invalidate,
  });
}

export function useRiderJobComplete() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      jobId,
      otp,
      proofPhotoPublicId,
    }: {
      jobId: string;
      otp?: string;
      proofPhotoPublicId?: string;
    }) =>
      (
        await apiClient.post<DeliveryJob>(`/rider/jobs/${jobId}/complete`, {
          otp,
          proofPhotoPublicId,
        })
      ).data,
    onSuccess: invalidate,
  });
}

export function useRiderJobFail() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ jobId, reason }: { jobId: string; reason: string }) =>
      (
        await apiClient.post<DeliveryJob>(`/rider/jobs/${jobId}/fail`, {
          reason,
        })
      ).data,
    onSuccess: invalidate,
  });
}

interface SignedUpload {
  timestamp: number;
  signature: string;
  folder: string;
  upload_preset: string;
  api_key: string;
  cloud_name: string;
  type: string;
}

/** Signs with the API, then uploads straight to Cloudinary. Returns the public_id the API expects. */
export async function uploadRiderImage(
  kind: "rider-photo" | "delivery-proof",
  file: File,
): Promise<string> {
  const sign = (await apiClient.post<SignedUpload>("/media/sign", { kind }))
    .data;
  const body = new FormData();
  body.set("file", file);
  body.set("api_key", sign.api_key);
  body.set("timestamp", String(sign.timestamp));
  body.set("signature", sign.signature);
  body.set("folder", sign.folder);
  body.set("upload_preset", sign.upload_preset);
  body.set("type", sign.type);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${sign.cloud_name}/image/upload`,
    { method: "POST", body },
  );
  if (!res.ok) throw new Error("UPLOAD_FAILED");
  const json = (await res.json()) as { public_id?: string };
  if (!json.public_id) throw new Error("UPLOAD_FAILED");
  return json.public_id;
}

export function useRiderRegistration() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      cnic: string;
      cityId: number;
      photo: File;
    }) => {
      const photoPublicId = await uploadRiderImage("rider-photo", input.photo);
      return (
        await apiClient.post("/rider/register", {
          name: input.name,
          cnic: input.cnic,
          cityId: input.cityId,
          photoPublicId,
        })
      ).data;
    },
    onSuccess: invalidate,
  });
}
