import { OrderStatus } from '@prisma/client';
import { ActorKind, TERMINAL_STATUSES, TRANSITIONS, actorKindOf, checkTransition, isTerminal, nextStatuses } from './order-state-machine';

const ALL = Object.values(OrderStatus);
const ACTORS: ActorKind[] = ['CUSTOMER', 'VENDOR', 'RIDER', 'ADMIN', 'SYSTEM'];

/** The complete, human-readable truth table: every (from, to, actor) the product allows. */
const ALLOWED: [OrderStatus, OrderStatus, ActorKind[]][] = [
  ['PLACED', 'ACCEPTED', ['VENDOR', 'ADMIN']],
  ['PLACED', 'REJECTED', ['VENDOR', 'SYSTEM', 'ADMIN']],
  ['PLACED', 'CANCELLED', ['CUSTOMER', 'ADMIN', 'SYSTEM']],
  ['ACCEPTED', 'CANCELLED', ['CUSTOMER', 'ADMIN']],
  ['ACCEPTED', 'PICKED_UP', ['VENDOR', 'RIDER', 'ADMIN']],
  ['PICKED_UP', 'IN_PROCESS', ['VENDOR', 'ADMIN']],
  ['IN_PROCESS', 'READY', ['VENDOR', 'ADMIN']],
  ['READY', 'OUT_FOR_DELIVERY', ['VENDOR', 'RIDER', 'ADMIN']],
  ['OUT_FOR_DELIVERY', 'DELIVERED', ['RIDER', 'ADMIN']],
];

describe('order state machine', () => {
  it('allows exactly the documented transitions for exactly the documented actors, and nothing else', () => {
    const allowed = new Set(ALLOWED.flatMap(([from, to, actors]) => actors.map((a) => `${from}>${to}>${a}`)));
    for (const from of ALL) {
      for (const to of ALL) {
        for (const actor of ACTORS) {
          // give a reason so only legality is being tested here
          const problem = checkTransition(from, to, actor, 'because');
          const key = `${from}>${to}>${actor}`;
          expect({ key, allowed: problem === null }).toEqual({ key, allowed: allowed.has(key) });
        }
      }
    }
  });

  it('terminal states have no way out for anyone', () => {
    expect(TERMINAL_STATUSES).toEqual(expect.arrayContaining(['DELIVERED', 'REJECTED', 'CANCELLED']));
    for (const from of ALL.filter(isTerminal)) {
      expect(TRANSITIONS[from]).toBeUndefined();
      for (const to of ALL) for (const actor of ACTORS) expect(checkTransition(from, to, actor, 'x')).not.toBeNull();
    }
  });

  it('never allows an order to stay put or go backwards', () => {
    const order: OrderStatus[] = ['PLACED', 'ACCEPTED', 'PICKED_UP', 'IN_PROCESS', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
    for (const status of ALL) for (const actor of ACTORS) expect(checkTransition(status, status, actor, 'x')).not.toBeNull();
    for (let i = 0; i < order.length; i++) {
      for (let j = 0; j < i; j++) for (const actor of ACTORS) expect(checkTransition(order[i], order[j], actor, 'x')).not.toBeNull();
    }
  });

  it('cannot skip a step', () => {
    for (const actor of ACTORS) {
      expect(checkTransition('PLACED', 'READY', actor, 'x')).not.toBeNull();
      expect(checkTransition('ACCEPTED', 'IN_PROCESS', actor, 'x')).not.toBeNull();
      expect(checkTransition('PICKED_UP', 'DELIVERED', actor, 'x')).not.toBeNull();
    }
  });

  it('a customer can only cancel, and only before pickup', () => {
    expect(nextStatuses('PLACED', 'CUSTOMER')).toEqual(['CANCELLED']);
    expect(nextStatuses('ACCEPTED', 'CUSTOMER')).toEqual(['CANCELLED']);
    for (const from of ['PICKED_UP', 'IN_PROCESS', 'READY', 'OUT_FOR_DELIVERY'] as OrderStatus[]) {
      expect(nextStatuses(from, 'CUSTOMER')).toEqual([]);
    }
  });

  it('lists what each actor can do next (drives UI buttons)', () => {
    expect(nextStatuses('PLACED', 'VENDOR').sort()).toEqual(['ACCEPTED', 'REJECTED']);
    expect(nextStatuses('ACCEPTED', 'VENDOR')).toEqual(['PICKED_UP']);
    expect(nextStatuses('READY', 'VENDOR')).toEqual(['OUT_FOR_DELIVERY']);
    expect(nextStatuses('OUT_FOR_DELIVERY', 'VENDOR')).toEqual([]);
    expect(nextStatuses('OUT_FOR_DELIVERY', 'RIDER')).toEqual(['DELIVERED']);
    expect(nextStatuses('DELIVERED', 'ADMIN')).toEqual([]);
  });

  describe('reasons', () => {
    it('rejecting always needs one', () => {
      for (const actor of ['VENDOR', 'SYSTEM', 'ADMIN'] as ActorKind[]) {
        expect(checkTransition('PLACED', 'REJECTED', actor)).toMatchObject({ code: 'ORDER_REASON_REQUIRED' });
        expect(checkTransition('PLACED', 'REJECTED', actor, '   ')).toMatchObject({ code: 'ORDER_REASON_REQUIRED' });
        expect(checkTransition('PLACED', 'REJECTED', actor, 'Too busy')).toBeNull();
      }
    });

    it('cancelling needs one from an admin but not from the customer', () => {
      expect(checkTransition('ACCEPTED', 'CANCELLED', 'ADMIN')).toMatchObject({ code: 'ORDER_REASON_REQUIRED' });
      expect(checkTransition('ACCEPTED', 'CANCELLED', 'ADMIN', 'Customer called')).toBeNull();
      expect(checkTransition('ACCEPTED', 'CANCELLED', 'CUSTOMER')).toBeNull();
      expect(checkTransition('PLACED', 'CANCELLED', 'CUSTOMER')).toBeNull();
    });

    it('illegal steps report illegality before asking for a reason', () => {
      expect(checkTransition('DELIVERED', 'REJECTED', 'VENDOR')).toMatchObject({ code: 'ORDER_INVALID_TRANSITION' });
    });
  });

  it('maps roles to actor kinds', () => {
    expect(actorKindOf('CUSTOMER')).toBe('CUSTOMER');
    expect(actorKindOf('VENDOR_OWNER')).toBe('VENDOR');
    expect(actorKindOf('VENDOR_STAFF')).toBe('VENDOR');
    expect(actorKindOf('RIDER')).toBe('RIDER');
    expect(actorKindOf('ADMIN')).toBe('ADMIN');
    expect(actorKindOf(null)).toBe('SYSTEM');
    expect(actorKindOf(undefined)).toBe('SYSTEM');
  });
});
