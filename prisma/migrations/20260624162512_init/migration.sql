-- CreateTable
CREATE TABLE "audit_logs" (
    "log_id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" INTEGER,
    "old_value" TEXT,
    "new_value" TEXT,
    "ip_address" VARCHAR(50),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_audit_logs" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "banners" (
    "banner_id" SERIAL NOT NULL,
    "title" VARCHAR(100),
    "image_url" VARCHAR(255),
    "target_url" VARCHAR(255),
    "position" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pk_banners" PRIMARY KEY ("banner_id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "cart_item_id" SERIAL NOT NULL,
    "cart_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "pk_cart_items" PRIMARY KEY ("cart_item_id")
);

-- CreateTable
CREATE TABLE "carts" (
    "cart_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_carts" PRIMARY KEY ("cart_id")
);

-- CreateTable
CREATE TABLE "categories" (
    "category_id" SERIAL NOT NULL,
    "category_name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "description" VARCHAR(255),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pk_categories" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "favorite_products" (
    "favorite_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_favorite_ce74_faf59_e60_b2_eb" PRIMARY KEY ("favorite_id")
);

-- CreateTable
CREATE TABLE "flash_sale_items" (
    "flash_sale_item_id" SERIAL NOT NULL,
    "flash_sale_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "sale_price" DECIMAL(18,2) NOT NULL,
    "quantity_limit" INTEGER NOT NULL,
    "sold_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pk_flash_sa_703_e929_e6_ef5_df4_d" PRIMARY KEY ("flash_sale_item_id")
);

-- CreateTable
CREATE TABLE "flash_sales" (
    "flash_sale_id" SERIAL NOT NULL,
    "flash_sale_name" VARCHAR(255) NOT NULL,
    "start_time" TIMESTAMP(6) NOT NULL,
    "end_time" TIMESTAMP(6) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'Upcoming',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_flash_sa_d603_a204_cdc8_dce3" PRIMARY KEY ("flash_sale_id")
);

-- CreateTable
CREATE TABLE "inventory_receipt_details" (
    "receipt_detail_id" SERIAL NOT NULL,
    "receipt_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "cost_price" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "pk_inventory_receipt_details" PRIMARY KEY ("receipt_detail_id")
);

-- CreateTable
CREATE TABLE "inventory_receipts" (
    "receipt_id" SERIAL NOT NULL,
    "warehouse_staff_id" INTEGER NOT NULL,
    "supplier_name" VARCHAR(200),
    "total_amount" DECIMAL(18,2),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier_id" INTEGER,

    CONSTRAINT "pk_inventory_receipts" PRIMARY KEY ("receipt_id")
);

-- CreateTable
CREATE TABLE "order_details" (
    "order_detail_id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "pk_order_details" PRIMARY KEY ("order_detail_id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "history_id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "old_status" VARCHAR(50),
    "new_status" VARCHAR(50) NOT NULL,
    "changed_by" INTEGER,
    "note" VARCHAR(500),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_order_status_history" PRIMARY KEY ("history_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "order_id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "order_code" VARCHAR(50) NOT NULL,
    "voucher_id" INTEGER,
    "sub_total" DECIMAL(18,2) NOT NULL,
    "shipping_fee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,
    "order_status" VARCHAR(50) NOT NULL DEFAULT 'PendingPayment',
    "customer_name" VARCHAR(100),
    "customer_phone" VARCHAR(15),
    "shipping_address" VARCHAR(500),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "address_id" INTEGER,

    CONSTRAINT "pk_orders" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "transaction_id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "gateway" VARCHAR(50),
    "transaction_ref" VARCHAR(100),
    "amount" DECIMAL(18,2) NOT NULL,
    "payment_type" VARCHAR(20) NOT NULL DEFAULT 'Payment',
    "status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gateway_response" TEXT,
    "paid_at" TIMESTAMP(6),
    "updated_at" TIMESTAMP(6),

    CONSTRAINT "pk_payment_transactions" PRIMARY KEY ("transaction_id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "image_id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "color" VARCHAR(50) NOT NULL,
    "image_url" VARCHAR(500) NOT NULL,
    "alt_text" VARCHAR(255),
    "is_thumbnail" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "variant_id" INTEGER,

    CONSTRAINT "pk_product_images" PRIMARY KEY ("image_id")
);

-- CreateTable
CREATE TABLE "product_items" (
    "item_id" SERIAL NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "serial_number" VARCHAR(50) NOT NULL,
    "status" SMALLINT NOT NULL DEFAULT 1,
    "import_receipt_detail_id" INTEGER,
    "order_detail_id" INTEGER,

    CONSTRAINT "pk_product_items" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "variant_id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "variant_name" VARCHAR(255),
    "sku" VARCHAR(50) NOT NULL,
    "color" VARCHAR(50),
    "capacity" VARCHAR(20),
    "ram" VARCHAR(20),
    "country" VARCHAR(20),
    "price" DECIMAL(18,2) NOT NULL,
    "old_price" DECIMAL(18,2),
    "installment" VARCHAR(100),
    "discount_label" VARCHAR(50),
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pk_product_variants" PRIMARY KEY ("variant_id")
);

-- CreateTable
CREATE TABLE "products" (
    "product_id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_products" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "product_promotions" (
    "promotion_id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "variant_id" INTEGER,
    "promotion_text" VARCHAR(255) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_product_promotions" PRIMARY KEY ("promotion_id")
);

-- CreateTable
CREATE TABLE "product_spec_groups" (
    "spec_group_id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "group_name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_product_spec_groups" PRIMARY KEY ("spec_group_id")
);

-- CreateTable
CREATE TABLE "product_specs" (
    "spec_id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "variant_id" INTEGER,
    "spec_group_id" INTEGER,
    "spec_key" VARCHAR(100) NOT NULL,
    "spec_label" VARCHAR(150) NOT NULL,
    "spec_value" VARCHAR(500) NOT NULL,
    "unit" VARCHAR(50),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_highlight" BOOLEAN NOT NULL DEFAULT false,
    "is_filterable" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_product_specs" PRIMARY KEY ("spec_id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "review_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "order_detail_id" INTEGER,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_reviews" PRIMARY KEY ("review_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "role_id" SERIAL NOT NULL,
    "role_name" VARCHAR(50) NOT NULL,

    CONSTRAINT "pk_roles" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "shipment_status_history" (
    "shipment_history_id" SERIAL NOT NULL,
    "shipment_id" INTEGER NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "location" VARCHAR(255),
    "note" VARCHAR(500),
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_shipment_status_history" PRIMARY KEY ("shipment_history_id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "shipment_id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "shipping_provider" VARCHAR(100),
    "tracking_code" VARCHAR(100),
    "status" VARCHAR(50) NOT NULL DEFAULT 'Pending',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_shipments" PRIMARY KEY ("shipment_id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "staff_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "citizen_id" VARCHAR(20) NOT NULL,
    "hire_date" DATE NOT NULL,
    "base_salary" DECIMAL(18,2),
    "branch" VARCHAR(100),

    CONSTRAINT "pk_staff_profiles" PRIMARY KEY ("staff_id")
);

-- CreateTable
CREATE TABLE "stock_reservations" (
    "reservation_id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "order_id" INTEGER,
    "reserved_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expired_at" TIMESTAMP(6) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'Active',

    CONSTRAINT "pk_stock_re_b7_ee5_f04_ace71045" PRIMARY KEY ("reservation_id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "supplier_id" SERIAL NOT NULL,
    "supplier_name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "address" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_supplier_4_be66694_c643_e820" PRIMARY KEY ("supplier_id")
);

-- CreateTable
CREATE TABLE "support_ticket_media" (
    "media_id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "media_url" VARCHAR(500) NOT NULL,
    "media_type" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_support_b2_c2_b5_af226_c0_d7_c" PRIMARY KEY ("media_id")
);

-- CreateTable
CREATE TABLE "support_ticket_status_history" (
    "history_id" SERIAL NOT NULL,
    "ticket_id" INTEGER NOT NULL,
    "old_status" VARCHAR(50),
    "new_status" VARCHAR(50) NOT NULL,
    "changed_by" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_support_4_d7_b4_adda85524_c8" PRIMARY KEY ("history_id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "ticket_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "order_id" INTEGER,
    "item_id" INTEGER,
    "ticket_type" VARCHAR(50) NOT NULL,
    "reason" TEXT,
    "status" VARCHAR(50) NOT NULL DEFAULT 'Open',
    "handled_by" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(6),

    CONSTRAINT "pk_support_tickets" PRIMARY KEY ("ticket_id")
);

-- CreateTable
CREATE TABLE "user_addresses" (
    "address_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "receiver_name" VARCHAR(100) NOT NULL,
    "receiver_phone" VARCHAR(15) NOT NULL,
    "detailed_address" VARCHAR(255) NOT NULL,
    "ward" VARCHAR(50) NOT NULL,
    "city" VARCHAR(50) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pk_user_addresses" PRIMARY KEY ("address_id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "role_id" INTEGER NOT NULL,
    "email" VARCHAR(100),
    "phone" VARCHAR(15),
    "user_name" VARCHAR(25) NOT NULL,
    "pass_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "status" SMALLINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_users" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "token_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "token_type" VARCHAR(50) NOT NULL,
    "expired_at" TIMESTAMP(6) NOT NULL,
    "used_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_verifica_658_fee8_add2_e3_e8_c" PRIMARY KEY ("token_id")
);

-- CreateTable
CREATE TABLE "voucher_usages" (
    "voucher_usage_id" SERIAL NOT NULL,
    "voucher_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "used_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_voucher_usages" PRIMARY KEY ("voucher_usage_id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "voucher_id" SERIAL NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "discount_type" VARCHAR(20) NOT NULL,
    "discount_value" DECIMAL(18,2) NOT NULL,
    "min_order_value" DECIMAL(18,2),
    "max_discount_amount" DECIMAL(18,2),
    "usage_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(6),
    "end_date" TIMESTAMP(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "pk_vouchers" PRIMARY KEY ("voucher_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_cart_items_cart_variant" ON "cart_items"("cart_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_carts_user_id" ON "carts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_categories_category_name" ON "categories"("category_name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "uq_favorite_products_user_product" ON "favorite_products"("user_id", "product_id");

-- CreateIndex
CREATE INDEX "ix_flash_sale_items_flash_sale_active" ON "flash_sale_items"("flash_sale_id", "is_active");

-- CreateIndex
CREATE INDEX "ix_flash_sale_items_variant_id" ON "flash_sale_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_flash_sale_items_flash_sale_variant" ON "flash_sale_items"("flash_sale_id", "variant_id");

-- CreateIndex
CREATE INDEX "ix_flash_sales_time_status" ON "flash_sales"("start_time", "end_time", "status");

-- CreateIndex
CREATE INDEX "ix_order_details_order_id" ON "order_details"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_order_details_order_variant" ON "order_details"("order_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_orders_order_code" ON "orders"("order_code");

-- CreateIndex
CREATE INDEX "ix_orders_user_id" ON "orders"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ux_payment_transactions_transaction_ref_not_null" ON "payment_transactions"("transaction_ref") WHERE (transaction_ref IS NOT NULL);

-- CreateIndex
CREATE INDEX "ix_payment_transactions_order_id" ON "payment_transactions"("order_id");

-- CreateIndex
CREATE INDEX "ix_product_images_product_color" ON "product_images"("product_id", "color", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "ux_product_images_one_thumbnail_per_color" ON "product_images"("product_id", "color") WHERE ((is_thumbnail = true) AND (is_active = true));

-- CreateIndex
CREATE UNIQUE INDEX "uq_product_items_serial_number" ON "product_items"("serial_number");

-- CreateIndex
CREATE INDEX "ix_product_items_variant_status" ON "product_items"("variant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_product_variants_sku" ON "product_variants"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "ix_product_promotions_product_active" ON "product_promotions"("product_id", "is_active");

-- CreateIndex
CREATE INDEX "ix_product_promotions_variant_active" ON "product_promotions"("variant_id", "is_active");

-- CreateIndex
CREATE INDEX "ix_product_spec_groups_product_sort" ON "product_spec_groups"("product_id", "sort_order");

-- CreateIndex
CREATE INDEX "ix_product_specs_product_active" ON "product_specs"("product_id", "is_active");

-- CreateIndex
CREATE INDEX "ix_product_specs_variant_active" ON "product_specs"("variant_id", "is_active");

-- CreateIndex
CREATE INDEX "ix_product_specs_spec_key" ON "product_specs"("spec_key");

-- CreateIndex
CREATE UNIQUE INDEX "ux_reviews_user_order_detail_not_null" ON "reviews"("user_id", "order_detail_id") WHERE (order_detail_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "uq_roles_role_name" ON "roles"("role_name");

-- CreateIndex
CREATE UNIQUE INDEX "ux_shipments_tracking_code_not_null" ON "shipments"("tracking_code") WHERE (tracking_code IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "uq_staff_profiles_user_id" ON "staff_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_staff_profiles_citizen_id" ON "staff_profiles"("citizen_id");

-- CreateIndex
CREATE INDEX "ix_stock_reservations_item_status" ON "stock_reservations"("item_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ux_user_addresses_one_default_per_user" ON "user_addresses"("user_id") WHERE (is_default = true);

-- CreateIndex
CREATE UNIQUE INDEX "ux_users_email_not_null" ON "users"("email") WHERE (email IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "ux_users_phone_not_null" ON "users"("phone") WHERE (phone IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_user_name" ON "users"("user_name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_voucher_usages_order" ON "voucher_usages"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_voucher_usages_voucher_user" ON "voucher_usages"("voucher_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_vouchers_code" ON "vouchers"("code");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "fk_audit_logs_users" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "fk_cart_items_carts" FOREIGN KEY ("cart_id") REFERENCES "carts"("cart_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "fk_cart_items_variants" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "fk_carts_users" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "favorite_products" ADD CONSTRAINT "fk_favorite_products_products" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "favorite_products" ADD CONSTRAINT "fk_favorite_products_users" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "flash_sale_items" ADD CONSTRAINT "fk_flash_sale_items_flash_sales" FOREIGN KEY ("flash_sale_id") REFERENCES "flash_sales"("flash_sale_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "flash_sale_items" ADD CONSTRAINT "fk_flash_sale_items_product_variants" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_receipt_details" ADD CONSTRAINT "fk_inventory_receipt_details_receipts" FOREIGN KEY ("receipt_id") REFERENCES "inventory_receipts"("receipt_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_receipt_details" ADD CONSTRAINT "fk_inventory_receipt_details_variants" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "fk_inventory_receipts_suppliers" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("supplier_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "inventory_receipts" ADD CONSTRAINT "fk_inventory_receipts_users" FOREIGN KEY ("warehouse_staff_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_details" ADD CONSTRAINT "fk_order_details_orders" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_details" ADD CONSTRAINT "fk_order_details_variants" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "fk_order_status_history_orders" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "fk_order_status_history_users" FOREIGN KEY ("changed_by") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_user_addresses" FOREIGN KEY ("address_id") REFERENCES "user_addresses"("address_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_users" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_vouchers" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("voucher_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "fk_payment_transactions_orders" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "fk_product_images_product_variants" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "fk_product_images_products" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_items" ADD CONSTRAINT "fk_product_items_order_details" FOREIGN KEY ("order_detail_id") REFERENCES "order_details"("order_detail_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_items" ADD CONSTRAINT "fk_product_items_receipt_details" FOREIGN KEY ("import_receipt_detail_id") REFERENCES "inventory_receipt_details"("receipt_detail_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_items" ADD CONSTRAINT "fk_product_items_variants" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "fk_product_variants_products" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "fk_products_categories" FOREIGN KEY ("category_id") REFERENCES "categories"("category_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_promotions" ADD CONSTRAINT "fk_product_promotions_products" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_promotions" ADD CONSTRAINT "fk_product_promotions_variants" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_spec_groups" ADD CONSTRAINT "fk_product_spec_groups_products" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_specs" ADD CONSTRAINT "fk_product_specs_products" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_specs" ADD CONSTRAINT "fk_product_specs_variants" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("variant_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "product_specs" ADD CONSTRAINT "fk_product_specs_groups" FOREIGN KEY ("spec_group_id") REFERENCES "product_spec_groups"("spec_group_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "fk_reviews_order_details" FOREIGN KEY ("order_detail_id") REFERENCES "order_details"("order_detail_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "fk_reviews_products" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "fk_reviews_users" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "shipment_status_history" ADD CONSTRAINT "fk_shipment_status_history_shipments" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("shipment_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "fk_shipments_orders" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "fk_stock_reservations_orders" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "fk_stock_reservations_product_items" FOREIGN KEY ("item_id") REFERENCES "product_items"("item_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "stock_reservations" ADD CONSTRAINT "fk_stock_reservations_users" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_ticket_media" ADD CONSTRAINT "fk_support_ticket_media_tickets" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("ticket_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_ticket_status_history" ADD CONSTRAINT "fk_ticket_status_history_tickets" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("ticket_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_ticket_status_history" ADD CONSTRAINT "fk_ticket_status_history_users" FOREIGN KEY ("changed_by") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "fk_support_tickets_handled_by" FOREIGN KEY ("handled_by") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "fk_support_tickets_items" FOREIGN KEY ("item_id") REFERENCES "product_items"("item_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "fk_support_tickets_orders" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "fk_support_tickets_users" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_addresses" ADD CONSTRAINT "fk_user_addresses_users" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "fk_users_roles" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "fk_verification_tokens_users" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "fk_voucher_usages_orders" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "fk_voucher_usages_users" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "voucher_usages" ADD CONSTRAINT "fk_voucher_usages_vouchers" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("voucher_id") ON DELETE NO ACTION ON UPDATE NO ACTION;
