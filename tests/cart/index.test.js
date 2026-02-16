const express = require('express');
const request = require('supertest');
const cartRouter = require('../../routes/cart');

jest.mock('../../lib/prisma', () => ({
  cart: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
  },
  cartItem: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  canteenItem: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
}));

const prisma = require('../../lib/prisma');

const app = express();
app.use(express.json());
app.use('/cart', cartRouter);

describe('Cart Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /:studentId', () => {
    it('should return cart for a valid studentId', async () => {
      const mockCart = {
        id: 1,
        studentId: 1,
        canteenId: 1,
        total: 200,
        items: [
          {
            id: 1,
            cartId: 1,
            canteenItemId: 1,
            quantity: 2,
            canteenItem: { id: 1, name: 'Item A', price: 100 },
          },
        ],
        canteen: { id: 1, name: 'Canteen A' },
      };
      prisma.cart.findUnique.mockResolvedValue(mockCart);

      const response = await request(app).get('/cart/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCart);
      expect(prisma.cart.findUnique).toHaveBeenCalledWith({
        where: { studentId: 1 },
        include: {
          items: {
            include: { canteenItem: true },
            orderBy: { id: 'asc' },
          },
          canteen: true,
        },
      });
    });

    it('should return 400 if studentId is not an integer', async () => {
      const response = await request(app).get('/cart/abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'studentId must be an integer' });
    });

    it('should return 404 if cart not found', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      const response = await request(app).get('/cart/1');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Cart not found' });
    });
  });

  describe('POST /:studentId/items', () => {
    it('should add item to cart successfully', async () => {
      const mockCanteenItem = { id: 1, name: 'Item A', price: 100, canteenId: 1 };
      const mockCart = { id: 1, studentId: 1, canteenId: 1, total: 0 };
      const mockCartWithItems = {
        id: 1,
        studentId: 1,
        canteenId: 1,
        total: 100,
        items: [
          {
            id: 1,
            cartId: 1,
            canteenItemId: 1,
            quantity: 1,
            canteenItem: mockCanteenItem,
          },
        ],
        canteen: { id: 1, name: 'Canteen A' },
      };

      prisma.canteenItem.findUnique.mockResolvedValue(mockCanteenItem);
      prisma.cart.upsert.mockResolvedValue(mockCart);
      prisma.cartItem.upsert.mockResolvedValue({});
      prisma.cartItem.findMany.mockResolvedValue([
        { quantity: 1, canteenItem: mockCanteenItem },
      ]);
      prisma.cart.update.mockResolvedValue({});
      prisma.cart.findUnique.mockResolvedValue(mockCartWithItems);

      const response = await request(app)
        .post('/cart/1/items')
        .send({ canteenId: 1, canteenItemId: 1, quantity: 1 });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockCartWithItems);
    });

    it('should return 400 if studentId is not an integer', async () => {
      const response = await request(app)
        .post('/cart/abc/items')
        .send({ canteenId: 1, canteenItemId: 1, quantity: 1 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'studentId must be an integer' });
    });

    it('should return 400 if canteenId is not an integer', async () => {
      const response = await request(app)
        .post('/cart/1/items')
        .send({ canteenId: 'abc', canteenItemId: 1, quantity: 1 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'canteenId must be an integer' });
    });

    it('should return 400 if canteenItemId is not an integer', async () => {
      const response = await request(app)
        .post('/cart/1/items')
        .send({ canteenId: 1, canteenItemId: 'abc', quantity: 1 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'canteenItemId must be an integer' });
    });

    it('should return 400 if quantity is not a positive integer', async () => {
      const response = await request(app)
        .post('/cart/1/items')
        .send({ canteenId: 1, canteenItemId: 1, quantity: 0 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'quantity must be a positive integer' });
    });

    it('should return 404 if canteen item not found', async () => {
      prisma.canteenItem.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/cart/1/items')
        .send({ canteenId: 1, canteenItemId: 1, quantity: 1 });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Canteen item not found' });
    });
  });

  describe('PUT /:studentId/items/:itemId', () => {
    it('should update item quantity successfully', async () => {
      const mockCart = { id: 1, studentId: 1 };
      const mockCartWithItems = {
        id: 1,
        studentId: 1,
        total: 200,
        items: [
          {
            id: 1,
            cartId: 1,
            canteenItemId: 1,
            quantity: 2,
            canteenItem: { id: 1, price: 100 },
          },
        ],
      };

      prisma.cart.findUnique.mockResolvedValue(mockCart);
      prisma.cartItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.cartItem.findMany.mockResolvedValue([
        { quantity: 2, canteenItem: { price: 100 } },
      ]);
      prisma.cart.update.mockResolvedValue({});
      prisma.cart.findUnique
        .mockResolvedValueOnce(mockCart)
        .mockResolvedValueOnce(mockCartWithItems);

      const response = await request(app)
        .put('/cart/1/items/1')
        .send({ quantity: 2 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCartWithItems);
    });

    it('should return 400 if studentId is not an integer', async () => {
      const response = await request(app)
        .put('/cart/abc/items/1')
        .send({ quantity: 2 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'studentId must be an integer' });
    });

    it('should return 400 if itemId is not an integer', async () => {
      const response = await request(app)
        .put('/cart/1/items/abc')
        .send({ quantity: 2 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'itemId must be an integer' });
    });

    it('should return 400 if quantity is not a positive integer', async () => {
      const response = await request(app)
        .put('/cart/1/items/1')
        .send({ quantity: -1 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'quantity must be a positive integer' });
    });

    it('should return 404 if cart not found', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .put('/cart/1/items/1')
        .send({ quantity: 2 });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Cart not found' });
    });

    it('should return 404 if cart item not found', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: 1 });
      prisma.cartItem.updateMany.mockResolvedValue({ count: 0 });

      const response = await request(app)
        .put('/cart/1/items/1')
        .send({ quantity: 2 });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Cart item not found' });
    });
  });

  describe('DELETE /:studentId/items/:itemId', () => {
    it('should delete item from cart successfully', async () => {
      const mockCart = { id: 1, studentId: 1 };
      const mockCartWithItems = {
        id: 1,
        studentId: 1,
        total: 0,
        items: [],
      };

      prisma.cart.findUnique.mockResolvedValue(mockCart);
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 1 });
      prisma.cartItem.findMany.mockResolvedValue([]);
      prisma.cart.update.mockResolvedValue({});
      prisma.cart.findUnique
        .mockResolvedValueOnce(mockCart)
        .mockResolvedValueOnce(mockCartWithItems);

      const response = await request(app).delete('/cart/1/items/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCartWithItems);
    });

    it('should return 400 if studentId is not an integer', async () => {
      const response = await request(app).delete('/cart/abc/items/1');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'studentId must be an integer' });
    });

    it('should return 400 if itemId is not an integer', async () => {
      const response = await request(app).delete('/cart/1/items/abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'itemId must be an integer' });
    });

    it('should return 404 if cart not found', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      const response = await request(app).delete('/cart/1/items/1');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Cart not found' });
    });

    it('should return 404 if cart item not found', async () => {
      prisma.cart.findUnique.mockResolvedValue({ id: 1 });
      prisma.cartItem.deleteMany.mockResolvedValue({ count: 0 });

      const response = await request(app).delete('/cart/1/items/1');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Cart item not found' });
    });
  });

  describe('DELETE /:studentId', () => {
    it('should clear entire cart successfully', async () => {
      const mockCart = { id: 1, studentId: 1 };

      prisma.cart.findUnique.mockResolvedValue(mockCart);
      prisma.cartItem.deleteMany.mockResolvedValue({});
      prisma.cart.delete.mockResolvedValue({});

      const response = await request(app).delete('/cart/1');

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});
    });

    it('should return 400 if studentId is not an integer', async () => {
      const response = await request(app).delete('/cart/abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'studentId must be an integer' });
    });

    it('should return 404 if cart not found', async () => {
      prisma.cart.findUnique.mockResolvedValue(null);

      const response = await request(app).delete('/cart/1');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Cart not found' });
    });
  });

  describe('POST /:studentId/sync', () => {
    it('should sync cart successfully', async () => {
      const mockCanteenItems = [
        { id: 1, name: 'Item A', price: 100, canteenId: 1 },
        { id: 2, name: 'Item B', price: 200, canteenId: 1 },
      ];
      const mockCart = { id: 1, studentId: 1, canteenId: 1, total: 0 };
      const mockCartWithItems = {
        id: 1,
        studentId: 1,
        canteenId: 1,
        total: 500,
        items: [
          {
            id: 1,
            cartId: 1,
            canteenItemId: 1,
            quantity: 1,
            canteenItem: mockCanteenItems[0],
          },
          {
            id: 2,
            cartId: 1,
            canteenItemId: 2,
            quantity: 2,
            canteenItem: mockCanteenItems[1],
          },
        ],
        canteen: { id: 1, name: 'Canteen A' },
      };

      prisma.canteenItem.findMany.mockResolvedValue(mockCanteenItems);
      prisma.$transaction.mockImplementation(async (callback) => {
        return callback(prisma);
      });
      prisma.cart.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockCart)
        .mockResolvedValueOnce(mockCartWithItems);
      prisma.cart.create.mockResolvedValue(mockCart);
      prisma.cartItem.deleteMany.mockResolvedValue({});
      prisma.cartItem.createMany.mockResolvedValue({});
      prisma.cartItem.findMany.mockResolvedValue([
        { quantity: 1, canteenItem: mockCanteenItems[0] },
        { quantity: 2, canteenItem: mockCanteenItems[1] },
      ]);
      prisma.cart.update.mockResolvedValue({});

      const response = await request(app)
        .post('/cart/1/sync')
        .send({
          canteenId: 1,
          items: [
            { canteenItemId: 1, quantity: 1 },
            { canteenItemId: 2, quantity: 2 },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCartWithItems);
    });

    it('should return 400 if studentId is not an integer', async () => {
      const response = await request(app)
        .post('/cart/abc/sync')
        .send({ canteenId: 1, items: [] });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'studentId must be an integer' });
    });

    it('should return 400 if canteenId is not an integer', async () => {
      const response = await request(app)
        .post('/cart/1/sync')
        .send({ canteenId: 'abc', items: [] });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'canteenId must be an integer' });
    });

    it('should return 400 if items is not an array', async () => {
      const response = await request(app)
        .post('/cart/1/sync')
        .send({ canteenId: 1, items: 'not an array' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'items must be an array' });
    });

    it('should return 400 if item data is invalid', async () => {
      const response = await request(app)
        .post('/cart/1/sync')
        .send({
          canteenId: 1,
          items: [{ canteenItemId: 'abc', quantity: 1 }],
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Each item requires canteenItemId and quantity',
      });
    });

    it('should return 400 if canteen items are invalid', async () => {
      prisma.canteenItem.findMany.mockResolvedValue([
        { id: 1, canteenId: 1 },
      ]);

      const response = await request(app)
        .post('/cart/1/sync')
        .send({
          canteenId: 1,
          items: [
            { canteenItemId: 1, quantity: 1 },
            { canteenItemId: 2, quantity: 1 },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid canteen items' });
    });
  });
});