//  src/modules/admin-product/admin-product.service.ts
import prisma from "../../utils/prisma";
import {
  AdminProductDto,
  AdminProductListResponseDto,
  CreateAdminProductBody,
  GetAdminProductsQuery,
  UpdateAdminProductBody,
} from "./admin-product.dto";
import { mapAdminProductToDto } from "./admin-product.mapper";

export class AdminProductServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Chuẩn hóa text: bỏ khoảng trắng thừa.
 */
const normalizeText = (value?: string | null) => {
  const text = value?.trim();
  return text ? text : null;
};

/**
 * Tạo slug đơn giản từ tên sản phẩm.
 * Slug là chuỗi dùng trên URL, ví dụ: iphone-15-pro-max.
 */
const createSlugFromName = (name: string) => {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

/**
 * Đảm bảo slug không bị trùng trong bảng products.
 */
const buildUniqueProductSlug = async (slugBase: string, productId?: number) => {
  let slug = slugBase;
  let counter = 1;

  while (true) {
    const existedProduct = await prisma.products.findFirst({
      where: {
        slug,
        ...(productId
          ? {
              NOT: {
                product_id: productId,
              },
            }
          : {}),
      },
      select: {
        product_id: true,
      },
    });

    if (!existedProduct) {
      return slug;
    }

    counter += 1;
    slug = `${slugBase}-${counter}`;
  }
};

/**
 * Kiểm tra category có tồn tại không.
 */
const ensureCategoryExists = async (categoryId: number) => {
  const category = await prisma.categories.findUnique({
    where: {
      category_id: categoryId,
    },
    select: {
      category_id: true,
      is_active: true,
    },
  });

  if (!category) {
    throw new AdminProductServiceError("Không tìm thấy danh mục", 404);
  }

  return category;
};

/**
 * GET /api/admin/products
 * Lấy danh sách sản phẩm cho Admin.
 */
export const getAdminProductsService = async (
  query: GetAdminProductsQuery
): Promise<AdminProductListResponseDto> => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const search = normalizeText(query.search);
  const categoryId = query.categoryId ? Number(query.categoryId) : undefined;
  const categorySlug = normalizeText(query.categorySlug);

  const where: any = {};

  if (search) {
    where.OR = [
      {
        name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        slug: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  if (categoryId) {
    where.category_id = categoryId;
  }

  if (categorySlug) {
    where.categories = {
      slug: categorySlug,
    };
  }

  if (query.isActive === "true") {
    where.is_active = true;
  }

  if (query.isActive === "false") {
    where.is_active = false;
  }

  let orderBy: any = {
    created_at: "desc",
  };

  switch (query.sort) {
    case "oldest":
      orderBy = { created_at: "asc" };
      break;
    case "name_asc":
      orderBy = { name: "asc" };
      break;
    case "name_desc":
      orderBy = { name: "desc" };
      break;
    default:
      orderBy = { created_at: "desc" };
      break;
  }

  const [items, totalItems] = await Promise.all([
    prisma.products.findMany({
      where,
      skip,
      take: limit,
      orderBy,
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
            variant_id: "asc",
          },
          select: {
            variant_id: true,
            sku: true,
            color: true,
            capacity: true,
            ram: true,
            price: true,
            old_price: true,
            stock_quantity: true,
          },
        },
        _count: {
          select: {
            product_variants: true,
            product_images: true,
          },
        },
      },
    }),

    prisma.products.count({
      where,
    }),
  ]);

  return {
    items: items.map(mapAdminProductToDto),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

/**
 * GET /api/admin/products/:productId
 * Lấy chi tiết sản phẩm theo ID cho Admin.
 */
export const getAdminProductDetailService = async (
  productId: number
): Promise<AdminProductDto> => {
  if (!productId || Number.isNaN(productId)) {
    throw new AdminProductServiceError("productId không hợp lệ", 400);
  }

  const product = await prisma.products.findUnique({
    where: {
      product_id: productId,
    },
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
          variant_id: "asc",
        },
        select: {
          variant_id: true,
          sku: true,
          color: true,
          capacity: true,
          ram: true,
          price: true,
          old_price: true,
          stock_quantity: true,
        },
      },
      _count: {
        select: {
          product_variants: true,
          product_images: true,
        },
      },
    },
  });

  if (!product) {
    throw new AdminProductServiceError("Không tìm thấy sản phẩm", 404);
  }

  return mapAdminProductToDto(product);
};

/**
 * POST /api/admin/products
 * Tạo product cha.
 */
export const createAdminProductService = async (
  body: CreateAdminProductBody
): Promise<AdminProductDto> => {
  const name = normalizeText(body.name);
  const description = body.description ?? null;
  const categoryId = Number(body.categoryId);

  if (!name) {
    throw new AdminProductServiceError("Vui lòng nhập tên sản phẩm", 400);
  }

  if (!categoryId || Number.isNaN(categoryId)) {
    throw new AdminProductServiceError("Vui lòng chọn danh mục", 400);
  }

  await ensureCategoryExists(categoryId);

  const slugBase = normalizeText(body.slug)
    ? createSlugFromName(body.slug as string)
    : createSlugFromName(name);

  if (!slugBase) {
    throw new AdminProductServiceError("Slug sản phẩm không hợp lệ", 400);
  }

  const slug = await buildUniqueProductSlug(slugBase);

  const createdProduct = await prisma.products.create({
    data: {
      category_id: categoryId,
      name,
      slug,
      description,
      is_active: body.isActive ?? true,
    },
    include: {
      categories: {
        select: {
          category_id: true,
          category_name: true,
          slug: true,
        },
      },
      product_variants: {
        select: {
          variant_id: true,
          sku: true,
          color: true,
          capacity: true,
          ram: true,
          price: true,
          old_price: true,
          stock_quantity: true,
        },
      },
      _count: {
        select: {
          product_variants: true,
          product_images: true,
        },
      },
    },
  });

  return mapAdminProductToDto(createdProduct);
};

/**
 * PATCH /api/admin/products/:productId
 * Cập nhật product cha.
 */
export const updateAdminProductService = async (
  productId: number,
  body: UpdateAdminProductBody
): Promise<AdminProductDto> => {
  if (!productId || Number.isNaN(productId)) {
    throw new AdminProductServiceError("productId không hợp lệ", 400);
  }

  const existedProduct = await prisma.products.findUnique({
    where: {
      product_id: productId,
    },
    select: {
      product_id: true,
      slug: true,
    },
  });

  if (!existedProduct) {
    throw new AdminProductServiceError("Không tìm thấy sản phẩm", 404);
  }

  const data: any = {};

  if (body.categoryId !== undefined) {
    const categoryId = Number(body.categoryId);

    if (!categoryId || Number.isNaN(categoryId)) {
      throw new AdminProductServiceError("categoryId không hợp lệ", 400);
    }

    await ensureCategoryExists(categoryId);
    data.category_id = categoryId;
  }

  if (body.name !== undefined) {
    const name = normalizeText(body.name);

    if (!name) {
      throw new AdminProductServiceError("Tên sản phẩm không được để trống", 400);
    }

    data.name = name;
  }

  if (body.slug !== undefined) {
    const slugBase = createSlugFromName(body.slug);

    if (!slugBase) {
      throw new AdminProductServiceError("Slug sản phẩm không hợp lệ", 400);
    }

    data.slug = await buildUniqueProductSlug(slugBase, productId);
  }

  if (body.description !== undefined) {
    data.description = body.description;
  }

  if (body.isActive !== undefined) {
    data.is_active = body.isActive;
  }

  const updatedProduct = await prisma.products.update({
    where: {
      product_id: productId,
    },
    data,
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
          variant_id: "asc",
        },
        select: {
          variant_id: true,
          sku: true,
          color: true,
          capacity: true,
          ram: true,
          price: true,
          old_price: true,
          stock_quantity: true,
        },
      },
      _count: {
        select: {
          product_variants: true,
          product_images: true,
        },
      },
    },
  });

  return mapAdminProductToDto(updatedProduct);
};

/**
 * DELETE /api/admin/products/:productId
 * Xóa mềm sản phẩm bằng is_active=false.
 */
export const deleteAdminProductService = async (
  productId: number
): Promise<AdminProductDto> => {
  if (!productId || Number.isNaN(productId)) {
    throw new AdminProductServiceError("productId không hợp lệ", 400);
  }

  const existedProduct = await prisma.products.findUnique({
    where: {
      product_id: productId,
    },
    select: {
      product_id: true,
    },
  });

  if (!existedProduct) {
    throw new AdminProductServiceError("Không tìm thấy sản phẩm", 404);
  }

  const deletedProduct = await prisma.products.update({
    where: {
      product_id: productId,
    },
    data: {
      is_active: false,
    },
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
          variant_id: "asc",
        },
        select: {
          variant_id: true,
          sku: true,
          color: true,
          capacity: true,
          ram: true,
          price: true,
          old_price: true,
          stock_quantity: true,
        },
      },
      _count: {
        select: {
          product_variants: true,
          product_images: true,
        },
      },
    },
  });

  return mapAdminProductToDto(deletedProduct);
};