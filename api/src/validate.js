import { z } from 'zod';
import { HttpError } from './errors.js';

/** Validate data against a schema or throw a 400 with a readable message */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues
      .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ');
    throw new HttpError(400, message);
  }
  return result.data;
}

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'is not a real date');

const id = z.coerce.number().int().positive();
const phone = z.string().trim().regex(/^[0-9+ -]{7,15}$/, 'must be 7-15 digits');

export const schemas = {
  id,
  login: z.object({
    username: z.string().trim().min(1).max(50),
    password: z.string().min(1).max(100),
  }),
  registerNewborn: z.object({
    guardian: z.object({
      name: z.string().trim().min(1).max(100),
      phone,
      email: z.string().trim().email().max(120).optional().or(z.literal('')),
      address: z.string().trim().max(250).optional(),
    }),
    baby: z.object({
      name: z.string().trim().min(1).max(100),
      gender: z.enum(['M', 'F', 'O']),
      dob: dateString,
      birthWeightKg: z.number().min(0.5).max(9.99).optional(),
    }),
    clinicId: id.optional(),
    includeRegional: z.boolean().default(false),
  }),
  administer: z.object({
    administeredDate: dateString.optional(),
    clinicId: id.optional(),
  }),
  reschedule: z.object({
    newDate: dateString,
    reason: z.string().trim().min(1).max(300),
  }),
  restock: z.object({
    clinicId: id.optional(),
    vaccineId: id,
    batchNo: z.string().trim().min(1).max(40),
    expiryDate: dateString,
    quantity: z.number().int().positive().max(100000),
  }),
  dashboardQuery: z.object({
    clinicId: id.optional(),
    days: z.coerce.number().int().min(0).max(365).default(7),
  }),
  newbornSearch: z.object({
    search: z.string().trim().max(100).optional(),
  }),
  inventoryQuery: z.object({ clinicId: id.optional() }),
  alertsQuery: z.object({
    unread: z.enum(['0', '1']).optional(),
    type: z.enum(['DUE_SOON', 'OVERDUE', 'LATE_DOSE', 'LOW_STOCK', 'EXPIRY']).optional(),
    clinicId: id.optional(),
  }),
  auditQuery: z.object({ recordId: id.optional() }),
  previewQuery: z.object({ clinicId: id.optional() }),
};
