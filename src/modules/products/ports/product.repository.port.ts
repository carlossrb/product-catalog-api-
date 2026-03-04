import { ProductStatus } from "../entities/product-status.enum";
import { Product } from "../entities/product.entity";

export const PRODUCT_REPOSITORY = Symbol("PRODUCT_REPOSITORY");

export interface ListProductsOptions {
  readonly name?: string;
  readonly status?: ProductStatus;
  readonly sortBy: string;
  readonly sortOrder: string;
  readonly page: number;
  readonly limit: number;
}

export interface ProductRepositoryPort {
  create(data: { name: string; description: string | null }): Product;
  save(product: Product): Promise<Product>;
  findById(id: string, relations?: string[]): Promise<Product | null>;
  findDuplicateName(name: string, excludeId: string): Promise<Product | null>;
  findAll(options: ListProductsOptions): Promise<[Product[], number]>;
}
