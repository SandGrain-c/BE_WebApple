import type {
  AdminShipmentListQueryDto,
  CreateShipmentDto,
  ShipmentStatus,
  UpdateShipmentDto,
  UpdateShipmentStatusDto,
} from "./shipment.dto";
import { shipmentValidationError } from "./shipment.error";

const SHIPMENT_STATUSES: readonly ShipmentStatus[] = [
  "Pending",
  "Preparing",
  "Shipped",
  "InTransit",
  "Delivered",
  "Failed",
  "Cancelled",
];

const SHIPMENT_SORTS = [
  "newest",
  "oldest",
  "status_asc",
  "status_desc",
] as const;

const CREATE_FIELDS = new Set([
  "orderId",
  "shippingProvider",
  "trackingCode",
  "location",
  "note",
]);
const UPDATE_FIELDS = new Set(["shippingProvider", "trackingCode"]);
const STATUS_FIELDS = new Set(["status", "location", "note"]);
const LIST_QUERY_FIELDS = new Set([
  "search",
  "status",
  "orderId",
  "page",
  "limit",
  "sort",
]);
const MAX_PAGE_SIZE = 10_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const ensureRecord = (
  value: unknown,
  message: string,
): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw shipmentValidationError(message);
  }

  return value;
};

const ensureAllowedFields = (
  value: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
) => {
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw shipmentValidationError("Dữ liệu vận chuyển chứa trường không hợp lệ");
  }
};

const parsePositiveBodyInteger = (value: unknown, fieldName: string) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw shipmentValidationError(`${fieldName} không hợp lệ`);
  }

  return value;
};

const parsePositiveQueryInteger = (
  value: unknown,
  fieldName: string,
  fallback: number,
  maximum?: number,
) => {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw shipmentValidationError(`${fieldName} không hợp lệ`);
  }

  let parsed = 0;

  for (const digit of value) {
    parsed = parsed * 10 + (digit.charCodeAt(0) - 48);

    if (!Number.isSafeInteger(parsed)) {
      throw shipmentValidationError(`${fieldName} không hợp lệ`);
    }
  }

  if (
    (maximum !== undefined && parsed > maximum)
  ) {
    throw shipmentValidationError(`${fieldName} không hợp lệ`);
  }

  return parsed;
};

const parseOptionalText = (
  value: unknown,
  fieldName: string,
  maximumLength: number,
  options?: { rejectBlank?: boolean },
) => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw shipmentValidationError(`${fieldName} không hợp lệ`);
  }

  const normalized = value.trim();

  if (!normalized) {
    if (options?.rejectBlank) {
      throw shipmentValidationError(`${fieldName} không được để trống`);
    }

    return null;
  }

  if (normalized.length > maximumLength) {
    throw shipmentValidationError(`${fieldName} vượt quá độ dài cho phép`);
  }

  return normalized;
};

const isShipmentStatus = (value: string): value is ShipmentStatus =>
  SHIPMENT_STATUSES.some((status) => status === value);

const isShipmentSort = (
  value: string,
): value is NonNullable<AdminShipmentListQueryDto["sort"]> =>
  SHIPMENT_SORTS.some((sort) => sort === value);

const parseShipmentStatus = (value: unknown) => {
  if (typeof value !== "string" || !isShipmentStatus(value)) {
    throw shipmentValidationError("Trạng thái vận chuyển không hợp lệ");
  }

  return value;
};

export const parsePositiveRouteId = (
  value: unknown,
  fieldName: string,
) => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw shipmentValidationError(`${fieldName} không hợp lệ`);
  }

  let parsed = 0;

  for (const digit of value) {
    parsed = parsed * 10 + (digit.charCodeAt(0) - 48);

    if (!Number.isSafeInteger(parsed)) {
      throw shipmentValidationError(`${fieldName} không hợp lệ`);
    }
  }

  return parsed;
};

export const parseAdminShipmentListQuery = (
  value: unknown,
): AdminShipmentListQueryDto => {
  const query = ensureRecord(value, "Query vận chuyển không hợp lệ");
  ensureAllowedFields(query, LIST_QUERY_FIELDS);

  const page = parsePositiveQueryInteger(query.page, "page", 1);
  const limit = parsePositiveQueryInteger(
    query.limit,
    "limit",
    10,
    MAX_PAGE_SIZE,
  );
  const orderId =
    query.orderId === undefined
      ? undefined
      : parsePositiveQueryInteger(query.orderId, "orderId", 1);

  let status: ShipmentStatus | undefined;
  if (query.status !== undefined) {
    status = parseShipmentStatus(query.status);
  }

  let sort: AdminShipmentListQueryDto["sort"];
  if (query.sort !== undefined) {
    if (
      typeof query.sort !== "string" ||
      !isShipmentSort(query.sort)
    ) {
      throw shipmentValidationError("sort không hợp lệ");
    }

    sort = query.sort;
  }

  let search: string | undefined;
  if (query.search !== undefined) {
    if (typeof query.search !== "string") {
      throw shipmentValidationError("search không hợp lệ");
    }

    search = query.search.trim() || undefined;
  }

  return {
    search,
    status,
    orderId,
    page,
    limit,
    sort,
  };
};

export const parseCreateShipmentBody = (
  value: unknown,
): CreateShipmentDto => {
  const body = ensureRecord(value, "Dữ liệu tạo vận chuyển không hợp lệ");
  ensureAllowedFields(body, CREATE_FIELDS);

  return {
    orderId: parsePositiveBodyInteger(body.orderId, "orderId"),
    shippingProvider: parseOptionalText(
      body.shippingProvider,
      "shippingProvider",
      100,
      { rejectBlank: true },
    ),
    trackingCode: parseOptionalText(
      body.trackingCode,
      "trackingCode",
      100,
      { rejectBlank: true },
    ),
    location: parseOptionalText(body.location, "location", 255),
    note: parseOptionalText(body.note, "note", 500),
  };
};

export const parseUpdateShipmentBody = (
  value: unknown,
): UpdateShipmentDto => {
  const body = ensureRecord(value, "Dữ liệu cập nhật vận chuyển không hợp lệ");
  ensureAllowedFields(body, UPDATE_FIELDS);

  const shippingProvider = parseOptionalText(
      body.shippingProvider,
      "shippingProvider",
      100,
      { rejectBlank: true },
    );
  const trackingCode = parseOptionalText(
      body.trackingCode,
      "trackingCode",
      100,
      { rejectBlank: true },
    );

  if (
    shippingProvider === undefined &&
    trackingCode === undefined
  ) {
    throw shipmentValidationError("Không có dữ liệu cần cập nhật");
  }

  if (shippingProvider === null || trackingCode === null) {
    throw shipmentValidationError(
      "trackingCode và shippingProvider không được để trống",
    );
  }

  return {
    shippingProvider,
    trackingCode,
  };
};

export const parseUpdateShipmentStatusBody = (
  value: unknown,
): UpdateShipmentStatusDto => {
  const body = ensureRecord(
    value,
    "Dữ liệu cập nhật trạng thái không hợp lệ",
  );
  ensureAllowedFields(body, STATUS_FIELDS);

  return {
    status: parseShipmentStatus(body.status),
    location: parseOptionalText(body.location, "location", 255),
    note: parseOptionalText(body.note, "note", 500),
  };
};
