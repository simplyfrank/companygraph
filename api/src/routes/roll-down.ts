// Roll-down API handlers for KPI and OKR roll-down from executive to domains, domains to products, and programs to products
// POST /api/v1/roll-down/kpi - batch KPI roll-down to domains
// GET /api/v1/roll-down/kpi - view KPI roll-down status
// POST /api/v1/roll-down/kpi/product - batch KPI roll-down from domain to products
// GET /api/v1/roll-down/kpi/product - view KPI product roll-down status
// POST /api/v1/roll-down/kpi/program - batch KPI roll-down from program to products
// GET /api/v1/roll-down/kpi/program - view KPI program roll-down status
// POST /api/v1/roll-down/okr - batch OKR roll-down to domains
// GET /api/v1/roll-down/okr - view OKR roll-down status
// POST /api/v1/roll-down/okr/product - batch OKR roll-down from domain to products
// GET /api/v1/roll-down/okr/product - view OKR product roll-down status
// POST /api/v1/roll-down/okr/program - batch OKR roll-down from program to products
// GET /api/v1/roll-down/okr/program - view OKR program roll-down status
// POST /api/v1/roll-down/sla/domain - batch SLA roll-down from domain to products
// GET /api/v1/roll-down/sla/domain - view SLA domain roll-down status
// POST /api/v1/roll-down/notify - notify domains of roll-down
// GET /api/v1/roll-down/contributions - get contribution analytics
// POST /api/v1/roll-down/commit - domain commits to roll-down
// POST /api/v1/roll-down/request-adjustment - domain requests adjustment
// POST /api/v1/roll-down/approve - approve roll-down assignment
// POST /api/v1/roll-down/reject - reject roll-down assignment
// POST /api/v1/roll-down/notify - send notification for roll-down assignment

import type { Driver } from "neo4j-driver";
import { z } from "zod";
import { uuidv7 } from "@companygraph/shared/schema/nodes";
import { getDriver } from "../neo4j/driver";
import { generateId } from "../ids";
import { ok, error, parseId, parseWith, readJson } from "./_helpers";

// =============================================================================
// Schemas
// =============================================================================

export const kpiRollDownSchema = z.object({
  kpi_id: uuidv7,
  domain_assignments: z.array(
    z.object({
      domain_id: uuidv7,
      weight: z.number().min(0).max(100),
      target_value: z.number(),
    }),
  ),
});

export const okrRollDownSchema = z.object({
  okr_directive_id: uuidv7,
  domain_assignments: z.array(
    z.object({
      domain_id: uuidv7,
      objectives: z.array(
        z.object({
          name: z.string().min(1).max(200),
          description: z.string().min(1).max(2000),
          key_results: z.array(
            z.object({
              name: z.string().min(1).max(200),
              description: z.string().min(1).max(2000),
              baseline_value: z.number(),
              target_value: z.number(),
              unit: z.string(),
              direction: z.enum(["higher_is_better", "lower_is_better"]),
            }),
          ),
        }),
      ),
    }),
  ),
});

export const rollDownCommitSchema = z.object({
  roll_down_id: uuidv7,
  domain_id: uuidv7,
  status: z.enum(["committed", "rejected"]),
  notes: z.string().optional(),
});

export const rollDownAdjustmentSchema = z.object({
  roll_down_id: uuidv7,
  domain_id: uuidv7,
  requested_adjustments: z.array(
    z.object({
      type: z.enum(["kpi", "okr"]),
      item_id: uuidv7,
      current_target: z.number(),
      proposed_target: z.number(),
      reason: z.string(),
    }),
  ),
});

// =============================================================================
// KPI Roll-Down Handlers
// =============================================================================

export async function handleKpiRollDownPost(req: Request): Promise<Response> {
  const input = parseWith(kpiRollDownSchema, await readJson(req));
  const rollDownId = uuidv7.parse(generateId());
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    // Create roll-down record
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE (r:RollDown {
          id: $rollDownId,
          type: 'kpi',
          kpi_id: $kpiId,
          createdAt: $now,
          status: 'pending'
        })`,
        { rollDownId, kpiId: input.kpi_id, now },
      ),
    );

    // Create domain assignments
    for (const assignment of input.domain_assignments) {
      await session.executeWrite((tx) =>
        tx.run(
          `CREATE (a:RollDownAssignment {
            id: $assignmentId,
            roll_down_id: $rollDownId,
            domain_id: $domainId,
            weight: $weight,
            target_value: $targetValue,
            status: 'pending',
            createdAt: $now
          })`,
          {
            assignmentId: uuidv7.parse(generateId()),
            rollDownId,
            domainId: assignment.domain_id,
            weight: assignment.weight,
            targetValue: assignment.target_value,
            now,
          },
        ),
      );
    }

    return ok({ id: rollDownId, status: "pending" });
  } finally {
    await session.close();
  }
}

export async function handleKpiRollDownGet(req: Request): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (r:RollDown {type: 'kpi'})
       OPTIONAL MATCH (r)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment)
       OPTIONAL MATCH (a)-[:FOR_DOMAIN]->(d:Domain)
       OPTIONAL MATCH (r)-[:FOR_KPI]->(k:KPI)
       RETURN r, a, d, k
       ORDER BY r.createdAt DESC`,
    );

    const rollDowns = new Map();
    for (const record of result.records) {
      const rollDown = record.get("r");
      const assignment = record.get("a");
      const domain = record.get("d");
      const kpi = record.get("k");

      if (!rollDowns.has(rollDown.id)) {
        rollDowns.set(rollDown.id, {
          id: rollDown.id,
          kpi_id: rollDown.kpi_id,
          kpi_name: kpi?.properties.name,
          createdAt: rollDown.createdAt,
          status: rollDown.status,
          assignments: [],
        });
      }

      if (assignment) {
        rollDowns.get(rollDown.id).assignments.push({
          id: assignment.id,
          domain_id: assignment.domain_id,
          domain_name: domain?.properties.name,
          weight: assignment.weight,
          target_value: assignment.target_value,
          status: assignment.status,
        });
      }
    }

    return ok(Array.from(rollDowns.values()));
  } finally {
    await session.close();
  }
}

export async function handleKpiRollDownByDomainGet(req: Request, domainId: string): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (r:RollDown {type: 'kpi'})-[:HAS_ASSIGNMENT]->(a:RollDownAssignment {domain_id: $domainId})
       OPTIONAL MATCH (r)-[:FOR_KPI]->(k:KPI)
       RETURN r, a, k
       ORDER BY r.createdAt DESC`,
      { domainId },
    );

    const rollDowns = result.records.map((record) => {
      const rollDown = record.get("r");
      const assignment = record.get("a");
      const kpi = record.get("k");

      return {
        id: rollDown.id,
        kpi_id: rollDown.kpi_id,
        kpi_name: kpi?.properties.name,
        weight: assignment.weight,
        target_value: assignment.target_value,
        status: assignment.status,
        createdAt: rollDown.createdAt,
      };
    });

    return ok(rollDowns);
  } finally {
    await session.close();
  }
}

// =============================================================================
// OKR Roll-Down Handlers
// =============================================================================

export async function handleOkrRollDownPost(req: Request): Promise<Response> {
  const input = parseWith(okrRollDownSchema, await readJson(req));
  const rollDownId = uuidv7.parse(generateId());
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    // Create roll-down record
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE (r:RollDown {
          id: $rollDownId,
          type: 'okr',
          okr_directive_id: $okrDirectiveId,
          createdAt: $now,
          status: 'pending'
        })`,
        { rollDownId, okrDirectiveId: input.okr_directive_id, now },
      ),
    );

    // Create domain assignments with objectives and KRs
    for (const domainAssignment of input.domain_assignments) {
      const assignmentId = uuidv7.parse(generateId());

      await session.executeWrite((tx) =>
        tx.run(
          `CREATE (a:RollDownAssignment {
            id: $assignmentId,
            roll_down_id: $rollDownId,
            domain_id: $domainId,
            status: 'pending',
            createdAt: $now
          })`,
          { assignmentId, rollDownId, domainId: domainAssignment.domain_id, now },
        ),
      );

      // Create objectives for this domain
      for (const objective of domainAssignment.objectives) {
        const objectiveId = uuidv7.parse(generateId());

        await session.executeWrite((tx) =>
          tx.run(
            `CREATE (o:RollDownObjective {
              id: $objectiveId,
              assignment_id: $assignmentId,
              name: $name,
              description: $description,
              createdAt: $now
            })`,
            { objectiveId, assignmentId, name: objective.name, description: objective.description, now },
          ),
        );

        // Create key results for this objective
        for (const kr of objective.key_results) {
          const krId = uuidv7.parse(generateId());

          await session.executeWrite((tx) =>
            tx.run(
              `CREATE (kr:RollDownKeyResult {
                id: $krId,
                objective_id: $objectiveId,
                name: $name,
                description: $description,
                baseline_value: $baselineValue,
                target_value: $targetValue,
                unit: $unit,
                direction: $direction,
                createdAt: $now
              })`,
              {
                krId,
                objectiveId,
                name: kr.name,
                description: kr.description,
                baselineValue: kr.baseline_value,
                targetValue: kr.target_value,
                unit: kr.unit,
                direction: kr.direction,
                now,
              },
            ),
          );
        }
      }
    }

    return ok({ id: rollDownId, status: "pending" });
  } finally {
    await session.close();
  }
}

export async function handleOkrRollDownGet(req: Request): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (r:RollDown {type: 'okr'})
       OPTIONAL MATCH (r)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment)
       OPTIONAL MATCH (a)-[:FOR_DOMAIN]->(d:Domain)
       OPTIONAL MATCH (r)-[:FOR_OKR]->(o:OKRDirective)
       RETURN r, a, d, o
       ORDER BY r.createdAt DESC`,
    );

    const rollDowns = new Map();
    for (const record of result.records) {
      const rollDown = record.get("r");
      const assignment = record.get("a");
      const domain = record.get("d");
      const okr = record.get("o");

      if (!rollDowns.has(rollDown.id)) {
        rollDowns.set(rollDown.id, {
          id: rollDown.id,
          okr_directive_id: rollDown.okr_directive_id,
          okr_name: okr?.properties.name,
          createdAt: rollDown.createdAt,
          status: rollDown.status,
          assignments: [],
        });
      }

      if (assignment) {
        rollDowns.get(rollDown.id).assignments.push({
          id: assignment.id,
          domain_id: assignment.domain_id,
          domain_name: domain?.properties.name,
          status: assignment.status,
        });
      }
    }

    return ok(Array.from(rollDowns.values()));
  } finally {
    await session.close();
  }
}

export async function handleOkrRollDownByDomainGet(req: Request, domainId: string): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (r:RollDown {type: 'okr'})-[:HAS_ASSIGNMENT]->(a:RollDownAssignment {domain_id: $domainId})
       OPTIONAL MATCH (a)-[:HAS_OBJECTIVE]->(o:RollDownObjective)
       OPTIONAL MATCH (o)-[:HAS_KEY_RESULT]->(kr:RollDownKeyResult)
       OPTIONAL MATCH (r)-[:FOR_OKR]->(okr:OKRDirective)
       RETURN r, a, o, kr, okr
       ORDER BY r.createdAt DESC`,
      { domainId },
    );

    const rollDowns = new Map();
    for (const record of result.records) {
      const rollDown = record.get("r");
      const assignment = record.get("a");
      const objective = record.get("o");
      const kr = record.get("kr");
      const okr = record.get("okr");

      if (!rollDowns.has(rollDown.id)) {
        rollDowns.set(rollDown.id, {
          id: rollDown.id,
          okr_directive_id: rollDown.okr_directive_id,
          okr_name: okr?.properties.name,
          status: assignment.status,
          createdAt: rollDown.createdAt,
          objectives: [],
        });
      }

      if (objective) {
        const existing = rollDowns.get(rollDown.id).objectives.find((o) => o.id === objective.id);
        if (!existing) {
          rollDowns.get(rollDown.id).objectives.push({
            id: objective.id,
            name: objective.name,
            description: objective.description,
            key_results: [],
          });
        }

        if (kr) {
          const obj = rollDowns.get(rollDown.id).objectives.find((o) => o.id === objective.id);
          if (obj) {
            obj.key_results.push({
              id: kr.id,
              name: kr.name,
              description: kr.description,
              baseline_value: kr.baseline_value,
              target_value: kr.target_value,
              unit: kr.unit,
              direction: kr.direction,
            });
          }
        }
      }
    }

    return ok(Array.from(rollDowns.values()));
  } finally {
    await session.close();
  }
}

// =============================================================================
// Roll-Down Commit/Adjustment Handlers
// =============================================================================

export async function handleRollDownCommitPost(req: Request): Promise<Response> {
  const input = parseWith(rollDownCommitSchema, await readJson(req));
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    await session.executeWrite((tx) =>
      tx.run(
        `MATCH (a:RollDownAssignment {id: $rollDownId, domain_id: $domainId})
         SET a.status = $status, a.notes = $notes, a.updatedAt = $now`,
        { rollDownId: input.roll_down_id, domainId: input.domain_id, status: input.status, notes: input.notes, now },
      ),
    );

    return ok({ success: true });
  } finally {
    await session.close();
  }
}

export async function handleRollDownAdjustmentPost(req: Request): Promise<Response> {
  const input = parseWith(rollDownAdjustmentSchema, await readJson(req));
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    for (const adjustment of input.requested_adjustments) {
      await session.executeWrite((tx) =>
        tx.run(
          `CREATE (a:RollDownAdjustment {
            id: $adjustmentId,
            roll_down_id: $rollDownId,
            domain_id: $domainId,
            type: $type,
            item_id: $itemId,
            current_target: $currentTarget,
            proposed_target: $proposedTarget,
            reason: $reason,
            status: 'pending',
            createdAt: $now
          })`,
          {
            adjustmentId: uuidv7.parse(generateId()),
            rollDownId: input.roll_down_id,
            domainId: input.domain_id,
            type: adjustment.type,
            itemId: adjustment.item_id,
            currentTarget: adjustment.current_target,
            proposedTarget: adjustment.proposed_target,
            reason: adjustment.reason,
            now,
          },
        ),
      );
    }

    return ok({ success: true });
  } finally {
    await session.close();
  }
}

// =============================================================================
// Contribution Analytics Handlers
// =============================================================================

export async function handleRollDownContributionsGet(req: Request): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (r:RollDown)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment)
       OPTIONAL MATCH (a)-[:FOR_DOMAIN]->(d:Domain)
       RETURN d.id AS domain_id, d.name AS domain_name,
              sum(a.weight) AS total_weight,
              count(a) AS assignment_count
       WITH domain_id, domain_name, total_weight, assignment_count
       RETURN domain_id, domain_name, total_weight, assignment_count
       ORDER BY domain_name`,
    );

    const contributions = result.records.map((record) => ({
      domain_id: record.get("domain_id"),
      domain_name: record.get("domain_name"),
      total_weight: record.get("total_weight"),
      assignment_count: record.get("assignment_count"),
    }));

    return ok(contributions);
  } finally {
    await session.close();
  }
}

export async function handleRollDownContributionsByDomainGet(req: Request, domainId: string): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (r:RollDown)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment {domain_id: $domainId})
       OPTIONAL MATCH (r)-[:FOR_KPI]->(k:KPI)
       OPTIONAL MATCH (r)-[:FOR_OKR]->(o:OKRDirective)
       RETURN r.type AS type, r.id AS roll_down_id,
              k.name AS kpi_name, o.name AS okr_name,
              a.weight AS weight, a.target_value AS target_value,
              a.status AS status
       ORDER BY r.createdAt DESC`,
      { domainId },
    );

    const contributions = result.records.map((record) => ({
      type: record.get("type"),
      roll_down_id: record.get("roll_down_id"),
      name: record.get("kpi_name") || record.get("okr_name"),
      weight: record.get("weight"),
      target_value: record.get("target_value"),
      status: record.get("status"),
    }));

    return ok(contributions);
  } finally {
    await session.close();
  }
}

// =============================================================================
// Domain to Product Roll-Down Handlers
// =============================================================================

export const kpiProductRollDownSchema = z.object({
  kpi_id: uuidv7,
  domain_id: uuidv7,
  product_assignments: z.array(
    z.object({
      product_id: uuidv7,
      weight: z.number().min(0).max(100),
      target_value: z.number(),
    }),
  ),
});

export const okrProductRollDownSchema = z.object({
  okr_directive_id: uuidv7,
  domain_id: uuidv7,
  product_assignments: z.array(
    z.object({
      product_id: uuidv7,
      objectives: z.array(
        z.object({
          name: z.string().min(1).max(200),
          description: z.string().min(1).max(2000),
          key_results: z.array(
            z.object({
              name: z.string().min(1).max(200),
              description: z.string().min(1).max(2000),
              baseline_value: z.number(),
              target_value: z.number(),
              unit: z.string(),
              direction: z.enum(["higher_is_better", "lower_is_better"]),
            }),
          ),
        }),
      ),
    }),
  ),
});

export async function handleKpiProductRollDownPost(req: Request): Promise<Response> {
  const input = parseWith(kpiProductRollDownSchema, await readJson(req));
  const rollDownId = uuidv7.parse(generateId());
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE (r:RollDown {
          id: $rollDownId,
          type: 'kpi_product',
          kpi_id: $kpiId,
          domain_id: $domainId,
          createdAt: $now,
          status: 'pending'
        })`,
        { rollDownId, kpiId: input.kpi_id, domainId: input.domain_id, now },
      ),
    );

    for (const assignment of input.product_assignments) {
      await session.executeWrite((tx) =>
        tx.run(
          `CREATE (a:RollDownAssignment {
            id: $assignmentId,
            roll_down_id: $rollDownId,
            product_id: $productId,
            weight: $weight,
            target_value: $targetValue,
            status: 'pending',
            createdAt: $now
          })`,
          {
            assignmentId: uuidv7.parse(generateId()),
            rollDownId,
            productId: assignment.product_id,
            weight: assignment.weight,
            targetValue: assignment.target_value,
            now,
          },
        ),
      );
    }

    return ok({ id: rollDownId, status: "pending" });
  } finally {
    await session.close();
  }
}

export async function handleKpiProductRollDownGet(req: Request, domainId: string): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (r:RollDown {type: 'kpi_product', domain_id: $domainId})
       OPTIONAL MATCH (r)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment)
       OPTIONAL MATCH (r)-[:FOR_KPI]->(k:KPI)
       OPTIONAL MATCH (a)-[:FOR_PRODUCT]->(p:Product)
       RETURN r, a, k, p
       ORDER BY r.createdAt DESC`,
      { domainId },
    );

    const rollDowns = new Map();
    for (const record of result.records) {
      const rollDown = record.get("r");
      const assignment = record.get("a");
      const kpi = record.get("k");
      const product = record.get("p");

      if (!rollDowns.has(rollDown.id)) {
        rollDowns.set(rollDown.id, {
          id: rollDown.id,
          kpi_id: rollDown.kpi_id,
          kpi_name: kpi?.properties.name,
          domain_id: rollDown.domain_id,
          createdAt: rollDown.createdAt,
          status: rollDown.status,
          assignments: [],
        });
      }

      if (assignment) {
        rollDowns.get(rollDown.id).assignments.push({
          id: assignment.id,
          product_id: assignment.product_id,
          product_name: product?.properties.name,
          weight: assignment.weight,
          target_value: assignment.target_value,
          status: assignment.status,
        });
      }
    }

    return ok(Array.from(rollDowns.values()));
  } finally {
    await session.close();
  }
}

export async function handleOkrProductRollDownPost(req: Request): Promise<Response> {
  const input = parseWith(okrProductRollDownSchema, await readJson(req));
  const rollDownId = uuidv7.parse(generateId());
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE (r:RollDown {
          id: $rollDownId,
          type: 'okr_product',
          okr_directive_id: $okrDirectiveId,
          domain_id: $domainId,
          createdAt: $now,
          status: 'pending'
        })`,
        { rollDownId, okrDirectiveId: input.okr_directive_id, domainId: input.domain_id, now },
      ),
    );

    for (const productAssignment of input.product_assignments) {
      const assignmentId = uuidv7.parse(generateId());

      await session.executeWrite((tx) =>
        tx.run(
          `CREATE (a:RollDownAssignment {
            id: $assignmentId,
            roll_down_id: $rollDownId,
            product_id: $productId,
            status: 'pending',
            createdAt: $now
          })`,
          { assignmentId, rollDownId, productId: productAssignment.product_id, now },
        ),
      );

      for (const objective of productAssignment.objectives) {
        const objectiveId = uuidv7.parse(generateId());

        await session.executeWrite((tx) =>
          tx.run(
            `CREATE (o:RollDownObjective {
              id: $objectiveId,
              assignment_id: $assignmentId,
              name: $name,
              description: $description,
              createdAt: $now
            })`,
            { objectiveId, assignmentId, name: objective.name, description: objective.description, now },
          ),
        );

        for (const kr of objective.key_results) {
          const krId = uuidv7.parse(generateId());

          await session.executeWrite((tx) =>
            tx.run(
              `CREATE (kr:RollDownKeyResult {
                id: $krId,
                objective_id: $objectiveId,
                name: $name,
                description: $description,
                baseline_value: $baselineValue,
                target_value: $targetValue,
                unit: $unit,
                direction: $direction,
                createdAt: $now
              })`,
              {
                krId,
                objectiveId,
                name: kr.name,
                description: kr.description,
                baselineValue: kr.baseline_value,
                targetValue: kr.target_value,
                unit: kr.unit,
                direction: kr.direction,
                now,
              },
            ),
          );
        }
      }
    }

    return ok({ id: rollDownId, status: "pending" });
  } finally {
    await session.close();
  }
}

export async function handleOkrProductRollDownGet(req: Request, domainId: string): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (r:RollDown {type: 'okr_product', domain_id: $domainId})
       OPTIONAL MATCH (r)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment)
       OPTIONAL MATCH (r)-[:FOR_OKR]->(o:OKRDirective)
       OPTIONAL MATCH (a)-[:FOR_PRODUCT]->(p:Product)
       RETURN r, a, o, p
       ORDER BY r.createdAt DESC`,
      { domainId },
    );

    const rollDowns = new Map();
    for (const record of result.records) {
      const rollDown = record.get("r");
      const assignment = record.get("a");
      const okr = record.get("o");
      const product = record.get("p");

      if (!rollDowns.has(rollDown.id)) {
        rollDowns.set(rollDown.id, {
          id: rollDown.id,
          okr_directive_id: rollDown.okr_directive_id,
          okr_name: okr?.properties.name,
          domain_id: rollDown.domain_id,
          createdAt: rollDown.createdAt,
          status: rollDown.status,
          assignments: [],
        });
      }

      if (assignment) {
        rollDowns.get(rollDown.id).assignments.push({
          id: assignment.id,
          product_id: assignment.product_id,
          product_name: product?.properties.name,
          status: assignment.status,
        });
      }
    }

    return ok(Array.from(rollDowns.values()));
  } finally {
    await session.close();
  }
}

// =============================================================================
// Program to Product Roll-Down Handlers
// =============================================================================

export const kpiProgramRollDownSchema = z.object({
  kpi_id: uuidv7,
  program_id: uuidv7,
  product_assignments: z.array(
    z.object({
      product_id: uuidv7,
      weight: z.number().min(0).max(100),
      target_value: z.number(),
    }),
  ),
});

export const okrProgramRollDownSchema = z.object({
  okr_directive_id: uuidv7,
  program_id: uuidv7,
  product_assignments: z.array(
    z.object({
      product_id: uuidv7,
      objectives: z.array(
        z.object({
          name: z.string().min(1).max(200),
          description: z.string().min(1).max(2000),
          key_results: z.array(
            z.object({
              name: z.string().min(1).max(200),
              description: z.string().min(1).max(2000),
              baseline_value: z.number(),
              target_value: z.number(),
              unit: z.string(),
              direction: z.enum(["higher_is_better", "lower_is_better"]),
            }),
          ),
        }),
      ),
    }),
  ),
});

export async function handleKpiProgramRollDownPost(req: Request): Promise<Response> {
  const input = parseWith(kpiProgramRollDownSchema, await readJson(req));
  const rollDownId = uuidv7.parse(generateId());
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE (r:RollDown {
          id: $rollDownId,
          type: 'kpi_program',
          kpi_id: $kpiId,
          program_id: $programId,
          createdAt: $now,
          status: 'pending'
        })`,
        { rollDownId, kpiId: input.kpi_id, programId: input.program_id, now },
      ),
    );

    for (const assignment of input.product_assignments) {
      await session.executeWrite((tx) =>
        tx.run(
          `CREATE (a:RollDownAssignment {
            id: $assignmentId,
            roll_down_id: $rollDownId,
            product_id: $productId,
            weight: $weight,
            target_value: $targetValue,
            status: 'pending',
            createdAt: $now
          })`,
          {
            assignmentId: uuidv7.parse(generateId()),
            rollDownId,
            productId: assignment.product_id,
            weight: assignment.weight,
            targetValue: assignment.target_value,
            now,
          },
        ),
      );
    }

    return ok({ id: rollDownId, status: "pending" });
  } finally {
    await session.close();
  }
}

export async function handleKpiProgramRollDownGet(req: Request, programId: string): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (r:RollDown {type: 'kpi_program', program_id: $programId})
       OPTIONAL MATCH (r)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment)
       OPTIONAL MATCH (r)-[:FOR_KPI]->(k:KPI)
       OPTIONAL MATCH (a)-[:FOR_PRODUCT]->(p:Product)
       RETURN r, a, k, p
       ORDER BY r.createdAt DESC`,
      { programId },
    );

    const rollDowns = new Map();
    for (const record of result.records) {
      const rollDown = record.get("r");
      const assignment = record.get("a");
      const kpi = record.get("k");
      const product = record.get("p");

      if (!rollDowns.has(rollDown.id)) {
        rollDowns.set(rollDown.id, {
          id: rollDown.id,
          kpi_id: rollDown.kpi_id,
          kpi_name: kpi?.properties.name,
          program_id: rollDown.program_id,
          createdAt: rollDown.createdAt,
          status: rollDown.status,
          assignments: [],
        });
      }

      if (assignment) {
        rollDowns.get(rollDown.id).assignments.push({
          id: assignment.id,
          product_id: assignment.product_id,
          product_name: product?.properties.name,
          weight: assignment.weight,
          target_value: assignment.target_value,
          status: assignment.status,
        });
      }
    }

    return ok(Array.from(rollDowns.values()));
  } finally {
    await session.close();
  }
}

export async function handleOkrProgramRollDownPost(req: Request): Promise<Response> {
  const input = parseWith(okrProgramRollDownSchema, await readJson(req));
  const rollDownId = uuidv7.parse(generateId());
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE (r:RollDown {
          id: $rollDownId,
          type: 'okr_program',
          okr_directive_id: $okrDirectiveId,
          program_id: $programId,
          createdAt: $now,
          status: 'pending'
        })`,
        { rollDownId, okrDirectiveId: input.okr_directive_id, programId: input.program_id, now },
      ),
    );

    for (const productAssignment of input.product_assignments) {
      const assignmentId = uuidv7.parse(generateId());

      await session.executeWrite((tx) =>
        tx.run(
          `CREATE (a:RollDownAssignment {
            id: $assignmentId,
            roll_down_id: $rollDownId,
            product_id: $productId,
            status: 'pending',
            createdAt: $now
          })`,
          { assignmentId, rollDownId, productId: productAssignment.product_id, now },
        ),
      );

      for (const objective of productAssignment.objectives) {
        const objectiveId = uuidv7.parse(generateId());

        await session.executeWrite((tx) =>
          tx.run(
            `CREATE (o:RollDownObjective {
              id: $objectiveId,
              assignment_id: $assignmentId,
              name: $name,
              description: $description,
              createdAt: $now
            })`,
            { objectiveId, assignmentId, name: objective.name, description: objective.description, now },
          ),
        );

        for (const kr of objective.key_results) {
          const krId = uuidv7.parse(generateId());

          await session.executeWrite((tx) =>
            tx.run(
              `CREATE (kr:RollDownKeyResult {
                id: $krId,
                objective_id: $objectiveId,
                name: $name,
                description: $description,
                baseline_value: $baselineValue,
                target_value: $targetValue,
                unit: $unit,
                direction: $direction,
                createdAt: $now
              })`,
              {
                krId,
                objectiveId,
                name: kr.name,
                description: kr.description,
                baselineValue: kr.baseline_value,
                targetValue: kr.target_value,
                unit: kr.unit,
                direction: kr.direction,
                now,
              },
            ),
          );
        }
      }
    }

    return ok({ id: rollDownId, status: "pending" });
  } finally {
    await session.close();
  }
}

export async function handleOkrProgramRollDownGet(req: Request, programId: string): Promise<Response> {
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (r:RollDown {type: 'okr_program', program_id: $programId})
       OPTIONAL MATCH (r)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment)
       OPTIONAL MATCH (r)-[:FOR_OKR]->(o:OKRDirective)
       OPTIONAL MATCH (a)-[:FOR_PRODUCT]->(p:Product)
       RETURN r, a, o, p
       ORDER BY r.createdAt DESC`,
      { programId },
    );

    const rollDowns = new Map();
    for (const record of result.records) {
      const rollDown = record.get("r");
      const assignment = record.get("a");
      const okr = record.get("o");
      const product = record.get("p");

      if (!rollDowns.has(rollDown.id)) {
        rollDowns.set(rollDown.id, {
          id: rollDown.id,
          okr_directive_id: rollDown.okr_directive_id,
          okr_name: okr?.properties.name,
          program_id: rollDown.program_id,
          createdAt: rollDown.createdAt,
          status: rollDown.status,
          assignments: [],
        });
      }

      if (assignment) {
        rollDowns.get(rollDown.id).assignments.push({
          id: assignment.id,
          product_id: assignment.product_id,
          product_name: product?.properties.name,
          status: assignment.status,
        });
      }
    }

    return ok(Array.from(rollDowns.values()));
  } finally {
    await session.close();
  }
}

// =============================================================================
// Approval Workflow Handlers
// =============================================================================

export const approveRollDownSchema = z.object({
  assignment_id: uuidv7,
  approver_id: z.string(),
  notes: z.string().optional(),
});

export const rejectRollDownSchema = z.object({
  assignment_id: uuidv7,
  rejecter_id: z.string(),
  reason: z.string().min(1).max(1000),
});

export async function handleRollDownApprove(req: Request): Promise<Response> {
  const input = parseWith(approveRollDownSchema, await readJson(req));
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    await session.executeWrite((tx) =>
      tx.run(
        `MATCH (a:RollDownAssignment {id: $assignmentId})
         SET a.status = 'approved',
             a.approved_at = $now,
             a.approver_id = $approverId,
             a.approval_notes = $notes
         RETURN a`,
        { assignmentId: input.assignment_id, approverId: input.approver_id, notes: input.notes || null, now },
      ),
    );

    return ok({ status: "approved" });
  } finally {
    await session.close();
  }
}

export async function handleRollDownReject(req: Request): Promise<Response> {
  const input = parseWith(rejectRollDownSchema, await readJson(req));
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    await session.executeWrite((tx) =>
      tx.run(
        `MATCH (a:RollDownAssignment {id: $assignmentId})
         SET a.status = 'rejected',
             a.rejected_at = $now,
             a.rejecter_id = $rejecterId,
             a.rejection_reason = $reason
         RETURN a`,
        { assignmentId: input.assignment_id, rejecterId: input.rejecter_id, reason: input.reason, now },
      ),
    );

    return ok({ status: "rejected" });
  } finally {
    await session.close();
  }
}

// =============================================================================
// Notification Handlers
// =============================================================================

export const notifyRollDownSchema = z.object({
  assignment_id: uuidv7,
  recipient_id: z.string(),
  message: z.string().min(1).max(500),
  notification_type: z.enum(["roll_down_assigned", "roll_down_approved", "roll_down_rejected", "roll_down_reminder"]),
});

export async function handleRollDownNotify(req: Request): Promise<Response> {
  const input = parseWith(notifyRollDownSchema, await readJson(req));
  const notificationId = uuidv7.parse(generateId());
  const now = new Date().toISOString();

  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    await session.executeWrite((tx) =>
      tx.run(
        `CREATE (n:Notification {
          id: $notificationId,
          assignment_id: $assignmentId,
          recipient_id: $recipientId,
          message: $message,
          notification_type: $notificationType,
          read: false,
          created_at: $now
        }) RETURN n`,
        {
          notificationId,
          assignmentId: input.assignment_id,
          recipientId: input.recipient_id,
          message: input.message,
          notificationType: input.notification_type,
          now,
        },
      ),
    );

    return ok({ id: notificationId, status: "sent" });
  } finally {
    await session.close();
  }
}

// =============================================================================
// SLA Roll-Down Handlers (Domain to Products)
// =============================================================================

export const slaDomainRollDownSchema = z.object({
  domain_id: uuidv7,
  sla_ids: z.array(uuidv7),
  product_assignments: z.array(z.object({
    product_id: uuidv7,
    product_type: z.enum(["application", "data"]),
    weight: z.number().min(0).max(1),
    target_value: z.number(),
  })),
});

export async function handleSlaDomainRollDownPost(req: Request): Promise<Response> {
  // DD-01 rule (iii) — the pre-existing try/catch flatten mapper was the
  // one handler already mapping ZodError to 400, with details:
  // e.flatten() and message "schema validation failed". Standardized to
  // the parseWith details.issues[] shape + "invalid_payload" message —
  // the third sanctioned contract change, pinned in
  // roll-down.integration.test.ts (req-review pass-2 C-01).
  const input = parseWith(slaDomainRollDownSchema, await readJson(req));

  if (input.sla_ids.length === 0) {
    return error(400, "invalid_payload", "sla_ids must not be empty", {});
  }
  if (input.product_assignments.length === 0) {
    return error(400, "invalid_payload", "product_assignments must not be empty", {});
  }

  const now = new Date().toISOString();
  const driver: Driver = getDriver();
  const session = driver.session();

  try {
    const rollDownId = generateId();
    const assignmentIds = input.product_assignments.map(() => generateId());

    await session.executeWrite(async (tx) => {
      // Verify domain exists
      const domainCheck = await tx.run(
        `MATCH (d:Domain {id: $domainId}) RETURN d.id`,
        { domainId: input.domain_id },
      );
      if (domainCheck.records.length === 0) {
        throw new Error(`Domain not found: ${input.domain_id}`);
      }

      // Verify all SLAs exist
      const slaCheck = await tx.run(
        `MATCH (s:SLA) WHERE s.id IN $slaIds AND s.archived_at IS NULL RETURN s.id AS id`,
        { slaIds: input.sla_ids },
      );
      if (slaCheck.records.length !== input.sla_ids.length) {
        throw new Error("One or more SLAs not found or archived");
      }

      // Verify all products exist
      const productIds = input.product_assignments.map((a) => a.product_id);
      const productCheck = await tx.run(
        `MATCH (p:Product) WHERE p.id IN $productIds RETURN p.id AS id`,
        { productIds },
      );
      if (productCheck.records.length !== productIds.length) {
        throw new Error("One or more products not found");
      }

      // Create RollDown node
      await tx.run(
        `CREATE (r:RollDown {
          id: $rollDownId,
          type: 'sla_domain',
          domain_id: $domainId,
          status: 'pending',
          createdAt: $now
        })`,
        { rollDownId, domainId: input.domain_id, now },
      );

      // Attach SLAs
      await tx.run(
        `MATCH (r:RollDown {id: $rollDownId})
         MATCH (s:SLA) WHERE s.id IN $slaIds
         CREATE (r)-[:FOR_SLA]->(s)`,
        { rollDownId, slaIds: input.sla_ids },
      );

      // Create assignments in a single batched query
      for (let i = 0; i < input.product_assignments.length; i++) {
        const assignment = input.product_assignments[i]!;
        await tx.run(
          `MATCH (r:RollDown {id: $rollDownId})
           MATCH (p:Product {id: $productId})
           CREATE (r)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment {
             id: $assignmentId,
             product_id: $productId,
             product_type: $productType,
             weight: $weight,
             target_value: $targetValue,
             status: 'pending',
             created_at: $now
           })-[:FOR_PRODUCT]->(p)`,
          {
            rollDownId,
            assignmentId: assignmentIds[i],
            productId: assignment.product_id,
            productType: assignment.product_type,
            weight: assignment.weight,
            targetValue: assignment.target_value,
            now,
          },
        );
      }
    });

    return ok({ id: rollDownId, status: "created" });
  } catch (e) {
    if (e instanceof Error && (e.message.includes("not found") || e.message.includes("archived"))) {
      return error(422, "not_found", e.message, {});
    }
    throw e;
  } finally {
    await session.close();
  }
}

export async function handleSlaDomainRollDownGet(req: Request, domainId: string): Promise<Response> {
  const id = parseId(domainId);
  if (!id) return error(400, "invalid_payload", "malformed domain_id", { domain_id: domainId });

  const driver: Driver = getDriver();
  const session = driver.session({ defaultAccessMode: "READ" });

  try {
    const result = await session.run(
      `MATCH (r:RollDown {type: 'sla_domain', domain_id: $domainId})
       OPTIONAL MATCH (r)-[:HAS_ASSIGNMENT]->(a:RollDownAssignment)
       OPTIONAL MATCH (r)-[:FOR_SLA]->(s:SLA)
       OPTIONAL MATCH (a)-[:FOR_PRODUCT]->(p:Product)
       RETURN r, a, s, p
       ORDER BY r.createdAt DESC`,
      { domainId: id },
    );

    const rollDowns = new Map();
    for (const record of result.records) {
      const rollDown = record.get("r");
      const assignment = record.get("a");
      const sla = record.get("s");
      const product = record.get("p");

      const rd = rollDown?.properties;
      if (!rd) continue;

      if (!rollDowns.has(rd.id)) {
        rollDowns.set(rd.id, {
          id: rd.id,
          sla_id: sla?.properties?.id,
          sla_name: sla?.properties?.name,
          domain_id: rd.domain_id,
          createdAt: rd.createdAt,
          status: rd.status,
          assignments: [],
        });
      }

      if (assignment) {
        const a = assignment.properties;
        rollDowns.get(rd.id).assignments.push({
          id: a.id,
          product_id: a.product_id,
          product_type: a.product_type,
          product_name: product?.properties?.name,
          status: a.status,
          weight: a.weight,
          target_value: a.target_value,
        });
      }
    }

    return ok(Array.from(rollDowns.values()));
  } finally {
    await session.close();
  }
}
