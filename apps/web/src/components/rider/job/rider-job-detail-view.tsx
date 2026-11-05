"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  type JobParty,
  uploadRiderImage,
  useRiderJob,
  useRiderJobAction,
  useRiderJobComplete,
  useRiderJobFail,
} from "@/lib/rider/hooks";
import { JobSummary } from "./job-card-parts";

function mapsUrl(party: JobParty): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${party.lat},${party.lng}`;
}

function PartyCard({
  title,
  party,
  mapsLabel,
}: {
  title: string;
  party: JobParty;
  mapsLabel: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-muted-foreground text-sm">{title}</p>
      <p className="font-medium">{party.name}</p>
      <p className="text-sm break-words">{party.address}</p>
      <p className="text-muted-foreground text-sm" dir="ltr">
        {party.phone}
      </p>
      <Button asChild size="sm" variant="outline" className="mt-2 w-full">
        <a href={mapsUrl(party)} target="_blank" rel="noreferrer">
          {mapsLabel}
        </a>
      </Button>
    </div>
  );
}

export function RiderJobDetailView({ jobId }: { jobId: string }) {
  const t = useTranslations("rider.job");
  const home = useTranslations("rider.home");
  const { data: job, isLoading } = useRiderJob(jobId);
  const action = useRiderJobAction();
  const complete = useRiderJobComplete();
  const fail = useRiderJobFail();

  const [proofType, setProofType] = useState<"PHOTO" | "OTP">("OTP");
  const [otp, setOtp] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [failReason, setFailReason] = useState("");
  const [showFail, setShowFail] = useState(false);

  if (isLoading) return <Card className="bg-muted h-96 animate-pulse" />;
  if (!job) {
    return (
      <Card className="p-6">
        <p>{t("notFound")}</p>
      </Card>
    );
  }

  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : t("failed"));
  const busy =
    action.isPending || complete.isPending || fail.isPending || uploading;
  const types = job.proof.types;
  const activeProof = types.includes(proofType)
    ? proofType
    : (types[0] ?? "OTP");

  const handleComplete = async () => {
    try {
      if (!job.proof.required) {
        await complete.mutateAsync({ jobId });
      } else if (activeProof === "OTP") {
        await complete.mutateAsync({ jobId, otp });
      } else if (photo) {
        setUploading(true);
        const proofPhotoPublicId = await uploadRiderImage(
          "delivery-proof",
          photo,
        );
        setUploading(false);
        await complete.mutateAsync({ jobId, proofPhotoPublicId });
      }
      toast.success(t("jobCompleted"));
    } catch (e) {
      setUploading(false);
      onError(e);
    }
  };

  const canComplete =
    !job.proof.required ||
    (activeProof === "OTP" ? /^\d{4}$/.test(otp) : !!photo);
  const target = job.status === "IN_TRANSIT" ? job.to : job.from;

  return (
    <div className="space-y-6">
      <Card className="space-y-3 p-6">
        <JobSummary
          job={job}
          pickupLabel={home("pickup")}
          dropLabel={home("drop")}
        />
        <Badge variant="outline">{t(`jobStatus.${job.status}`)}</Badge>
        {job.failureReason && (
          <p className="text-destructive text-sm">{job.failureReason}</p>
        )}
      </Card>

      <Card className="space-y-4 p-6">
        <h3 className="font-semibold">{t("addresses")}</h3>
        <PartyCard
          title={t("pickupAddress")}
          party={job.from}
          mapsLabel={t("openMaps")}
        />
        <div className="bg-border h-px" />
        <PartyCard
          title={t("dropAddress")}
          party={job.to}
          mapsLabel={t("openMaps")}
        />
      </Card>

      {(job.status === "UNASSIGNED" || job.status === "ASSIGNED") && (
        <Card className="space-y-3 p-6">
          <Button
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() =>
              action.mutate(
                {
                  jobId,
                  action: job.status === "ASSIGNED" ? "accept" : "claim",
                },
                { onError },
              )
            }
          >
            {home("acceptJob")}
          </Button>
          {job.status === "ASSIGNED" && (
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() =>
                action.mutate({ jobId, action: "decline" }, { onError })
              }
            >
              {home("decline")}
            </Button>
          )}
        </Card>
      )}

      {job.status === "ACCEPTED" && (
        <Card className="space-y-3 p-6">
          <p className="text-muted-foreground text-sm break-words">
            {target.address}
          </p>
          <Button
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() =>
              action.mutate({ jobId, action: "start" }, { onError })
            }
          >
            {action.isPending ? t("updating") : t("markInTransit")}
          </Button>
        </Card>
      )}

      {job.status === "IN_TRANSIT" && (
        <Card className="space-y-4 p-6">
          {job.proof.required && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{t("proofType")}</p>
              {types.length > 1 && (
                <div className="flex gap-2">
                  {types.map((type) => (
                    <Button
                      key={type}
                      variant={activeProof === type ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setProofType(type)}
                    >
                      {type === "PHOTO" ? t("photo") : t("otp")}
                    </Button>
                  ))}
                </div>
              )}
              {activeProof === "OTP" ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium">{t("enterOtp")}</span>
                  <Input
                    inputMode="numeric"
                    maxLength={4}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    className="text-center font-mono text-2xl tracking-widest"
                    placeholder="0000"
                    dir="ltr"
                  />
                </label>
              ) : (
                <label className="block space-y-2">
                  <span className="text-sm font-medium">{t("takePhoto")}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm"
                  />
                </label>
              )}
            </div>
          )}

          <Button
            size="lg"
            className="w-full"
            disabled={busy || !canComplete}
            onClick={() => void handleComplete()}
          >
            {busy ? t("submitting") : t("markCompleted")}
          </Button>

          {!showFail ? (
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setShowFail(true)}
            >
              {t("reportProblem")}
            </Button>
          ) : (
            <div className="space-y-2">
              <Input
                value={failReason}
                onChange={(e) => setFailReason(e.target.value)}
                placeholder={t("failReason")}
              />
              <Button
                variant="destructive"
                className="w-full"
                disabled={busy || failReason.trim().length < 3}
                onClick={() =>
                  fail.mutate({ jobId, reason: failReason.trim() }, { onError })
                }
              >
                {t("markFailed")}
              </Button>
            </div>
          )}
        </Card>
      )}

      {job.status === "COMPLETED" && (
        <p className="py-4 text-center text-lg font-semibold text-green-600">
          ✓ {t("jobCompleted")}
        </p>
      )}
    </div>
  );
}
