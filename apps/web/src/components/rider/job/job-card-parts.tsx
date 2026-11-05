import { formatMoney } from "@dhoblio/shared";
import type { DeliveryJob } from "@/lib/rider/hooks";

export function formatWindow(job: DeliveryJob): string {
  const opts: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  };
  const start = new Date(job.scheduledStart).toLocaleString("en-PK", opts);
  const end = new Date(job.scheduledEnd).toLocaleTimeString("en-PK", {
    timeStyle: "short",
  });
  return `${start} – ${end}`;
}

export function JobSummary({
  job,
  pickupLabel,
  dropLabel,
}: {
  job: DeliveryJob;
  pickupLabel: string;
  dropLabel: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{job.order.orderNo}</p>
        <span className="bg-secondary text-secondary-foreground rounded-md px-2 py-0.5 text-xs">
          {job.jobType === "PICKUP" ? pickupLabel : dropLabel}
        </span>
        <span className="text-sm font-medium">{formatMoney(job.riderFee)}</span>
      </div>
      <p className="text-muted-foreground text-sm break-words">
        {job.from.address}
      </p>
      <p className="text-muted-foreground text-sm break-words">
        → {job.to.address}
      </p>
      <p className="text-muted-foreground text-xs">{formatWindow(job)}</p>
    </div>
  );
}
