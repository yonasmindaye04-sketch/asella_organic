import { jest, describe, it, expect } from '@jest/globals';
import request from 'supertest';
import app from '../app.js';

jest.setTimeout(15_000);

describe('Health Check API', () => {
  it('should respond with 200 or 503 depending on service status', async () => {
    const res = await request(app).get('/api/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('timestamp');
  });

  it('should return JSON with db and telegram status fields', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toHaveProperty('db');
    expect(res.body).toHaveProperty('telegram');
    expect(typeof res.body.db).toBe('boolean');
    expect(typeof res.body.telegram).toBe('boolean');
  });
});

describe('404 handler', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/nonexistent-route');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('error', 'Not found');
  });
});
