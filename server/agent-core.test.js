import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentManagerCore, InMemoryAgentStore, JsonFileAgentStore } from './agent-core.js';

const makeManager = () => {
  let tick = 0;
  return new AgentManagerCore({
    store: new InMemoryAgentStore(),
    maxAttempts: 2,
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString(),
  });
};

test('creates a task and records an event', async () => {
  const manager = makeManager();
  const task = await manager.createTask({ title: 'Audit API', goal: 'Review authorization checks' });
  assert.equal(task.status, 'queued');
  assert.equal(task.attempts, 0);
  assert.equal((await manager.getTaskEvents(task.id)).length, 1);
});

test('rejects invalid state transitions', async () => {
  const manager = makeManager();
  const task = await manager.createTask({ title: 'Test', goal: 'Exercise transitions' });
  await assert.rejects(manager.transitionTask(task.id, 'succeeded'), /Invalid task transition/);
});

test('bounds retries and eventually fails', async () => {
  const manager = makeManager();
  const task = await manager.createTask({ title: 'Retry', goal: 'Test bounded retry behavior' });
  await manager.transitionTask(task.id, 'running');
  const retry = await manager.failTask(task.id, 'first failure');
  assert.equal(retry.status, 'queued');
  await manager.transitionTask(task.id, 'running');
  const failed = await manager.failTask(task.id, 'second failure');
  assert.equal(failed.status, 'failed');
  await manager.transitionTask(task.id, 'queued');
  await assert.rejects(manager.transitionTask(task.id, 'running'), /Task retry limit reached/);
});

test('sensitive action cannot proceed without matching approved request', async () => {
  const manager = makeManager();
  const denied = await manager.authorizeAction('deploy_production');
  assert.deepEqual(denied, { allowed: false, reason: 'explicit_approval_required' });

  const approval = await manager.requestApproval({
    action: 'deploy_production',
    summary: 'Deploy reviewed release after checks pass',
  });
  assert.equal((await manager.authorizeAction('deploy_production', approval.id)).allowed, false);
  await manager.decideApproval(approval.id, { decision: 'approved', decidedBy: 'owner' });
  assert.equal((await manager.authorizeAction('deploy_production', approval.id)).allowed, true);
  assert.equal((await manager.authorizeAction('real_payment', approval.id)).allowed, false);
});

test('approval requests cannot be decided twice', async () => {
  const manager = makeManager();
  const approval = await manager.requestApproval({ action: 'real_payment', summary: 'Enable real payment collection' });
  await manager.decideApproval(approval.id, { decision: 'rejected' });
  await assert.rejects(manager.decideApproval(approval.id, { decision: 'approved' }), /already been decided/);
});

test('memory types are classified and can be archived', async () => {
  const manager = makeManager();
  const memory = await manager.remember({
    type: 'management_preference',
    content: 'Run tests before reporting completion',
    source: 'owner',
    confidence: 1,
  });
  assert.equal(memory.type, 'management_preference');
  await manager.archiveMemory(memory.id);
  const report = await manager.report();
  assert.equal(report.memoryCounts.management_preference, 0);
});

test('report keeps production actions and real payments disabled', async () => {
  const manager = makeManager();
  const report = await manager.report();
  assert.equal(report.safety.productionActionsEnabled, false);
  assert.equal(report.safety.realPaymentsEnabled, false);
  assert.equal(report.safety.mergeAndDeploymentRequireOwnerApproval, true);
});

test('file store persists tasks and approvals across manager instances', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dar-agent-core-'));
  try {
    const filePath = join(dir, 'state.json');
    const first = new AgentManagerCore({ store: new JsonFileAgentStore(filePath) });
    const task = await first.createTask({ title: 'Persist', goal: 'Survive manager restart' });
    const approval = await first.requestApproval({
      taskId: task.id,
      action: 'production_database_write',
      summary: 'Write production data after explicit approval',
    });
    const second = new AgentManagerCore({ store: new JsonFileAgentStore(filePath) });
    assert.equal((await second.getTask(task.id)).status, 'queued');
    assert.equal((await second.report()).pendingApprovals, 1);
    assert.equal((await second.authorizeAction('production_database_write', approval.id)).allowed, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('approval pauses a running task and approval decision resumes it', async () => {
  const manager = makeManager();
  const task = await manager.createTask({ title: 'Sensitive step', goal: 'Wait for owner approval' });
  await manager.transitionTask(task.id, 'running');
  const approval = await manager.requestApproval({
    taskId: task.id,
    action: 'production_migration',
    summary: 'Apply a production migration after review',
  });
  assert.equal((await manager.getTask(task.id)).status, 'waiting_approval');
  await manager.decideApproval(approval.id, { decision: 'approved', decidedBy: 'owner' });
  assert.equal((await manager.getTask(task.id)).status, 'queued');
});
