import { Category } from "../entities/category.entity";

export const CATEGORY_REPOSITORY = Symbol("CATEGORY_REPOSITORY");

export interface ListCategoriesOptions {
  readonly name?: string;
  readonly sortBy: string;
  readonly sortOrder: string;
  readonly page: number;
  readonly limit: number;
}

export interface CategoryRepositoryPort {
  create(data: { name: string; parentId: string | null }): Category;
  save(category: Category): Promise<Category>;
  findById(id: string, relations?: string[]): Promise<Category | null>;
  findByName(name: string): Promise<Category | null>;
  findByNameExcluding(
    name: string,
    excludeId: string,
  ): Promise<Category | null>;
  findAll(options: ListCategoriesOptions): Promise<[Category[], number]>;
}
