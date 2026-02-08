const express = require('express');
const request = require('supertest');
const itemsRouter = require('../../routes/items');

jest.mock('../../lib/prisma', () => ({
  canteen: {
    findUnique: jest.fn(),
  },
  canteenItem: {
    findMany: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    findUnique: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

const prisma = require('../../lib/prisma');

const app = express();
app.use(express.json());
app.use('/canteens/:canteenId/items', itemsRouter);

describe('Items Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /canteens/:canteenId/items', () => {
    it('should return items for a valid canteen', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1, name: 'Canteen A' });
      const mockItems = [
        { id: 1, name: 'Item A', price: 100, rating: 4.5, isVeg: true, canteenId: 1 },
      ];
      prisma.canteenItem.findMany.mockResolvedValue(mockItems);

      const response = await request(app).get('/canteens/1/items');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockItems);
      expect(prisma.canteen.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(prisma.canteenItem.findMany).toHaveBeenCalledWith({
        where: { canteenId: 1 },
        orderBy: { id: 'asc' },
      });
    });

    it('should return 400 if canteenId is not an integer', async () => {
      const response = await request(app).get('/canteens/abc/items');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'canteenId must be an integer' });
    });

    it('should return 404 if canteen not found', async () => {
      prisma.canteen.findUnique.mockResolvedValue(null);

      const response = await request(app).get('/canteens/999/items');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Canteen not found' });
    });

    it('should handle database error on fetch canteen', async () => {
      prisma.canteen.findUnique.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/canteens/1/items');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch items' });
    });
  });

  describe('POST /canteens/:canteenId/items', () => {
    it('should create an item successfully', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });
      const input = { name: 'New Item', price: 150, rating: 4.0, isVeg: false };
      const createdItem = { id: 2, ...input, canteenId: 1 };
      prisma.canteenItem.create.mockResolvedValue(createdItem);

      const response = await request(app)
        .post('/canteens/1/items')
        .send(input);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(createdItem);
      expect(prisma.canteenItem.create).toHaveBeenCalledWith({
        data: {
          name: 'New Item',
          price: 150,
          rating: 4.0,
          isVeg: false,
          canteenId: 1,
        },
      });
    });

    it('should create item with null rating', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });
      const input = { name: 'Item B', price: 200, isVeg: true };
      const createdItem = { id: 3, name: 'Item B', price: 200, rating: null, isVeg: true, canteenId: 1 };
      prisma.canteenItem.create.mockResolvedValue(createdItem);

      const response = await request(app)
        .post('/canteens/1/items')
        .send(input);

      expect(response.status).toBe(201);
      expect(prisma.canteenItem.create).toHaveBeenCalledWith({
        data: {
          name: 'Item B',
          price: 200,
          rating: null,
          isVeg: true,
          canteenId: 1,
        },
      });
    });

    it('should return 400 if name is missing', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });

      const response = await request(app)
        .post('/canteens/1/items')
        .send({ price: 100, isVeg: true });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'name is required' });
    });

    it('should return 400 if price is missing', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });

      const response = await request(app)
        .post('/canteens/1/items')
        .send({ name: 'Item', isVeg: true });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'price is required' });
    });

    it('should return 400 if price is not a number', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });

      const response = await request(app)
        .post('/canteens/1/items')
        .send({ name: 'Item', price: 'abc', isVeg: true });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'price is required' });
    });

    it('should return 400 if isVeg is not boolean', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });

      const response = await request(app)
        .post('/canteens/1/items')
        .send({ name: 'Item', price: 100, isVeg: 'yes' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'isVeg must be boolean' });
    });

    it('should trim name', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });
      const input = { name: '  Item Name  ', price: 100, isVeg: true };
      prisma.canteenItem.create.mockResolvedValue({ id: 4, name: 'Item Name', price: 100, rating: null, isVeg: true, canteenId: 1 });

      const response = await request(app)
        .post('/canteens/1/items')
        .send(input);

      expect(prisma.canteenItem.create).toHaveBeenCalledWith({
        data: {
          name: 'Item Name',
          price: 100,
          rating: null,
          isVeg: true,
          canteenId: 1,
        },
      });
    });

    it('should return 404 if canteen not found', async () => {
      prisma.canteen.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/canteens/999/items')
        .send({ name: 'Item', price: 100, isVeg: true });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Canteen not found' });
    });

    it('should handle database error on create', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });
      prisma.canteenItem.create.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/canteens/1/items')
        .send({ name: 'Item', price: 100, isVeg: true });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create item' });
    });
  });

  describe('PUT /canteens/:canteenId/items/:id', () => {
    it('should update an item successfully', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });
      prisma.canteenItem.updateMany.mockResolvedValue({ count: 1 });
      const updatedItem = { id: 2, name: 'Updated Item', price: 120, rating: 4.5, isVeg: true, canteenId: 1 };
      prisma.canteenItem.findUnique.mockResolvedValue(updatedItem);

      const response = await request(app)
        .put('/canteens/1/items/2')
        .send({ name: 'Updated Item', price: 120, rating: 4.5 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedItem);
      expect(prisma.canteenItem.updateMany).toHaveBeenCalledWith({
        where: { id: 2, canteenId: 1 },
        data: { name: 'Updated Item', price: 120, rating: 4.5 },
      });
    });

    it('should return 400 if id is not integer', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });

      const response = await request(app)
        .put('/canteens/1/items/abc')
        .send({ name: 'Item' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'id must be an integer' });
    });

    it('should return 400 if no fields to update', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });

      const response = await request(app)
        .put('/canteens/1/items/2')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'no fields to update' });
    });

    it('should return 400 if name is invalid', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });

      const response = await request(app)
        .put('/canteens/1/items/2')
        .send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'name must be a non-empty string' });
    });

    it('should return 400 if price is invalid', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });

      const response = await request(app)
        .put('/canteens/1/items/2')
        .send({ price: 'abc' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'price must be a number' });
    });

    it('should return 404 if item not found', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });
      prisma.canteenItem.updateMany.mockResolvedValue({ count: 0 });

      const response = await request(app)
        .put('/canteens/1/items/999')
        .send({ name: 'Item' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Item not found' });
    });

    it('should handle database error', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });
      prisma.canteenItem.updateMany.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .put('/canteens/1/items/2')
        .send({ name: 'Item' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to update item' });
    });
  });

  describe('DELETE /canteens/:canteenId/items/:id', () => {
    it('should delete an item successfully', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });
      prisma.canteenItem.deleteMany.mockResolvedValue({ count: 1 });

      const response = await request(app).delete('/canteens/1/items/2');

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});
      expect(prisma.canteenItem.deleteMany).toHaveBeenCalledWith({
        where: { id: 2, canteenId: 1 },
      });
    });

    it('should return 400 if id is not integer', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });

      const response = await request(app).delete('/canteens/1/items/abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'id must be an integer' });
    });

    it('should return 404 if item not found', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });
      prisma.canteenItem.deleteMany.mockResolvedValue({ count: 0 });

      const response = await request(app).delete('/canteens/1/items/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Item not found' });
    });

    it('should handle database error', async () => {
      prisma.canteen.findUnique.mockResolvedValue({ id: 1 });
      prisma.canteenItem.deleteMany.mockRejectedValue(new Error('Database error'));

      const response = await request(app).delete('/canteens/1/items/2');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete item' });
    });
  });
});