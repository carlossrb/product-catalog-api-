import { Inject } from "@nestjs/common";
import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { ListCategoriesQuery } from "../impl/list-categories.query";
import { Category } from "../../entities/category.entity";
import {
  CacheKeys,
  CacheTTL,
  hashQueryParams,
} from "../../../../common/cache/cache-keys";
import {
  CATEGORY_REPOSITORY,
  CategoryRepositoryPort,
} from "../../ports/category.repository.port";

interface PaginatedResult<T> {
  readonly data: T[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
}

@QueryHandler(ListCategoriesQuery)
export class ListCategoriesHandler implements IQueryHandler<ListCategoriesQuery> {
  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepositoryPort,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(
    query: ListCategoriesQuery,
  ): Promise<PaginatedResult<Category>> {
    const version =
      (await this.cache.get<number>(CacheKeys.categoryListVersion())) ?? 0;
    const hash = hashQueryParams({
      name: query.name,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      limit: query.limit,
    });
    const cacheKey = CacheKeys.categoryList(version, hash);
    const cached = await this.cache.get<PaginatedResult<Category>>(cacheKey);

    if (cached) {
      return cached;
    }

    const [data, total] = await this.categories.findAll({
      name: query.name,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      page: query.page,
      limit: query.limit,
    });

    const result: PaginatedResult<Category> = {
      data,
      total,
      page: query.page,
      limit: query.limit,
    };

    await this.cache.set(cacheKey, result, CacheTTL.CATEGORY_LIST);

    return result;
  }
}
