const express = require('express');
const request = require('supertest');
const canteensRouter = require('../../routes/canteens');

jest.mock('../../lib/prisma', () => ({
  canteen: {
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
}));

const prisma = require('../../lib/prisma');

const app = express();
app.use(express.json());
app.use('/canteens', canteensRouter);

describe('Canteens Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /canteens', () => {
    it('should return all canteens successfully', async () => {
      const mockCanteens = [
        { id: 1, name: 'Canteen A', ratings: 4.5 },
        { id: 2, name: 'Canteen B', ratings: null },
      ];
      prisma.canteen.findMany.mockResolvedValue(mockCanteens);

      const response = await request(app).get('/canteens');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCanteens);
      expect(prisma.canteen.findMany).toHaveBeenCalledWith({
        orderBy: { id: 'asc' },
      });
    });

    it('should handle database error', async () => {
      prisma.canteen.findMany.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/canteens');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch canteens' });
    });
  });

  describe('POST /canteens', () => {
    it('should create a canteen successfully with name and ratings', async () => {
      const input = { name: 'New Canteen', ratings: 4.0 };
      const createdCanteen = { id: 3, name: 'New Canteen', ratings: 4.0 };
      prisma.canteen.create.mockResolvedValue(createdCanteen);

      const response = await request(app)
        .post('/canteens')
        .send(input);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(createdCanteen);
      expect(prisma.canteen.create).toHaveBeenCalledWith({
        data: {
          name: 'New Canteen',
          ratings: 4.0,
        },
      });
    });

    it('should create a canteen with name only (ratings null)', async () => {
      const input = { name: 'Another Canteen' };
      const createdCanteen = { id: 4, name: 'Another Canteen', ratings: null };
      prisma.canteen.create.mockResolvedValue(createdCanteen);

      const response = await request(app)
        .post('/canteens')
        .send(input);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(createdCanteen);
      expect(prisma.canteen.create).toHaveBeenCalledWith({
        data: {
          name: 'Another Canteen',
          ratings: null,
        },
      });
    });

    it('should return 400 if name is missing', async () => {
      const response = await request(app)
        .post('/canteens')
        .send({ ratings: 4.0 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'name is required' });
    });

    it('should return 400 if name is not a string', async () => {
      const response = await request(app)
        .post('/canteens')
        .send({ name: 123 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'name is required' });
    });

    it('should trim name whitespace', async () => {
      const input = { name: '  Canteen Name  ' };
      const createdCanteen = { id: 5, name: 'Canteen Name', ratings: null };
      prisma.canteen.create.mockResolvedValue(createdCanteen);

      const response = await request(app)
        .post('/canteens')
        .send(input);

      expect(response.status).toBe(201);
      expect(prisma.canteen.create).toHaveBeenCalledWith({
        data: {
          name: 'Canteen Name',
          ratings: null,
        },
      });
    });

    it('should handle database error on create', async () => {
      const input = { name: 'Canteen' };
      prisma.canteen.create.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/canteens')
        .send(input);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create canteen' });
    });
  });

  describe('DELETE /canteens/:id', () => {
    it('should delete a canteen successfully', async () => {
      prisma.canteen.delete.mockResolvedValue({});

      const response = await request(app).delete('/canteens/1');

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});
      expect(prisma.canteen.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should return 400 if id is not an integer', async () => {
      const response = await request(app).delete('/canteens/abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'id must be an integer' });
    });

    it('should return 404 if canteen not found', async () => {
      prisma.canteen.delete.mockRejectedValue({ code: 'P2025' }); // Prisma not found error

      const response = await request(app).delete('/canteens/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Canteen not found' });
    });

    it('should handle database error on delete', async () => {
      prisma.canteen.delete.mockRejectedValue(new Error('Database error'));

      const response = await request(app).delete('/canteens/1');

      expect(response.status).toBe(404); // Code treats all delete errors as 404
      expect(response.body).toEqual({ error: 'Canteen not found' });
    });
  });
});