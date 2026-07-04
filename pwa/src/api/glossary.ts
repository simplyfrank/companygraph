// Glossary API functions — collections and terms

import type { GlossaryCollectionRead, GlossaryTermRead } from "@companygraph/shared/schema/ontology";
import { json } from "./core";

export const glossary = {
  listCollections: (scopeLevel?: string) =>
    json<GlossaryCollectionRead[]>(
      scopeLevel ? `/api/v1/glossary/collections?scope_level=${scopeLevel}` : "/api/v1/glossary/collections"
    ),

  createCollection: (data: Partial<GlossaryCollectionRead>) =>
    json<GlossaryCollectionRead>("/api/v1/glossary/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getCollection: (iri: string) =>
    json<GlossaryCollectionRead>(`/api/v1/glossary/collections/${encodeURIComponent(iri)}`),

  patchCollection: (iri: string, data: Partial<GlossaryCollectionRead>) =>
    json<GlossaryCollectionRead>(`/api/v1/glossary/collections/${encodeURIComponent(iri)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deleteCollection: (iri: string) =>
    json<{ success: boolean }>(`/api/v1/glossary/collections/${encodeURIComponent(iri)}`, {
      method: "DELETE",
    }),

  listTerms: (collectionIri?: string) =>
    json<GlossaryTermRead[]>(
      collectionIri ? `/api/v1/glossary/terms?collection_iri=${collectionIri}` : "/api/v1/glossary/terms"
    ),

  createTerm: (data: Partial<GlossaryTermRead>) =>
    json<GlossaryTermRead>("/api/v1/glossary/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  getTerm: (id: string) =>
    json<GlossaryTermRead>(`/api/v1/glossary/terms/${encodeURIComponent(id)}`),

  patchTerm: (id: string, data: Partial<GlossaryTermRead>) =>
    json<GlossaryTermRead>(`/api/v1/glossary/terms/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  deleteTerm: (id: string) =>
    json<{ success: boolean }>(`/api/v1/glossary/terms/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
