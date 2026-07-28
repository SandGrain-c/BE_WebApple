// src/modules/admin-category/admin-category.service.ts


import prisma from "../../utils/prisma";
import {
  AdminCategoryDto,
  AdminCategoryListResponseDto,
  CreateAdminCategoryBody,
  GetAdminCategoriesQuery,
  UpdateAdminCategoryBody,
} from "./admin-category.dto";
import { mapAdminCategoryToDto } from "./admin-category.mapper";

export class AdminCategoryServiceError extends Error {
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
 * Tạo slug từ tên danh mục.
 * Slug là chuỗi dùng trên URL, ví dụ: apple-watch.
 */
const createSlugFromText = (text: string) => {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

/**
 * Đảm bảo slug không bị trùng.
 */
const buildUniqueCategorySlug = async (
  slugBase: string,
  categoryId?: number
) => {
  let slug = slugBase;
  let counter = 1;

  while (true) {
    const existedCategory = await prisma.categories.findFirst({
      where: {
        slug,
        ...(categoryId
          ? {
              NOT: {
                category_id: categoryId,
              },
            }
          : {}),
      },
      select: {
        category_id: true,
      },
    });

    if (!existedCategory) {
      return slug;
    }

    counter += 1;
    slug = `${slugBase}-${counter}`;
  }
};

/**
 * Kiểm tra tên danh mục không bị trùng.
 */
const ensureCategoryNameUnique = async (
  categoryName: string,
  categoryId?: number
) => {
  const existedCategory = await prisma.categories.findFirst({
    where: {
      category_name: {
        equals: categoryName,
        mode: "insensitive",
      },
      ...(categoryId
        ? {
            NOT: {
              category_id: categoryId,
            },
          }
        : {}),
    },
    select: {
      category_id: true,
    },
  });

  if (existedCategory) {
    throw new AdminCategoryServiceError("Tên danh mục đã tồn tại", 409);
  }
};

/**
 * GET /api/admin/categories
 * Lấy danh sách danh mục cho Admin.
 */
export const getAdminCategoriesService = async (
  query: GetAdminCategoriesQuery
): Promise<AdminCategoryListResponseDto> => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;

  const search = normalizeText(query.search);

  const where: any = {};

  if (search) {
    where.OR = [
      {
        category_name: {
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

  if (query.isActive === "true") {
    where.is_active = true;
  }

  if (query.isActive === "false") {
    where.is_active = false;
  }

  let orderBy: any = [
    {
      display_order: "asc",
    },
    {
      category_id: "asc",
    },
  ];

  switch (query.sort) {
    case "newest":
      orderBy = { category_id: "desc" };
      break;
    case "oldest":
      orderBy = { category_id: "asc" };
      break;
    case "name_asc":
      orderBy = { category_name: "asc" };
      break;
    case "name_desc":
      orderBy = { category_name: "desc" };
      break;
    case "display_order_desc":
      orderBy = { display_order: "desc" };
      break;
    case "display_order_asc":
    default:
      orderBy = [
        {
          display_order: "asc",
        },
        {
          category_id: "asc",
        },
      ];
      break;
  }

  const [items, totalItems] = await Promise.all([
    prisma.categories.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
    }),

    prisma.categories.count({
      where,
    }),
  ]);

  return {
    items: items.map(mapAdminCategoryToDto),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
};

/**
 * GET /api/admin/categories/:categoryId
 * Lấy chi tiết danh mục.
 */
export const getAdminCategoryDetailService = async (
  categoryId: number
): Promise<AdminCategoryDto> => {
  if (!categoryId || Number.isNaN(categoryId)) {
    throw new AdminCategoryServiceError("categoryId không hợp lệ", 400);
  }

  const category = await prisma.categories.findUnique({
    where: {
      category_id: categoryId,
    },
    include: {
      _count: {
        select: {
          products: true,
        },
      },
    },
  });

  if (!category) {
    throw new AdminCategoryServiceError("Không tìm thấy danh mục", 404);
  }

  return mapAdminCategoryToDto(category);
};

/**
 * POST /api/admin/categories
 * Tạo danh mục mới.
 */
export const createAdminCategoryService = async (
  body: CreateAdminCategoryBody
): Promise<AdminCategoryDto> => {
  const categoryName = normalizeText(body.categoryName);

  if (!categoryName) {
    throw new AdminCategoryServiceError("Vui lòng nhập tên danh mục", 400);
  }

  await ensureCategoryNameUnique(categoryName);

  const slugBase = normalizeText(body.slug)
    ? createSlugFromText(body.slug as string)
    : createSlugFromText(categoryName);

  if (!slugBase) {
    throw new AdminCategoryServiceError("Slug danh mục không hợp lệ", 400);
  }

  const slug = await buildUniqueCategorySlug(slugBase);

  const displayOrder =
    body.displayOrder === undefined ? 0 : Number(body.displayOrder);

  if (Number.isNaN(displayOrder)) {
    throw new AdminCategoryServiceError("displayOrder không hợp lệ", 400);
  }

  const createdCategory = await prisma.categories.create({
    data: {
      category_name: categoryName,
      slug,
      description: body.description ?? null,
      display_order: displayOrder,
      is_active: body.isActive ?? true,
    },
    include: {
      _count: {
        select: {
          products: true,
        },
      },
    },
  });

  return mapAdminCategoryToDto(createdCategory);
};

/**
 * PATCH /api/admin/categories/:categoryId
 * Cập nhật danh mục.
 */
export const updateAdminCategoryService = async (
  categoryId: number,
  body: UpdateAdminCategoryBody
): Promise<AdminCategoryDto> => {
  if (!categoryId || Number.isNaN(categoryId)) {
    throw new AdminCategoryServiceError("categoryId không hợp lệ", 400);
  }

  const existedCategory = await prisma.categories.findUnique({
    where: {
      category_id: categoryId,
    },
    select: {
      category_id: true,
    },
  });

  if (!existedCategory) {
    throw new AdminCategoryServiceError("Không tìm thấy danh mục", 404);
  }

  const data: any = {};

  if (body.categoryName !== undefined) {
    const categoryName = normalizeText(body.categoryName);

    if (!categoryName) {
      throw new AdminCategoryServiceError(
        "Tên danh mục không được để trống",
        400
      );
    }

    await ensureCategoryNameUnique(categoryName, categoryId);
    data.category_name = categoryName;
  }

  if (body.slug !== undefined) {
    const slugBase = createSlugFromText(body.slug);

    if (!slugBase) {
      throw new AdminCategoryServiceError("Slug danh mục không hợp lệ", 400);
    }

    data.slug = await buildUniqueCategorySlug(slugBase, categoryId);
  }

  if (body.description !== undefined) {
    data.description = body.description;
  }

  if (body.displayOrder !== undefined) {
    const displayOrder = Number(body.displayOrder);

    if (Number.isNaN(displayOrder)) {
      throw new AdminCategoryServiceError("displayOrder không hợp lệ", 400);
    }

    data.display_order = displayOrder;
  }

  if (body.isActive !== undefined) {
    data.is_active = body.isActive;
  }

  const updatedCategory = await prisma.categories.update({
    where: {
      category_id: categoryId,
    },
    data,
    include: {
      _count: {
        select: {
          products: true,
        },
      },
    },
  });

  return mapAdminCategoryToDto(updatedCategory);
};

/**
 * DELETE /api/admin/categories/:categoryId
 * Xóa mềm danh mục bằng is_active=false.
 */
export const deleteAdminCategoryService = async (
  categoryId: number
): Promise<AdminCategoryDto> => {
  if (!categoryId || Number.isNaN(categoryId)) {
    throw new AdminCategoryServiceError("categoryId không hợp lệ", 400);
  }

  const existedCategory = await prisma.categories.findUnique({
    where: {
      category_id: categoryId,
    },
    select: {
      category_id: true,
    },
  });

  if (!existedCategory) {
    throw new AdminCategoryServiceError("Không tìm thấy danh mục", 404);
  }

  const deletedCategory = await prisma.categories.update({
    where: {
      category_id: categoryId,
    },
    data: {
      is_active: false,
    },
    include: {
      _count: {
        select: {
          products: true,
        },
      },
    },
  });

  return mapAdminCategoryToDto(deletedCategory);
};