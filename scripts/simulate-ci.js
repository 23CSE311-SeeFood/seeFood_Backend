#!/usr/bin/env node

/**
 * Local CI Simulation Script
 * 
 * This script simulates the CI/CD pipeline locally before pushing to GitHub/GitLab.
 * Useful for testing without actually committing.
 * 
 * Usage: node scripts/simulate-ci.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description, options = {}) {
  log(`\n▶ ${description}`, 'cyan');
  log(`  $ ${command}`, 'blue');

  const [cmd, ...args] = command.split(' ');
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd(),
    env: { ...process.env, CI: 'true', ...options.env },
  });

  if (result.status !== 0) {
    log(`✗ ${description} failed with exit code ${result.status}`, 'red');
    return false;
  }

  log(`✓ ${description} passed`, 'green');
  return true;
}

function setupEnv() {
  const envPath = path.join(process.cwd(), '.env');
  log(`\n▶ Setting up environment variables`, 'cyan');

  const envContent = `DATABASE_URL="postgresql://postgres:teja@3905@localhost:5432/seefood"
JWT_SECRET="vivek"
PORT=3000
CORS_ORIGINS="http://localhost:3000,http://localhost:3001"
`;

  fs.writeFileSync(envPath, envContent);
  log(`✓ Created .env file`, 'green');
}

function main() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║         Local CI/CD Pipeline Simulation                    ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');

  const steps = [
    {
      name: 'Setup Environment',
      fn: setupEnv,
    },
    {
      name: 'Install Dependencies',
      command: 'npm ci',
      description: 'Installing dependencies (npm ci)',
    },
    {
      name: 'Run Lint',
      command: 'npm run lint --if-present',
      description: 'Running linter',
    },
    {
      name: 'Run Unit Tests',
      command: 'npm run test --if-present',
      description: 'Running unit tests',
    },
    {
      name: 'Database Migration',
      command: 'npx prisma migrate deploy',
      description: 'Running Prisma migrations',
    },
    {
      name: 'E2E Tests',
      command: 'npm run test:e2e',
      description: 'Running Playwright E2E tests',
      note: 'Server must be running on localhost:3000\nRun in another terminal: npm run dev',
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const step of steps) {
    if (step.note) {
      log(`\n⚠ ${step.note}`, 'yellow');
    }

    let success;
    if (step.fn) {
      try {
        step.fn();
        success = true;
      } catch (error) {
        log(`✗ ${step.name} failed: ${error.message}`, 'red');
        success = false;
      }
    } else {
      success = runCommand(step.command, step.description);
    }

    if (success) {
      passed++;
    } else {
      failed++;
      log(`\n⚠ Stopping pipeline (continue with caution)`, 'yellow');
      break;
    }
  }

  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log(`║  Summary: ${passed} passed, ${failed} failed`, 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');

  if (failed === 0) {
    log('\n✓ All checks passed! Safe to push to repository.', 'green');
    process.exit(0);
  } else {
    log('\n✗ Some checks failed. Fix issues before pushing.', 'red');
    process.exit(1);
  }
}

main();
