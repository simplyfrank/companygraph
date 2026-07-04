import React, { useState, useEffect } from "react";
import { glossary } from "../../api";
import type { GlossaryCollectionRead, GlossaryTermRead } from "@companygraph/shared/schema/ontology";

export function GlossaryManager() {
  const [collections, setCollections] = useState<GlossaryCollectionRead[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<GlossaryCollectionRead | null>(null);
  const [terms, setTerms] = useState<GlossaryTermRead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateCollection, setShowCreateCollection] = useState(false);
  const [showCreateTerm, setShowCreateTerm] = useState(false);

  useEffect(() => {
    loadCollections();
  }, []);

  useEffect(() => {
    if (selectedCollection) {
      loadTerms(selectedCollection.iri);
    } else {
      setTerms([]);
    }
  }, [selectedCollection]);

  const loadCollections = async () => {
    try {
      setIsLoading(true);
      const data = await glossary.listCollections();
      setCollections(data);
    } catch (error) {
      console.error("Failed to load collections:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTerms = async (collectionIri: string) => {
    try {
      const data = await glossary.listTerms(collectionIri);
      setTerms(data);
    } catch (error) {
      console.error("Failed to load terms:", error);
    }
  };

  const handleCreateCollection = async (collection: Partial<GlossaryCollectionRead>) => {
    try {
      await glossary.createCollection(collection);
      await loadCollections();
      setShowCreateCollection(false);
    } catch (error) {
      console.error("Failed to create collection:", error);
    }
  };

  const handleCreateTerm = async (term: Partial<GlossaryTermRead>) => {
    if (!selectedCollection) return;
    try {
      await glossary.createTerm({ ...term, collection_iri: selectedCollection.iri });
      await loadTerms(selectedCollection.iri);
      setShowCreateTerm(false);
    } catch (error) {
      console.error("Failed to create term:", error);
    }
  };

  if (isLoading) {
    return <div className="p-4">Loading glossary...</div>;
  }

  return (
    <div className="flex h-full">
      {/* Collections sidebar */}
      <div className="w-80 border-r bg-gray-50 p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Collections</h2>
          <button
            onClick={() => setShowCreateCollection(true)}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            + New
          </button>
        </div>
        <div className="space-y-2">
          {collections.map((collection) => (
            <div
              key={collection.iri}
              onClick={() => setSelectedCollection(collection)}
              className={`p-3 rounded cursor-pointer ${
                selectedCollection?.iri === collection.iri
                  ? "bg-blue-100 border-blue-300"
                  : "bg-white hover:bg-gray-100"
              }`}
            >
              <div className="font-medium">{collection.label}</div>
              <div className="text-sm text-gray-500">{collection.scope_level}</div>
              <div className="text-xs text-gray-400">{collection.concept_count} terms</div>
            </div>
          ))}
        </div>
      </div>

      {/* Terms panel */}
      <div className="flex-1 p-6">
        {selectedCollection ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold">{selectedCollection.label}</h1>
                <p className="text-gray-600">{selectedCollection.description}</p>
              </div>
              <button
                onClick={() => setShowCreateTerm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                + Add Term
              </button>
            </div>

            <div className="space-y-3">
              {terms.map((term) => (
                <div
                  key={term.id}
                  className="p-4 bg-white border rounded hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-lg">{term.label}</h3>
                      <p className="text-gray-600 mt-1">{term.description}</p>
                      {term.synonyms.length > 0 && (
                        <div className="mt-2 text-sm text-gray-500">
                          <span className="font-medium">Synonyms:</span> {term.synonyms.join(", ")}
                        </div>
                      )}
                      {term.tags.length > 0 && (
                        <div className="mt-2 flex gap-2">
                          {term.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span
                      className={`px-2 py-1 text-xs rounded ${
                        term.status === "ACTIVE"
                          ? "bg-green-100 text-green-800"
                          : term.status === "DRAFT"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {term.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {terms.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <p>No terms in this collection yet.</p>
                <button
                  onClick={() => setShowCreateTerm(true)}
                  className="mt-4 text-blue-600 hover:underline"
                >
                  Add your first term
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <p>Select a collection to view its terms</p>
          </div>
        )}
      </div>

      {/* Create Collection Modal */}
      {showCreateCollection && (
        <CreateCollectionModal
          onClose={() => setShowCreateCollection(false)}
          onCreate={handleCreateCollection}
        />
      )}

      {/* Create Term Modal */}
      {showCreateTerm && selectedCollection && (
        <CreateTermModal
          collection={selectedCollection}
          onClose={() => setShowCreateTerm(false)}
          onCreate={handleCreateTerm}
        />
      )}
    </div>
  );
}

function CreateCollectionModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (collection: Partial<GlossaryCollectionRead>) => void;
}) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [scopeLevel, setScopeLevel] = useState<"ENTERPRISE" | "DOMAIN" | "DEPARTMENT" | "TEAM" | "PROJECT">("ENTERPRISE");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      iri: `urn:glossary:${Date.now()}`,
      label,
      description,
      scope_level: scopeLevel,
      collection_type: "GLOSSARY",
      source_type: "CUSTOM",
      is_editable: true,
      status: "active",
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Create Collection</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Scope Level</label>
            <select
              value={scopeLevel}
              onChange={(e) => setScopeLevel(e.target.value as "ENTERPRISE" | "DOMAIN" | "DEPARTMENT" | "TEAM" | "PROJECT")}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="ENTERPRISE">Enterprise</option>
              <option value="DOMAIN">Domain</option>
              <option value="DEPARTMENT">Department</option>
              <option value="TEAM">Team</option>
              <option value="PROJECT">Project</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateTermModal({
  collection,
  onClose,
  onCreate,
}: {
  collection: GlossaryCollectionRead;
  onClose: () => void;
  onCreate: (term: Partial<GlossaryTermRead>) => void;
}) {
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [synonyms, setSynonyms] = useState("");
  const [tags, setTags] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCreate({
      id: crypto.randomUUID(),
      iri: `urn:glossary:${collection.iri}:${Date.now()}`,
      local_name: label.toLowerCase().replace(/\s+/g, "_"),
      label,
      description,
      status: "DRAFT",
      collection_iri: collection.iri,
      synonyms: synonyms.split(",").map((s) => s.trim()).filter(Boolean),
      tags: tags.split(",").map((s) => s.trim()).filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Add Term to {collection.label}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Term</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Synonyms (comma-separated)</label>
            <input
              type="text"
              value={synonyms}
              onChange={(e) => setSynonyms(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="e.g., synonym1, synonym2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full px-3 py-2 border rounded"
              placeholder="e.g., tag1, tag2"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add Term
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
