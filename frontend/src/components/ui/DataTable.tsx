/**
 * PracticePerfect DataTable.
 * - Caption-style UPPERCASE column headers
 * - 1px solid --border-soft row rules
 * - tabular-nums for numeric data
 * - {data, meta} envelope — renders meta.total count
 * - th[scope="col"] for accessibility
 * - Empty state when data is empty
 * - No hardcoded hex — all colors via CSS tokens
 */
import React from 'react';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Column<T> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface DataTableProps<T extends object> {
  columns: Column<T>[];
  data: T[];
  meta: PageMeta;
  rowKey: keyof T;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
  loading?: boolean;
}

export function DataTable<T extends object>({
  columns,
  data,
  meta,
  rowKey,
  onPageChange,
  emptyMessage = 'No results found',
  loading = false,
}: DataTableProps<T>) {
  return (
    <div>
      {/* Result count header */}
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-caption)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
          color: 'var(--muted)',
          marginBottom: 'var(--space-sm)',
          padding: 'var(--space-sm) var(--space-md)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-block)',
            fontWeight: 700,
            color: 'var(--ink)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {meta.total.toLocaleString()}
        </span>{' '}
        results
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body)',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  scope="col"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-eyebrow)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 600,
                    color: 'var(--muted)',
                    textAlign: 'left',
                    padding: 'var(--space-xs) var(--space-md)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              // Skeleton rows
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} aria-hidden="true">
                  {columns.map((col) => (
                    <td key={String(col.key)} style={{ padding: 'var(--space-sm) var(--space-md)' }}>
                      <div
                        style={{
                          height: '1rem',
                          background: 'var(--border-soft)',
                          borderRadius: 'var(--radius-xs)',
                          animation: 'pulse 1.5s ease-in-out infinite',
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    textAlign: 'center',
                    padding: 'var(--space-xxl) var(--space-md)',
                    color: 'var(--muted)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-body)',
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={String(row[rowKey])}
                  style={{ borderBottom: '1px solid var(--border-soft)' }}
                >
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      style={{
                        padding: 'var(--space-sm) var(--space-md)',
                        color: 'var(--text-primary)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {col.render
                        ? col.render(row[col.key], row)
                        : String(row[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {meta.totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-md) var(--space-md)',
            borderTop: '1px solid var(--border-soft)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-body)',
            color: 'var(--muted)',
          }}
        >
          <span>
            Page {meta.page} of {meta.totalPages}
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            <button
              onClick={() => onPageChange?.(meta.page - 1)}
              disabled={meta.page <= 1}
              aria-label="Previous page"
              style={{
                background: 'none',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.25rem 0.5rem',
                cursor: meta.page <= 1 ? 'not-allowed' : 'pointer',
                color: 'var(--text-primary)',
              }}
            >
              ‹
            </button>
            <button
              onClick={() => onPageChange?.(meta.page + 1)}
              disabled={meta.page >= meta.totalPages}
              aria-label="Next page"
              style={{
                background: 'none',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-xs)',
                padding: '0.25rem 0.5rem',
                cursor: meta.page >= meta.totalPages ? 'not-allowed' : 'pointer',
                color: 'var(--text-primary)',
              }}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
