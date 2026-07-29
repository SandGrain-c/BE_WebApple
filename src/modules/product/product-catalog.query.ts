import type { Request } from "express";

export const CATALOG_SORTS = [
  "newest",
  "oldest",
  "price_asc",
  "price_desc",
  "name_asc",
  "name_desc",
  "best_selling",
] as const;

export type CatalogSort = (typeof CATALOG_SORTS)[number];

export type ParsedCatalogQuery = {
  categorySlug?: string;
  search?: string;
  color?: string;
  capacity?: string;
  ram?: string;
  minPrice?: number;
  maxPrice?: number;
  sort: CatalogSort;
  page: number;
  limit: number;
};

export class ProductCatalogQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductCatalogQueryError";
  }
}

type ExpressQuery = Request["query"];

function optionalString(
  query: ExpressQuery,
  key: keyof ExpressQuery,
): string | undefined {
  const value = query[key];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ProductCatalogQueryError(
      `Query parameter "${String(key)}" must be a string`,
    );
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalFiniteNumber(
  query: ExpressQuery,
  key: keyof ExpressQuery,
): number | undefined {
  const value = optionalString(query, key);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ProductCatalogQueryError(
      `Query parameter "${String(key)}" must be a finite non-negative number`,
    );
  }

  return parsed;
}

function positiveInteger(
  query: ExpressQuery,
  key: keyof ExpressQuery,
  defaultValue: number,
  maximum?: number,
): number {
  const value = optionalString(query, key);

  if (value === undefined) {
    return defaultValue;
  }

  if (!/^\d+$/.test(value)) {
    throw new ProductCatalogQueryError(
      `Query parameter "${String(key)}" must be a positive integer`,
    );
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    (maximum !== undefined && parsed > maximum)
  ) {
    const range = maximum ? ` from 1 to ${maximum}` : " greater than zero";
    throw new ProductCatalogQueryError(
      `Query parameter "${String(key)}" must be an integer${range}`,
    );
  }

  return parsed;
}

function parseSort(query: ExpressQuery): CatalogSort {
  const value = optionalString(query, "sort");

  if (value === undefined) {
    return "newest";
  }

  const matchedSort = CATALOG_SORTS.find((sort) => sort === value);

  if (!matchedSort) {
    throw new ProductCatalogQueryError(
      `Query parameter "sort" must be one of: ${CATALOG_SORTS.join(", ")}`,
    );
  }

  return matchedSort;
}

export function parseProductCatalogQuery(
  query: ExpressQuery,
): ParsedCatalogQuery {
  const category = optionalString(query, "category");
  const categorySlug = optionalString(query, "categorySlug");

  if (
    category &&
    categorySlug &&
    category.toLowerCase() !== categorySlug.toLowerCase()
  ) {
    throw new ProductCatalogQueryError(
      'Query parameters "category" and "categorySlug" must match',
    );
  }

  const minPrice = optionalFiniteNumber(query, "minPrice");
  const maxPrice = optionalFiniteNumber(query, "maxPrice");

  if (
    minPrice !== undefined &&
    maxPrice !== undefined &&
    minPrice > maxPrice
  ) {
    throw new ProductCatalogQueryError(
      'Query parameter "minPrice" must not exceed "maxPrice"',
    );
  }

  return {
    categorySlug: categorySlug ?? category,
    search: optionalString(query, "search"),
    color: optionalString(query, "color"),
    capacity: optionalString(query, "capacity"),
    ram: optionalString(query, "ram"),
    minPrice,
    maxPrice,
    sort: parseSort(query),
    page: positiveInteger(query, "page", 1),
    limit: positiveInteger(query, "limit", 12, 100),
  };
}
