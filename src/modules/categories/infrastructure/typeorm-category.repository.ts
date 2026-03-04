import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, ILike, Not, Repository } from "typeorm";
import { Category } from "../entities/category.entity";
import {
  CategoryRepositoryPort,
  ListCategoriesOptions,
} from "../ports/category.repository.port";

@Injectable()
export class TypeOrmCategoryRepository implements CategoryRepositoryPort {
  constructor(
    @InjectRepository(Category)
    private readonly repo: Repository<Category>,
  ) {}

  create(data: { name: string; parentId: string | null }): Category {
    return this.repo.create(data);
  }

  save(category: Category): Promise<Category> {
    return this.repo.save(category);
  }

  findById(id: string, relations?: string[]): Promise<Category | null> {
    return this.repo.findOne({ where: { id }, relations });
  }

  findByName(name: string): Promise<Category | null> {
    return this.repo.findOne({ where: { name } });
  }

  findByNameExcluding(
    name: string,
    excludeId: string,
  ): Promise<Category | null> {
    return this.repo.findOne({ where: { name, id: Not(excludeId) } });
  }

  findAll(options: ListCategoriesOptions): Promise<[Category[], number]> {
    const where: FindOptionsWhere<Category> = {};

    if (options.name) {
      where.name = ILike(`%${options.name}%`);
    }

    return this.repo.findAndCount({
      where,
      relations: ["parent"],
      order: { [options.sortBy]: options.sortOrder.toUpperCase() },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
    });
  }
}
