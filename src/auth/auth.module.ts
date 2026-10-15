import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "../database/entities/user.entity";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([UserEntity]),
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configuration: ConfigService) => {
        const secret = configuration.getOrThrow<string>("JWT_SECRET").trim();
        if (secret.length < 32)
          throw new Error(
            "JWT_SECRET doit contenir au moins 32 caractères aléatoires.",
          );
        return {
          secret,
          signOptions: {
            expiresIn: configuration.get<string>(
              "JWT_EXPIRES_IN",
              "4h",
            ) as `${number}${"s" | "m" | "h" | "d"}`,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
