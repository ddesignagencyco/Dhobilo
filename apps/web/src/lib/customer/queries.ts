export const discoveryQueryKeys = {
  all: ['discovery'] as const,
  lists: () => [...discoveryQueryKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...discoveryQueryKeys.lists(), filters] as const,
  details: () => [...discoveryQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...discoveryQueryKeys.details(), id] as const,
};

export const cartQueryKeys = {
  all: ['cart'] as const,
};

export const checkoutQueryKeys = {
  all: ['checkout'] as const,
  draft: () => [...checkoutQueryKeys.all, 'draft'] as const,
};

export const orderQueryKeys = {
  all: ['orders'] as const,
  lists: () => [...orderQueryKeys.all, 'list'] as const,
  list: () => [...orderQueryKeys.lists()] as const,
  details: () => [...orderQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderQueryKeys.details(), id] as const,
};
