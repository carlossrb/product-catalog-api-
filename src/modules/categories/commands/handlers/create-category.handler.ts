import { Inject } from "@nestjs/common";
import { CommandHandler, EventBus, ICommandHandler } from "@nestjs/cqrs";
import { ConflictException, Logger, NotFoundException } from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { CreateCategoryCommand } from "../impl/create-category.command";
import { Category } from "../../entities/category.entity";
import { CategoryCreatedEvent } from "../../events/category.events";
import { CacheKeys } from "../../../../common/cache/cache-keys";
import {
  CATEGORY_REPOSITORY,
  CategoryRepositoryPort,
} from "../../ports/category.repository.port";

@CommandHandler(CreateCategoryCommand)
export class CreateCategoryHandler implements ICommandHandler<CreateCategoryCommand> {
  private readonly logger = new Logger(CreateCategoryHandler.name);

  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepositoryPort,
    private readonly eventBus: EventBus,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(command: CreateCategoryCommand): Promise<Category> {
    const existing = await this.categories.findByName(command.name);

    if (existing) {
      throw new ConflictException(
        `Category with name "${command.name}" already exists`,
      );
    }

    if (command.parentId) {
      const parent = await this.categories.findById(command.parentId);

      if (!parent) {
        throw new NotFoundException(
          `Parent category ${command.parentId} not found`,
        );
      }
    }

    const category = this.categories.create({
      name: command.name,
      parentId: command.parentId,
    });

    const saved = await this.categories.save(category);

    const currentVersion =
      (await this.cache.get<number>(CacheKeys.categoryListVersion())) ?? 0;
    await this.cache.set(CacheKeys.categoryListVersion(), currentVersion + 1);

    this.logger.log({
      action: "created",
      categoryId: saved.id,
      name: saved.name,
    });
    this.eventBus.publish(
      new CategoryCreatedEvent(saved.id, saved.name, saved.parentId),
    );

    return saved;
  }
}
