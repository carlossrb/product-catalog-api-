import { Inject } from "@nestjs/common";
import { CommandHandler, EventBus, ICommandHandler } from "@nestjs/cqrs";
import { Logger, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { ActivateProductCommand } from "../impl/activate-product.command";
import { Product } from "../../entities/product.entity";
import { ProductActivatedEvent } from "../../events/product.events";
import { CacheKeys } from "../../../../common/cache/cache-keys";
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from "../../ports/product.repository.port";

@CommandHandler(ActivateProductCommand)
export class ActivateProductHandler implements ICommandHandler<ActivateProductCommand> {
  private readonly logger = new Logger(ActivateProductHandler.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepositoryPort,
    private readonly eventBus: EventBus,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(command: ActivateProductCommand): Promise<Product> {
    const product = await this.products.findById(command.id, [
      "categories",
      "attributes",
    ]);

    if (!product) {
      throw new NotFoundException(`Product ${command.id} not found`);
    }

    const duplicate = await this.products.findDuplicateName(
      product.name,
      product.id,
    );

    product.activate(!!duplicate);

    const saved = await this.products.save(product);

    await this.cache.del(CacheKeys.product(saved.id));

    this.logger.log({
      action: "activated",
      productId: saved.id,
      name: saved.name,
    });
    this.eventBus.publish(new ProductActivatedEvent(saved.id, saved.name));

    return saved;
  }
}
