// src/modules/product-image/product-image.service.ts

import type { UploadApiResponse } from "cloudinary";
import cloudinary from "../../config/cloudinary";
import { integrationStatus } from "../../config/env";
import prisma from "../../utils/prisma";
import type {
  CreateProductImagePayload,
  UpdateProductImagePayload,
} from "./product-image.dto";
import { mapProductImageToDto } from "./product-image.mapper";
import { CreateManyProductImagesBody } from "./product-image.dto";
export class ProductImageServiceError extends Error {
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

const parseOptionalNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "string" && value.toLowerCase() === "null") {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new ProductImageServiceError("ID không hợp lệ", 400);
  }

  return numberValue;
};

const parseBoolean = (
  value: string | boolean | null | undefined,
  defaultValue: boolean,
) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const lowerValue = value.toLowerCase();

    if (lowerValue === "true") {
      return true;
    }

    if (lowerValue === "false") {
      return false;
    }
  }

  return defaultValue;
};

const parseSortOrder = (value: unknown, defaultValue = 0) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < 0) {
    throw new ProductImageServiceError("sortOrder không hợp lệ", 400);
  }

  return numberValue;
};

const getProductOrThrow = async (productId: number) => {
  const product = await prisma.products.findUnique({
    where: {
      product_id: productId,
    },
  });

  if (!product) {
    throw new ProductImageServiceError("Không tìm thấy sản phẩm", 404);
  }

  return product;
};

const getVariantOrThrow = async (productId: number, variantId: number) => {
  const variant = await prisma.product_variants.findUnique({
    where: {
      variant_id: variantId,
    },
  });

  if (!variant) {
    throw new ProductImageServiceError("Không tìm thấy biến thể sản phẩm", 404);
  }

  if (variant.product_id !== productId) {
    throw new ProductImageServiceError(
      "Biến thể không thuộc sản phẩm này",
      400,
    );
  }

  return variant;
};

const uploadProductImageToCloudinary = (
  file: Express.Multer.File,
  folder: string,
): Promise<UploadApiResponse> => {
  if (integrationStatus.cloudinary !== "configured") {
    throw new ProductImageServiceError(
      `Cloudinary ${integrationStatus.cloudinary}; chức năng upload bị tắt`,
      503,
    );
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
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

const destroyCloudinaryImage = async (publicId?: string | null) => {
  if (!publicId) {
    return;
  }

  if (integrationStatus.cloudinary !== "configured") {
    throw new ProductImageServiceError(
      `Cloudinary ${integrationStatus.cloudinary}; chức năng xóa asset bị tắt`,
      503,
    );
  }

  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
    });
  } catch (error) {
    console.error("Không thể xóa ảnh trên Cloudinary:", error);
  }
};

export const getProductImagesService = async (
  productId: number,
  query: {
    includeInactive?: boolean;
    color?: string;
    variantId?: number | null;
  },
) => {
  await getProductOrThrow(productId);

  const images = await prisma.product_images.findMany({
    where: {
      product_id: productId,
      ...(query.includeInactive ? {} : { is_active: true }),
      ...(query.color
        ? {
            color: {
              equals: query.color,
              mode: "insensitive" as const,
            },
          }
        : {}),
      ...(query.variantId ? { variant_id: query.variantId } : {}),
    },
    orderBy: [
      { is_thumbnail: "desc" as const },
      { sort_order: "asc" as const },
      { image_id: "asc" as const },
    ],
  });

  return images.map(mapProductImageToDto);
};

export const createProductImageService = async (
  productId: number,
  payload: CreateProductImagePayload,
  file?: Express.Multer.File,
) => {
  if (!file) {
    throw new ProductImageServiceError("Vui lòng chọn file ảnh", 400);
  }

  const product = await getProductOrThrow(productId);

  const variantId = parseOptionalNumber(payload.variantId);
  const variant = variantId
    ? await getVariantOrThrow(productId, variantId)
    : null;

  const color = normalizeText(payload.color) ?? normalizeText(variant?.color);

  if (!color) {
    throw new ProductImageServiceError("Vui lòng nhập màu ảnh", 400);
  }

  const isThumbnail = parseBoolean(payload.isThumbnail, false);
  const sortOrder = parseSortOrder(payload.sortOrder, 0);
  const isActive = parseBoolean(payload.isActive, true);

  const uploadResult = await uploadProductImageToCloudinary(
    file,
    `duc-bach-hoa/products/${product.slug}`,
  );

  try {
    const createdImage = await prisma.$transaction(async (tx) => {
      if (isThumbnail && isActive) {
        await tx.product_images.updateMany({
          where: {
            product_id: productId,
            color,
            is_thumbnail: true,
            is_active: true,
          },
          data: {
            is_thumbnail: false,
          },
        });
      }

      return tx.product_images.create({
        data: {
          product_id: productId,
          variant_id: variantId,
          color,
          image_url: uploadResult.secure_url,
          cloudinary_public_id: uploadResult.public_id,
          alt_text: normalizeText(payload.altText),
          is_thumbnail: isThumbnail,
          sort_order: sortOrder,
          is_active: isActive,
        },
      });
    });

    return mapProductImageToDto(createdImage);
  } catch (error) {
    await destroyCloudinaryImage(uploadResult.public_id);
    throw error;
  }
};

export const updateProductImageService = async (
  imageId: number,
  payload: UpdateProductImagePayload,
  file?: Express.Multer.File,
) => {
  const existedImage = await prisma.product_images.findUnique({
    where: {
      image_id: imageId,
    },
  });

  if (!existedImage) {
    throw new ProductImageServiceError("Không tìm thấy ảnh sản phẩm", 404);
  }

  const product = await getProductOrThrow(existedImage.product_id);

  let nextVariantId = existedImage.variant_id;

  if (payload.variantId !== undefined) {
    nextVariantId = parseOptionalNumber(payload.variantId);
  }

  const variant = nextVariantId
    ? await getVariantOrThrow(existedImage.product_id, nextVariantId)
    : null;

  const nextColor =
    payload.color !== undefined
      ? normalizeText(payload.color)
      : existedImage.color;

  const finalColor = nextColor ?? normalizeText(variant?.color);

  if (!finalColor) {
    throw new ProductImageServiceError("Vui lòng nhập màu ảnh", 400);
  }

  const nextIsActive =
    payload.isActive !== undefined
      ? parseBoolean(payload.isActive, existedImage.is_active)
      : existedImage.is_active;

  const nextIsThumbnail =
    payload.isThumbnail !== undefined
      ? parseBoolean(payload.isThumbnail, existedImage.is_thumbnail)
      : existedImage.is_thumbnail;

  const nextSortOrder =
    payload.sortOrder !== undefined
      ? parseSortOrder(payload.sortOrder, existedImage.sort_order)
      : existedImage.sort_order;

  let nextImageUrl = existedImage.image_url;
  let nextCloudinaryPublicId = existedImage.cloudinary_public_id;

  let uploadedNewImage: UploadApiResponse | null = null;

  if (file) {
    uploadedNewImage = await uploadProductImageToCloudinary(
      file,
      `duc-bach-hoa/products/${product.slug}`,
    );

    nextImageUrl = uploadedNewImage.secure_url;
    nextCloudinaryPublicId = uploadedNewImage.public_id;
  }

  try {
    const updatedImage = await prisma.$transaction(async (tx) => {
      if (nextIsThumbnail && nextIsActive) {
        await tx.product_images.updateMany({
          where: {
            product_id: existedImage.product_id,
            color: finalColor,
            is_thumbnail: true,
            is_active: true,
            NOT: {
              image_id: imageId,
            },
          },
          data: {
            is_thumbnail: false,
          },
        });
      }

      return tx.product_images.update({
        where: {
          image_id: imageId,
        },
        data: {
          variant_id: nextVariantId,
          color: finalColor,
          image_url: nextImageUrl,
          cloudinary_public_id: nextCloudinaryPublicId,
          alt_text:
            payload.altText !== undefined
              ? normalizeText(payload.altText)
              : existedImage.alt_text,
          is_thumbnail: nextIsThumbnail,
          sort_order: nextSortOrder,
          is_active: nextIsActive,
        },
      });
    });

    if (uploadedNewImage && existedImage.cloudinary_public_id) {
      await destroyCloudinaryImage(existedImage.cloudinary_public_id);
    }

    return mapProductImageToDto(updatedImage);
  } catch (error) {
    if (uploadedNewImage) {
      await destroyCloudinaryImage(uploadedNewImage.public_id);
    }

    throw error;
  }
};

export const setProductImageThumbnailService = async (imageId: number) => {
  const existedImage = await prisma.product_images.findUnique({
    where: {
      image_id: imageId,
    },
  });

  if (!existedImage) {
    throw new ProductImageServiceError("Không tìm thấy ảnh sản phẩm", 404);
  }

  if (!existedImage.is_active) {
    throw new ProductImageServiceError(
      "Không thể đặt ảnh đã bị ẩn làm thumbnail",
      400,
    );
  }

  const updatedImage = await prisma.$transaction(async (tx) => {
    await tx.product_images.updateMany({
      where: {
        product_id: existedImage.product_id,
        color: existedImage.color,
        is_thumbnail: true,
        is_active: true,
        NOT: {
          image_id: imageId,
        },
      },
      data: {
        is_thumbnail: false,
      },
    });

    return tx.product_images.update({
      where: {
        image_id: imageId,
      },
      data: {
        is_thumbnail: true,
      },
    });
  });

  return mapProductImageToDto(updatedImage);
};

export const deleteProductImageService = async (
  imageId: number,
  options?: {
    destroyCloudinary?: boolean;
  },
) => {
  const existedImage = await prisma.product_images.findUnique({
    where: {
      image_id: imageId,
    },
  });

  if (!existedImage) {
    throw new ProductImageServiceError("Không tìm thấy ảnh sản phẩm", 404);
  }

  if (
    options?.destroyCloudinary &&
    existedImage.cloudinary_public_id &&
    integrationStatus.cloudinary !== "configured"
  ) {
    throw new ProductImageServiceError(
      `Cloudinary ${integrationStatus.cloudinary}; chức năng xóa asset bị tắt`,
      503,
    );
  }

  const deletedImage = await prisma.product_images.update({
    where: {
      image_id: imageId,
    },
    data: {
      is_active: false,
      is_thumbnail: false,
    },
  });

  if (options?.destroyCloudinary) {
    await destroyCloudinaryImage(existedImage.cloudinary_public_id);
  }

  return mapProductImageToDto(deletedImage);
};

/**
 * Upload buffer ảnh lên Cloudinary.
 * Dùng data URI để không cần thêm thư viện streamifier.
 */
const uploadBufferToCloudinary = async (
  file: Express.Multer.File,
  folder: string
) => {
  if (integrationStatus.cloudinary !== "configured") {
    throw new ProductImageServiceError(
      `Cloudinary ${integrationStatus.cloudinary}; chức năng upload bị tắt`,
      503,
    );
  }

  const base64File = file.buffer.toString("base64");
  const dataUri = `data:${file.mimetype};base64,${base64File}`;

  return cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "image",
  });
};

/**
 * Chuyển string form-data sang boolean.
 */
// const parseBoolean = (value: unknown, defaultValue: boolean) => {
//   if (value === undefined || value === null || value === "") {
//     return defaultValue;
//   }

//   return value === "true" || value === true;
// };

/**
 * POST /api/admin/products/:productId/images/bulk
 * Upload nhiều ảnh sản phẩm trong một request.
 */
export const createManyProductImagesService = async (
  productId: number,
  files: Express.Multer.File[],
  body: CreateManyProductImagesBody
) => {
  if (!productId || Number.isNaN(productId)) {
    throw new Error("productId không hợp lệ");
  }

  if (!files || files.length === 0) {
    throw new Error("Vui lòng chọn ít nhất một ảnh");
  }

  const product = await prisma.products.findUnique({
    where: {
      product_id: productId,
    },
    select: {
      product_id: true,
      slug: true,
      name: true,
    },
  });

  if (!product) {
    throw new Error("Không tìm thấy sản phẩm");
  }

  const variantId = body.variantId ? Number(body.variantId) : null;

  if (variantId !== null && Number.isNaN(variantId)) {
    throw new Error("variantId không hợp lệ");
  }

  let variantColor: string | null = null;

  if (variantId !== null) {
    const variant = await prisma.product_variants.findFirst({
      where: {
        variant_id: variantId,
        product_id: productId,
      },
      select: {
        variant_id: true,
        color: true,
      },
    });

    if (!variant) {
      throw new Error("Biến thể không thuộc sản phẩm này");
    }

    variantColor = variant.color;
  }

  const color = body.color?.trim() || variantColor;

  if (!color) {
    throw new Error("Vui lòng nhập màu hoặc chọn variant có màu");
  }

  const thumbnailIndex =
    body.thumbnailIndex !== undefined && body.thumbnailIndex !== ""
      ? Number(body.thumbnailIndex)
      : -1;

  if (thumbnailIndex >= files.length) {
    throw new Error("thumbnailIndex không hợp lệ");
  }

  const sortOrderStart =
    body.sortOrderStart !== undefined && body.sortOrderStart !== ""
      ? Number(body.sortOrderStart)
      : 0;

  if (Number.isNaN(sortOrderStart)) {
    throw new Error("sortOrderStart không hợp lệ");
  }

  const isActive = parseBoolean(body.isActive, true);

  const folder = `duc-bach-hoa/products/${product.slug}`;

  const uploadedResults: Array<{
    secure_url: string;
    public_id: string;
  }> = [];

  try {
    /**
     * Upload lần lượt để dễ kiểm soát lỗi.
     * Nếu một ảnh lỗi, các ảnh đã upload sẽ được xóa ở catch.
     */
    for (const file of files) {
      const uploaded = await uploadBufferToCloudinary(file, folder);

      uploadedResults.push({
        secure_url: uploaded.secure_url,
        public_id: uploaded.public_id,
      });
    }

    const createdImages = await prisma.$transaction(async (tx) => {
      /**
       * Nếu có thumbnailIndex, bỏ thumbnail cũ cùng product + color.
       * DB của bạn đang ràng buộc mỗi product + color chỉ có 1 thumbnail active.
       */
      if (thumbnailIndex >= 0) {
        await tx.product_images.updateMany({
          where: {
            product_id: productId,
            color,
            is_active: true,
            is_thumbnail: true,
          },
          data: {
            is_thumbnail: false,
          },
        });
      }

      const created = [];

      for (let index = 0; index < uploadedResults.length; index += 1) {
        const uploaded = uploadedResults[index];

        const image = await tx.product_images.create({
          data: {
            product_id: productId,
            variant_id: variantId,
            color,
            image_url: uploaded.secure_url,
            cloudinary_public_id: uploaded.public_id,
            alt_text: body.altText?.trim() || `${product.name} ${color}`,
            is_thumbnail: index === thumbnailIndex,
            sort_order: sortOrderStart + index,
            is_active: isActive,
          },
        });

        created.push(image);
      }

      return created;
    });

    return createdImages.map(mapProductImageToDto);
  } catch (error) {
    /**
     * Nếu DB lỗi sau khi đã upload Cloudinary,
     * xóa các ảnh đã upload để tránh rác trên Cloudinary.
     */
    await Promise.all(
      uploadedResults.map((item) =>
        cloudinary.uploader.destroy(item.public_id).catch(() => null)
      )
    );

    throw error;
  }
};
