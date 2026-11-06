'use client';

import { ChevronsRight, Power } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const THUMB = 56;
const PAD = 4;

/**
 * Slide (or tap) to flip online/offline. Drag past the halfway point to commit, otherwise it springs back.
 * Direction follows the page: in RTL the thumb starts on the right and slides left.
 */
export function OnlineSlider({
  online,
  pending,
  onToggle,
  labelOn,
  labelOff,
  className,
}: {
  online: boolean;
  pending: boolean;
  onToggle: () => void;
  labelOn: string;
  labelOff: string;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, moved: 0 });
  const [offset, setOffset] = useState<number | null>(null);
  const [travel, setTravel] = useState(220);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => setTravel(Math.max(0, track.clientWidth - THUMB - PAD * 2));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const directionSign = () => (trackRef.current && getComputedStyle(trackRef.current).direction === 'rtl' ? -1 : 1);

  const buzz = (ms: number) => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pending) return;
    drag.current = { active: true, startX: e.clientX, moved: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    buzz(8);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;
    const base = online ? travel : 0;
    const raw = (e.clientX - drag.current.startX) * directionSign();
    drag.current.moved = Math.max(drag.current.moved, Math.abs(raw));
    setOffset(Math.min(travel, Math.max(0, base + raw)));
  };

  const finish = () => {
    if (!drag.current.active) return;
    const { moved } = drag.current;
    const position = offset ?? (online ? travel : 0);
    drag.current.active = false;
    setOffset(null);
    const tapped = moved < 6;
    const crossed = online ? position < travel / 2 : position > travel / 2;
    if (tapped || crossed) {
      buzz(20);
      onToggle();
    }
  };

  const resting = online ? travel : 0;
  const position = offset ?? resting;
  const progress = travel > 0 ? position / travel : online ? 1 : 0;

  return (
    <div
      ref={trackRef}
      className={cn(
        'relative h-16 select-none overflow-hidden rounded-full border transition-colors duration-300',
        online ? 'border-white/25 bg-white/15 text-white' : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 flex items-center justify-center gap-1 text-sm font-semibold transition-opacity duration-200',
          online ? 'ps-4 pe-16' : 'ps-16 pe-4',
        )}
        style={{ opacity: Math.max(0, 1 - progress * 1.6) }}
      >
        {online ? null : <ChevronsRight className="size-4 animate-pulse rtl:-scale-x-100" />}
        {online ? labelOff : labelOn}
      </span>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center ps-4 pe-16 text-sm font-semibold text-white transition-opacity duration-200"
        style={{ opacity: online ? Math.max(0, progress * 1.4 - 0.4) : 0 }}
      >
        {labelOff}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={online}
        aria-label={online ? labelOff : labelOn}
        disabled={pending}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            buzz(20);
            onToggle();
          }
        }}
        style={{
          width: THUMB,
          height: THUMB,
          top: PAD,
          insetInlineStart: PAD + position,
          transition: offset === null ? 'inset-inline-start 420ms var(--ease-spring), background-color 300ms' : 'none',
          touchAction: 'pan-y',
        }}
        className={cn(
          'absolute flex items-center justify-center rounded-full shadow-md outline-none focus-visible:ring-4',
          online ? 'bg-white text-primary ring-white/40' : 'bg-primary text-primary-foreground ring-ring/40',
          pending && 'animate-pulse',
        )}
      >
        <Power className="size-6" aria-hidden />
      </button>
    </div>
  );
}
