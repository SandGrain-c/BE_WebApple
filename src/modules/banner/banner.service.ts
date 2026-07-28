// src/modules/banner/banner.service.ts

import { UploadApiResponse } from "cloudinary";
import cloudinary from "../../config/cloudinary";
import prisma from "../../utils/prisma";
import type {
  CreateBannerPayload,
  UpdateBannerPayload,
} from "./banner.dto";
import { mapBannerToDto } from "./banner.mapper";

export class BannerServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

const parseBoolean = (
  value: boolean | string | null | undefined,
  defaultValue: boolean,
) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    if (value.toLowerCase() === "true") {
      return true;
    }

    if (value.toLowerCase() === "false") {
      return false;
    }
  }

  return defaultValue;
};

const uploadBannerToCloudinary = (
  file: Express.Multer.File,
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "duc-bach-hoa/banners",
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result) {
          return reject(error);
        }

        return resolve(result);
      },
    );

    uploadStream.end(file.buffer);
  });
};

export const getPublicBannersService = async (position?: string) => {
  const where = {
    is_active: true,
    ...(position
      ? {
          position: {
            equals: position,
            mode: "insensitive" as const,
          },
        }
      : {}),
  };

  const banners = await prisma.banners.findMany({
    where,
    orderBy: {
      banner_id: "asc",
    },
  });

  return banners.map(mapBannerToDto);
};

export const getAdminBannersService = async (query: {
  position?: string;
  isActive?: string;
}) => {
  const where = {
    ...(query.position
      ? {
          position: {
            equals: query.position,
            mode: "insensitive" as const,
          },
        }
      : {}),
    ...(query.isActive === "true"
      ? {
          is_active: true,
        }
      : {}),
    ...(query.isActive === "false"
      ? {
          is_active: false,
        }
      : {}),
  };

  const banners = await prisma.banners.findMany({
    where,
    orderBy: {
      banner_id: "asc",
    },
  });

  return banners.map(mapBannerToDto);
};

export const createBannerService = async (
  payload: CreateBannerPayload,
  file?: Express.Multer.File,
) => {
  if (!file) {
    throw new BannerServiceError("Vui lòng chọn ảnh banner", 400);
  }

  const uploadResult = await uploadBannerToCloudinary(file);

  const banner = await prisma.banners.create({
    data: {
      title: normalizeText(payload.title),
      image_url: uploadResult.secure_url,
      target_url: normalizeText(payload.targetUrl),
      position: normalizeText(payload.position),
      is_active: parseBoolean(payload.isActive, true),
    },
  });

  return mapBannerToDto(banner);
};

export const updateBannerService = async (
  bannerId: number,
  payload: UpdateBannerPayload,
  file?: Express.Multer.File,
) => {
  const existedBanner = await prisma.banners.findUnique({
    where: {
      banner_id: bannerId,
    },
  });

  if (!existedBanner) {
    throw new BannerServiceError("Không tìm thấy banner", 404);
  }

  let imageUrl = existedBanner.image_url;

  if (file) {
    const uploadResult = await uploadBannerToCloudinary(file);
    imageUrl = uploadResult.secure_url;
  }

  const banner = await prisma.banners.update({
    where: {
      banner_id: bannerId,
    },
    data: {
      title:
        payload.title !== undefined
          ? normalizeText(payload.title)
          : existedBanner.title,

      target_url:
        payload.targetUrl !== undefined
          ? normalizeText(payload.targetUrl)
          : existedBanner.target_url,

      position:
        payload.position !== undefined
          ? normalizeText(payload.position)
          : existedBanner.position,

      is_active:
        payload.isActive !== undefined
          ? parseBoolean(payload.isActive, existedBanner.is_active)
          : existedBanner.is_active,

      image_url: imageUrl,
    },
  });

  return mapBannerToDto(banner);
};

export const deleteBannerService = async (bannerId: number) => {
  const existedBanner = await prisma.banners.findUnique({
    where: {
      banner_id: bannerId,
    },
  });

  if (!existedBanner) {
    throw new BannerServiceError("Không tìm thấy banner", 404);
  }

  const banner = await prisma.banners.update({
    where: {
      banner_id: bannerId,
    },
    data: {
      is_active: false,
    },
  });

  return mapBannerToDto(banner);
};