import { Flame, type LucideIcon, Shirt, Sparkles, WashingMachine } from 'lucide-react';

/** The service types the discovery API filters on, with the icon each one wears across the app. */
export const SERVICE_TYPES: { value: string; icon: LucideIcon }[] = [
  { value: 'WASH_FOLD', icon: WashingMachine },
  { value: 'WASH_IRON', icon: Shirt },
  { value: 'DRY_CLEAN', icon: Sparkles },
  { value: 'IRON_ONLY', icon: Flame },
];

export function serviceIcon(value: string): LucideIcon {
  return SERVICE_TYPES.find((type) => type.value === value)?.icon ?? Shirt;
}
