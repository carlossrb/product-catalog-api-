import { Inject } from "@nestjs/common";
import { CommandHandler, EventBus, ICommandHandler } from "@nestjs/cqrs";
import { Logger, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { UpdateProductCommand } from "../impl/update-product.command";
import { Product } from "../../entities/product.entity";
import { ProductUpdatedEvent } from "../../events/product.events";
import { CacheKeys } from "../../../../common/cache/cache-keys";
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from "../../ports/product.repository.port";

@CommandHandler(UpdateProductCommand)
export class UpdateProductHandler implements ICommandHandler<UpdateProductCommand> {
  private readonly logger = new Logger(UpdateProductHandler.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepositoryPort,
    private readonly eventBus: EventBus,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(command: UpdateProductCommand): Promise<Product> {
    const product = await this.products.findById(command.id);

    if (!product) {
      throw new NotFoundException(`Product ${command.id} not found`);
    }

    const changes = product.applyUpdate(command.name, command.description);

    if (Object.keys(changes).length === 0) {
      return product;
    }

    const saved = await this.products.save(product);

    await this.cache.del(CacheKeys.product(saved.id));

    this.logger.log({ action: "updated", productId: saved.id, changes });
    this.eventBus.publish(new ProductUpdatedEvent(saved.id, changes));

    return saved;
  }
}
