import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, ILike, Not, Repository } from "typeorm";
import { Product } from "../entities/product.entity";
import {
  ListProductsOptions,
  ProductRepositoryPort,
} from "../ports/product.repository.port";

@Injectable()
export class TypeOrmProductRepository implements ProductRepositoryPort {
  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
  ) {}

  create(data: { name: string; description: string | null }): Product {
    return this.repo.create(data);
  }

  save(product: Product): Promise<Product> {
    return this.repo.save(product);
  }

  findById(id: string, relations?: string[]): Promise<Product | null> {
    return this.repo.findOne({ where: { id }, relations });
  }

  findDuplicateName(name: string, excludeId: string): Promise<Product | null> {
    return this.repo.findOne({ where: { name, id: Not(excludeId) } });
  }

  findAll(options: ListProductsOptions): Promise<[Product[], number]> {
    const where: FindOptionsWhere<Product> = {};

    if (options.name) {
      where.name = ILike(`%${options.name}%`);
    }

    if (options.status) {
      where.status = options.status;
    }

    return this.repo.findAndCount({
      where,
      relations: ["categories", "attributes"],
      order: { [options.sortBy]: options.sortOrder.toUpperCase() },
      skip: (options.page - 1) * options.limit,
      take: options.limit,
    });
  }
}
