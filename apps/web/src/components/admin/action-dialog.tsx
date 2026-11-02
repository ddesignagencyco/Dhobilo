'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * The confirm dialog behind every irreversible admin action: approve, reject, suspend, pay, resolve.
 *
 * When `reason` is set the dialog collects one and will not submit without it. That is not decoration —
 * the API requires a 5–500 character reason on vendor and rider rejections and shows it to the vendor, so
 * validating here saves a round trip and stops "asdf" reaching someone's inbox.
 */
export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  variant = 'default',
  pending,
  reason,
  children,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  variant?: 'default' | 'destructive' | 'success';
  pending?: boolean;
  /** Collect a reason. `minLength` defaults to the API's 5-character floor for vendor-facing reasons. */
  reason?: { label: string; placeholder?: string; minLength?: number; maxLength?: number; required?: boolean };
  children?: ReactNode;
  onConfirm: (reason: string) => void;
}) {
  const t = useTranslations('common');
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);

  // Reset between openings, or the previous rejection's reason would be pre-filled for the next vendor.
  useEffect(() => {
    if (open) {
      setValue('');
      setTouched(false);
    }
  }, [open]);

  const minLength = reason?.minLength ?? 5;
  const required = reason?.required ?? true;
  const trimmed = value.trim();
  const tooShort = !!reason && required && trimmed.length < minLength;
  const showError = touched && tooShort;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {children}

        {reason ? (
          <div className="space-y-2">
            <Label htmlFor="action-reason">
              {reason.label}
              {!required ? <span className="text-muted-foreground font-normal">({t('optional')})</span> : null}
            </Label>
            <Textarea
              id="action-reason"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={reason.placeholder}
              maxLength={reason.maxLength ?? 500}
              rows={3}
              aria-invalid={showError}
              aria-describedby={showError ? 'action-reason-error' : undefined}
            />
            {showError ? (
              <p id="action-reason-error" className="text-destructive text-xs">
                Enter at least {minLength} characters.
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                {trimmed.length}/{reason.maxLength ?? 500}
              </p>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {t('cancel')}
          </Button>
          <Button
            variant={variant}
            disabled={pending || tooShort}
            onClick={() => {
              setTouched(true);
              if (tooShort) return;
              onConfirm(trimmed);
            }}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
