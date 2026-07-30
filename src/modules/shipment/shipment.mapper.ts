// src/modules/shipment/shipment.mapper.ts

import type {
    ShipmentDto,
    ShipmentHistoryDto,
    ShipmentOrderSummaryDto,
  } from "./shipment.dto";
  
  function toNumber(value: any) {
    // Prisma Decimal cần ép về number để FE dùng dễ hơn
    if (value === null || value === undefined) return 0;
    return Number(value);
  }
  
  function toIsoString(value: any) {
    return value?.toISOString?.() ?? String(value);
  }
  
  export function mapShipmentHistoryToDto(history: any): ShipmentHistoryDto {
    return {
      shipmentHistoryId: history.shipment_history_id,
      shipmentId: history.shipment_id,
      status: history.status,
      location: history.location,
      note: history.note,
      updatedAt: toIsoString(history.updated_at),
    };
  }
  
  export function mapShipmentOrderToDto(order: any): ShipmentOrderSummaryDto {
    return {
      orderId: order.order_id,
      orderCode: order.order_code,
      orderStatus: order.order_status,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      shippingAddress: order.shipping_address,
      totalAmount: toNumber(order.total_amount),
      createdAt: toIsoString(order.created_at),
    };
  }
  
  export function mapShipmentToDto(shipment: any): ShipmentDto {
    return {
      shipmentId: shipment.shipment_id,
      orderId: shipment.order_id,
      shippingProvider: shipment.shipping_provider,
      trackingCode: shipment.tracking_code,
      status: shipment.status,
      createdAt: toIsoString(shipment.created_at),
  
      // orders là relation trong Prisma schema
      order: shipment.orders ? mapShipmentOrderToDto(shipment.orders) : undefined,
  
      // shipment_status_history là relation lịch sử vận chuyển
      history: shipment.shipment_status_history
        ? shipment.shipment_status_history.map(mapShipmentHistoryToDto)
        : undefined,
    };
  }