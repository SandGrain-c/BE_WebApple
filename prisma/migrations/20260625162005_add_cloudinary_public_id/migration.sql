-- AlterTable
ALTER TABLE "banners" ADD COLUMN     "cloudinary_public_id" VARCHAR(255),
ALTER COLUMN "image_url" SET DATA TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "cloudinary_public_id" VARCHAR(255);

-- CreateIndex
CREATE INDEX "ix_banners_cloudinary_public_id" ON "banners"("cloudinary_public_id");

-- CreateIndex
CREATE INDEX "ix_product_images_cloudinary_public_id" ON "product_images"("cloudinary_public_id");
