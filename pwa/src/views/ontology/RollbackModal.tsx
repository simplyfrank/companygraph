import { useState, useEffect } from "react";
import { api } from "../../api";
import { Card } from "../../components/Card";
import { SecLabel } from "../_shared";
import styles from "./RollbackModal.module.css";

interface RollbackModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface Version {
  version_id: string;
  created_at: string;
  description: string;
}

export function RollbackModal({ onClose, onSuccess }: RollbackModalProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVersions = async () => {
      try {
        setLoading(true);
        const response = await fetch("/api/v1/ontology/versions");
        if (!response.ok) throw new Error("Failed to fetch versions");
        const data = await response.json();
        setVersions(data.rows || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load versions");
      } finally {
        setLoading(false);
      }
    };

    fetchVersions();
  }, []);

  const handleRollback = async () => {
    if (!selectedVersion) {
      setError("Please select a version to rollback to");
      return;
    }

    try {
      setRollingBack(true);
      setError(null);
      const response = await fetch(`/api/v1/ontology/rollback/${selectedVersion}`, {
        method: "POST",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Rollback failed");
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed");
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <Card title="Rollback to Version">
          {loading ? (
            <div className={styles.loading}>Loading versions...</div>
          ) : error ? (
            <div className={styles.error}>{error}</div>
          ) : versions.length === 0 ? (
            <div className={styles.empty}>No versions available for rollback</div>
          ) : (
            <>
              <SecLabel>SELECT VERSION</SecLabel>
              <div className={styles.versionList}>
                {versions.map((version) => (
                  <div
                    key={version.version_id}
                    className={styles.versionItem}
                    data-selected={selectedVersion === version.version_id ? "true" : undefined}
                    onClick={() => setSelectedVersion(version.version_id)}
                  >
                    <div className={styles.versionId}>{version.version_id.slice(0, 8)}</div>
                    <div className={styles.versionDate}>
                      {new Date(version.created_at).toLocaleString()}
                    </div>
                    <div className={styles.versionDesc}>{version.description}</div>
                  </div>
                ))}
              </div>

              {error && <div className={styles.error}>{error}</div>}

              <div className={styles.actions}>
                <button type="button" onClick={onClose} className={styles.cancelBtn}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRollback}
                  disabled={!selectedVersion || rollingBack}
                  className={styles.rollbackBtn}
                >
                  {rollingBack ? "Rolling back..." : "Rollback"}
                </button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
