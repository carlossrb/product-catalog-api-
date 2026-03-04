import { Inject } from "@nestjs/common";
import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { GetCategoryQuery } from "../impl/get-category.query";
import { Category } from "../../entities/category.entity";
import { CacheKeys, CacheTTL } from "../../../../common/cache/cache-keys";
import {
  CATEGORY_REPOSITORY,
  CategoryRepositoryPort,
} from "../../ports/category.repository.port";

@QueryHandler(GetCategoryQuery)
export class GetCategoryHandler implements IQueryHandler<GetCategoryQuery> {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepositoryPort,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(query: GetCategoryQuery): Promise<Category> {
    const cacheKey = CacheKeys.category(query.id);
    const cached = await this.cache.get<Category>(cacheKey);

    if (cached) {
      return cached;
    }

    const category = await this.categories.findById(query.id, [
      "parent",
      "children",
    ]);

    if (!category) {
      throw new NotFoundException(`Category ${query.id} not found`);
    }

    await this.cache.set(cacheKey, category, CacheTTL.CATEGORY_DETAIL);

    return category;
  }
}
