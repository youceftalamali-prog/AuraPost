import type { Session } from "../models/Session";

export interface SessionRepository {
  findById(id: string): Promise<Session | null>;

  findByUser(userId: string): Promise<Session[]>;

  create(session: Session): Promise<Session>;

  update(id: string, data: Partial<Session>): Promise<Session>;

  deactivate(id: string): Promise<void>;

  delete(id: string): Promise<void>;
}