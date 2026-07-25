import { Fragment } from "react";

export type Column<T> = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => React.ReactNode;
};

export default function DataTable<T extends { [key: string]: unknown }>({
  columns,
  rows,
  keyField,
  emptyLabel = "Keine Daten vorhanden.",
  onRowClick,
  renderExpanded,
  isRowExpanded,
}: {
  columns: Column<T>[];
  rows: T[];
  keyField: keyof T;
  emptyLabel?: string;
  onRowClick?: (row: T) => void;
  renderExpanded?: (row: T) => React.ReactNode;
  isRowExpanded?: (row: T) => boolean;
}) {
  if (!rows.length) {
    return <p className="text-text-muted text-sm py-4">{emptyLabel}</p>;
  }

  const alignClass = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-border-accent">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 text-[0.72rem] font-semibold uppercase tracking-wider text-text-muted ${alignClass(col.align)}`}
              >
                {col.label}
              </th>
            ))}
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
                    <td key={col.key} className={`px-3 py-2.5 ${alignClass(col.align)}`}>
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
