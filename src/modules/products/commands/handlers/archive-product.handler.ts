import { Inject } from "@nestjs/common";
import { CommandHandler, EventBus, ICommandHandler } from "@nestjs/cqrs";
import { Logger, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { ArchiveProductCommand } from "../impl/archive-product.command";
import { Product } from "../../entities/product.entity";
import { ProductArchivedEvent } from "../../events/product.events";
import { CacheKeys } from "../../../../common/cache/cache-keys";
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from "../../ports/product.repository.port";

@CommandHandler(ArchiveProductCommand)
export class ArchiveProductHandler implements ICommandHandler<ArchiveProductCommand> {
  private readonly logger = new Logger(ArchiveProductHandler.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepositoryPort,
    private readonly eventBus: EventBus,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(command: ArchiveProductCommand): Promise<Product> {
    const product = await this.products.findById(command.id);

    if (!product) {
      throw new NotFoundException(`Product ${command.id} not found`);
    }

    product.archive();

    const saved = await this.products.save(product);

    await this.cache.del(CacheKeys.product(saved.id));

    this.logger.log({
      action: "archived",
      productId: saved.id,
      name: saved.name,
    });
    this.eventBus.publish(new ProductArchivedEvent(saved.id, saved.name));

    return saved;
  }
}
