import { z } from 'zod';

export const DoctorProfileSchema = z.object({
  fullName: z.string().min(1),
  designation: z.string().min(1),
  regNumber: z.string().min(1),
  clinicName: z.string().optional(),
  phone: z.string().optional(),
  stampBase64: z.string().optional(),
  hmacSecret: z.string().optional(),
  signatureFont: z.enum(['Dancing Script', 'Great Vibes', 'Caveat', 'Satisfy']).optional(),
  signatureStyle: z.enum(['initials', 'lastName', 'fullName']).optional(),
  signatureBase64: z.string().optional(),
});

export type DoctorProfile = z.infer<typeof DoctorProfileSchema>;
