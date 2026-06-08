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
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-label)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
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
      usersApi.list({ page, search: search || undefined, role: roleFilter || undefined, status: statusFilter || undefined }),
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

  const columns: Column<UserResponseDto>[] = [
    {
      key: 'displayName',
      header: 'Name',
      render: (val, row) => (
        <span
          style={{
            color: row.status === 'DELETED' ? 'var(--muted)' : 'var(--ink)',
            textDecoration: row.status === 'DELETED' ? 'line-through' : 'none',
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
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: row.status === 'DELETED' ? 'var(--muted)' : 'var(--ink-2)',
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
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-label)', textTransform: 'uppercase', color: 'var(--muted)' }}>
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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {row.status !== 'DELETED' && (
            <button
              onClick={() => impersonateMutation.mutate(row.id)}
              style={{
                background: 'none',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.25rem 0.5rem',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-label)',
                textTransform: 'uppercase',
                color: 'var(--ink-2)',
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
        padding: '2rem',
        backgroundColor: 'var(--paper)',
        minHeight: '100svh',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '2rem',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-label)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--muted)',
              marginBottom: '0.25rem',
            }}
          >
            Super Admin
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-h1)',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--ink)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Users
          </h1>
          {meta.total > 0 && (
            <div style={{ marginTop: '0.5rem' }}>
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
          gap: '1rem',
          marginBottom: '1.5rem',
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
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--ink)',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.5rem 0.75rem',
            flex: '1 1 200px',
          }}
        />
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          aria-label="Filter by role"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--ink)',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.5rem 0.75rem',
          }}
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
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--ink)',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            padding: '0.5rem 0.75rem',
          }}
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="DELETED">Deleted</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--line)' }}>
        <DataTable<UserResponseDto>
          columns={columns}
          data={users}
          meta={meta}
          rowKey="id"
          onPageChange={setPage}
          loading={isLoading}
        />
      </div>

      {/* Create User Sheet */}
      <Sheet
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create Trainer"
      >
        <form
          onSubmit={handleSubmit(onCreateSubmit)}
          noValidate
          style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
        >
          {createError && (
            <div
              aria-live="polite"
              role="alert"
              style={{
                padding: '0.75rem',
                color: 'var(--danger)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
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
          >
            Create
          </Button>
        </form>
      </Sheet>
    </main>
  );
}
