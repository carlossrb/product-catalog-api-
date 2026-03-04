import { Inject } from "@nestjs/common";
import { CommandHandler, EventBus, ICommandHandler } from "@nestjs/cqrs";
import { Logger, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { RemoveAttributeCommand } from "../impl/remove-attribute.command";
import { AttributeRemovedEvent } from "../../events/product.events";
import { CacheKeys } from "../../../../common/cache/cache-keys";
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from "../../ports/product.repository.port";
import {
  PRODUCT_ATTRIBUTE_REPOSITORY,
  ProductAttributeRepositoryPort,
} from "../../ports/product-attribute.repository.port";

@CommandHandler(RemoveAttributeCommand)
export class RemoveAttributeHandler implements ICommandHandler<RemoveAttributeCommand> {
  private readonly logger = new Logger(RemoveAttributeHandler.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepositoryPort,
    @Inject(PRODUCT_ATTRIBUTE_REPOSITORY)
    private readonly attributes: ProductAttributeRepositoryPort,
    private readonly eventBus: EventBus,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(command: RemoveAttributeCommand): Promise<void> {
    const product = await this.products.findById(command.productId);

    if (!product) {
      throw new NotFoundException(`Product ${command.productId} not found`);
    }

    product.assertModifiable();

    const attribute = await this.attributes.findByProductAndId(
      command.productId,
      command.attributeId,
    );

    if (!attribute) {
      throw new NotFoundException(
        `Attribute ${command.attributeId} not found for product ${command.productId}`,
      );
    }

    await this.attributes.remove(attribute);

    await this.cache.del(CacheKeys.product(command.productId));

    this.logger.log({
      action: "attribute_removed",
      productId: product.id,
      attributeId: command.attributeId,
      key: attribute.key,
    });
    this.eventBus.publish(
      new AttributeRemovedEvent(product.id, command.attributeId, attribute.key),
    );
  }
}
