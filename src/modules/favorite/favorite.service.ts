import prisma from "../../utils/prisma";
import {
  FavoriteCheckResponseDto,
  FavoriteListResponseDto,
  FavoriteProductDto,
} from "./favorite.dto";
import { mapFavoriteToDto } from "./favorite.mapper";

export class FavoriteServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Include chuẩn để lấy sản phẩm yêu thích kèm dữ liệu hiển thị.
 */
const favoriteInclude = {
  products: {
    include: {
      categories: {
        select: {
          category_id: true,
          category_name: true,
          slug: true,
        },
      },
      product_variants: {
        orderBy: {
          price: "asc" as const,
        },
        select: {
          variant_id: true,
          price: true,
          old_price: true,
          discount_label: true,
          installment: true,
          stock_quantity: true,
        },
      },
      product_images: {
        where: {
          is_active: true,
        },
        orderBy: [
          {
            is_thumbnail: "desc" as const,
          },
          {
            sort_order: "asc" as const,
          },
          {
            image_id: "asc" as const,
          },
        ],
        select: {
          image_id: true,
          image_url: true,
          is_thumbnail: true,
          sort_order: true,
        },
      },
    },
  },
};

/**
 * Lấy userId từ JWT.
 */
const validateUserId = (userId: number) => {
  if (!userId || Number.isNaN(userId)) {
    throw new FavoriteServiceError("Bạn chưa đăng nhập", 401);
  }
};

/**
 * Kiểm tra productId hợp lệ.
 */
const validateProductId = (productId: number) => {
  if (!productId || Number.isNaN(productId)) {
    throw new FavoriteServiceError("productId không hợp lệ", 400);
  }
};

/**
 * Kiểm tra sản phẩm tồn tại và đang hoạt động.
 */
const ensureProductActive = async (productId: number) => {
  const product = await prisma.products.findUnique({
    where: {
      product_id: productId,
    },
    select: {
      product_id: true,
      is_active: true,
    },
  });

  if (!product) {
    throw new FavoriteServiceError("Không tìm thấy sản phẩm", 404);
  }

  if (!product.is_active) {
    throw new FavoriteServiceError("Sản phẩm hiện không còn hoạt động", 400);
  }

  return product;
};

/**
 * GET /api/favorites
 * Lấy danh sách sản phẩm yêu thích của user hiện tại.
 */
export const getMyFavoritesService = async (
  userId: number
): Promise<FavoriteListResponseDto> => {
  validateUserId(userId);

  const favorites = await prisma.favorite_products.findMany({
    where: {
      user_id: userId,
      products: {
        is_active: true,
      },
    },
    orderBy: {
      created_at: "desc",
    },
    include: favoriteInclude,
  });

  return {
    items: favorites.map(mapFavoriteToDto),
    totalItems: favorites.length,
  };
};

/**
 * POST /api/favorites/:productId
 * Thêm sản phẩm vào yêu thích.
 */
export const addMyFavoriteService = async (
  userId: number,
  productId: number
): Promise<FavoriteProductDto> => {
  validateUserId(userId);
  validateProductId(productId);

  await ensureProductActive(productId);

  const existedFavorite = await prisma.favorite_products.findFirst({
    where: {
      user_id: userId,
      product_id: productId,
    },
    select: {
      favorite_id: true,
    },
  });

  if (existedFavorite) {
    throw new FavoriteServiceError("Sản phẩm đã có trong danh sách yêu thích", 409);
  }

  const createdFavorite = await prisma.favorite_products.create({
    data: {
      user_id: userId,
      product_id: productId,
    },
    include: favoriteInclude,
  });

  return mapFavoriteToDto(createdFavorite);
};

/**
 * DELETE /api/favorites/:productId
 * Bỏ yêu thích sản phẩm.
 */
export const removeMyFavoriteService = async (
  userId: number,
  productId: number
): Promise<FavoriteProductDto> => {
  validateUserId(userId);
  validateProductId(productId);

  const existedFavorite = await prisma.favorite_products.findFirst({
    where: {
      user_id: userId,
      product_id: productId,
    },
    include: favoriteInclude,
  });

  if (!existedFavorite) {
    throw new FavoriteServiceError("Sản phẩm chưa có trong danh sách yêu thích", 404);
  }

  await prisma.favorite_products.delete({
    where: {
      favorite_id: existedFavorite.favorite_id,
    },
  });

  return mapFavoriteToDto(existedFavorite);
};

/**
 * GET /api/favorites/check/:productId
 * Kiểm tra sản phẩm đã được user yêu thích chưa.
 */
export const checkMyFavoriteService = async (
  userId: number,
  productId: number
): Promise<FavoriteCheckResponseDto> => {
  validateUserId(userId);
  validateProductId(productId);

  const favorite = await prisma.favorite_products.findFirst({
    where: {
      user_id: userId,
      product_id: productId,
    },
    select: {
      favorite_id: true,
    },
  });

  return {
    productId,
    isFavorited: !!favorite,
  };
};