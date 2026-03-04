import { Inject } from "@nestjs/common";
import { CommandHandler, EventBus, ICommandHandler } from "@nestjs/cqrs";
import { Logger, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { AddCategoryCommand } from "../impl/add-category.command";
import { Product } from "../../entities/product.entity";
import { CategoryAddedToProductEvent } from "../../events/product.events";
import { CacheKeys } from "../../../../common/cache/cache-keys";
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from "../../ports/product.repository.port";
import {
  CATEGORY_REPOSITORY,
  CategoryRepositoryPort,
} from "../../../categories/ports/category.repository.port";

@CommandHandler(AddCategoryCommand)
export class AddCategoryHandler implements ICommandHandler<AddCategoryCommand> {
  private readonly logger = new Logger(AddCategoryHandler.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepositoryPort,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepositoryPort,
    private readonly eventBus: EventBus,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(command: AddCategoryCommand): Promise<Product> {
    const product = await this.products.findById(command.productId, [
      "categories",
    ]);

    if (!product) {
      throw new NotFoundException(`Product ${command.productId} not found`);
    }

    const category = await this.categories.findById(command.categoryId);

    if (!category) {
      throw new NotFoundException(`Category ${command.categoryId} not found`);
    }

    product.addCategory(category);

    const saved = await this.products.save(product);

    await this.cache.del(CacheKeys.product(product.id));

    this.logger.log({
      action: "category_added",
      productId: product.id,
      categoryId: category.id,
    });
    this.eventBus.publish(
      new CategoryAddedToProductEvent(product.id, category.id, category.name),
    );

    return saved;
  }
}
