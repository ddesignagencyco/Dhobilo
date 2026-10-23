import { OrderStatus, Role } from '@prisma/client';

/** Who is asking for a transition. Vendor owners and staff are the same kind for lifecycle purposes. */
export type ActorKind = 'CUSTOMER' | 'VENDOR' | 'RIDER' | 'ADMIN' | 'SYSTEM';

export function actorKindOf(role: Role | null | undefined): ActorKind {
  switch (role) {
    case Role.CUSTOMER:
      return 'CUSTOMER';
    case Role.VENDOR_OWNER:
    case Role.VENDOR_STAFF:
      return 'VENDOR';
    case Role.RIDER:
      return 'RIDER';
    case Role.ADMIN:
      return 'ADMIN';
    default:
      return 'SYSTEM';
  }
}

interface Rule {
  /** Who may perform this step. */
  actors: readonly ActorKind[];
  /** A reason must accompany the step (for everyone, or only for these actors). */
  reasonRequired?: true | readonly ActorKind[];
}

const S = OrderStatus;

/**
 * The only way an order changes status (TRD §10). Anything not listed is illegal.
 *
 * Until riders exist (Phase 5) the vendor performs the physical hand-offs ("received" = PICKED_UP, "handed to
 * rider" = OUT_FOR_DELIVERY); riders get the same steps later. Admins can push any step as a support override.
 */
export const TRANSITIONS: Readonly<Partial<Record<OrderStatus, Readonly<Partial<Record<OrderStatus, Rule>>>>>> = {
  [S.PLACED]: {
    [S.ACCEPTED]: { actors: ['VENDOR', 'ADMIN'] },
    [S.REJECTED]: { actors: ['VENDOR', 'SYSTEM', 'ADMIN'], reasonRequired: true },
    // SYSTEM: an online order that was never paid for is cancelled automatically.
    [S.CANCELLED]: { actors: ['CUSTOMER', 'ADMIN', 'SYSTEM'], reasonRequired: ['ADMIN', 'SYSTEM'] },
  },
  [S.ACCEPTED]: {
    // "Customer before pickup": an ACCEPTED order has not been picked up yet, so this is exactly that window.
    [S.CANCELLED]: { actors: ['CUSTOMER', 'ADMIN'], reasonRequired: ['ADMIN'] },
    [S.PICKED_UP]: { actors: ['VENDOR', 'RIDER', 'ADMIN'] },
  },
  [S.PICKED_UP]: { [S.IN_PROCESS]: { actors: ['VENDOR', 'ADMIN'] } },
  [S.IN_PROCESS]: { [S.READY]: { actors: ['VENDOR', 'ADMIN'] } },
  [S.READY]: { [S.OUT_FOR_DELIVERY]: { actors: ['VENDOR', 'RIDER', 'ADMIN'] } },
  [S.OUT_FOR_DELIVERY]: { [S.DELIVERED]: { actors: ['RIDER', 'ADMIN'] } },
};

export const TERMINAL_STATUSES: readonly OrderStatus[] = [S.DELIVERED, S.REJECTED, S.CANCELLED];
export const isTerminal = (status: OrderStatus) => TERMINAL_STATUSES.includes(status);

export type TransitionProblem =
  | { code: 'ORDER_INVALID_TRANSITION'; message: string }
  | { code: 'ORDER_REASON_REQUIRED'; message: string };

/** null = allowed. */
export function checkTransition(from: OrderStatus, to: OrderStatus, actor: ActorKind, reason?: string): TransitionProblem | null {
  const rule = TRANSITIONS[from]?.[to];
  if (!rule) {
    return { code: 'ORDER_INVALID_TRANSITION', message: `An order that is ${from.toLowerCase()} cannot become ${to.toLowerCase()}.` };
  }
  if (!rule.actors.includes(actor)) {
    return { code: 'ORDER_INVALID_TRANSITION', message: `You cannot move an order from ${from.toLowerCase()} to ${to.toLowerCase()}.` };
  }
  const needsReason = rule.reasonRequired === true || (Array.isArray(rule.reasonRequired) && rule.reasonRequired.includes(actor));
  if (needsReason && !reason?.trim()) {
    return { code: 'ORDER_REASON_REQUIRED', message: 'A reason is required for this step.' };
  }
  return null;
}

/** Statuses `actor` may move an order to from `from` (drives buttons in the vendor and admin UIs). */
export function nextStatuses(from: OrderStatus, actor: ActorKind): OrderStatus[] {
  return Object.entries(TRANSITIONS[from] ?? {})
    .filter(([, rule]) => rule!.actors.includes(actor))
    .map(([to]) => to as OrderStatus);
}
