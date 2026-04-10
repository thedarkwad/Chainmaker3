type PaginationProps = {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
};

/**
 * Simple previous / next pagination control.
 * Renders nothing when there is only one page.
 */
export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-center gap-2 ${className ?? ""}`}>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="px-2.5 py-0.5 text-xs border border-edge rounded disabled:opacity-30 hover:bg-accent-tint transition-colors"
      >
        Previous
      </button>
      <span className="text-xs text-muted tabular-nums">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="px-2.5 py-0.5 text-xs border border-edge rounded disabled:opacity-30 hover:bg-accent-tint transition-colors"
      >
        Next
      </button>
    </div>
  );
}
