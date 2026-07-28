export type FavoriteProductDto = {
    favoriteId: number;
    productId: number;
    name: string;
    slug: string;
    categoryId: number;
    categoryName: string;
    categorySlug: string;
  
    image: string | null;
  
    price: number | null;
    oldPrice: number | null;
    discountLabel: string | null;
    installment: string | null;
  
    stockQuantity: number;
    stockStatus: "in-stock" | "out-of-stock";
  
    createdAt: string;
  };
  
  export type FavoriteListResponseDto = {
    items: FavoriteProductDto[];
    totalItems: number;
  };
  
  export type FavoriteCheckResponseDto = {
    productId: number;
    isFavorited: boolean;
  };