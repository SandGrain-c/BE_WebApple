import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, test, vi } from "vitest";

const bannerRepository = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

const uploadStream = vi.hoisted(() => vi.fn());

vi.mock("../../../src/utils/prisma", () => ({
  default: {
    banners: bannerRepository,
  },
}));

vi.mock("../../../src/config/env", () => ({
  integrationStatus: {
    cloudinary: "configured",
  },
}));

vi.mock("../../../src/config/cloudinary", () => ({
  default: {
    uploader: {
      upload_stream: uploadStream,
    },
  },
}));

import {
  createBannerService,
  updateBannerService,
} from "../../../src/modules/banner/banner.service";
import bannerPublicRoute from "../../../src/modules/banner/banner-public.route";

const imageFile = {
  buffer: Buffer.from("banner-test-image"),
} as Express.Multer.File;

function bannerRow(overrides: Record<string, unknown> = {}) {
  return {
    banner_id: 1,
    title: "Banner test",
    image_url: "https://test.invalid/banner.png",
    cloudinary_public_id: null,
    target_url: "/iphone",
    position: "home-hero",
    is_active: true,
    ...overrides,
  };
}

describe("Banner position service contract", () => {
  const publicApp = express();
  publicApp.use("/api/banners", bannerPublicRoute);

  beforeEach(() => {
    vi.clearAllMocks();

    uploadStream.mockImplementation((_options, callback) => {
      callback(null, {
        secure_url: "https://test.invalid/uploaded-banner.png",
      });

      return {
        end: vi.fn(),
      };
    });
  });

  test("create persists the active home-small position without an external upload", async () => {
    bannerRepository.create.mockImplementation(async ({ data }) =>
      bannerRow({
        ...data,
        banner_id: 10,
      }),
    );

    const result = await createBannerService(
      {
        title: "Home small",
        targetUrl: "/iphone",
        position: "home-small",
        isActive: "true",
      },
      imageFile,
    );

    expect(bannerRepository.create).toHaveBeenCalledWith({
      data: {
        title: "Home small",
        image_url: "https://test.invalid/uploaded-banner.png",
        target_url: "/iphone",
        position: "home-small",
        is_active: true,
      },
    });
    expect(result.position).toBe("home-small");
  });

  test("update changes a banner from home-hero to home-small", async () => {
    bannerRepository.findUnique.mockResolvedValue(bannerRow());
    bannerRepository.update.mockImplementation(async ({ data }) =>
      bannerRow(data),
    );

    const result = await updateBannerService(1, {
      position: "home-small",
    });

    expect(bannerRepository.update).toHaveBeenCalledWith({
      where: {
        banner_id: 1,
      },
      data: expect.objectContaining({
        position: "home-small",
      }),
    });
    expect(result.position).toBe("home-small");
  });

  test.each(["home-hero", "home-small"])(
    "public API returns active banners for %s",
    async (position) => {
      bannerRepository.findMany.mockResolvedValue([
        bannerRow({ position }),
      ]);

      const response = await request(publicApp)
        .get("/api/banners")
        .query({ position });

      expect(response.status).toBe(200);
      expect(bannerRepository.findMany).toHaveBeenCalledWith({
        where: {
          is_active: true,
          position: {
            equals: position,
            mode: "insensitive",
          },
        },
        orderBy: {
          banner_id: "asc",
        },
      });
      expect(response.body.data).toEqual([
        expect.objectContaining({
          position,
          isActive: true,
        }),
      ]);
    },
  );
});
