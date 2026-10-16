/**
 * Dar Agent Manager Core — safe, dependency-free foundation.
 *
 * This module is deliberately not wired to production routes or credentials.
 * It provides a testable task ledger, structured memory, and approval gate.
 * Persistence is injected by the caller; the default store is in-memory.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const TASK_STATES = Object.freeze([
  'queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled',
]);

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);
const TRANSITIONS = Object.freeze({
  queued: new Set(['running', 'cancelled']),
  running: new Set(['waiting_approval', 'succeeded', 'failed', 'queued', 'cancelled']),
  waiting_approval: new Set(['queued', 'cancelled']),
  succeeded: new Set(),
  failed: new Set(['queued', 'cancelled']),
  cancelled: new Set(),
});

const SENSITIVE_ACTIONS = new Set([
  'merge_main',
  'deploy_production',
  'production_database_write',
  'production_migration',
  'change_secret',
  'change_security_permissions',
  'send_external_message',
  'real_payment',
  'spend_over_budget',
]);

const MEMORY_TYPES = new Set([
  'project_fact',
  'approved_decision',
  'management_preference',
  'commercial_goal',
  'hypothesis',
]);

function requiredString(value, field, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new TypeError(`${field} must be a non-empty string of at most ${max} characters`);
  }
  return value.trim();
}

function clone(value) {
  return structuredClone(value);
}

export class InMemoryAgentStore {
  constructor() {
    this.tasks = new Map();
    this.events = new Map();
    this.memories = new Map();
    this.approvals = new Map();
  }
  async getTask(id) { return clone(this.tasks.get(id) ?? null); }
  async saveTask(task) { this.tasks.set(task.id, clone(task)); return clone(task); }
  async listTasks() { return [...this.tasks.values()].map(clone); }
  async getEvents(taskId) { return clone(this.events.get(taskId) ?? []); }
  async addEvent(taskId, event) {
    const events = this.events.get(taskId) ?? [];
    events.push(clone(event));
    this.events.set(taskId, events);
    return clone(event);
  }
  async listMemories() { return [...this.memories.values()].map(clone); }
  async saveMemory(memory) { this.memories.set(memory.id, clone(memory)); return clone(memory); }
  async getApproval(id) { return clone(this.approvals.get(id) ?? null); }
  async listApprovals() { return [...this.approvals.values()].map(clone); }
  async saveApproval(approval) { this.approvals.set(approval.id, clone(approval)); return clone(approval); }
}

/**
 * Small single-process JSON store for local development and prototypes.
 * For multi-instance/production deployments use a transactional database adapter.
 */
export class JsonFileAgentStore {
  constructor(filePath) {
    this.filePath = requiredString(filePath, 'filePath', 1000);
    this.writeQueue = Promise.resolve();
  }
  async #read() {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return { tasks: {}, events: {}, memories: {}, approvals: {} };
      throw error;
    }
  }
  async #mutate(fn) {
    const operation = this.writeQueue.then(async () => {
      const state = await this.#read();
      const result = fn(state);
      await mkdir(dirname(this.filePath), { recursive: true });
      const temp = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 });
      await rename(temp, this.filePath);
      return clone(result);
    });
    this.writeQueue = operation.catch(() => {});
    return operation;
  }
  async getTask(id) { const s = await this.#read(); return clone(s.tasks[id] ?? null); }
  async saveTask(task) { return this.#mutate(s => (s.tasks[task.id] = clone(task))); }
  async listTasks() { const s = await this.#read(); return Object.values(s.tasks).map(clone); }
  async getEvents(taskId) { const s = await this.#read(); return clone(s.events[taskId] ?? []); }
  async addEvent(taskId, event) { return this.#mutate(s => { (s.events[taskId] ??= []).push(clone(event)); return event; }); }
  async listMemories() { const s = await this.#read(); return Object.values(s.memories).map(clone); }
  async saveMemory(memory) { return this.#mutate(s => (s.memories[memory.id] = clone(memory))); }
  async getApproval(id) { const s = await this.#read(); return clone(s.approvals[id] ?? null); }
  async listApprovals() { const s = await this.#read(); return Object.values(s.approvals).map(clone); }
  async saveApproval(approval) { return this.#mutate(s => (s.approvals[approval.id] = clone(approval))); }
}

export class AgentManagerCore {
  constructor({ store = new InMemoryAgentStore(), maxAttempts = 3, now = () => new Date().toISOString() } = {}) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
      throw new RangeError('maxAttempts must be an integer between 1 and 10');
    }
    this.store = store;
    this.maxAttempts = maxAttempts;
    this.now = now;
  }

  async createTask({ title, goal, createdBy = 'owner', metadata = {} }) {
    const task = {
      id: randomUUID(),
      title: requiredString(title, 'title', 160),
      goal: requiredString(goal, 'goal', 4000),
      createdBy: requiredString(createdBy, 'createdBy', 120),
      metadata: clone(metadata),
      status: 'queued',
      attempts: 0,
      maxAttempts: this.maxAttempts,
      createdAt: this.now(),
      updatedAt: this.now(),
      lastError: null,
    };
    await this.store.saveTask(task);
    await this.#event(task.id, null, 'queued', 'task_created', createdBy);
    return task;
  }

  async transitionTask(id, nextState, { actor = 'manager', reason = '' } = {}) {
    if (!TASK_STATES.includes(nextState)) throw new TypeError('Unknown task state');
    const task = await this.#requireTask(id);
    if (!TRANSITIONS[task.status].has(nextState)) {
      throw new Error(`Invalid task transition: ${task.status} -> ${nextState}`);
    }
    if (nextState === 'running') {
      if (task.attempts >= task.maxAttempts) throw new Error('Task retry limit reached');
      task.attempts += 1;
      task.lastError = null;
    }
    task.status = nextState;
    task.updatedAt = this.now();
    await this.store.saveTask(task);
    await this.#event(id, null, nextState, requiredString(reason || 'state_transition', 'reason', 300), actor);
    return task;
  }

  async failTask(id, error, { actor = 'manager' } = {}) {
    const task = await this.#requireTask(id);
    if (task.status !== 'running') throw new Error('Only a running task can fail');
    task.lastError = requiredString(String(error), 'error', 1000);
    task.status = task.attempts < task.maxAttempts ? 'queued' : 'failed';
    task.updatedAt = this.now();
    await this.store.saveTask(task);
    await this.#event(id, null, task.status, 'task_failed', actor, { error: task.lastError, retryAvailable: task.status === 'queued' });
    return task;
  }

  async requestApproval({ taskId = null, action, summary, requestedBy = 'manager', expiresAt = null }) {
    action = requiredString(action, 'action', 100);
    if (!SENSITIVE_ACTIONS.has(action)) throw new Error('Action is not registered as a sensitive action');
    if (taskId) await this.#requireTask(taskId);
    const approval = {
      id: randomUUID(), taskId, action,
      summary: requiredString(summary, 'summary', 2000),
      requestedBy: requiredString(requestedBy, 'requestedBy', 120),
      status: 'pending',
      createdAt: this.now(),
      expiresAt,
      decidedAt: null,
      decidedBy: null,
    };
    await this.store.saveApproval(approval);
    if (taskId) {
      const task = await this.#requireTask(taskId);
      if (task.status === 'running') {
        await this.transitionTask(taskId, 'waiting_approval', { actor: requestedBy, reason: `approval_required:${action}` });
      }
    }
    return approval;
  }

  async decideApproval(id, { decision, decidedBy = 'owner' }) {
    if (!['approved', 'rejected'].includes(decision)) throw new TypeError('Decision must be approved or rejected');
    const approval = await this.store.getApproval(id);
    if (!approval) throw new Error('Approval request not found');
    if (approval.status !== 'pending') throw new Error('Approval request has already been decided');
    if (approval.expiresAt && Date.parse(approval.expiresAt) <= Date.parse(this.now())) {
      approval.status = 'expired';
      approval.decidedAt = this.now();
      approval.decidedBy = null;
      await this.store.saveApproval(approval);
      throw new Error('Approval request has expired');
    }
    approval.status = decision;
    approval.decidedAt = this.now();
    approval.decidedBy = requiredString(decidedBy, 'decidedBy', 120);
    await this.store.saveApproval(approval);
    if (approval.taskId) {
      const task = await this.#requireTask(approval.taskId);
      await this.#event(task.id, null, task.status, `approval_${decision}`, decidedBy, { approvalId: id, action: approval.action });
    }
    return approval;
  }

  async authorizeAction(action, approvalId = null) {
    if (!SENSITIVE_ACTIONS.has(action)) return { allowed: true, reason: 'non_sensitive_action' };
    if (!approvalId) return { allowed: false, reason: 'explicit_approval_required' };
    const approval = await this.store.getApproval(approvalId);
    if (!approval || approval.action !== action || approval.status !== 'approved') {
      return { allowed: false, reason: 'matching_approved_request_required' };
    }
    if (approval.expiresAt && Date.parse(approval.expiresAt) <= Date.parse(this.now())) {
      return { allowed: false, reason: 'approval_expired' };
    }
    return { allowed: true, reason: 'matching_approval_recorded' };
  }

  async remember({ type, content, source = 'owner', confidence = null }) {
    if (!MEMORY_TYPES.has(type)) throw new TypeError('Unsupported memory type');
    const memory = {
      id: randomUUID(),
      type,
      content: requiredString(content, 'content', 4000),
      source: requiredString(source, 'source', 300),
      confidence: confidence == null ? null : (() => { const value = Number(confidence); if (!Number.isFinite(value)) throw new TypeError('confidence must be a finite number'); return Math.max(0, Math.min(1, value)); })(),
      createdAt: this.now(),
      updatedAt: this.now(),
      archivedAt: null,
    };
    await this.store.saveMemory(memory);
    return memory;
  }

  async archiveMemory(id) {
    const memories = await this.store.listMemories();
    const memory = memories.find(item => item.id === id);
    if (!memory) throw new Error('Memory item not found');
    memory.archivedAt = this.now();
    memory.updatedAt = this.now();
    await this.store.saveMemory(memory);
    return memory;
  }

  async report() {
    const [tasks, memories] = await Promise.all([this.store.listTasks(), this.store.listMemories()]);
    const approvals = await this.store.listApprovals();
    const counts = Object.fromEntries(TASK_STATES.map(state => [state, tasks.filter(task => task.status === state).length]));
    return {
      generatedAt: this.now(),
      taskCounts: counts,
      totalTasks: tasks.length,
      memoryCounts: Object.fromEntries([...MEMORY_TYPES].map(type => [type, memories.filter(memory => memory.type === type && !memory.archivedAt).length])),
      pendingApprovals: approvals.filter(item => item.status === 'pending').length,
      safety: {
        productionActionsEnabled: false,
        realPaymentsEnabled: false,
        mergeAndDeploymentRequireOwnerApproval: true,
      },
    };
  }

  async getTask(id) { return this.#requireTask(id); }
  async getTaskEvents(id) {
    await this.#requireTask(id);
    return this.store.getEvents(id);
  }

  async #requireTask(id) {
    const task = await this.store.getTask(id);
    if (!task) throw new Error('Task not found');
    return task;
  }
  async #event(taskId, oldStatus, newStatus, type, actor, details = {}) {
    return this.store.addEvent(taskId, {
      id: randomUUID(), taskId, oldStatus, newStatus, type, actor,
      details: clone(details), createdAt: this.now(),
    });
  }
}

export const SENSITIVE_ACTION_TYPES = Object.freeze([...SENSITIVE_ACTIONS]);
