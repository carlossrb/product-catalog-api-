import { Inject } from "@nestjs/common";
import { CommandHandler, EventBus, ICommandHandler } from "@nestjs/cqrs";
import { Logger } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { CreateProductCommand } from "../impl/create-product.command";
import { Product } from "../../entities/product.entity";
import { ProductCreatedEvent } from "../../events/product.events";
import {
  PRODUCT_REPOSITORY,
  ProductRepositoryPort,
} from "../../ports/product.repository.port";

@CommandHandler(CreateProductCommand)
export class CreateProductHandler implements ICommandHandler<CreateProductCommand> {
  private readonly logger = new Logger(CreateProductHandler.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepositoryPort,
    private readonly eventBus: EventBus,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(command: CreateProductCommand): Promise<Product> {
    const product = this.products.create({
      name: command.name,
      description: command.description,
    });

    const saved = await this.products.save(product);

    this.logger.log({
      action: "created",
      productId: saved.id,
      name: saved.name,
    });
    this.eventBus.publish(new ProductCreatedEvent(saved.id, saved.name));

    return saved;
  }
}
