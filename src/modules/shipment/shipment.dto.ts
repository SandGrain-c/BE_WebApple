// src/modules/shipment/shipment.dto.ts

export type ShipmentStatus =
  | "Pending"
  | "Preparing"
  | "Shipped"
  | "InTransit"
  | "Delivered"
  | "Failed"
  | "Cancelled";

export type ShipmentHistoryDto = {
  shipmentHistoryId: number;
  shipmentId: number;
  status: string;
  location: string | null;
  note: string | null;
  updatedAt: string;
};

export type ShipmentOrderSummaryDto = {
  orderId: number;
  orderCode: string;
  orderStatus: string;
  customerName: string | null;
  customerPhone: string | null;
  shippingAddress: string | null;
  totalAmount: number;
  createdAt: string;
};

export type ShipmentDto = {
  shipmentId: number;
  orderId: number;
  shippingProvider: string | null;
  trackingCode: string | null;
  status: string;
  createdAt: string;
  order?: ShipmentOrderSummaryDto;
  history?: ShipmentHistoryDto[];
};

export type AdminShipmentListQueryDto = {
  search?: string;
  status?: ShipmentStatus;
  orderId?: number;
  page?: number;
  limit?: number;
  sort?: "newest" | "oldest" | "status_asc" | "status_desc";
};

export type CreateShipmentDto = {
  orderId: number;
  shippingProvider?: string;
  trackingCode?: string;
  status?: ShipmentStatus;
  location?: string;
  note?: string;
};

export type UpdateShipmentDto = {
  shippingProvider?: string | null;
  trackingCode?: string | null;
};

export type UpdateShipmentStatusDto = {
  status: ShipmentStatus;
  location?: string;
  note?: string;
};