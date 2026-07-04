import { z } from "zod";

export const UpdateUserSchema = z.object({
  firstName: z.string().min(2).optional(),

  lastName: z.string().min(2).optional(),

  avatar: z.string().url().optional(),
});

export type UpdateUserInput = z.infer<
  typeof UpdateUserSchema
>;