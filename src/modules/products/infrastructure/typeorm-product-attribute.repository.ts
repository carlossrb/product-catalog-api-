import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProductAttribute } from "../entities/product-attribute.entity";
import { ProductAttributeRepositoryPort } from "../ports/product-attribute.repository.port";

@Injectable()
export class TypeOrmProductAttributeRepository implements ProductAttributeRepositoryPort {
  constructor(
    @InjectRepository(ProductAttribute)
    private readonly repo: Repository<ProductAttribute>,
  ) {}

  create(data: {
    productId: string;
    key: string;
    value: string;
  }): ProductAttribute {
    return this.repo.create(data);
  }

  save(attribute: ProductAttribute): Promise<ProductAttribute> {
    return this.repo.save(attribute);
  }

  findByProductAndId(
    productId: string,
    attributeId: string,
  ): Promise<ProductAttribute | null> {
    return this.repo.findOne({
      where: { id: attributeId, productId },
    });
  }

  findByProductAndKey(
    productId: string,
    key: string,
  ): Promise<ProductAttribute | null> {
    return this.repo.findOne({ where: { productId, key } });
  }

  remove(attribute: ProductAttribute): Promise<ProductAttribute> {
    return this.repo.remove(attribute);
  }
}
