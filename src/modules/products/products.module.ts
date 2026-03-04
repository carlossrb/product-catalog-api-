import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Product } from "./entities/product.entity";
import { ProductAttribute } from "./entities/product-attribute.entity";
import { Category } from "../categories/entities/category.entity";
import { ProductsController } from "./products.controller";
import { ProductCommandHandlers } from "./commands";
import { ProductQueryHandlers } from "./queries";
import { PRODUCT_REPOSITORY } from "./ports/product.repository.port";
import { PRODUCT_ATTRIBUTE_REPOSITORY } from "./ports/product-attribute.repository.port";
import { CATEGORY_REPOSITORY } from "../categories/ports/category.repository.port";
import { TypeOrmProductRepository } from "./infrastructure/typeorm-product.repository";
import { TypeOrmProductAttributeRepository } from "./infrastructure/typeorm-product-attribute.repository";
import { TypeOrmCategoryRepository } from "../categories/infrastructure/typeorm-category.repository";

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([Product, ProductAttribute, Category]),
  ],
  controllers: [ProductsController],
  providers: [
    ...ProductCommandHandlers,
    ...ProductQueryHandlers,
    { provide: PRODUCT_REPOSITORY, useClass: TypeOrmProductRepository },
    {
      provide: PRODUCT_ATTRIBUTE_REPOSITORY,
      useClass: TypeOrmProductAttributeRepository,
    },
    { provide: CATEGORY_REPOSITORY, useClass: TypeOrmCategoryRepository },
  ],
})
export class ProductsModule {}
