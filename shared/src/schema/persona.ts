import { z } from "zod";

// Persona attributes schema for the Persona node
export const personaAttributesSchema = z.object({
  // Basic persona information
  roleType: z.enum(["strategic", "operational", "tactical", "support"]).default("operational"),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  
  // Decision-making authority
  authorityLevel: z.enum(["full", "partial", "advisory", "none"]).default("none"),
  authorityScope: z.array(z.string()).default([]),
  monetaryApprovalLimit: z.number().nonnegative().optional(),
  
  // Assignment information
  isPrimary: z.boolean().default(false),
  allocationPercentage: z.number().min(0).max(100).default(100),
  effectiveStartDate: z.string().datetime().optional(),
  effectiveEndDate: z.string().datetime().optional(),
  
  // Skills and competencies
  skills: z.array(z.object({
    name: z.string(),
    category: z.string(),
    proficiencyLevel: z.enum(["beginner", "intermediate", "advanced", "expert"]),
    isRequired: z.boolean().default(false),
  })).default([]),
  
  // Responsibilities
  responsibilities: z.array(z.object({
    title: z.string(),
    category: z.enum(["strategic", "operational", "tactical"]),
    priority: z.enum(["high", "medium", "low"]),
    linkedKpiId: z.string().optional(),
    timeExpectation: z.enum(["daily", "weekly", "monthly", "quarterly"]).optional(),
  })).default([]),
  
  // Relationships
  supervisorPersonaId: z.string().optional(),
  peerPersonaIds: z.array(z.string()).default([]),
  collaborationPersonaIds: z.array(z.string()).default([]),
  
  // Template information
  isTemplate: z.boolean().default(false),
  templateId: z.string().optional(),
  templateVersion: z.string().optional(),
  
  // Metadata
  notes: z.string().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
});

export type PersonaAttributes = z.infer<typeof personaAttributesSchema>;

// Persona assignment schema for domain-persona relationships
export const personaAssignmentSchema = z.object({
  personaId: z.string().uuid(),
  domainId: z.string().uuid(),
  isPrimary: z.boolean().default(false),
  allocationPercentage: z.number().min(0).max(100).default(100),
  effectiveStartDate: z.string().datetime(),
  effectiveEndDate: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export type PersonaAssignment = z.infer<typeof personaAssignmentSchema>;

// Persona creation payload
export const personaCreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  attributes: personaAttributesSchema.optional(),
});

export type PersonaCreate = z.infer<typeof personaCreateSchema>;

// Persona update payload
export const personaUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  attributes: personaAttributesSchema.partial().optional(),
});

export type PersonaUpdate = z.infer<typeof personaUpdateSchema>;
