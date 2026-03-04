import { Inject } from "@nestjs/common";
import { CommandHandler, EventBus, ICommandHandler } from "@nestjs/cqrs";
import { Logger, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { UpdateAttributeCommand } from "../impl/update-attribute.command";
import { ProductAttribute } from "../../entities/product-attribute.entity";
import { AttributeUpdatedEvent } from "../../events/product.events";
import { CacheKeys } from "../../../../common/cache/cache-keys";
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from "../../ports/product.repository.port";
import {
  PRODUCT_ATTRIBUTE_REPOSITORY,
  ProductAttributeRepositoryPort,
} from "../../ports/product-attribute.repository.port";

@CommandHandler(UpdateAttributeCommand)
export class UpdateAttributeHandler implements ICommandHandler<UpdateAttributeCommand> {
  private readonly logger = new Logger(UpdateAttributeHandler.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepositoryPort,
    @Inject(PRODUCT_ATTRIBUTE_REPOSITORY)
    private readonly attributes: ProductAttributeRepositoryPort,
    private readonly eventBus: EventBus,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(command: UpdateAttributeCommand): Promise<ProductAttribute> {
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

    const changes: Record<string, unknown> = {};

    if (command.key !== undefined) {
      changes.key = command.key;
      attribute.key = command.key;
    }

    if (command.value !== undefined) {
      changes.value = command.value;
      attribute.value = command.value;
    }

    if (Object.keys(changes).length === 0) {
      return attribute;
    }

    const saved = await this.attributes.save(attribute);

    await this.cache.del(CacheKeys.product(command.productId));

    this.logger.log({
      action: "attribute_updated",
      productId: product.id,
      attributeId: attribute.id,
      changes,
    });
    this.eventBus.publish(
      new AttributeUpdatedEvent(product.id, attribute.id, changes),
    );

    return saved;
  }
}
