const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const app = require('../server');
const { getDatabase } = require('../src/db/database');
const { seedDatabase } = require('../src/db/seed');

describe('REST API Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    seedDatabase(true);
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  test('GET /api/health should return application metadata', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'healthy');
    assert.ok(body.application.includes('Smart Hospital Emergency Resource Manager'));
  });

  test('GET /api/dashboard/summary should return computed resource statistics', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/summary`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.beds.total >= 20);
    assert.ok(body.data.doctors.total >= 8);
    assert.ok(body.data.ambulances.total >= 5);
  });

  test('GET /api/dashboard/charts should return aggregation structures', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard/charts`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(Array.isArray(body.data.bedsByWard));
    assert.ok(Array.isArray(body.data.doctorSpecialties));
    assert.ok(Array.isArray(body.data.ambulanceStatus));
    assert.ok(Array.isArray(body.data.casesByPriority));
  });

  test('GET /api/cases should support search and pagination', async () => {
    const res = await fetch(`${baseUrl}/api/cases?limit=5&page=1`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.length, 5);
    assert.ok(body.pagination.total >= 10);
  });

  test('GET /api/settings/priorities should return priority scores', async () => {
    const res = await fetch(`${baseUrl}/api/settings/priorities`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    const critical = body.data.find((p) => p.priority_key === 'Critical');
    assert.ok(critical);
    assert.strictEqual(critical.score, 100);
  });

  test('Authentication: Login with invalid password fails, valid succeeds', async () => {
    // 1. Invalid
    const badRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'coordinator', password: 'wrongpassword' }),
    });
    assert.strictEqual(badRes.status, 401);

    // 2. Valid
    const goodRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'coordinator', password: 'coord123' }),
    });
    assert.strictEqual(goodRes.status, 200);
    const goodBody = await goodRes.json();
    assert.strictEqual(goodBody.success, true);
    assert.strictEqual(goodBody.user.role, 'coordinator');
  });

  test('Protected Route: POST /api/cases requires authentication', async () => {
    const res = await fetch(`${baseUrl}/api/cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'Trauma',
        priority: 'High',
        care_area: 'Trauma Bay',
      }),
    });
    assert.strictEqual(res.status, 401);
  });

  test.after(() => {
    if (server) {
      server.close();
    }
  });
});
