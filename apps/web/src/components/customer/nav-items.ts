import { Home, ReceiptText, UserRound } from 'lucide-react';

export const CUSTOMER_NAV = [
  { href: '/', label: 'home', icon: Home },
  { href: '/orders', label: 'orders', icon: ReceiptText },
  { href: '/profile', label: 'profile', icon: UserRound },
] as const;

export function isNavActive(pathname: string, href: string): boolean {
  return href === '/'
    ? pathname === '/' || pathname.startsWith('/discovery') || pathname.startsWith('/vendor')
    : pathname.startsWith(href);
}
