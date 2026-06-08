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

interface DataTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  meta: PageMeta;
  rowKey: keyof T;
  onPageChange?: (page: number) => void;
  emptyMessage?: string;
  loading?: boolean;
}

/**
 * Editorial Athletic DataTable.
 * - Mono UPPERCASE column headers
 * - Hairline row rules
 * - tabular-nums for numeric data
 * - {data, meta} envelope — renders meta.total as tale-of-the-tape stat
 * - th[scope="col"] for accessibility
 * - Empty state when data is empty
 */
export function DataTable<T extends Record<string, unknown>>({
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
      {/* Tale-of-the-tape header count */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-label)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--muted)',
          marginBottom: '0.75rem',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--text-h3)',
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
            fontSize: 'var(--text-sm)',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)' }}>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  scope="col"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-label)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--muted)',
                    textAlign: 'left',
                    padding: '0.5rem 0.75rem',
                    fontWeight: 400,
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
                    <td key={String(col.key)} style={{ padding: '0.75rem' }}>
                      <div
                        style={{
                          height: '1rem',
                          background: 'var(--line)',
                          borderRadius: '2px',
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
                    padding: '3rem 1rem',
                    color: 'var(--muted)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-sm)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={String(row[rowKey])}
                  style={{ borderBottom: '1px solid var(--line)' }}
                >
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      style={{
                        padding: '0.75rem',
                        color: 'var(--ink)',
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
            padding: '1rem 0',
            borderTop: '1px solid var(--line)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--muted)',
          }}
        >
          <span>
            Page {meta.page} of {meta.totalPages}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => onPageChange?.(meta.page - 1)}
              disabled={meta.page <= 1}
              aria-label="Previous page"
              style={{
                background: 'none',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.25rem 0.5rem',
                cursor: meta.page <= 1 ? 'not-allowed' : 'pointer',
                color: 'var(--ink)',
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
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.25rem 0.5rem',
                cursor: meta.page >= meta.totalPages ? 'not-allowed' : 'pointer',
                color: 'var(--ink)',
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
