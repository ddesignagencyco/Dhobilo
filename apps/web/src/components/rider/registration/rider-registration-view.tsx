"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Link, useRouter } from "@/i18n/navigation";
import {
  useCities,
  useRiderApplication,
  useRiderRegistration,
} from "@/lib/rider/hooks";

type Step = "info" | "photo" | "review";
const STEPS: Step[] = ["info", "photo", "review"];

export function RiderRegistrationView() {
  const t = useTranslations("rider.register");
  const home = useTranslations("rider.home");
  const locale = useLocale();
  const router = useRouter();

  const application = useRiderApplication();
  const cities = useCities();
  const register = useRiderRegistration();

  const [step, setStep] = useState<Step>("info");
  const [name, setName] = useState("");
  const [cnic, setCnic] = useState("");
  const [cityId, setCityId] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  if (application.isLoading)
    return <Card className="bg-muted h-48 animate-pulse" />;

  const existing = application.data;
  if (existing && existing.status !== "REJECTED") {
    return (
      <Card className="space-y-3 p-6 text-center">
        <p className="font-medium">{home(`application.${existing.status}`)}</p>
        <Button asChild variant="outline">
          <Link href="/rider/home">{t("toJobs")}</Link>
        </Button>
      </Card>
    );
  }

  const cnicDigits = cnic.replace(/\D/g, "");
  const infoValid =
    name.trim().length >= 2 && cnicDigits.length === 13 && cityId !== "";

  const submit = () => {
    if (!photo) {
      toast.error(t("photosRequired"));
      return;
    }
    register.mutate(
      { name: name.trim(), cnic: cnicDigits, cityId: Number(cityId), photo },
      {
        onSuccess: () => {
          toast.success(t("registrationSubmitted"));
          router.push("/rider/home");
        },
        onError: (e) =>
          toast.error(
            e instanceof Error && e.message === "UPLOAD_FAILED"
              ? t("uploadFailed")
              : e instanceof Error
                ? e.message
                : t("uploadFailed"),
          ),
      },
    );
  };

  return (
    <div className="max-w-2xl space-y-6">
      {existing?.rejectionReason && (
        <p className="text-destructive text-sm">{existing.rejectionReason}</p>
      )}

      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${step === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
            >
              {i + 1}
            </div>
            {i < STEPS.length - 1 && <div className="bg-muted h-1 flex-1" />}
          </div>
        ))}
      </div>

      {step === "info" && (
        <Card className="space-y-4 p-6">
          <h3 className="font-semibold">{t("basicInfo")}</h3>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t("name")}</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("nameHint")}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t("cnic")}</span>
            <Input
              value={cnic}
              onChange={(e) => setCnic(e.target.value)}
              placeholder="12345-1234567-1"
              dir="ltr"
              inputMode="numeric"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">{t("city")}</span>
            <select
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="">{t("selectCity")}</option>
              {(cities.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {locale === "ur" && c.nameUr ? c.nameUr : c.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            className="w-full"
            disabled={!infoValid}
            onClick={() => setStep("photo")}
          >
            {t("next")}
          </Button>
        </Card>
      )}

      {step === "photo" && (
        <Card className="space-y-4 p-6">
          <h3 className="font-semibold">{t("documentVerification")}</h3>
          <label className="block space-y-2">
            <span className="text-sm font-medium">{t("profilePhoto")}</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm"
            />
            {photo && <p className="text-sm text-green-600">✓ {photo.name}</p>}
          </label>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep("info")}
            >
              {t("back")}
            </Button>
            <Button
              className="flex-1"
              disabled={!photo}
              onClick={() => setStep("review")}
            >
              {t("review")}
            </Button>
          </div>
        </Card>
      )}

      {step === "review" && (
        <Card className="space-y-4 p-6">
          <h3 className="font-semibold">{t("reviewInfo")}</h3>
          <div className="space-y-2 text-sm">
            <p>
              <span className="font-medium">{t("name")}:</span> {name}
            </p>
            <p dir="ltr" className="text-start">
              <span className="font-medium">{t("cnic")}:</span> {cnic}
            </p>
            <p className="text-green-600">✓ {t("documentsUploaded")}</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep("photo")}
            >
              {t("back")}
            </Button>
            <Button
              className="flex-1"
              disabled={register.isPending}
              onClick={submit}
            >
              {register.isPending ? t("submitting") : t("completeRegistration")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
