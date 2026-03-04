import { Inject } from "@nestjs/common";
import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { GetProductQuery } from "../impl/get-product.query";
import { Product } from "../../entities/product.entity";
import { CacheKeys, CacheTTL } from "../../../../common/cache/cache-keys";
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from "../../ports/product.repository.port";

@QueryHandler(GetProductQuery)
export class GetProductHandler implements IQueryHandler<GetProductQuery> {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepositoryPort,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(query: GetProductQuery): Promise<Product> {
    const cacheKey = CacheKeys.product(query.id);
    const cached = await this.cache.get<Product>(cacheKey);

    if (cached) {
      return cached;
    }

    const product = await this.products.findById(query.id, [
      "categories",
      "attributes",
    ]);

    if (!product) {
      throw new NotFoundException(`Product ${query.id} not found`);
    }

    await this.cache.set(cacheKey, product, CacheTTL.PRODUCT_DETAIL);

    return product;
  }
}
