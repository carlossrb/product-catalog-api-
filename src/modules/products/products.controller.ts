import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { ApiOperation, ApiResponse } from "@nestjs/swagger";
import { ApiTagWithDescription } from "../../common/decorators/api-tag.decorator";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import {
  AddAttributeDto,
  UpdateAttributeDto,
} from "./dto/manage-attribute.dto";
import { QueryProductsDto } from "./dto/query-products.dto";
import { CreateProductCommand } from "./commands/impl/create-product.command";
import { UpdateProductCommand } from "./commands/impl/update-product.command";
import { ActivateProductCommand } from "./commands/impl/activate-product.command";
import { ArchiveProductCommand } from "./commands/impl/archive-product.command";
import { AddCategoryCommand } from "./commands/impl/add-category.command";
import { RemoveCategoryCommand } from "./commands/impl/remove-category.command";
import { AddAttributeCommand } from "./commands/impl/add-attribute.command";
import { UpdateAttributeCommand } from "./commands/impl/update-attribute.command";
import { RemoveAttributeCommand } from "./commands/impl/remove-attribute.command";
import { GetProductQuery } from "./queries/impl/get-product.query";
import { ListProductsQuery } from "./queries/impl/list-products.query";
import { Product } from "./entities/product.entity";
import { ProductAttribute } from "./entities/product-attribute.entity";

@Controller("products")
@ApiTagWithDescription("Products", "Gerenciamento de produtos do catálogo")
export class ProductsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({ summary: "Criar produto (status inicial: DRAFT)" })
  @ApiResponse({ status: 201, description: "Produto criado" })
  async create(@Body() dto: CreateProductDto): Promise<Product> {
    return this.commandBus.execute(
      new CreateProductCommand(dto.name, dto.description ?? null),
    );
  }

  @Get()
  @ApiOperation({ summary: "Listar produtos com filtros e paginação" })
  @ApiResponse({ status: 200, description: "Lista de produtos" })
  async findAll(@Query() query: QueryProductsDto) {
    return this.queryBus.execute(
      new ListProductsQuery(
        query.name,
        query.status,
        query.sortBy,
        query.sortOrder,
        query.page,
        query.limit,
      ),
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Buscar produto por ID" })
  @ApiResponse({ status: 200, description: "Produto encontrado" })
  @ApiResponse({ status: 404, description: "Produto não encontrado" })
  async findOne(@Param("id", ParseUUIDPipe) id: string): Promise<Product> {
    return this.queryBus.execute(new GetProductQuery(id));
  }

  @Patch(":id")
  @ApiOperation({ summary: "Atualizar produto" })
  @ApiResponse({ status: 200, description: "Produto atualizado" })
  @ApiResponse({ status: 404, description: "Produto não encontrado" })
  @ApiResponse({
    status: 400,
    description: "Produto arquivado: só aceita alteração de descrição",
  })
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<Product> {
    return this.commandBus.execute(
      new UpdateProductCommand(id, dto.name, dto.description),
    );
  }

  @Patch(":id/activate")
  @ApiOperation({ summary: "Ativar produto (DRAFT >> ACTIVE)" })
  @ApiResponse({ status: 200, description: "Produto ativado" })
  @ApiResponse({ status: 400, description: "Pré-condições não atendidas" })
  async activate(@Param("id", ParseUUIDPipe) id: string): Promise<Product> {
    return this.commandBus.execute(new ActivateProductCommand(id));
  }

  @Patch(":id/archive")
  @ApiOperation({ summary: "Arquivar produto" })
  @ApiResponse({ status: 200, description: "Produto arquivado" })
  @ApiResponse({ status: 400, description: "Produto já está arquivado" })
  async archive(@Param("id", ParseUUIDPipe) id: string): Promise<Product> {
    return this.commandBus.execute(new ArchiveProductCommand(id));
  }

  @Post(":id/categories/:categoryId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Associar categoria ao produto" })
  @ApiResponse({ status: 200, description: "Categoria associada" })
  @ApiResponse({
    status: 404,
    description: "Produto ou categoria não encontrado",
  })
  @ApiResponse({ status: 409, description: "Categoria já associada" })
  async addCategory(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("categoryId", ParseUUIDPipe) categoryId: string,
  ): Promise<Product> {
    return this.commandBus.execute(new AddCategoryCommand(id, categoryId));
  }

  @Delete(":id/categories/:categoryId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Remover categoria do produto" })
  @ApiResponse({ status: 200, description: "Categoria removida" })
  @ApiResponse({ status: 404, description: "Associação não encontrada" })
  async removeCategory(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("categoryId", ParseUUIDPipe) categoryId: string,
  ): Promise<Product> {
    return this.commandBus.execute(new RemoveCategoryCommand(id, categoryId));
  }

  @Post(":id/attributes")
  @ApiOperation({ summary: "Adicionar atributo ao produto" })
  @ApiResponse({ status: 201, description: "Atributo adicionado" })
  @ApiResponse({ status: 409, description: "Atributo com mesma key já existe" })
  async addAttribute(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddAttributeDto,
  ): Promise<ProductAttribute> {
    return this.commandBus.execute(
      new AddAttributeCommand(id, dto.key, dto.value),
    );
  }

  @Patch(":id/attributes/:attributeId")
  @ApiOperation({ summary: "Atualizar atributo do produto" })
  @ApiResponse({ status: 200, description: "Atributo atualizado" })
  @ApiResponse({ status: 404, description: "Atributo não encontrado" })
  async updateAttribute(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("attributeId", ParseUUIDPipe) attributeId: string,
    @Body() dto: UpdateAttributeDto,
  ): Promise<ProductAttribute> {
    return this.commandBus.execute(
      new UpdateAttributeCommand(id, attributeId, dto.key, dto.value),
    );
  }

  @Delete(":id/attributes/:attributeId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remover atributo do produto" })
  @ApiResponse({ status: 204, description: "Atributo removido" })
  @ApiResponse({ status: 404, description: "Atributo não encontrado" })
  async removeAttribute(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("attributeId", ParseUUIDPipe) attributeId: string,
  ): Promise<void> {
    return this.commandBus.execute(new RemoveAttributeCommand(id, attributeId));
  }
}
