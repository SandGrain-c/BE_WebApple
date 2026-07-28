// src/modules/admin-notification/admin-notification.dto.ts

export type AdminNotificationSummaryDto = {
    orders: {
      pendingPayment: number;
      pendingConfirmation: number;
      confirmed: number;
      processing: number;
      shipping: number;
      newOrders: number;
    };
  
    payments: {
      pending: number;
      pendingCOD: number;
      pendingOnlineBanking: number;
      successToday: number;
    };
  
    shipments: {
      pending: number;
      preparing: number;
      shipped: number;
      inTransit: number;
      failed: number;
      needAction: number;
    };
  
    reviews: {
      hidden: number;
    };
  
    totalBadge: number;
  };