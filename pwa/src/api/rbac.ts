// RBAC API functions — personas, RBAC roles, user-persona assignments

import { json, withSignal, guardArray } from "./core";

// Types
export interface PersonaRow {
  id: string;
  name: string;
  description: string;
  parentPersonaId: string | null;
  rbacRoleIds: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface PersonaCreate {
  name: string;
  description?: string | undefined;
  parentPersonaId?: string | undefined;
  rbacRoleIds?: string[] | undefined;
}

export interface PersonaUpdate {
  name?: string | undefined;
  description?: string | undefined;
  parentPersonaId?: string | null | undefined;
  rbacRoleIds?: string[] | undefined;
}

export interface RbacRoleRow {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RbacRoleCreate {
  name: string;
  description?: string | undefined;
  permissions: string[];
}

export interface RbacRoleUpdate {
  name?: string | undefined;
  description?: string | undefined;
  permissions?: string[] | undefined;
}

export interface UserPersonaAssignment {
  personaId: string;
  personaName: string;
  domainIds: string[];
  assignedAt: string;
}

export interface UserPersonaCreate {
  personaId: string;
  domainIds?: string[] | undefined;
}

export interface UserPersonaUpdate {
  domainIds: string[];
}

export interface PersonaPermissions {
  personaId: string;
  permissions: string[];
  rbacRoles: Array<{ id: string; name: string; permissions: string[] }>;
  inheritedFrom: Array<{ personaId: string; personaName: string }>;
}

// Persona API
export const personas = {
  list: async (signal?: AbortSignal) => {
    const data = await json<unknown>("/api/v1/personas", withSignal(signal));
    return guardArray<PersonaRow>(data, "personas.list");
  },
  get: (id: string, signal?: AbortSignal) =>
    json<PersonaRow>(`/api/v1/personas/${encodeURIComponent(id)}`, withSignal(signal)),
  create: (data: PersonaCreate) =>
    json<PersonaRow>("/api/v1/personas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
  update: (id: string, data: PersonaUpdate) =>
    json<PersonaRow>(`/api/v1/personas/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    json<{ success: boolean }>(`/api/v1/personas/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  getPermissions: (id: string, signal?: AbortSignal) =>
    json<PersonaPermissions>(`/api/v1/personas/${encodeURIComponent(id)}/permissions`, withSignal(signal)),
  assignRbacRole: (personaId: string, rbacRoleId: string) =>
    json<{ success: boolean }>(`/api/v1/personas/${encodeURIComponent(personaId)}/rbac-roles`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rbacRoleId }),
    }),
  removeRbacRole: (personaId: string, rbacRoleId: string) =>
    json<{ success: boolean }>(`/api/v1/personas/${encodeURIComponent(personaId)}/rbac-roles/${encodeURIComponent(rbacRoleId)}`, {
      method: "DELETE",
    }),
};

// RBAC Role API
export const rbacRoles = {
  list: async (signal?: AbortSignal) => {
    const data = await json<unknown>("/api/v1/rbac-roles", withSignal(signal));
    return guardArray<RbacRoleRow>(data, "rbacRoles.list");
  },
  get: (id: string, signal?: AbortSignal) =>
    json<RbacRoleRow>(`/api/v1/rbac-roles/${encodeURIComponent(id)}`, withSignal(signal)),
  create: (data: RbacRoleCreate) =>
    json<RbacRoleRow>("/api/v1/rbac-roles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
  update: (id: string, data: RbacRoleUpdate) =>
    json<RbacRoleRow>(`/api/v1/rbac-roles/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
  delete: (id: string) =>
    json<{ success: boolean }>(`/api/v1/rbac-roles/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};

// User-Persona Assignment API
export const userPersonas = {
  list: (userId: string, signal?: AbortSignal) =>
    json<{ assignments: UserPersonaAssignment[] }>(`/api/v1/users/${encodeURIComponent(userId)}/personas`, withSignal(signal)),
  assign: (userId: string, data: UserPersonaCreate) =>
    json<{ assignment: UserPersonaAssignment }>(`/api/v1/users/${encodeURIComponent(userId)}/personas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
  update: (userId: string, personaId: string, data: UserPersonaUpdate) =>
    json<{ assignment: UserPersonaAssignment }>(`/api/v1/users/${encodeURIComponent(userId)}/personas/${encodeURIComponent(personaId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    }),
  remove: (userId: string, personaId: string) =>
    json<{ success: boolean }>(`/api/v1/users/${encodeURIComponent(userId)}/personas/${encodeURIComponent(personaId)}`, {
      method: "DELETE",
    }),
};
