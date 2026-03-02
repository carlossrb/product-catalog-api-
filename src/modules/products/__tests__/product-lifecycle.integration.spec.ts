import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "@nestjs/cqrs";
import { Cache } from "@nestjs/cache-manager";
import { BadRequestException } from "@nestjs/common";
import { Repository } from "typeorm";
import { CreateProductHandler } from "../commands/handlers/create-product.handler";
import { CreateProductCommand } from "../commands/impl/create-product.command";
import { UpdateProductHandler } from "../commands/handlers/update-product.handler";
import { UpdateProductCommand } from "../commands/impl/update-product.command";
import { ActivateProductHandler } from "../commands/handlers/activate-product.handler";
import { ActivateProductCommand } from "../commands/impl/activate-product.command";
import { ArchiveProductHandler } from "../commands/handlers/archive-product.handler";
import { ArchiveProductCommand } from "../commands/impl/archive-product.command";
import { AddCategoryHandler } from "../commands/handlers/add-category.handler";
import { AddCategoryCommand } from "../commands/impl/add-category.command";
import { AddAttributeHandler } from "../commands/handlers/add-attribute.handler";
import { AddAttributeCommand } from "../commands/impl/add-attribute.command";
import { RemoveAttributeHandler } from "../commands/handlers/remove-attribute.handler";
import { Product } from "../entities/product.entity";
import { ProductAttribute } from "../entities/product-attribute.entity";
import { ProductStatus } from "../entities/product-status.enum";
import { Category } from "../../categories/entities/category.entity";

interface StoredProduct {
  id: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  categories: Category[];
  attributes: ProductAttribute[];
  createdAt: Date;
  updatedAt: Date;
}

const store: {
  products: Map<string, StoredProduct>;
  attributes: Map<string, ProductAttribute>;
} = {
  products: new Map(),
  attributes: new Map(),
};

const productRepo = {
  create: vi.fn((data: Partial<Product>) => ({
    id: `prod-${Date.now()}`,
    status: ProductStatus.DRAFT,
    categories: [],
    attributes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  })),
  save: vi.fn((product: StoredProduct) => {
    store.products.set(product.id, { ...product });
    const attrs = [...store.attributes.values()].filter(
      (a) => a.productId === product.id,
    );
    return Promise.resolve({ ...product, attributes: attrs });
  }),
  findOne: vi.fn(
    ({ where }: { where: Record<string, unknown>; relations?: string[] }) => {
      if (where.name && where.id) {
        for (const [, p] of store.products) {
          if (
            p.name === where.name &&
            p.id !== (where.id as { _value: string })._value
          ) {
            return Promise.resolve(p);
          }
        }
        return Promise.resolve(null);
      }
      const product = store.products.get(where.id as string);
      if (!product) return Promise.resolve(null);
      const attrs = [...store.attributes.values()].filter(
        (a) => a.productId === product.id,
      );
      return Promise.resolve({ ...product, attributes: attrs });
    },
  ),
} as unknown as Repository<Product>;

const categoryRepo = {
  findOne: vi.fn(({ where }: { where: Record<string, unknown> }) => {
    if (where.id === "cat-1") {
      return Promise.resolve({
        id: "cat-1",
        name: "Vestuário",
        parentId: null,
      } as Category);
    }
    return Promise.resolve(null);
  }),
} as unknown as Repository<Category>;

const attrRepo = {
  create: vi.fn((data: Partial<ProductAttribute>) => ({
    id: `attr-${Date.now()}`,
    ...data,
  })),
  save: vi.fn((attr: ProductAttribute) => {
    store.attributes.set(attr.id, { ...attr });
    return Promise.resolve(attr);
  }),
  findOne: vi.fn(({ where }: { where: Record<string, unknown> }) => {
    if (where.id) {
      const attr = store.attributes.get(where.id as string);
      return Promise.resolve(attr ?? null);
    }
    for (const [, a] of store.attributes) {
      if (a.productId === where.productId && a.key === where.key) {
        return Promise.resolve(a);
      }
    }
    return Promise.resolve(null);
  }),
  remove: vi.fn((attr: ProductAttribute) => {
    store.attributes.delete(attr.id);
    return Promise.resolve(attr);
  }),
} as unknown as Repository<ProductAttribute>;

const eventBus = { publish: vi.fn() } as unknown as EventBus;

const cache = {
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
} as unknown as Cache;

describe("Product Lifecycle Integration", () => {
  const createHandler = new CreateProductHandler(productRepo, eventBus, cache);
  const updateHandler = new UpdateProductHandler(productRepo, eventBus, cache);
  const activateHandler = new ActivateProductHandler(
    productRepo,
    eventBus,
    cache,
  );
  const archiveHandler = new ArchiveProductHandler(
    productRepo,
    eventBus,
    cache,
  );
  const addCategoryHandler = new AddCategoryHandler(
    productRepo,
    categoryRepo,
    eventBus,
    cache,
  );
  const addAttributeHandler = new AddAttributeHandler(
    productRepo,
    attrRepo,
    eventBus,
    cache,
  );
  new RemoveAttributeHandler(productRepo, attrRepo, eventBus, cache);

  beforeEach(() => {
    vi.clearAllMocks();
    store.products.clear();
    store.attributes.clear();
  });

  it("deve completar o fluxo: criar >> adicionar categoria >> adicionar atributo >> ativar >> arquivar", async () => {
    const created = await createHandler.execute(
      new CreateProductCommand("Camiseta", "Algodão"),
    );
    expect(created.status).toBe(ProductStatus.DRAFT);

    await addCategoryHandler.execute(
      new AddCategoryCommand(created.id, "cat-1"),
    );

    const attr = await addAttributeHandler.execute(
      new AddAttributeCommand(created.id, "cor", "azul"),
    );
    expect(attr.key).toBe("cor");

    const activated = await activateHandler.execute(
      new ActivateProductCommand(created.id),
    );
    expect(activated.status).toBe(ProductStatus.ACTIVE);

    const archived = await archiveHandler.execute(
      new ArchiveProductCommand(created.id),
    );
    expect(archived.status).toBe(ProductStatus.ARCHIVED);

    expect(eventBus.publish).toHaveBeenCalledTimes(5);
  });

  it("deve rejeitar ativação sem categoria e sem atributo", async () => {
    const created = await createHandler.execute(
      new CreateProductCommand("Shorts", null),
    );

    await expect(
      activateHandler.execute(new ActivateProductCommand(created.id)),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve rejeitar alteração de nome após arquivamento", async () => {
    const created = await createHandler.execute(
      new CreateProductCommand("Calça", null),
    );

    await archiveHandler.execute(new ArchiveProductCommand(created.id));

    await expect(
      updateHandler.execute(new UpdateProductCommand(created.id, "Novo Nome")),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve permitir alterar descrição após arquivamento", async () => {
    const created = await createHandler.execute(
      new CreateProductCommand("Jaqueta", "Original"),
    );

    await archiveHandler.execute(new ArchiveProductCommand(created.id));

    const updated = await updateHandler.execute(
      new UpdateProductCommand(created.id, undefined, "Descrição atualizada"),
    );

    expect(updated.description).toBe("Descrição atualizada");
  });

  it("deve rejeitar adicionar atributo em produto arquivado", async () => {
    const created = await createHandler.execute(
      new CreateProductCommand("Boné", null),
    );

    await archiveHandler.execute(new ArchiveProductCommand(created.id));

    await expect(
      addAttributeHandler.execute(
        new AddAttributeCommand(created.id, "cor", "preto"),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve rejeitar adicionar categoria em produto arquivado", async () => {
    const created = await createHandler.execute(
      new CreateProductCommand("Meia", null),
    );

    await archiveHandler.execute(new ArchiveProductCommand(created.id));

    await expect(
      addCategoryHandler.execute(new AddCategoryCommand(created.id, "cat-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve rejeitar ativação de produto já arquivado", async () => {
    const created = await createHandler.execute(
      new CreateProductCommand("Luva", null),
    );

    await archiveHandler.execute(new ArchiveProductCommand(created.id));

    await expect(
      activateHandler.execute(new ActivateProductCommand(created.id)),
    ).rejects.toThrow(BadRequestException);
  });
});
