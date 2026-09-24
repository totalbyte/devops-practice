// k6 load test for the Relativa stack (runs against the Gateway).
//
//   k6 run tests/load/relativa.js
//   k6 run -e PROFILE=spike -e RATE=5 tests/load/relativa.js
//
// Environment:
//   GATEWAY          Gateway base URL                  (default http://localhost:8080)
//   ADMIN_EMAIL      seeded account used for the run   (default admin@relativa.com)
//   ADMIN_PASSWORD                                     (default Demo1234!)
//   PROFILE          smoke | ramp | spike | soak       (default smoke)
//   RATE             requests per second per scenario  (default 3)
//   DURATION         seconds per stage                 (default 20)
//   SOAK_DURATION    seconds for the soak profile      (default 120)
//   SPIKE_MULTIPLIER rate multiplier for the spike     (default 5)
//   P95_MS           p95 latency threshold, ms         (default 3000)
//   MAX_FAIL_RATE    allowed share of failed requests  (default 0.05)
//   WARMUP_ROUNDS    untimed passes over read endpoints before the run (default 3)
//
// Every scenario gets its own p95 + error-rate threshold, so k6 exits non-zero
// (and the CI job fails) when any endpoint breaches them.

import http from 'k6/http';
import { check, fail, group } from 'k6';
import exec from 'k6/execution';

const GATEWAY = (__ENV.GATEWAY || 'http://localhost:8080').replace(/\/+$/, '');
const ADMIN_EMAIL = __ENV.ADMIN_EMAIL || 'admin@relativa.com';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'Demo1234!';
const PROFILE = (__ENV.PROFILE || 'smoke').toLowerCase();
const RATE = Number(__ENV.RATE || 3);
const DURATION = Number(__ENV.DURATION || 20);
const SOAK_DURATION = Number(__ENV.SOAK_DURATION || 120);
const SPIKE_MULTIPLIER = Math.max(2, Number(__ENV.SPIKE_MULTIPLIER || 5));
const P95_MS = Number(__ENV.P95_MS || 3000);
const MAX_FAIL_RATE = Number(__ENV.MAX_FAIL_RATE || 0.05);
const WARMUP_ROUNDS = Number(__ENV.WARMUP_ROUNDS || 3);

// Read-only endpoints; `{org}` / `{ws}` are filled in from setup() data.
const READ_ENDPOINTS = {
  graph_build: '/graph/api/v1/graph?organizationId={org}',
  org_dashboard_summary: '/graph/api/v1/dashboard/summary?organizationId={org}',
  org_dashboard_pipeline: '/graph/api/v1/dashboard/pipeline?organizationId={org}',
  org_dashboard_risk: '/graph/api/v1/dashboard/risk-distribution?organizationId={org}',
  org_dashboard_trends: '/graph/api/v1/dashboard/trends?organizationId={org}',
  org_dashboard_top_entities: '/graph/api/v1/dashboard/top-entities?organizationId={org}',
  workspace_dashboard_summary: '/graph/api/v1/dashboard/workspace/{ws}/summary',
  workspace_dashboard_risk: '/graph/api/v1/dashboard/workspace/{ws}/risk-distribution',
  entity_list: '/core/api/v1/workspaces/{ws}/entities/?take=50',
  organizations_list: '/core/api/v1/organizations/',
  workspaces_list: '/core/api/v1/workspaces/?organizationId={org}',
  audit_log: '/audit/audit-log?entity_type=organization&organization_id={org}',
};

// Write scenarios run at a lower rate than the reads, like the original suite.
const WRITE_SCENARIOS = {
  user_journey: { exec: 'userJourney', rate: Math.max(1, Math.floor(RATE / 3)) },
  auth_login: { exec: 'authLogin', rate: Math.max(1, Math.floor(RATE / 2)) },
  workspace_create: { exec: 'workspaceCreate', rate: Math.max(1, Math.floor(RATE / 2)) },
  entity_create: { exec: 'entityCreate', rate: Math.max(1, Math.floor(RATE / 2)) },
  entity_relationship_reassign: {
    exec: 'relationshipReassign',
    rate: Math.max(1, Math.floor(RATE / 3)),
  },
};

function stagesFor(rate) {
  switch (PROFILE) {
    case 'ramp':
      return [
        { target: rate, duration: `${DURATION}s` },
        { target: rate, duration: `${DURATION}s` },
      ];
    case 'spike':
      return [
        { target: rate, duration: '1s' },
        { target: rate, duration: `${DURATION}s` },
        { target: rate * SPIKE_MULTIPLIER, duration: '1s' },
        { target: rate * SPIKE_MULTIPLIER, duration: `${Math.max(5, Math.floor(DURATION / 2))}s` },
        { target: rate, duration: '1s' },
        { target: rate, duration: `${DURATION}s` },
      ];
    case 'soak':
      return [{ target: rate, duration: `${SOAK_DURATION}s` }];
    default:
      return [{ target: rate, duration: `${DURATION}s` }];
  }
}

function scenario(exec, rate, env = {}) {
  const peak = PROFILE === 'spike' ? rate * SPIKE_MULTIPLIER : rate;
  return {
    executor: 'ramping-arrival-rate',
    startRate: PROFILE === 'ramp' ? 0 : rate,
    timeUnit: '1s',
    stages: stagesFor(rate),
    preAllocatedVUs: Math.max(2, peak * 2),
    maxVUs: Math.max(10, peak * 10),
    exec,
    env,
  };
}

const scenarios = {};
const thresholds = {
  http_req_failed: [`rate<=${MAX_FAIL_RATE}`],
  checks: [`rate>=${1 - MAX_FAIL_RATE}`],
};

for (const name of Object.keys(READ_ENDPOINTS)) {
  scenarios[name] = scenario('authedGet', RATE, { ENDPOINT: name });
}
for (const [name, cfg] of Object.entries(WRITE_SCENARIOS)) {
  scenarios[name] = scenario(cfg.exec, cfg.rate);
}
for (const name of Object.keys(scenarios)) {
  thresholds[`http_req_duration{scenario:${name}}`] = [`p(95)<${P95_MS}`];
  thresholds[`http_req_failed{scenario:${name}}`] = [`rate<=${MAX_FAIL_RATE}`];
}

export const options = {
  scenarios,
  thresholds,
  setupTimeout: '120s',
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

// ---------------------------------------------------------------------------
// helpers

function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

function expect2xx(res, label) {
  return check(res, { [`${label}: 2xx`]: (r) => r.status >= 200 && r.status < 300 });
}

function login() {
  const res = http.post(
    `${GATEWAY}/auth/api/v1/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'auth_login' } },
  );
  if (res.status !== 200) fail(`login returned ${res.status}`);
  const token = res.json('accessToken');
  if (!token) fail('login succeeded but no accessToken was returned (two-factor enabled?)');
  return token;
}

function hasRequiredOutgoing(type) {
  return (type.outgoingRelationships || []).some((r) => r.isRequired);
}

function sampleValue(prop) {
  if (prop.allowedValues && prop.allowedValues.length > 0) return prop.allowedValues[0].value;
  switch (prop.dataType) {
    case 'Int':
    case 'Decimal':
      return '1';
    case 'Bool':
      return 'true';
    case 'Date':
      return '2026-01-01';
    default:
      return 'load';
  }
}

function createBody(type) {
  return {
    entityTypeId: type.id,
    properties: (type.properties || [])
      .filter((p) => p.isRequired)
      .map((p) => ({ propertyId: p.propertyId, value: sampleValue(p) })),
    links: [],
  };
}

function createEntity(params, workspaceId, type) {
  const res = http.post(
    `${GATEWAY}/core/api/v1/workspaces/${workspaceId}/entities/`,
    JSON.stringify(createBody(type)),
    params,
  );
  return res.status >= 200 && res.status < 300 ? res.json('id') : null;
}

// Creates source -> targetA link plus a spare targetB so the reassign scenario
// can toggle the relationship between the two targets.
function seedReassign(params, workspaceId, types) {
  for (const src of types) {
    const rel = (src.outgoingRelationships || [])[0];
    if (hasRequiredOutgoing(src) || !rel) continue;
    const targetType = types.find((t) => t.id === rel.targetEntityTypeId);
    if (!targetType || hasRequiredOutgoing(targetType)) continue;

    const source = createEntity(params, workspaceId, src);
    const a = createEntity(params, workspaceId, targetType);
    const b = createEntity(params, workspaceId, targetType);
    if (!source || !a || !b) continue;

    const res = http.post(
      `${GATEWAY}/core/api/v1/workspaces/${workspaceId}/entity-relationships`,
      JSON.stringify({
        sourceEntityId: source,
        targetEntityId: a,
        relationshipTypeId: rel.relationshipTypeId,
      }),
      params,
    );
    if (res.status < 200 || res.status >= 300) continue;
    const relId = res.json('id') || res.json('relationshipId');
    if (relId) return { relId, targetA: a, targetB: b };
  }
  return null;
}

// ---------------------------------------------------------------------------
// lifecycle

export function setup() {
  const token = login();
  const params = authHeaders(token);

  const orgs = http.get(`${GATEWAY}/core/api/v1/organizations/`, params);
  if (orgs.status !== 200 || orgs.json().length === 0) {
    fail('the load-test account belongs to no organization');
  }
  const orgId = orgs.json()[0].id;

  let workspaceId;
  const workspaces = http.get(`${GATEWAY}/core/api/v1/workspaces/?organizationId=${orgId}`, params);
  if (workspaces.status === 200 && workspaces.json().length > 0) {
    workspaceId = workspaces.json()[0].id;
  } else {
    const created = http.post(
      `${GATEWAY}/core/api/v1/workspaces`,
      JSON.stringify({ name: `LoadTest ${Date.now()}`, organizationId: orgId }),
      params,
    );
    if (created.status < 200 || created.status >= 300) fail(`workspace create returned ${created.status}`);
    workspaceId = created.json('id');
  }

  let entityCreateBody = null;
  let reassign = null;
  const typesRes = http.get(`${GATEWAY}/core/api/v1/entity-types`, params);
  if (typesRes.status === 200) {
    const types = typesRes.json();
    const creatable = types.find((t) => !hasRequiredOutgoing(t));
    entityCreateBody = creatable ? createBody(creatable) : null;
    reassign = seedReassign(params, workspaceId, types);
  }

  // Warm-up (replaces NBomber's WarmUpDuration): the first calls pay for JIT, EF model
  // building and cold query plans. setup() requests carry no `scenario` tag, so they do
  // not count towards the per-scenario thresholds.
  for (let round = 0; round < WARMUP_ROUNDS; round++) {
    for (const path of Object.values(READ_ENDPOINTS)) {
      http.get(`${GATEWAY}${path.replace('{org}', orgId).replace('{ws}', workspaceId)}`, params);
    }
  }

  console.log(
    `Authenticated as ${ADMIN_EMAIL} via ${GATEWAY}; orgId=${orgId}, workspaceId=${workspaceId}; ` +
      `profile=${PROFILE}, rate=${RATE}/s, duration=${DURATION}s, warm-up rounds=${WARMUP_ROUNDS}.`,
  );
  if (!entityCreateBody) console.warn('entity_create: no entity type creatable without links');
  if (!reassign) console.warn('entity_relationship_reassign: no reassignable relationship seeded');

  return { token, orgId, workspaceId, entityCreateBody, reassign };
}

// ---------------------------------------------------------------------------
// scenario functions (referenced by `exec` above)

export function authedGet(data) {
  const name = __ENV.ENDPOINT;
  const path = READ_ENDPOINTS[name].replace('{org}', data.orgId).replace('{ws}', data.workspaceId);
  const params = authHeaders(data.token);
  params.tags = { name };
  expect2xx(http.get(`${GATEWAY}${path}`, params), name);
}

export function userJourney(data) {
  const params = authHeaders(data.token);
  group('user_journey', () => {
    for (const step of ['org_dashboard_summary', 'graph_build', 'entity_list']) {
      const path = READ_ENDPOINTS[step]
        .replace('{org}', data.orgId)
        .replace('{ws}', data.workspaceId);
      expect2xx(http.get(`${GATEWAY}${path}`, { ...params, tags: { name: step } }), step);
    }
  });
}

export function authLogin() {
  const res = http.post(
    `${GATEWAY}/auth/api/v1/auth/login`,
    JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'auth_login' } },
  );
  expect2xx(res, 'auth_login');
}

export function workspaceCreate(data) {
  const params = authHeaders(data.token);
  params.tags = { name: 'workspace_create' };
  const body = JSON.stringify({
    name: `LoadWS ${exec.scenario.iterationInTest}-${Date.now()}`,
    organizationId: data.orgId,
  });
  expect2xx(http.post(`${GATEWAY}/core/api/v1/workspaces`, body, params), 'workspace_create');
}

export function entityCreate(data) {
  if (!data.entityCreateBody) return;
  const params = authHeaders(data.token);
  params.tags = { name: 'entity_create' };
  const res = http.post(
    `${GATEWAY}/core/api/v1/workspaces/${data.workspaceId}/entities/`,
    JSON.stringify(data.entityCreateBody),
    params,
  );
  expect2xx(res, 'entity_create');
}

export function relationshipReassign(data) {
  if (!data.reassign) return;
  const { relId, targetA, targetB } = data.reassign;
  const target = exec.scenario.iterationInTest % 2 === 0 ? targetA : targetB;
  const params = authHeaders(data.token);
  params.tags = { name: 'entity_relationship_reassign' };
  const res = http.put(
    `${GATEWAY}/core/api/v1/workspaces/${data.workspaceId}/entity-relationships/${relId}`,
    JSON.stringify({ newSourceEntityId: null, newTargetEntityId: target }),
    params,
  );
  expect2xx(res, 'entity_relationship_reassign');
}
