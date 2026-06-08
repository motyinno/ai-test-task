/**
 * PracticePerfect Users admin page.
 * SA chrome only — uses ink/paper/border-soft palette (no brand accent).
 * Updated to PracticePerfect design tokens.
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, type UserResponseDto, type CreateTrainerDto } from '@/api/endpoints/users';
import { impersonationApi } from '@/api/endpoints/impersonation';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';
import { StatNumber } from '@/components/ui/StatNumber';
import { ApiError } from '@/api/errors';
import { ME_QUERY_KEY } from '@/providers/auth-provider';
import { useForm } from 'react-hook-form';

const USERS_QUERY_KEY = ['users'] as const;

interface CreateFormValues {
  businessName: string;
  trainerName: string;
  email: string;
  phone?: string;
}

function StatusChip({ status }: { status: UserResponseDto['status'] }) {
  const colors: Record<string, string> = {
    ACTIVE: 'var(--success)',
    INACTIVE: 'var(--warning)',
    DELETED: 'var(--muted)',
  };
  return (
    <span
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-eyebrow)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight: 600,
        color: colors[status] ?? 'var(--muted)',
      }}
    >
      {status}
    </span>
  );
}

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: [...USERS_QUERY_KEY, { page, search, roleFilter, statusFilter }],
    queryFn: () =>
      usersApi.list({
        page,
        search: search || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
      }),
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreateTrainerDto) => usersApi.create(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_QUERY_KEY });
      setIsCreateOpen(false);
      setCreateError(null);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setCreateError(err.message);
      }
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: (userId: string) => impersonationApi.start(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ME_QUERY_KEY });
    },
  });

  const { register, handleSubmit, formState: { errors }, reset } = useForm<CreateFormValues>();

  const onCreateSubmit = (values: CreateFormValues) => {
    setCreateError(null);
    createMutation.mutate({
      businessName: values.businessName,
      trainerName: values.trainerName,
      email: values.email,
      phone: values.phone,
      onboardingMode: 'INVITE_LINK',
    });
  };

  const selectStyle: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize: 'var(--text-body)',
    color: 'var(--text-primary)',
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border-soft)',
    borderRadius: 'var(--radius-sm)',
    padding: '0 10px',
    height: '40px',
    outline: 'none',
  };

  const columns: Column<UserResponseDto>[] = [
    {
      key: 'displayName',
      header: 'Name',
      render: (val, row) => (
        <span
          style={{
            color: row.status === 'DELETED' ? 'var(--muted)' : 'var(--ink)',
            textDecoration: row.status === 'DELETED' ? 'line-through' : 'none',
            fontWeight: 500,
          }}
        >
          {String(val)}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (val, row) => (
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body)',
            color: row.status === 'DELETED' ? 'var(--muted)' : 'var(--text-secondary)',
          }}
        >
          {String(val)}
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (val) => (
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-eyebrow)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 600,
            color: 'var(--muted)',
          }}
        >
          {String(val)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (val) => <StatusChip status={val as UserResponseDto['status']} />,
    },
    {
      key: 'id',
      header: 'Actions',
      render: (_val, row) => (
        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          {row.status !== 'DELETED' && (
            <button
              onClick={() => impersonateMutation.mutate(row.id)}
              style={{
                background: 'none',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.25rem 0.5rem',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-eyebrow)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-secondary)',
              }}
            >
              Impersonate
            </button>
          )}
        </div>
      ),
    },
  ];

  const users = data?.data ?? [];
  const meta = data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0 };

  return (
    <main
      role="main"
      data-sa-chrome="true"
      style={{
        padding: 'var(--space-xl)',
        backgroundColor: 'var(--bg)',
        minHeight: '100svh',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 'var(--space-xl)',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-eyebrow)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              fontWeight: 600,
              color: 'var(--muted)',
              marginBottom: 'var(--space-xxs)',
            }}
          >
            Super Admin
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-hero)',
              fontWeight: 700,
              color: 'var(--ink)',
              margin: 0,
              lineHeight: '38px',
            }}
          >
            Users
          </h1>
          {meta.total > 0 && (
            <div style={{ marginTop: 'var(--space-sm)' }}>
              <StatNumber value={meta.total} label="Total Users" />
            </div>
          )}
        </div>

        <Button onClick={() => { setIsCreateOpen(true); setCreateError(null); reset(); }}>
          Create Trainer
        </Button>
      </div>

      {/* Search + filters */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-md)',
          marginBottom: 'var(--space-lg)',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="search"
          placeholder="Search name or email…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          aria-label="Search users"
          style={{
            ...selectStyle,
            flex: '1 1 200px',
          }}
        />
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          aria-label="Filter by role"
          style={selectStyle}
        >
          <option value="">All Roles</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="TRAINER">Trainer</option>
          <option value="COACH">Coach</option>
          <option value="PLAYER">Player</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          aria-label="Filter by status"
          style={selectStyle}
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="DELETED">Deleted</option>
        </select>
      </div>

      {/* Table */}
      <div
        style={{
          backgroundColor: 'var(--surface)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-card-soft)',
          border: '1px solid var(--border-soft)',
          overflow: 'hidden',
        }}
      >
        <DataTable<UserResponseDto>
          columns={columns}
          data={users}
          meta={meta}
          rowKey="id"
          onPageChange={setPage}
          loading={isLoading}
        />
      </div>

      {/* Create Trainer Sheet */}
      <Sheet
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create Trainer"
      >
        <form
          onSubmit={handleSubmit(onCreateSubmit)}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}
        >
          {createError && (
            <div
              aria-live="polite"
              role="alert"
              style={{
                padding: 'var(--space-sm) var(--space-md)',
                color: 'var(--danger)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-body)',
                backgroundColor: 'rgba(196,43,43,0.06)',
              }}
            >
              {createError}
            </div>
          )}
          <Input
            id="businessName"
            label="Business Name"
            error={errors.businessName?.message}
            {...register('businessName', { required: 'Business name is required' })}
          />
          <Input
            id="trainerName"
            label="Trainer Name"
            error={errors.trainerName?.message}
            {...register('trainerName', { required: 'Trainer name is required' })}
          />
          <Input
            id="createEmail"
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register('email', {
              required: 'Email is required',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid email' },
            })}
          />
          <Input
            id="phone"
            label="Phone (optional)"
            type="tel"
            {...register('phone')}
          />
          <Button
            type="submit"
            loading={createMutation.isPending}
            style={{ width: '100%' }}
          >
            Create
          </Button>
        </form>
      </Sheet>
    </main>
  );
}
