import { Fragment } from "react";
import { ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";

export type Column<T> = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => React.ReactNode;
  hideOnMobile?: boolean;
  /** Tailwind width class(es) for the <col>, e.g. "w-16" or "w-16 md:w-24". Omit to let the column fill remaining space. */
  width?: string;
  /** Macht den Spaltenkopf klickbar (siehe sortKey/sortDir/onSort auf DataTable). */
  sortable?: boolean;
};

export default function DataTable<T extends { [key: string]: unknown }>({
  columns,
  rows,
  keyField,
  emptyLabel = "Keine Daten vorhanden.",
  onRowClick,
  renderExpanded,
  isRowExpanded,
  sortKey,
  sortDir,
  onSort,
}: {
  columns: Column<T>[];
  rows: T[];
  keyField: keyof T;
  emptyLabel?: string;
  onRowClick?: (row: T) => void;
  renderExpanded?: (row: T) => React.ReactNode;
  isRowExpanded?: (row: T) => boolean;
  /** Aktuell aktive Sortier-Spalte (key eines sortable-Columns). */
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
}) {
  if (!rows.length) {
    return <p className="text-text-muted text-sm py-4">{emptyLabel}</p>;
  }

  const alignClass = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
      <table className="w-full table-fixed border-collapse text-xs md:text-sm">
        <colgroup>
          {columns.map((col) => (
            <col
              key={col.key}
              className={`${col.hideOnMobile ? "hidden md:table-column" : ""} ${col.width ?? ""}`}
            />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b-2 border-border-accent">
            {columns.map((col) => {
              const isSortable = col.sortable && onSort;
              const isActive = isSortable && sortKey === col.key;
              return (
                <th
                  key={col.key}
                  onClick={isSortable ? () => onSort(col.key) : undefined}
                  className={`px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-wider text-text-muted ${alignClass(col.align)} ${col.hideOnMobile ? "hidden md:table-cell" : ""} ${isSortable ? "cursor-pointer select-none hover:text-text-primary transition-colors" : ""} ${isActive ? "text-text-primary" : ""}`}
                >
                  {isSortable ? (
                    <span className={`inline-flex items-center gap-0.5 ${col.align === "right" ? "flex-row-reverse" : ""}`}>
                      {col.label}
                      {isActive ? (
                        sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                      ) : (
                        <ArrowUpDown size={11} className="text-text-disabled" />
                      )}
                    </span>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const expanded = isRowExpanded?.(row) ?? false;
            return (
              <Fragment key={String(row[keyField])}>
                <tr
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-border transition-colors ${onRowClick ? "cursor-pointer hover:bg-bg-hover" : "hover:bg-bg-hover"} ${expanded ? "bg-bg-hover" : ""}`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-3 py-2.5 ${alignClass(col.align)} ${col.hideOnMobile ? "hidden md:table-cell" : ""}`}>
                      {col.render ? col.render(row) : String(row[col.key] ?? "–")}
                    </td>
                  ))}
                </tr>
                {expanded && renderExpanded && (
                  <tr className="border-b border-border">
                    <td colSpan={columns.length} className="px-3 py-0">
                      {renderExpanded(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
