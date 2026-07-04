import { useState } from "react";
import { api } from "../api";
import { useFetch } from "../useFetch";
import { Button } from "./Button";
import styles from "./PersonaDetail.module.css";

interface PersonaDetailProps {
  personaId: string;
  onClose?: () => void;
}

export function PersonaDetail({ personaId, onClose }: PersonaDetailProps) {
  const [refreshKey, setRefreshKey] = useState(0);

  const personaData = useFetch(() => api.persona.get(personaId), [personaId, refreshKey]);

  if (personaData.status === "loading") return <div className={styles.loading}>Loading persona details...</div>;
  if (personaData.status === "error") return <div className={styles.error}>Error: {personaData.error}</div>;

  const { persona, domains } = personaData.data;

  return (
    <div className={styles.container}>
      {onClose && (
        <div className={styles.header}>
          <Button tone="ghost" onClick={onClose}>← Back</Button>
        </div>
      )}

      <div className={styles.content}>
        <div className={styles.mainSection}>
          <h1 className={styles.title}>{persona.name}</h1>
          {persona.description && <p className={styles.description}>{persona.description}</p>}

          <div className={styles.badges}>
            {persona.attributes.roleType && (
              <span className={styles.badge}>{persona.attributes.roleType}</span>
            )}
            {persona.attributes.authorityLevel && (
              <span className={styles.badge}>{persona.attributes.authorityLevel}</span>
            )}
            {persona.attributes.isTemplate && (
              <span className={styles.templateBadge}>Template</span>
            )}
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Contact Information</h2>
            <div className={styles.infoGrid}>
              {persona.attributes.contactEmail && (
                <div className={styles.infoItem}>
                  <span className={styles.label}>Email:</span>
                  <a href={`mailto:${persona.attributes.contactEmail}`} className={styles.link}>
                    {persona.attributes.contactEmail}
                  </a>
                </div>
              )}
              {persona.attributes.contactPhone && (
                <div className={styles.infoItem}>
                  <span className={styles.label}>Phone:</span>
                  <span>{persona.attributes.contactPhone}</span>
                </div>
              )}
              {persona.attributes.monetaryApprovalLimit !== undefined && (
                <div className={styles.infoItem}>
                  <span className={styles.label}>Approval Limit:</span>
                  <span>${persona.attributes.monetaryApprovalLimit.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {persona.attributes.skills && persona.attributes.skills.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Skills ({persona.attributes.skills.length})</h2>
              <div className={styles.skillsGrid}>
                {persona.attributes.skills.map((skill, index) => (
                  <div key={index} className={styles.skillCard}>
                    <div className={styles.skillHeader}>
                      <strong>{skill.name}</strong>
                      <span className={`${styles.proficiencyBadge} ${styles[skill.proficiencyLevel]}`}>
                        {skill.proficiencyLevel}
                      </span>
                    </div>
                    <div className={styles.skillMeta}>
                      <span className={styles.category}>{skill.category}</span>
                      {skill.isRequired && <span className={styles.required}>Required</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {persona.attributes.responsibilities && persona.attributes.responsibilities.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Responsibilities ({persona.attributes.responsibilities.length})</h2>
              <div className={styles.responsibilitiesList}>
                {persona.attributes.responsibilities.map((resp, index) => (
                  <div key={index} className={styles.responsibilityCard}>
                    <div className={styles.respHeader}>
                      <strong>{resp.title}</strong>
                      <span className={`${styles.priorityBadge} ${styles[resp.priority]}`}>
                        {resp.priority}
                      </span>
                    </div>
                    <div className={styles.respMeta}>
                      <span className={styles.category}>{resp.category}</span>
                      {resp.timeExpectation && <span className={styles.frequency}>{resp.timeExpectation}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {persona.attributes.authorityScope && persona.attributes.authorityScope.length > 0 && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Authority Scope</h2>
              <ul className={styles.list}>
                {persona.attributes.authorityScope.map((scope, index) => (
                  <li key={index}>{scope}</li>
                ))}
              </ul>
            </div>
          )}

          {persona.attributes.notes && (
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Notes</h2>
              <p className={styles.notes}>{persona.attributes.notes}</p>
            </div>
          )}
        </div>

        <div className={styles.sidebar}>
          <div className={styles.sidebarSection}>
            <h3 className={styles.sidebarTitle}>Assigned Domains</h3>
            {domains && domains.length > 0 ? (
              <ul className={styles.domainList}>
                {domains.map((domain) => (
                  <li key={domain.id} className={styles.domainItem}>
                    <div>
                      <strong>{domain.name}</strong>
                      {domain.isPrimary && <span className={styles.primaryBadge}>Primary</span>}
                    </div>
                    <div className={styles.domainMeta}>
                      <span>{domain.allocationPercentage}% allocation</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>Not assigned to any domains</p>
            )}
          </div>

          {persona.attributes.supervisorPersonaId && (
            <div className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>Supervisor</h3>
              <div className={styles.relationshipLink}>
                <code>{persona.attributes.supervisorPersonaId.slice(0, 8)}…</code>
              </div>
            </div>
          )}

          {persona.attributes.peerPersonaIds && persona.attributes.peerPersonaIds.length > 0 && (
            <div className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>Peers ({persona.attributes.peerPersonaIds.length})</h3>
              <ul className={styles.list}>
                {persona.attributes.peerPersonaIds.map((id, index) => (
                  <li key={index}>
                    <code>{id.slice(0, 8)}…</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {persona.attributes.collaborationPersonaIds && persona.attributes.collaborationPersonaIds.length > 0 && (
            <div className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>Collaborators ({persona.attributes.collaborationPersonaIds.length})</h3>
              <ul className={styles.list}>
                {persona.attributes.collaborationPersonaIds.map((id, index) => (
                  <li key={index}>
                    <code>{id.slice(0, 8)}…</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.sidebarSection}>
            <h3 className={styles.sidebarTitle}>Metadata</h3>
            <div className={styles.metadata}>
              <div className={styles.metaItem}>
                <span className={styles.label}>Created:</span>
                <span>{new Date(persona.createdAt).toLocaleDateString()}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.label}>Updated:</span>
                <span>{new Date(persona.updatedAt).toLocaleDateString()}</span>
              </div>
              {persona.attributes.createdBy && (
                <div className={styles.metaItem}>
                  <span className={styles.label}>Created By:</span>
                  <span>{persona.attributes.createdBy}</span>
                </div>
              )}
              {persona.attributes.updatedBy && (
                <div className={styles.metaItem}>
                  <span className={styles.label}>Updated By:</span>
                  <span>{persona.attributes.updatedBy}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
