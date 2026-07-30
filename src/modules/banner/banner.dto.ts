// src/modules/banner/banner.dto.ts

export type BannerDto = {
    bannerId: number;
    title: string | null;
    imageUrl: string | null;
    targetUrl: string | null;
    position: string | null;
    isActive: boolean;
  };
  
  export type CreateBannerPayload = {
    title?: string | null;
    targetUrl?: string | null;
    position?: string | null;
    isActive?: boolean | string | null;
  };
  
  export type UpdateBannerPayload = {
    title?: string | null;
    targetUrl?: string | null;
    position?: string | null;
    isActive?: boolean | string | null;
  };