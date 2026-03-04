import { Inject } from "@nestjs/common";
import { CommandHandler, EventBus, ICommandHandler } from "@nestjs/cqrs";
import { Logger, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { RemoveCategoryCommand } from "../impl/remove-category.command";
import { Product } from "../../entities/product.entity";
import { CategoryRemovedFromProductEvent } from "../../events/product.events";
import { CacheKeys } from "../../../../common/cache/cache-keys";
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from "../../ports/product.repository.port";

@CommandHandler(RemoveCategoryCommand)
export class RemoveCategoryHandler implements ICommandHandler<RemoveCategoryCommand> {
  private readonly logger = new Logger(RemoveCategoryHandler.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepositoryPort,
    private readonly eventBus: EventBus,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(command: RemoveCategoryCommand): Promise<Product> {
    const product = await this.products.findById(command.productId, [
      "categories",
    ]);

    if (!product) {
      throw new NotFoundException(`Product ${command.productId} not found`);
    }

    product.removeCategory(command.categoryId);

    const saved = await this.products.save(product);

    await this.cache.del(CacheKeys.product(product.id));

    this.logger.log({
      action: "category_removed",
      productId: product.id,
      categoryId: command.categoryId,
    });
    this.eventBus.publish(
      new CategoryRemovedFromProductEvent(product.id, command.categoryId),
    );

    return saved;
  }
}
