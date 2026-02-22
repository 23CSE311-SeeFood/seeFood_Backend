const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

jest.mock('../../lib/prisma', () => ({
  student: {
    upsert: jest.fn(),
  },
}));

const prisma = require('../../lib/prisma');

// Stub fetch before the microsoft router is loaded so it uses this instead of node-fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const microsoftRouter = require('../../routes/microsoft');

const app = express();
app.use(express.json());
app.use('/microsoft', microsoftRouter);

const originalEnv = { ...process.env };

function createState(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

describe('Microsoft Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  describe('GET /microsoft/login', () => {
    it('should return 500 if OAuth is not configured', async () => {
      process.env.MS_CLIENT_ID = '';
      process.env.MS_REDIRECT_URI = '';

      const res = await request(app).get('/microsoft/login');

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Microsoft OAuth not configured' });
    });

    it('should return 400 if app redirect is missing', async () => {
      process.env.MS_CLIENT_ID = 'client-id';
      process.env.MS_REDIRECT_URI = 'https://example.com/ms/callback';
      process.env.MS_APP_REDIRECT = '';

      const res = await request(app).get('/microsoft/login');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Missing app redirect' });
    });

    it('should redirect to Microsoft authorize with state when configured', async () => {
      process.env.MS_CLIENT_ID = 'client-id';
      process.env.MS_REDIRECT_URI = 'https://example.com/ms/callback';
      process.env.MS_APP_REDIRECT = 'https://app.example.com/after-login';
      process.env.MS_STATE_SECRET = 'state-secret';
      process.env.JWT_SECRET = 'jwt-secret';

      const res = await request(app).get('/microsoft/login');

      expect(res.status).toBe(302);
      const location = res.headers.location;
      expect(location).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');

      const url = new URL(location);
      expect(url.searchParams.get('client_id')).toBe('client-id');
      expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/ms/callback');
      expect(url.searchParams.get('scope')).toBe(
        process.env.MS_SCOPES || 'openid profile email offline_access User.Read'
      );
      const state = url.searchParams.get('state');
      expect(state).toBeTruthy();
    });
  });

  describe('GET /microsoft/callback', () => {
    it('should return 500 if OAuth is not configured', async () => {
      process.env.MS_CLIENT_ID = '';
      process.env.MS_CLIENT_SECRET = '';
      process.env.MS_REDIRECT_URI = '';

      const res = await request(app).get('/microsoft/callback').query({ code: 'abc', state: 'xyz' });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Microsoft OAuth not configured' });
    });

    it('should handle Microsoft error in query', async () => {
      process.env.MS_CLIENT_ID = 'client-id';
      process.env.MS_CLIENT_SECRET = 'client-secret';
      process.env.MS_REDIRECT_URI = 'https://example.com/ms/callback';

      const res = await request(app)
        .get('/microsoft/callback')
        .query({ error: 'access_denied', error_description: 'User denied' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'Microsoft auth error',
        details: 'User denied',
      });
    });

    it('should return 400 if code or state is missing', async () => {
      process.env.MS_CLIENT_ID = 'client-id';
      process.env.MS_CLIENT_SECRET = 'client-secret';
      process.env.MS_REDIRECT_URI = 'https://example.com/ms/callback';

      const res = await request(app)
        .get('/microsoft/callback')
        .query({ code: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Missing code or state' });
    });

    it('should return 400 for invalid state', async () => {
      process.env.MS_CLIENT_ID = 'client-id';
      process.env.MS_CLIENT_SECRET = 'client-secret';
      process.env.MS_REDIRECT_URI = 'https://example.com/ms/callback';
      process.env.MS_STATE_SECRET = 'state-secret';

      const res = await request(app)
        .get('/microsoft/callback')
        .query({ code: 'abc', state: 'invalid.state' });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid state' });
    });

    it('should return 400 for expired state', async () => {
      const secret = 'state-secret';
      process.env.MS_CLIENT_ID = 'client-id';
      process.env.MS_CLIENT_SECRET = 'client-secret';
      process.env.MS_REDIRECT_URI = 'https://example.com/ms/callback';
      process.env.MS_STATE_SECRET = secret;

      const pastTs = Date.now() - 11 * 60 * 1000; // older than 10 minutes
      const state = createState({ ts: pastTs, redirect: 'https://app.example.com/callback' }, secret);

      const res = await request(app)
        .get('/microsoft/callback')
        .query({ code: 'abc', state });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'State expired' });
    });

    it('should return 500 if JWT secret is not configured', async () => {
      const secret = 'state-secret';
      const redirectUrl = 'https://app.example.com/callback';

      process.env.MS_CLIENT_ID = 'client-id';
      process.env.MS_CLIENT_SECRET = 'client-secret';
      process.env.MS_REDIRECT_URI = 'https://example.com/ms/callback';
      process.env.MS_STATE_SECRET = secret;
      process.env.JWT_SECRET = '';

      const state = createState({ ts: Date.now(), redirect: redirectUrl }, secret);

      const email = 'user@cb.students.amrita.edu';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'access-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ mail: email, displayName: 'User' }),
        });

      prisma.student.upsert.mockResolvedValue({
        id: 1,
        email,
        name: 'User',
      });

      const res = await request(app)
        .get('/microsoft/callback')
        .query({ code: 'abc', state });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'JWT secret not configured' });
    });

    it('should create a new student and redirect with JWT token', async () => {
      const secret = 'state-secret';
      const redirectUrl = 'https://app.example.com/callback';
      const email = 'user@cb.students.amrita.edu';

      process.env.MS_CLIENT_ID = 'client-id';
      process.env.MS_CLIENT_SECRET = 'client-secret';
      process.env.MS_REDIRECT_URI = 'https://example.com/ms/callback';
      process.env.MS_STATE_SECRET = secret;
      process.env.JWT_SECRET = 'jwt-secret';

      const state = createState({ ts: Date.now(), redirect: redirectUrl }, secret);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'access-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ mail: email, displayName: 'User Name' }),
        });

      prisma.student.upsert.mockResolvedValue({
        id: 1,
        email,
        name: 'User Name',
        number: null,
        branch: null,
        rollNumber: null,
        password: 'hashed-password',
      });

      const res = await request(app)
        .get('/microsoft/callback')
        .query({ code: 'abc', state });

      expect(res.status).toBe(302);
      const location = res.headers.location;
      const url = new URL(location);

      expect(url.origin + url.pathname).toBe(redirectUrl);

      const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
      const token = hashParams.get('token');
      expect(token).toBeTruthy();

      const payload = jwt.verify(token, 'jwt-secret');
      expect(payload.sub).toBe(1);
      expect(payload.email).toBe(email);
      expect(payload.name).toBe('User Name');

      expect(prisma.student.upsert).toHaveBeenCalledWith({
        where: { email },
        update: {},
        create: {
          name: 'User Name',
          email,
          number: null,
          branch: null,
          rollNumber: null,
          password: expect.any(String),
        },
      });
    });
  });
});
