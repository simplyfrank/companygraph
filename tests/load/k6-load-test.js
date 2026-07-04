// k6 load test for CompanyGraph API
// Baseline: 250 concurrent users

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 50 },   // Stay at 50 users
    { duration: '2m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 250 },  // Ramp up to 250 users (baseline)
    { duration: '10m', target: 250 }, // Stay at 250 users
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s
    http_req_failed: ['rate<0.01'], // Error rate < 1%
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8787';

// Test data
const journeyIds = ['journey-1', 'journey-2', 'journey-3'];
const domainIds = ['domain-1', 'domain-2'];

export default function () {
  // Health check
  const healthRes = http.get(`${BASE_URL}/api/v1/healthz`);
  check(healthRes, {
    'health status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  // Get schema
  const schemaRes = http.get(`${BASE_URL}/api/v1/schema`);
  check(schemaRes, {
    'schema status is 200': (r) => r.status === 200,
    'schema has node labels': (r) => JSON.parse(r.body).node_labels !== undefined,
  }) || errorRate.add(1);

  // Get journeys
  const journeyId = journeyIds[Math.floor(Math.random() * journeyIds.length)];
  const journeyRes = http.get(`${BASE_URL}/api/v1/journeys/${journeyId}`);
  check(journeyRes, {
    'journey status is 200': (r) => r.status === 200 || r.status === 404, // 404 acceptable for missing data
  }) || errorRate.add(1);

  // Get domains
  const domainId = domainIds[Math.floor(Math.random() * domainIds.length)];
  const domainRes = http.get(`${BASE_URL}/api/v1/domains/${domainId}`);
  check(domainRes, {
    'domain status is 200': (r) => r.status === 200 || r.status === 404,
  }) || errorRate.add(1);

  // Get KPI trends (analytics endpoint)
  const kpiRes = http.get(`${BASE_URL}/api/v1/kpi/trends?days=30`);
  check(kpiRes, {
    'kpi trends status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  // Get SLA breaches
  const slaRes = http.get(`${BASE_URL}/api/v1/sla/breaches?limit=50`);
  check(slaRes, {
    'sla breaches status is 200': (r) => r.status === 200,
  }) || errorRate.add(1);

  // Small think time between iterations
  sleep(Math.random() * 2 + 1);
}
