import { Inject } from "@nestjs/common";
import { CommandHandler, EventBus, ICommandHandler } from "@nestjs/cqrs";
import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { UpdateCategoryCommand } from "../impl/update-category.command";
import { Category } from "../../entities/category.entity";
import { CategoryUpdatedEvent } from "../../events/category.events";
import { CacheKeys } from "../../../../common/cache/cache-keys";
import {
  CATEGORY_REPOSITORY,
  CategoryRepositoryPort,
} from "../../ports/category.repository.port";

@CommandHandler(UpdateCategoryCommand)
export class UpdateCategoryHandler implements ICommandHandler<UpdateCategoryCommand> {
  private readonly logger = new Logger(UpdateCategoryHandler.name);

  constructor(
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepositoryPort,
    private readonly eventBus: EventBus,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async execute(command: UpdateCategoryCommand): Promise<Category> {
    const category = await this.categories.findById(command.id);

    if (!category) {
      throw new NotFoundException(`Category ${command.id} not found`);
    }

    const changes: Record<string, unknown> = {};

    if (command.name !== undefined && command.name !== category.name) {
      const duplicate = await this.categories.findByNameExcluding(
        command.name,
        command.id,
      );

      if (duplicate) {
        throw new ConflictException(
          `Category with name "${command.name}" already exists`,
        );
      }

      changes.name = command.name;
      category.name = command.name;
    }

    if (command.parentId !== undefined) {
      if (command.parentId === command.id) {
        throw new BadRequestException("A category cannot be its own parent");
      }

      if (command.parentId !== null) {
        const parent = await this.categories.findById(command.parentId);

        if (!parent) {
          throw new NotFoundException(
            `Parent category ${command.parentId} not found`,
          );
        }
      }

      changes.parentId = command.parentId;
      category.parentId = command.parentId;
    }

    if (Object.keys(changes).length === 0) {
      return category;
    }

    const saved = await this.categories.save(category);

    await this.cache.del(CacheKeys.category(saved.id));
    const currentVersion =
      (await this.cache.get<number>(CacheKeys.categoryListVersion())) ?? 0;
    await this.cache.set(CacheKeys.categoryListVersion(), currentVersion + 1);

    this.logger.log({ action: "updated", categoryId: saved.id, changes });
    this.eventBus.publish(new CategoryUpdatedEvent(saved.id, changes));

    return saved;
  }
}
