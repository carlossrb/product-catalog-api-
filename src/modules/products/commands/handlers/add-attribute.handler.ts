import { Inject } from "@nestjs/common";
import { CommandHandler, EventBus, ICommandHandler } from "@nestjs/cqrs";
import { ConflictException, Logger, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { AddAttributeCommand } from "../impl/add-attribute.command";
import { ProductAttribute } from "../../entities/product-attribute.entity";
import { AttributeAddedEvent } from "../../events/product.events";
import { CacheKeys } from "../../../../common/cache/cache-keys";
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from "../../ports/product.repository.port";
import {
  PRODUCT_ATTRIBUTE_REPOSITORY,
  ProductAttributeRepositoryPort,
} from "../../ports/product-attribute.repository.port";

@CommandHandler(AddAttributeCommand)
export class AddAttributeHandler implements ICommandHandler<AddAttributeCommand> {
  private readonly logger = new Logger(AddAttributeHandler.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepositoryPort,
    @Inject(PRODUCT_ATTRIBUTE_REPOSITORY)
    private readonly attributes: ProductAttributeRepositoryPort,
    private readonly eventBus: EventBus,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(command: AddAttributeCommand): Promise<ProductAttribute> {
    const product = await this.products.findById(command.productId);

    if (!product) {
      throw new NotFoundException(`Product ${command.productId} not found`);
    }

    product.assertModifiable();

    const existing = await this.attributes.findByProductAndKey(
      command.productId,
      command.key,
    );

    if (existing) {
      throw new ConflictException(
        `Attribute with key "${command.key}" already exists for this product`,
      );
    }

    const attribute = this.attributes.create({
      productId: command.productId,
      key: command.key,
      value: command.value,
    });

    const saved = await this.attributes.save(attribute);

    await this.cache.del(CacheKeys.product(command.productId));

    this.logger.log({
      action: "attribute_added",
      productId: product.id,
      key: command.key,
    });
    this.eventBus.publish(
      new AttributeAddedEvent(product.id, command.key, command.value),
    );

    return saved;
  }
}
