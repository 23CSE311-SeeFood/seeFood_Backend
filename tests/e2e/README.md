# E2E Testing with Playwright

This directory contains end-to-end tests for the seeFood backend application using Playwright.

## Overview

The E2E tests are designed to validate the complete functionality of the API endpoints, ensuring that requests and responses work correctly across the entire application flow.

## Test Files

### 1. **auth.spec.js** - Authentication Tests
Tests for user registration, login, and authentication flow.

**Coverage:**
- Student registration (with and without optional fields)
- Duplicate email validation
- Missing required fields validation
- Student login success and failure scenarios
- Admin registration
- Admin login with valid and invalid credentials
- Password validation

**Key Test Cases:**
- ✅ Student registration with all fields
- ✅ Student login with valid credentials
- ✅ Duplicate email prevention
- ✅ Invalid credentials rejection
- ✅ Admin registration and login
- ✅ Missing fields validation

### 2. **canteens.spec.js** - Canteen Management Tests
Tests for creating, retrieving, and deleting canteens.

**Coverage:**
- Get all canteens
- Create new canteen with ratings
- Create canteen without ratings
- Delete canteen
- Input validation (name is required, must be string)
- Whitespace trimming
- Multiple canteen creation and retrieval

**Key Test Cases:**
- ✅ Retrieve all canteens
- ✅ Create canteen with ratings
- ✅ Create canteen without ratings
- ✅ Delete canteen successfully
- ✅ Fail on missing canteen name
- ✅ Fail on non-string name
- ✅ Invalid deletion attempts

### 3. **items.spec.js** - Menu Items Tests
Tests for CRUD operations on canteen menu items.

**Coverage:**
- Get all items for a canteen
- Create items with different food types (VEG, NON_VEG)
- Create items in all categories (RICE, CURRIES, ICECREAM, ROOTI, DRINKS, OTHER)
- Update item details (name, price, rating)
- Delete items
- Input validation for all fields
- Image URL handling
- Price handling (integers and decimals)

**Key Test Cases:**
- ✅ Create vegetarian item
- ✅ Create non-vegetarian item
- ✅ All category types validation
- ✅ Update items with partial data
- ✅ Delete items
- ✅ Validate food type and category
- ✅ Decimal price handling
- ✅ Image URL support

### 4. **cart.spec.js** - Shopping Cart Tests
Tests for cart functionality including adding items and managing cart state.

**Coverage:**
- Get student cart
- Add items to cart
- Update item quantity in cart
- Remove items from cart
- Cart total calculation
- Input validation for student ID, item ID, quantity
- Default quantity handling
- Error scenarios

**Key Test Cases:**
- ✅ Add items to cart with quantity
- ✅ Get cart contents
- ✅ Update item quantity
- ✅ Remove items from cart
- ✅ Validate student ID
- ✅ Validate item ID and canteen ID
- ✅ Quantity validation (must be positive integer)
- ✅ Cart total calculation

### 5. **health.spec.js** - Server Health and API Tests
Tests for basic server functionality and API health checks.

**Coverage:**
- Root endpoint response
- Health check endpoint
- Request error handling
- JSON payload processing
- CORS header validation
- Concurrent request handling
- Content-Type validation

**Key Test Cases:**
- ✅ Root endpoint returns status "ok"
- ✅ Health check endpoint returns "OK"
- ✅ JSON payload handling
- ✅ Concurrent requests
- ✅ CORS validation

## Setup and Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Docker/PostgreSQL (for local database setup)

### Installation

1. Install Playwright and dependencies:
```bash
npm install
npx playwright install
```

2. Set up environment variables in `.env`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/seefood"
JWT_SECRET="your-secret-key"
PORT=3000
CORS_ORIGINS="http://localhost:3000,http://localhost:3001"
```

3. Run database migrations:
```bash
npx prisma migrate dev
```

## Running Tests

### Run all E2E tests:
```bash
npm run test:e2e
```

### Run tests in UI mode (interactive):
```bash
npm run test:e2e:ui
```

### Run tests in headed mode (see browser):
```bash
npm run test:e2e:headed
```

### Run tests in debug mode:
```bash
npm run test:e2e:debug
```

### Run specific test file:
```bash
npx playwright test tests/e2e/auth.spec.js
```

### Run tests with specific project/browser:
```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Configuration

The `playwright.config.js` file contains the test configuration:

- **Test Directory**: `./tests/e2e`
- **Base URL**: `http://localhost:3000` (can be overridden with `BASE_URL` environment variable)
- **Browsers**: Chromium, Firefox, WebKit
- **Web Server**: Automatically starts with `npm run dev`
- **Reporter**: HTML (reports generated in `./playwright-report/`)

## Test Structure

Each test file uses Playwright's test framework with:

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Feature Group', () => {
  test('should do something', async ({ request }) => {
    const response = await request.get('/endpoint');
    expect(response.status()).toBe(200);
  });
});
```

## API Being Tested

### Authentication Routes
- `POST /auth/register` - Student registration
- `POST /auth/login` - Student login
- `POST /auth/admin/register` - Admin registration
- `POST /auth/admin/login` - Admin login

### Canteen Routes
- `GET /canteens` - Retrieve all canteens
- `POST /canteens` - Create new canteen
- `DELETE /canteens/:id` - Delete canteen

### Item Routes
- `GET /canteens/:canteenId/items` - Get items for canteen
- `POST /canteens/:canteenId/items` - Create item
- `PUT /canteens/:canteenId/items/:id` - Update item
- `DELETE /canteens/:canteenId/items/:id` - Delete item

### Cart Routes
- `GET /cart/:studentId` - Get student cart
- `POST /cart/:studentId/items` - Add item to cart
- `PUT /cart/:studentId/items/:itemId` - Update cart item quantity
- `DELETE /cart/:studentId/items/:itemId` - Remove item from cart

## Test Patterns

### Creating Test Data
Tests create unique instances using timestamps to avoid conflicts:
```javascript
const testEmail = `student_${Date.now()}@test.com`;
```

### Error Handling
Tests validate both success and failure scenarios:
```javascript
test('should fail to create item without name', async ({ request }) => {
  const response = await request.post(`${baseURL}/canteens/${canteenId}/items`, {
    data: { price: 100 }
  });
  expect(response.status()).toBe(400);
});
```

### Setup/Teardown with beforeAll
Tests use `beforeAll` to set up shared test data:
```javascript
test.beforeAll(async ({ request }) => {
  // Create test data
});
```

## Troubleshooting

### Server not starting
- Ensure `.env` is properly configured
- Check database connection
- Run migrations: `npx prisma migrate dev`

### Tests timing out
- Increase timeout in `playwright.config.js`
- Check if server is running on the correct port
- Verify database is accessible

### Playwright installation issues
```bash
npx playwright install --with-deps
```

## Continuous Integration

To run tests in CI environment:
```bash
# Set CI environment variable
CI=true npm run test:e2e
```

The `playwright.config.js` automatically adjusts settings for CI:
- Uses 1 worker instead of parallel
- Retries tests up to 2 times
- Disables server reuse

## Extending Tests

To add new tests:

1. Create a new file in `tests/e2e/` with `.spec.js` extension
2. Use the same test structure as existing files
3. Import `{ test, expect }` from `@playwright/test`
4. Write test cases describing the behavior
5. Run the tests to verify

Example:
```javascript
const { test, expect } = require('@playwright/test');

test.describe('New Feature', () => {
  test('should work correctly', async ({ request }) => {
    const response = await request.get('/api/endpoint');
    expect(response.status()).toBe(200);
  });
});
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [API Testing Guide](https://playwright.dev/docs/api-testing)
- [Assertion Reference](https://playwright.dev/docs/test-assertions)
- [Test Configuration](https://playwright.dev/docs/test-configuration)

## Notes

- Tests are designed to be independent and can run in any order
- Each test creates its own test data to avoid conflicts
- Use timestamps in email/name generation to ensure uniqueness
- Tests validate both positive and negative scenarios
- HTTP status codes and response structures are verified
