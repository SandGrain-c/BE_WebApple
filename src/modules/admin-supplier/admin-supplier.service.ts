// src/modules/admin-supplier/admin-supplier.service.ts

import prisma from "../../utils/prisma";
import type {
  CreateSupplierDto,
  SupplierListQueryDto,
  UpdateSupplierDto,
} from "./admin-supplier.dto";
import { mapSupplierToDto } from "./admin-supplier.mapper";

const SUPPLIER_ENTITY = "suppliers";

function normalizeText(value?: string | null) {
  // Chuẩn hóa text: bỏ khoảng trắng thừa
  return value?.trim() || null;
}

function validateEmail(email?: string | null) {
  if (!email) return;

  // Regex: biểu thức kiểm tra định dạng email cơ bản
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    throw new Error("Email nhà cung cấp không hợp lệ");
  }
}

function validateStatus(status?: string) {
  if (!status) return;

  if (!["Active", "Inactive"].includes(status)) {
    throw new Error("Trạng thái nhà cung cấp không hợp lệ");
  }
}

async function writeAuditLog(params: {
  actorId?: number;
  action: string;
  entityId?: number;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  tx?: any;
}) {
  // Audit log: nhật ký thao tác quan trọng của admin
  const client = params.tx ?? prisma;

  await client.audit_logs.create({
    data: {
      user_id: params.actorId,
      action: params.action,
      entity_type: SUPPLIER_ENTITY,
      entity_id: params.entityId,
      old_value: params.oldValue ? JSON.stringify(params.oldValue) : null,
      new_value: params.newValue ? JSON.stringify(params.newValue) : null,
      ip_address: params.ipAddress,
    },
  });
}

export async function getAdminSuppliers(query: SupplierListQueryDto) {
  const page = Number(query.page) > 0 ? Number(query.page) : 1;
  const limit = Number(query.limit) > 0 ? Number(query.limit) : 10;
  const skip = (page - 1) * limit;

  validateStatus(query.status);

  const where: any = {};

  if (query.status) {
    where.status = query.status;
  }

  if (query.search?.trim()) {
    const search = query.search.trim();

    where.OR = [
      {
        supplier_name: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        phone: {
          contains: search,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: search,
          mode: "insensitive",
        },
      },
    ];
  }

  const orderBy =
    query.sort === "oldest"
      ? { created_at: "asc" as const }
      : query.sort === "name_asc"
        ? { supplier_name: "asc" as const }
        : query.sort === "name_desc"
          ? { supplier_name: "desc" as const }
          : { created_at: "desc" as const };

  const [items, totalItems] = await Promise.all([
    prisma.suppliers.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        _count: {
          select: {
            inventory_receipts: true,
          },
        },
      },
    }),
    prisma.suppliers.count({ where }),
  ]);

  return {
    items: items.map(mapSupplierToDto),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
    },
  };
}

export async function getAdminSupplierById(supplierId: number) {
  if (!supplierId || supplierId <= 0) {
    throw new Error("supplierId không hợp lệ");
  }

  const supplier = await prisma.suppliers.findUnique({
    where: {
      supplier_id: supplierId,
    },
    include: {
      _count: {
        select: {
          inventory_receipts: true,
        },
      },
    },
  });

  if (!supplier) {
    throw new Error("Không tìm thấy nhà cung cấp");
  }

  return mapSupplierToDto(supplier);
}

export async function createAdminSupplier(
  dto: CreateSupplierDto,
  actorId?: number,
  ipAddress?: string
) {
  const supplierName = normalizeText(dto.supplierName);
  const phone = normalizeText(dto.phone);
  const email = normalizeText(dto.email);
  const address = normalizeText(dto.address);
  const status = dto.status ?? "Active";

  if (!supplierName) {
    throw new Error("Tên nhà cung cấp là bắt buộc");
  }

  validateEmail(email);
  validateStatus(status);

  // Kiểm tra trùng tên mềm ở tầng service vì DB chưa đặt unique supplier_name
  const existedSupplier = await prisma.suppliers.findFirst({
    where: {
      supplier_name: {
        equals: supplierName,
        mode: "insensitive",
      },
    },
  });

  if (existedSupplier) {
    throw new Error("Tên nhà cung cấp đã tồn tại");
  }

  const supplier = await prisma.$transaction(async (tx) => {
    const created = await tx.suppliers.create({
      data: {
        supplier_name: supplierName,
        phone,
        email,
        address,
        status,
      },
    });

    await writeAuditLog({
      tx,
      actorId,
      action: "CREATE_SUPPLIER",
      entityId: created.supplier_id,
      newValue: created,
      ipAddress,
    });

    return created;
  });

  return mapSupplierToDto(supplier);
}

export async function updateAdminSupplier(
  supplierId: number,
  dto: UpdateSupplierDto,
  actorId?: number,
  ipAddress?: string
) {
  if (!supplierId || supplierId <= 0) {
    throw new Error("supplierId không hợp lệ");
  }

  const currentSupplier = await prisma.suppliers.findUnique({
    where: {
      supplier_id: supplierId,
    },
  });

  if (!currentSupplier) {
    throw new Error("Không tìm thấy nhà cung cấp");
  }

  const updateData: any = {};

  if (dto.supplierName !== undefined) {
    const supplierName = normalizeText(dto.supplierName);

    if (!supplierName) {
      throw new Error("Tên nhà cung cấp không được để trống");
    }

    const duplicatedSupplier = await prisma.suppliers.findFirst({
      where: {
        supplier_id: {
          not: supplierId,
        },
        supplier_name: {
          equals: supplierName,
          mode: "insensitive",
        },
      },
    });

    if (duplicatedSupplier) {
      throw new Error("Tên nhà cung cấp đã tồn tại");
    }

    updateData.supplier_name = supplierName;
  }

  if (dto.phone !== undefined) {
    updateData.phone = normalizeText(dto.phone);
  }

  if (dto.email !== undefined) {
    const email = normalizeText(dto.email);
    validateEmail(email);
    updateData.email = email;
  }

  if (dto.address !== undefined) {
    updateData.address = normalizeText(dto.address);
  }

  if (dto.status !== undefined) {
    validateStatus(dto.status);
    updateData.status = dto.status;
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error("Không có dữ liệu cần cập nhật");
  }

  const updatedSupplier = await prisma.$transaction(async (tx) => {
    const updated = await tx.suppliers.update({
      where: {
        supplier_id: supplierId,
      },
      data: updateData,
    });

    await writeAuditLog({
      tx,
      actorId,
      action: "UPDATE_SUPPLIER",
      entityId: supplierId,
      oldValue: currentSupplier,
      newValue: updated,
      ipAddress,
    });

    return updated;
  });

  return mapSupplierToDto(updatedSupplier);
}

export async function deactivateAdminSupplier(
  supplierId: number,
  actorId?: number,
  ipAddress?: string
) {
  if (!supplierId || supplierId <= 0) {
    throw new Error("supplierId không hợp lệ");
  }

  const currentSupplier = await prisma.suppliers.findUnique({
    where: {
      supplier_id: supplierId,
    },
  });

  if (!currentSupplier) {
    throw new Error("Không tìm thấy nhà cung cấp");
  }

  if (currentSupplier.status === "Inactive") {
    throw new Error("Nhà cung cấp đã ngừng hoạt động");
  }

  // Không xóa cứng vì supplier có thể đã liên kết với phiếu nhập kho
  const supplier = await prisma.$transaction(async (tx) => {
    const updated = await tx.suppliers.update({
      where: {
        supplier_id: supplierId,
      },
      data: {
        status: "Inactive",
      },
    });

    await writeAuditLog({
      tx,
      actorId,
      action: "DEACTIVATE_SUPPLIER",
      entityId: supplierId,
      oldValue: currentSupplier,
      newValue: updated,
      ipAddress,
    });

    return updated;
  });

  return mapSupplierToDto(supplier);
}