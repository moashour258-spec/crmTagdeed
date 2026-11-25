import { z } from "zod";
import { validateNationalId } from "@/lib/crypto/national-id";

export const phoneSchema = z.string().regex(/^(\+20|0)1[0125][0-9]{8}$/);

export const profileSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  phone: phoneSchema,
  address: z.string().trim().min(5).max(500),
  nationalId: z.string().refine(validateNationalId),
});

export const userDraftSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  email: z.string().trim().email(),
  role: z.enum(["admin", "sales"]),
  method: z.enum(["invitation", "random_password", "custom_password"]),
  password: z.string().optional(),
});
