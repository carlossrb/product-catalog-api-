import { MiddlewareConsumer, Module, NestModule, Scope } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CacheModule } from "@nestjs/cache-manager";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bullmq";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { CqrsModule } from "@nestjs/cqrs";
import KeyvRedis from "@keyv/redis";
import { appConfig } from "./config/app.config";
import { databaseConfig } from "./config/database.config";
import { redisConfig } from "./config/redis.config";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { TypeormExceptionFilter } from "./common/filters/typeorm-exception.filter";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { HealthModule } from "./modules/health/health.module";
import { ProductsModule } from "./modules/products/products.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { AuditModule } from "./modules/audit/audit.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, redisConfig],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres" as const,
        host: config.get<string>("database.host"),
        port: config.get<number>("database.port"),
        username: config.get<string>("database.username"),
        password: config.get<string>("database.password"),
        database: config.get<string>("database.database"),
        autoLoadEntities: true,
        synchronize: config.get<string>("app.nodeEnv") !== "production",
        logging: config.get<string>("app.nodeEnv") === "development",
      }),
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>("redis.host"),
          port: config.get<number>("redis.port"),
        },
      }),
    }),

    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        stores: [
          new KeyvRedis(
            `redis://${config.get<string>("redis.host")}:${config.get<number>("redis.port")}`,
          ),
        ],
      }),
    }),

    ThrottlerModule.forRoot([{ ttl: 60000, limit: 150 }]),
    CqrsModule.forRoot(),

    HealthModule,
    ProductsModule,
    CategoriesModule,
    AuditModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      scope: Scope.REQUEST,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_FILTER,
      scope: Scope.REQUEST,
      useClass: TypeormExceptionFilter,
    },
    {
      provide: APP_FILTER,
      scope: Scope.REQUEST,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*");
  }
}
