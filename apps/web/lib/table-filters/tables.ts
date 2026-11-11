import { ACCOUNT_COLUMNS } from "../admin/table-columns";
import { LOT_COLUMNS } from "../notice-lots-columns";
import { PRICE_BUYER_COLUMNS } from "../price-columns";
import { TED_COLUMNS } from "../ted-columns";
import type { TableColumns } from "./types";

/*
 * The server-rendered tables whose funnels live in the address (useUrlFilters): a page passes only the table's name
 * to its client parts, since a declaration carries patterns and functions that cannot cross to the browser as props.
 */
export interface UrlTable {
  columns: TableColumns;
  /** The route that answers ?optiuni=<column> with the column's facet. */
  endpoint: string;
  /** The page's parameters a new filter drops (its page number). */
  reset: readonly string[];
}

export const URL_TABLES = {
  ted: { columns: TED_COLUMNS, endpoint: "/api/ted-awards", reset: ["p"] },
  loturi: { columns: LOT_COLUMNS, endpoint: "/api/anunturi/loturi", reset: ["p"] },
  conturi: { columns: ACCOUNT_COLUMNS, endpoint: "/api/admin/conturi", reset: ["page", "err"] },
  preturi: { columns: PRICE_BUYER_COLUMNS, endpoint: "/api/preturi/cumparatori", reset: ["pagina", "deschis"] },
} as const satisfies Record<string, UrlTable>;

export type UrlTableName = keyof typeof URL_TABLES;
