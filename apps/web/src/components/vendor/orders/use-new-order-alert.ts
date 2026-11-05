"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Plays a short beep and vibrates when an order id appears that was not present on the previous poll.
 * Browsers only allow audio after a user gesture, so sound is opt-in through `enable()` (a button click).
 */
export function useNewOrderAlert(
  newOrderIds: string[] | undefined,
  onNew?: (count: number) => void,
) {
  const seen = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [soundOn, setSoundOn] = useState(false);

  const beep = useCallback(() => {
    const ctx = audio.current;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  }, []);

  const enable = useCallback(() => {
    if (!audio.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor) audio.current = new Ctor();
    }
    void audio.current?.resume();
    setSoundOn(true);
    beep();
  }, [beep]);

  useEffect(() => {
    if (!newOrderIds) return;
    if (seen.current === null) {
      seen.current = new Set(newOrderIds);
      return;
    }
    const fresh = newOrderIds.filter((id) => !seen.current!.has(id));
    newOrderIds.forEach((id) => seen.current!.add(id));
    if (fresh.length === 0) return;
    onNew?.(fresh.length);
    if (soundOn) beep();
    if (typeof navigator !== "undefined" && "vibrate" in navigator)
      navigator.vibrate?.([200, 100, 200]);
  }, [newOrderIds, soundOn, beep, onNew]);

  return { soundOn, enable };
}
