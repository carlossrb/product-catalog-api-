import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventBus } from "@nestjs/cqrs";
import { Cache } from "@nestjs/cache-manager";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
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
import { RemoveCategoryHandler } from "../commands/handlers/remove-category.handler";
import { RemoveCategoryCommand } from "../commands/impl/remove-category.command";
import { AddAttributeHandler } from "../commands/handlers/add-attribute.handler";
import { AddAttributeCommand } from "../commands/impl/add-attribute.command";
import { UpdateAttributeHandler } from "../commands/handlers/update-attribute.handler";
import { UpdateAttributeCommand } from "../commands/impl/update-attribute.command";
import { RemoveAttributeHandler } from "../commands/handlers/remove-attribute.handler";
import { RemoveAttributeCommand } from "../commands/impl/remove-attribute.command";
import { Product } from "../entities/product.entity";
import { ProductAttribute } from "../entities/product-attribute.entity";
import { ProductStatus } from "../entities/product-status.enum";
import { Category } from "../../categories/entities/category.entity";
import { ProductRepositoryPort } from "../ports/product.repository.port";
import { ProductAttributeRepositoryPort } from "../ports/product-attribute.repository.port";
import { CategoryRepositoryPort } from "../../categories/ports/category.repository.port";

const mockProductRepo = (): ProductRepositoryPort => ({
  create: vi.fn(),
  save: vi.fn(),
  findById: vi.fn(),
  findDuplicateName: vi.fn(),
  findAll: vi.fn(),
});

const mockAttrRepo = (): ProductAttributeRepositoryPort => ({
  create: vi.fn(),
  save: vi.fn(),
  findByProductAndId: vi.fn(),
  findByProductAndKey: vi.fn(),
  remove: vi.fn(),
});

const mockCategoryRepo = (): CategoryRepositoryPort => ({
  create: vi.fn(),
  save: vi.fn(),
  findById: vi.fn(),
  findByName: vi.fn(),
  findByNameExcluding: vi.fn(),
  findAll: vi.fn(),
});

const mockEventBus = () => ({ publish: vi.fn() }) as unknown as EventBus;

const mockCache = () =>
  ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  }) as unknown as Cache;

const buildProduct = (overrides: Partial<Product> = {}): Product => {
  const p = Object.assign(new Product(), {
    id: "prod-1",
    name: "Camiseta",
    description: null,
    status: ProductStatus.DRAFT,
    categories: [] as Category[],
    attributes: [] as ProductAttribute[],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  return p;
};

const buildCategory = (overrides: Partial<Category> = {}): Category =>
  ({
    id: "cat-1",
    name: "Vestuário",
    parentId: null,
    ...overrides,
  }) as Category;

const buildAttribute = (
  overrides: Partial<ProductAttribute> = {},
): ProductAttribute =>
  ({
    id: "attr-1",
    key: "cor",
    value: "azul",
    productId: "prod-1",
    ...overrides,
  }) as ProductAttribute;

describe("CreateProductHandler", () => {
  const repo = mockProductRepo();
  const eventBus = mockEventBus();
  const cache = mockCache();
  const handler = new CreateProductHandler(repo, eventBus, cache);

  beforeEach(() => vi.clearAllMocks());

  it("deve criar produto com status DRAFT", async () => {
    const saved = buildProduct();
    vi.mocked(repo.create).mockReturnValue(saved);
    vi.mocked(repo.save).mockResolvedValue(saved);

    const result = await handler.execute(
      new CreateProductCommand("Camiseta", null),
    );

    expect(result.status).toBe(ProductStatus.DRAFT);
    expect(repo.create).toHaveBeenCalledWith({
      name: "Camiseta",
      description: null,
    });
    expect(eventBus.publish).toHaveBeenCalledOnce();
  });

  it("deve criar produto com descrição", async () => {
    const saved = buildProduct({ description: "Algodão 100%" });
    vi.mocked(repo.create).mockReturnValue(saved);
    vi.mocked(repo.save).mockResolvedValue(saved);

    const result = await handler.execute(
      new CreateProductCommand("Camiseta", "Algodão 100%"),
    );

    expect(result.description).toBe("Algodão 100%");
  });
});

describe("UpdateProductHandler", () => {
  const repo = mockProductRepo();
  const eventBus = mockEventBus();
  const cache = mockCache();
  const handler = new UpdateProductHandler(repo, eventBus, cache);

  beforeEach(() => vi.clearAllMocks());

  it("deve atualizar nome e descrição de produto DRAFT", async () => {
    const product = buildProduct();
    vi.mocked(repo.findById).mockResolvedValue(product);
    vi.mocked(repo.save).mockResolvedValue({
      ...product,
      name: "Premium",
      description: "Nova",
    } as Product);

    await handler.execute(
      new UpdateProductCommand("prod-1", "Premium", "Nova"),
    );

    expect(repo.save).toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledOnce();
  });

  it("deve permitir atualizar apenas descrição de produto ARCHIVED", async () => {
    const product = buildProduct({ status: ProductStatus.ARCHIVED });
    vi.mocked(repo.findById).mockResolvedValue(product);
    vi.mocked(repo.save).mockResolvedValue({
      ...product,
      description: "Atualizada",
    } as Product);

    await handler.execute(
      new UpdateProductCommand("prod-1", undefined, "Atualizada"),
    );

    expect(repo.save).toHaveBeenCalled();
  });

  it("deve rejeitar alteração de nome em produto ARCHIVED", async () => {
    const product = buildProduct({ status: ProductStatus.ARCHIVED });
    vi.mocked(repo.findById).mockResolvedValue(product);

    await expect(
      handler.execute(new UpdateProductCommand("prod-1", "Novo Nome")),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve lançar NotFoundException quando produto não existe", async () => {
    vi.mocked(repo.findById).mockResolvedValue(null);

    await expect(
      handler.execute(new UpdateProductCommand("inexistente", "Nome")),
    ).rejects.toThrow(NotFoundException);
  });

  it("deve retornar produto sem salvar quando não há alterações", async () => {
    const product = buildProduct();
    vi.mocked(repo.findById).mockResolvedValue(product);

    const result = await handler.execute(new UpdateProductCommand("prod-1"));

    expect(result).toBe(product);
    expect(repo.save).not.toHaveBeenCalled();
    expect(eventBus.publish).not.toHaveBeenCalled();
  });
});

describe("ActivateProductHandler", () => {
  const repo = mockProductRepo();
  const eventBus = mockEventBus();
  const cache = mockCache();
  const handler = new ActivateProductHandler(repo, eventBus, cache);

  beforeEach(() => vi.clearAllMocks());

  it("deve ativar produto DRAFT com categorias e atributos", async () => {
    const product = buildProduct({
      categories: [buildCategory()],
      attributes: [buildAttribute()],
    });

    vi.mocked(repo.findById).mockResolvedValue(product);
    vi.mocked(repo.findDuplicateName).mockResolvedValue(null);
    vi.mocked(repo.save).mockResolvedValue({
      ...product,
      status: ProductStatus.ACTIVE,
    } as Product);

    const result = await handler.execute(new ActivateProductCommand("prod-1"));

    expect(result.status).toBe(ProductStatus.ACTIVE);
    expect(eventBus.publish).toHaveBeenCalledOnce();
  });

  it("deve rejeitar ativação de produto ARCHIVED", async () => {
    const product = buildProduct({ status: ProductStatus.ARCHIVED });
    vi.mocked(repo.findById).mockResolvedValue(product);

    await expect(
      handler.execute(new ActivateProductCommand("prod-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve rejeitar ativação de produto já ACTIVE", async () => {
    const product = buildProduct({ status: ProductStatus.ACTIVE });
    vi.mocked(repo.findById).mockResolvedValue(product);

    await expect(
      handler.execute(new ActivateProductCommand("prod-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve rejeitar quando não tem categorias", async () => {
    const product = buildProduct({
      categories: [],
      attributes: [buildAttribute()],
    });

    vi.mocked(repo.findById).mockResolvedValue(product);
    vi.mocked(repo.findDuplicateName).mockResolvedValue(null);

    await expect(
      handler.execute(new ActivateProductCommand("prod-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve rejeitar quando não tem atributos", async () => {
    const product = buildProduct({
      categories: [buildCategory()],
      attributes: [],
    });

    vi.mocked(repo.findById).mockResolvedValue(product);
    vi.mocked(repo.findDuplicateName).mockResolvedValue(null);

    await expect(
      handler.execute(new ActivateProductCommand("prod-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve rejeitar quando existe outro produto com mesmo nome", async () => {
    const product = buildProduct({
      categories: [buildCategory()],
      attributes: [buildAttribute()],
    });
    const duplicate = buildProduct({ id: "prod-2" });

    vi.mocked(repo.findById).mockResolvedValue(product);
    vi.mocked(repo.findDuplicateName).mockResolvedValue(duplicate);

    await expect(
      handler.execute(new ActivateProductCommand("prod-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve reportar múltiplas violações de uma vez", async () => {
    const product = buildProduct({ categories: [], attributes: [] });
    const duplicate = buildProduct({ id: "prod-2" });

    vi.mocked(repo.findById).mockResolvedValue(product);
    vi.mocked(repo.findDuplicateName).mockResolvedValue(duplicate);

    try {
      await handler.execute(new ActivateProductCommand("prod-1"));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as {
        violations: string[];
      };
      expect(response.violations).toHaveLength(3);
    }
  });

  it("deve lançar NotFoundException quando produto não existe", async () => {
    vi.mocked(repo.findById).mockResolvedValue(null);

    await expect(
      handler.execute(new ActivateProductCommand("inexistente")),
    ).rejects.toThrow(NotFoundException);
  });
});

describe("ArchiveProductHandler", () => {
  const repo = mockProductRepo();
  const eventBus = mockEventBus();
  const cache = mockCache();
  const handler = new ArchiveProductHandler(repo, eventBus, cache);

  beforeEach(() => vi.clearAllMocks());

  it("deve arquivar produto DRAFT", async () => {
    const product = buildProduct();
    vi.mocked(repo.findById).mockResolvedValue(product);
    vi.mocked(repo.save).mockResolvedValue({
      ...product,
      status: ProductStatus.ARCHIVED,
    } as Product);

    const result = await handler.execute(new ArchiveProductCommand("prod-1"));

    expect(result.status).toBe(ProductStatus.ARCHIVED);
    expect(eventBus.publish).toHaveBeenCalledOnce();
  });

  it("deve arquivar produto ACTIVE", async () => {
    const product = buildProduct({ status: ProductStatus.ACTIVE });
    vi.mocked(repo.findById).mockResolvedValue(product);
    vi.mocked(repo.save).mockResolvedValue({
      ...product,
      status: ProductStatus.ARCHIVED,
    } as Product);

    const result = await handler.execute(new ArchiveProductCommand("prod-1"));

    expect(result.status).toBe(ProductStatus.ARCHIVED);
  });

  it("deve rejeitar produto já ARCHIVED", async () => {
    const product = buildProduct({ status: ProductStatus.ARCHIVED });
    vi.mocked(repo.findById).mockResolvedValue(product);

    await expect(
      handler.execute(new ArchiveProductCommand("prod-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve lançar NotFoundException quando produto não existe", async () => {
    vi.mocked(repo.findById).mockResolvedValue(null);

    await expect(
      handler.execute(new ArchiveProductCommand("inexistente")),
    ).rejects.toThrow(NotFoundException);
  });
});

describe("AddCategoryHandler", () => {
  const productRepo = mockProductRepo();
  const categoryRepo = mockCategoryRepo();
  const eventBus = mockEventBus();
  const cache = mockCache();
  const handler = new AddCategoryHandler(
    productRepo,
    categoryRepo,
    eventBus,
    cache,
  );

  beforeEach(() => vi.clearAllMocks());

  it("deve associar categoria ao produto", async () => {
    const product = buildProduct();
    const category = buildCategory();

    vi.mocked(productRepo.findById).mockResolvedValue(product);
    vi.mocked(categoryRepo.findById).mockResolvedValue(category);
    vi.mocked(productRepo.save).mockResolvedValue(product);

    await handler.execute(new AddCategoryCommand("prod-1", "cat-1"));

    expect(productRepo.save).toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledOnce();
  });

  it("deve rejeitar quando produto é ARCHIVED", async () => {
    const product = buildProduct({ status: ProductStatus.ARCHIVED });
    const category = buildCategory();
    vi.mocked(productRepo.findById).mockResolvedValue(product);
    vi.mocked(categoryRepo.findById).mockResolvedValue(category);

    await expect(
      handler.execute(new AddCategoryCommand("prod-1", "cat-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve rejeitar quando produto não existe", async () => {
    vi.mocked(productRepo.findById).mockResolvedValue(null);

    await expect(
      handler.execute(new AddCategoryCommand("inexistente", "cat-1")),
    ).rejects.toThrow(NotFoundException);
  });

  it("deve rejeitar quando categoria não existe", async () => {
    const product = buildProduct();
    vi.mocked(productRepo.findById).mockResolvedValue(product);
    vi.mocked(categoryRepo.findById).mockResolvedValue(null);

    await expect(
      handler.execute(new AddCategoryCommand("prod-1", "inexistente")),
    ).rejects.toThrow(NotFoundException);
  });

  it("deve rejeitar quando categoria já está associada", async () => {
    const category = buildCategory();
    const product = buildProduct({ categories: [category] });

    vi.mocked(productRepo.findById).mockResolvedValue(product);
    vi.mocked(categoryRepo.findById).mockResolvedValue(category);

    await expect(
      handler.execute(new AddCategoryCommand("prod-1", "cat-1")),
    ).rejects.toThrow(ConflictException);
  });
});

describe("RemoveCategoryHandler", () => {
  const repo = mockProductRepo();
  const eventBus = mockEventBus();
  const cache = mockCache();
  const handler = new RemoveCategoryHandler(repo, eventBus, cache);

  beforeEach(() => vi.clearAllMocks());

  it("deve remover categoria do produto", async () => {
    const category = buildCategory();
    const product = buildProduct({ categories: [category] });

    vi.mocked(repo.findById).mockResolvedValue(product);
    vi.mocked(repo.save).mockResolvedValue(product);

    await handler.execute(new RemoveCategoryCommand("prod-1", "cat-1"));

    expect(repo.save).toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledOnce();
  });

  it("deve rejeitar quando produto é ARCHIVED", async () => {
    const product = buildProduct({ status: ProductStatus.ARCHIVED });
    vi.mocked(repo.findById).mockResolvedValue(product);

    await expect(
      handler.execute(new RemoveCategoryCommand("prod-1", "cat-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve rejeitar quando categoria não está associada", async () => {
    const product = buildProduct();
    vi.mocked(repo.findById).mockResolvedValue(product);

    await expect(
      handler.execute(new RemoveCategoryCommand("prod-1", "cat-x")),
    ).rejects.toThrow(BadRequestException);
  });
});

describe("AddAttributeHandler", () => {
  const productRepo = mockProductRepo();
  const attrRepo = mockAttrRepo();
  const eventBus = mockEventBus();
  const cache = mockCache();
  const handler = new AddAttributeHandler(
    productRepo,
    attrRepo,
    eventBus,
    cache,
  );

  beforeEach(() => vi.clearAllMocks());

  it("deve adicionar atributo ao produto", async () => {
    const product = buildProduct();
    const saved = buildAttribute();

    vi.mocked(productRepo.findById).mockResolvedValue(product);
    vi.mocked(attrRepo.findByProductAndKey).mockResolvedValue(null);
    vi.mocked(attrRepo.create).mockReturnValue(saved);
    vi.mocked(attrRepo.save).mockResolvedValue(saved);

    const result = await handler.execute(
      new AddAttributeCommand("prod-1", "cor", "azul"),
    );

    expect(result.key).toBe("cor");
    expect(eventBus.publish).toHaveBeenCalledOnce();
  });

  it("deve rejeitar quando produto é ARCHIVED", async () => {
    const product = buildProduct({ status: ProductStatus.ARCHIVED });
    vi.mocked(productRepo.findById).mockResolvedValue(product);

    await expect(
      handler.execute(new AddAttributeCommand("prod-1", "cor", "azul")),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve rejeitar quando key já existe no produto", async () => {
    const product = buildProduct();
    const existing = buildAttribute();

    vi.mocked(productRepo.findById).mockResolvedValue(product);
    vi.mocked(attrRepo.findByProductAndKey).mockResolvedValue(existing);

    await expect(
      handler.execute(new AddAttributeCommand("prod-1", "cor", "verde")),
    ).rejects.toThrow(ConflictException);
  });

  it("deve rejeitar quando produto não existe", async () => {
    vi.mocked(productRepo.findById).mockResolvedValue(null);

    await expect(
      handler.execute(new AddAttributeCommand("inexistente", "cor", "azul")),
    ).rejects.toThrow(NotFoundException);
  });
});

describe("UpdateAttributeHandler", () => {
  const productRepo = mockProductRepo();
  const attrRepo = mockAttrRepo();
  const eventBus = mockEventBus();
  const cache = mockCache();
  const handler = new UpdateAttributeHandler(
    productRepo,
    attrRepo,
    eventBus,
    cache,
  );

  beforeEach(() => vi.clearAllMocks());

  it("deve atualizar valor do atributo", async () => {
    const product = buildProduct();
    const attr = buildAttribute();

    vi.mocked(productRepo.findById).mockResolvedValue(product);
    vi.mocked(attrRepo.findByProductAndId).mockResolvedValue(attr);
    vi.mocked(attrRepo.save).mockResolvedValue({
      ...attr,
      value: "verde",
    } as ProductAttribute);

    await handler.execute(
      new UpdateAttributeCommand("prod-1", "attr-1", undefined, "verde"),
    );

    expect(attrRepo.save).toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledOnce();
  });

  it("deve atualizar key e value do atributo", async () => {
    const product = buildProduct();
    const attr = buildAttribute();

    vi.mocked(productRepo.findById).mockResolvedValue(product);
    vi.mocked(attrRepo.findByProductAndId).mockResolvedValue(attr);
    vi.mocked(attrRepo.save).mockResolvedValue({
      ...attr,
      key: "tamanho",
      value: "M",
    } as ProductAttribute);

    await handler.execute(
      new UpdateAttributeCommand("prod-1", "attr-1", "tamanho", "M"),
    );

    expect(attrRepo.save).toHaveBeenCalled();
  });

  it("deve retornar atributo sem salvar quando não há alterações", async () => {
    const product = buildProduct();
    const attr = buildAttribute();

    vi.mocked(productRepo.findById).mockResolvedValue(product);
    vi.mocked(attrRepo.findByProductAndId).mockResolvedValue(attr);

    const result = await handler.execute(
      new UpdateAttributeCommand("prod-1", "attr-1"),
    );

    expect(result).toBe(attr);
    expect(attrRepo.save).not.toHaveBeenCalled();
  });

  it("deve rejeitar quando produto é ARCHIVED", async () => {
    const product = buildProduct({ status: ProductStatus.ARCHIVED });
    vi.mocked(productRepo.findById).mockResolvedValue(product);

    await expect(
      handler.execute(
        new UpdateAttributeCommand("prod-1", "attr-1", undefined, "x"),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve rejeitar quando atributo não existe", async () => {
    const product = buildProduct();
    vi.mocked(productRepo.findById).mockResolvedValue(product);
    vi.mocked(attrRepo.findByProductAndId).mockResolvedValue(null);

    await expect(
      handler.execute(
        new UpdateAttributeCommand("prod-1", "inexistente", undefined, "x"),
      ),
    ).rejects.toThrow(NotFoundException);
  });
});

describe("RemoveAttributeHandler", () => {
  const productRepo = mockProductRepo();
  const attrRepo = mockAttrRepo();
  const eventBus = mockEventBus();
  const cache = mockCache();
  const handler = new RemoveAttributeHandler(
    productRepo,
    attrRepo,
    eventBus,
    cache,
  );

  beforeEach(() => vi.clearAllMocks());

  it("deve remover atributo do produto", async () => {
    const product = buildProduct();
    const attr = buildAttribute();

    vi.mocked(productRepo.findById).mockResolvedValue(product);
    vi.mocked(attrRepo.findByProductAndId).mockResolvedValue(attr);
    vi.mocked(attrRepo.remove).mockResolvedValue(attr);

    await handler.execute(new RemoveAttributeCommand("prod-1", "attr-1"));

    expect(attrRepo.remove).toHaveBeenCalledWith(attr);
    expect(eventBus.publish).toHaveBeenCalledOnce();
  });

  it("deve rejeitar quando produto é ARCHIVED", async () => {
    const product = buildProduct({ status: ProductStatus.ARCHIVED });
    vi.mocked(productRepo.findById).mockResolvedValue(product);

    await expect(
      handler.execute(new RemoveAttributeCommand("prod-1", "attr-1")),
    ).rejects.toThrow(BadRequestException);
  });

  it("deve rejeitar quando atributo não existe", async () => {
    const product = buildProduct();
    vi.mocked(productRepo.findById).mockResolvedValue(product);
    vi.mocked(attrRepo.findByProductAndId).mockResolvedValue(null);

    await expect(
      handler.execute(new RemoveAttributeCommand("prod-1", "inexistente")),
    ).rejects.toThrow(NotFoundException);
  });

  it("deve rejeitar quando produto não existe", async () => {
    vi.mocked(productRepo.findById).mockResolvedValue(null);

    await expect(
      handler.execute(new RemoveAttributeCommand("inexistente", "attr-1")),
    ).rejects.toThrow(NotFoundException);
  });
});
