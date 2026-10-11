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
      // optional only so a known phone number can be reused; the database insists on it for a new guardian
      name: z.string().trim().max(100).optional(),
      phone,
      email: z.string().trim().email().max(120).optional().or(z.literal('')),
      // required for a new guardian (the database insists); optional only for a known phone number
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
  guardianLookup: z.object({ phone }),
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
  createUser: z
    .object({
      role: z.enum(['NURSE', 'PARENT']),
      fullName: z.string().trim().min(1).max(100).optional(),
      clinicId: id.optional(),
      guardianId: id.optional(),
      username: z.string().trim().regex(/^[A-Za-z0-9_.-]{3,40}$/, 'use 3-40 letters, digits, dot, dash or underscore').optional(),
    })
    .superRefine((v, ctx) => {
      const need = (cond, path, message) => cond && ctx.addIssue({ code: 'custom', path: [path], message });
      need(v.role === 'NURSE' && !v.fullName, 'fullName', 'is required for a nurse');
      need(v.role === 'NURSE' && !v.clinicId, 'clinicId', 'is required for a nurse');
      need(v.role === 'PARENT' && !v.guardianId, 'guardianId', 'is required for a parent login');
    }),
  updateNewborn: z.object({
    name: z.string().trim().min(1).max(100),
    gender: z.enum(['M', 'F', 'O']),
    dob: dateString,
    birthWeightKg: z.number().min(0.5).max(9.99).nullable().optional(),
  }),
  deleteNewborn: z.object({ restoreStock: z.enum(['0', '1']).optional() }),
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
