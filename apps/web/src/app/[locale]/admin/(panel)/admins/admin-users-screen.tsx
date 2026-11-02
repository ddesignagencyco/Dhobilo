'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { AdminRole } from '@dhoblio/shared';
import { ActionDialog } from '@/components/admin/action-dialog';
import { ErrorState, TableSkeleton } from '@/components/admin/states';
import { StatusBadge } from '@/components/admin/status-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { bffData } from '@/lib/api/bff';
import type { AdminUser } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { useAdminMutation } from '@/lib/hooks/use-admin-mutation';
import { CreateAdminDialog } from './create-admin-dialog';

const ROLES = [AdminRole.SUPER_ADMIN, AdminRole.OPERATIONS, AdminRole.FINANCE, AdminRole.SUPPORT] as const;

/**
 * Admin accounts and their sub-roles.
 *
 * The API enforces three rules this screen has to respect rather than discover:
 *  - You cannot change your own role or status (CANNOT_CHANGE_SELF), so your own row's controls are off.
 *  - The last active super admin cannot be demoted or deactivated (LAST_SUPER_ADMIN).
 *  - Deactivating an admin revokes all of their sessions immediately.
 */
export function AdminUsersScreen({ myId }: { myId: string }) {
  const t = useTranslations();
  const [creating, setCreating] = useState(false);
  const [deactivating, setDeactivating] = useState<AdminUser | null>(null);

  const admins = useQuery({
    queryKey: ['admin', 'admins'],
    queryFn: () => bffData<AdminUser[]>('/admin/admins'),
  });

  const update = useAdminMutation<unknown, { id: string; body: Record<string, unknown> }>({
    request: ({ id, body }) => ({ path: `/admin/admins/${id}`, options: { method: 'PATCH', body } }),
    successMessage: t('admins.updated'),
    invalidate: [['admin', 'admins']],
    onSuccess: () => setDeactivating(null),
  });

  const rows = admins.data ?? [];
  const activeSupers = rows.filter((a) => a.adminRole === AdminRole.SUPER_ADMIN && a.status === 'ACTIVE').length;

  return (
    <>
      <Alert variant="info" className="mb-4">
        <ShieldCheck />
        <AlertDescription>
          <p>{t('admins.rolesExplainer')}</p>
          <p>{t('admins.selfRule')}</p>
        </AlertDescription>
      </Alert>

      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus />
          {t('admins.add')}
        </Button>
      </div>

      {admins.isError ? <ErrorState error={admins.error} onRetry={() => void admins.refetch()} /> : null}

      <Card className="gap-0 overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('common.name')}</TableHead>
              <TableHead>{t('common.email')}</TableHead>
              <TableHead>{t('admins.role')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('admins.lastLogin')}</TableHead>
              <TableHead className="text-end">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.isLoading ? (
              <TableSkeleton columns={6} />
            ) : (
              rows.map((admin) => {
                const isMe = admin.id === myId;
                // Demoting or deactivating the last active super admin is refused server-side.
                const isLastSuper =
                  admin.adminRole === AdminRole.SUPER_ADMIN && admin.status === 'ACTIVE' && activeSupers <= 1;
                const locked = isMe || isLastSuper;

                return (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">
                      {admin.name ?? '—'}
                      {isMe ? (
                        <Badge variant="outline" className="ms-2">
                          {t('admins.you')}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="break-all" dir="ltr">
                      {admin.email ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={admin.adminRole}
                        disabled={locked || update.isPending}
                        onValueChange={(value) => update.mutate({ id: admin.id, body: { adminRole: value } })}
                      >
                        <SelectTrigger size="sm" className="w-40" aria-label={t('admins.role')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {t(`roles.${role}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={admin.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {admin.lastLoginAt ? formatDateTime(admin.lastLoginAt) : t('admins.never')}
                    </TableCell>
                    <TableCell className="text-end">
                      {admin.status === 'ACTIVE' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={locked}
                          title={isMe ? t('admins.cannotSelf') : isLastSuper ? t('admins.cannotLastSuper') : undefined}
                          onClick={() => setDeactivating(admin)}
                        >
                          {t('admins.deactivate')}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isMe || update.isPending}
                          onClick={() => update.mutate({ id: admin.id, body: { status: 'ACTIVE' } })}
                        >
                          {t('admins.reactivate')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {creating ? <CreateAdminDialog onClose={() => setCreating(false)} /> : null}

      {deactivating ? (
        <ActionDialog
          open
          onOpenChange={(next) => !next && setDeactivating(null)}
          title={t('admins.deactivateTitle')}
          description={t('admins.deactivateBody', { name: deactivating.name ?? deactivating.email ?? '' })}
          confirmLabel={t('admins.deactivate')}
          variant="destructive"
          pending={update.isPending}
          onConfirm={() => update.mutate({ id: deactivating.id, body: { status: 'DEACTIVATED' } })}
        />
      ) : null}
    </>
  );
}
