import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { usersService } from "./users.service";
import type { JwtClaims, User, UserRole } from "../types";

export const authService = {
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    const user = await usersService.findByEmail(email);
    if (!user) throw AppError.unauthorized("Invalid email or password");

    if (user.status !== "Active") {
      throw AppError.forbidden("This account is inactive");
    }

    const isValid = await usersService.verifyPassword(user, password);
    if (!isValid) throw AppError.unauthorized("Invalid email or password");

    const { passwordHash: _passwordHash, ...publicUser } = user;
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    return { token, user: publicUser };
  },

  async register(input: {
    name: string;
    email: string;
    password: string;
    department: string;
    role: UserRole;
  }): Promise<{ token: string; user: User }> {
    const user = await usersService.create({
      ...input,
      status: "Active",
    });
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    return { token, user };
  },
};

function signToken(claims: JwtClaims): string {
  return jwt.sign(claims, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  } as jwt.SignOptions);
}
