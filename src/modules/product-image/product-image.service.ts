// src/modules/product-image/product-image.service.ts

import cloudinary from "../../config/cloudinary";
import prisma from "../../utils/prisma";

type CreateProductImageInput = {
  productId: number;
  variantId?: number | null;
  color: string;
  altText?: string;
  isThumbnail?: boolean;
  sortOrder?: number;
  fileBuffer: Buffer;
};

const uploadBufferToCloudinary = (
  fileBuffer: Buffer,
  folder: string
): Promise<{
  secure_url: string;
  public_id: string;
}> => {
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

        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    uploadStream.end(fileBuffer);
  });
};

export const createProductImageService = async (
  input: CreateProductImageInput
) => {
  const {
    productId,
    variantId,
    color,
    altText,
    isThumbnail = false,
    sortOrder = 0,
    fileBuffer,
  } = input;

  const product = await prisma.products.findUnique({
    where: {
      product_id: productId,
    },
  });

  if (!product) {
    throw new Error("Product not found");
  }

  if (variantId) {
    const variant = await prisma.product_variants.findUnique({
      where: {
        variant_id: variantId,
      },
    });

    if (!variant) {
      throw new Error("Product variant not found");
    }

    if (variant.product_id !== productId) {
      throw new Error("Variant does not belong to this product");
    }
  }

  const folder = `duc-bach-hoa/products/${product.slug}`;

  const uploadedImage = await uploadBufferToCloudinary(fileBuffer, folder);

  const productImage = await prisma.product_images.create({
    data: {
      product_id: productId,
      variant_id: variantId || null,
      color,
      image_url: uploadedImage.secure_url,
      alt_text: altText,
      is_thumbnail: isThumbnail,
      sort_order: sortOrder,
      is_active: true,
    },
  });

  return {
    imageId: productImage.image_id,
    productId: productImage.product_id,
    variantId: productImage.variant_id,
    color: productImage.color,
    imageUrl: productImage.image_url,
    altText: productImage.alt_text,
    isThumbnail: productImage.is_thumbnail,
    sortOrder: productImage.sort_order,
    isActive: productImage.is_active,
    createdAt: productImage.created_at,
    cloudinaryPublicId: uploadedImage.public_id,
  };
};