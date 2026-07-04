import bcrypt from "bcrypt";

export class PasswordService {
  private static readonly SALT_ROUNDS = 10;

  public async hash(password: string): Promise<string> {
    return bcrypt.hash(password, PasswordService.SALT_ROUNDS);
  }

  public async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
