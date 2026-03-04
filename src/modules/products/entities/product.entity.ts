import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { ProductStatus } from "./product-status.enum";
import { ProductAttribute } from "./product-attribute.entity";
import { Category } from "../../categories/entities/category.entity";

@Entity("products")
export class Product {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({
    type: "enum",
    enum: ProductStatus,
    default: ProductStatus.DRAFT,
  })
  status!: ProductStatus;

  @ManyToMany(() => Category, { eager: false })
  @JoinTable({
    name: "product_categories",
    joinColumn: { name: "product_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "category_id", referencedColumnName: "id" },
  })
  categories!: Category[];

  @OneToMany(() => ProductAttribute, (attr) => attr.product, {
    cascade: true,
    eager: false,
  })
  attributes!: ProductAttribute[];

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  get isArchived(): boolean {
    return this.status === ProductStatus.ARCHIVED;
  }

  activationViolations(): string[] {
    const violations: string[] = [];

    if (this.categories.length === 0) {
      violations.push("Product must have at least 1 category");
    }

    if (this.attributes.length === 0) {
      violations.push("Product must have at least 1 attribute");
    }

    return violations;
  }

  activate(hasDuplicateName: boolean): void {
    if (this.isArchived) {
      throw new BadRequestException("Archived products cannot be activated");
    }

    if (this.status === ProductStatus.ACTIVE) {
      throw new BadRequestException("Product is already active");
    }

    const violations = this.activationViolations();

    if (hasDuplicateName) {
      violations.push(
        `Another product with the name "${this.name}" already exists`,
      );
    }

    if (violations.length > 0) {
      throw new BadRequestException({
        message: "Product cannot be activated",
        violations,
      });
    }

    this.status = ProductStatus.ACTIVE;
  }

  archive(): void {
    if (this.isArchived) {
      throw new BadRequestException("Product is already archived");
    }

    this.status = ProductStatus.ARCHIVED;
  }

  applyUpdate(name?: string, description?: string): Record<string, unknown> {
    if (this.isArchived && name !== undefined) {
      throw new BadRequestException(
        "Archived products can only have their description updated",
      );
    }

    const changes: Record<string, unknown> = {};

    if (name !== undefined) {
      changes.name = name;
      this.name = name;
    }

    if (description !== undefined) {
      changes.description = description;
      this.description = description;
    }

    return changes;
  }

  assertModifiable(): void {
    if (this.isArchived) {
      throw new BadRequestException(
        "Cannot modify categories or attributes of an archived product",
      );
    }
  }

  addCategory(category: Category): void {
    this.assertModifiable();

    const alreadyAssociated = this.categories.some((c) => c.id === category.id);

    if (alreadyAssociated) {
      throw new ConflictException(
        "Category is already associated with this product",
      );
    }

    this.categories.push(category);
  }

  removeCategory(categoryId: string): void {
    this.assertModifiable();

    const index = this.categories.findIndex((c) => c.id === categoryId);

    if (index === -1) {
      throw new BadRequestException(
        `Category ${categoryId} is not associated with this product`,
      );
    }

    this.categories.splice(index, 1);
  }
}
