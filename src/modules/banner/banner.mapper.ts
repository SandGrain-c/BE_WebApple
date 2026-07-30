// src/modules/banner/banner.mapper.ts

import type { BannerDto } from "./banner.dto";

export const mapBannerToDto = (banner: any): BannerDto => {
  return {
    bannerId: banner.banner_id,
    title: banner.title,
    imageUrl: banner.image_url,
    targetUrl: banner.target_url,
    position: banner.position,
    isActive: banner.is_active,
  };
};