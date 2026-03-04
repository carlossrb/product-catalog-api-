import { ProductAttribute } from "../entities/product-attribute.entity";

export const PRODUCT_ATTRIBUTE_REPOSITORY = Symbol(
  "PRODUCT_ATTRIBUTE_REPOSITORY",
);

export interface ProductAttributeRepositoryPort {
  create(data: {
    productId: string;
    key: string;
    value: string;
  }): ProductAttribute;
  save(attribute: ProductAttribute): Promise<ProductAttribute>;
  findByProductAndId(
    productId: string,
    attributeId: string,
  ): Promise<ProductAttribute | null>;
  findByProductAndKey(
    productId: string,
    key: string,
  ): Promise<ProductAttribute | null>;
  remove(attribute: ProductAttribute): Promise<ProductAttribute>;
}
