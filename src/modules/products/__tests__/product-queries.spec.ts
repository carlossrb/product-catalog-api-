import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { Cache } from "@nestjs/cache-manager";
import { GetProductHandler } from "../queries/handlers/get-product.handler";
import { GetProductQuery } from "../queries/impl/get-product.query";
import { ListProductsHandler } from "../queries/handlers/list-products.handler";
import { ListProductsQuery } from "../queries/impl/list-products.query";
import { Product } from "../entities/product.entity";
import { ProductStatus } from "../entities/product-status.enum";
import { ProductRepositoryPort } from "../ports/product.repository.port";

const mockProductRepo = (): ProductRepositoryPort => ({
  create: vi.fn(),
  save: vi.fn(),
  findById: vi.fn(),
  findDuplicateName: vi.fn(),
  findAll: vi.fn(),
});

const mockCache = () =>
  ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  }) as unknown as Cache;

const buildProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: "prod-1",
    name: "Camiseta",
    description: null,
    status: ProductStatus.DRAFT,
    categories: [],
    attributes: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Product;

describe("GetProductHandler", () => {
  const repo = mockProductRepo();
  const cache = mockCache();
  const handler = new GetProductHandler(repo, cache);

  beforeEach(() => vi.clearAllMocks());

  it("deve retornar produto com categorias e atributos", async () => {
    const product = buildProduct();
    vi.mocked(repo.findById).mockResolvedValue(product);

    const result = await handler.execute(new GetProductQuery("prod-1"));

    expect(result).toBe(product);
    expect(repo.findById).toHaveBeenCalledWith("prod-1", [
      "categories",
      "attributes",
    ]);
  });

  it("deve lançar NotFoundException quando produto não existe", async () => {
    vi.mocked(repo.findById).mockResolvedValue(null);

    await expect(
      handler.execute(new GetProductQuery("inexistente")),
    ).rejects.toThrow(NotFoundException);
  });
});

describe("ListProductsHandler", () => {
  const repo = mockProductRepo();
  const handler = new ListProductsHandler(repo);

  beforeEach(() => vi.clearAllMocks());

  it("deve retornar lista paginada com defaults", async () => {
    const products = [buildProduct()];
    vi.mocked(repo.findAll).mockResolvedValue([products, 1]);

    const result = await handler.execute(new ListProductsQuery());

    expect(result).toEqual({
      data: products,
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it("deve filtrar por nome parcial", async () => {
    vi.mocked(repo.findAll).mockResolvedValue([[], 0]);

    await handler.execute(
      new ListProductsQuery("camis", undefined, "createdAt", "desc", 1, 10),
    );

    expect(repo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ name: "camis" }),
    );
  });

  it("deve filtrar por status", async () => {
    vi.mocked(repo.findAll).mockResolvedValue([[], 0]);

    await handler.execute(
      new ListProductsQuery(
        undefined,
        ProductStatus.ACTIVE,
        "createdAt",
        "desc",
        1,
        10,
      ),
    );

    expect(repo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ status: ProductStatus.ACTIVE }),
    );
  });

  it("deve respeitar paginação", async () => {
    vi.mocked(repo.findAll).mockResolvedValue([[], 0]);

    await handler.execute(
      new ListProductsQuery(undefined, undefined, "name", "asc", 3, 5),
    );

    expect(repo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3, limit: 5 }),
    );
  });
});
