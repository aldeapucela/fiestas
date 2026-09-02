import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { findPotentialDuplicatePairs } from './event-duplicate-detection.mjs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const eventsPath = 'src/data/fiestas-2026/events.json';
const reportsDir = path.join(root, '.cache', 'fiestas', 'reports');
const outputPath = path.join(reportsDir, `event-history-audit-${stamp()}.json`);

const commits = await eventCommits();
const versions = [];
for (const commit of commits.toReversed()) {
  const events = await readEventsAt(commit.hash);
  if (events) versions.push({ ...commit, events });
}

const lifecycle = analyzeLifecycle(versions);
const currentEvents = JSON.parse(await fs.readFile(path.join(root, eventsPath), 'utf8'));
const currentPotentialDuplicates = findPotentialDuplicatePairs(currentEvents)
  .map(({ left, right, score, reason }) => ({
    score,
    reason,
    left: eventSummary(left),
    right: eventSummary(right)
  }));

const report = {
  generatedAt: new Date().toISOString(),
  file: eventsPath,
  commits: versions.length,
  currentEvents: currentEvents.length,
  totals: {
    added: lifecycle.added.length,
    deleted: lifecycle.deleted.length,
    reintroducedLocalIds: lifecycle.reintroducedLocalIds.length,
    currentPotentialDuplicates: currentPotentialDuplicates.length
  },
  highSignalDeletionCommits: lifecycle.highSignalDeletionCommits,
  reintroducedLocalIds: lifecycle.reintroducedLocalIds,
  currentPotentialDuplicates
};

await fs.mkdir(reportsDir, { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  reportPath: path.relative(root, outputPath),
  totals: report.totals
}, null, 2));

async function eventCommits() {
  const { stdout } = await execFileAsync('git', ['log', '--format=%H%x09%s', '--follow', '--', eventsPath], {
    cwd: root,
    maxBuffer: 10 * 1024 * 1024
  });
  return stdout.trim().split('\n').filter(Boolean).map((line) => {
    const [hash, ...subject] = line.split('\t');
    return { hash, shortHash: hash.slice(0, 7), subject: subject.join('\t') };
  });
}

async function readEventsAt(hash) {
  try {
    const { stdout } = await execFileAsync('git', ['show', `${hash}:${eventsPath}`], {
      cwd: root,
      maxBuffer: 50 * 1024 * 1024
    });
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function analyzeLifecycle(versions) {
  const added = [];
  const deleted = [];
  const reintroducedLocalIds = [];
  const deletedById = new Map();
  const highSignalDeletionCommits = new Map();

  for (let index = 1; index < versions.length; index += 1) {
    const previous = new Map(versions[index - 1].events.map((event) => [String(event.id), event]));
    const current = new Map(versions[index].events.map((event) => [String(event.id), event]));
    const commit = versions[index];
    let deletedInCommit = 0;

    for (const [id, event] of previous) {
      if (current.has(id)) continue;
      const record = { ...eventSummary(event), commit: commit.shortHash, subject: commit.subject };
      deleted.push(record);
      deletedById.set(id, record);
      deletedInCommit += 1;
    }

    for (const [id, event] of current) {
      if (previous.has(id)) continue;
      const record = { ...eventSummary(event), commit: commit.shortHash, subject: commit.subject };
      added.push(record);
      const priorDeletion = deletedById.get(id);
      if (priorDeletion) {
        reintroducedLocalIds.push({
          ...eventSummary(event),
          reintroducedIn: commit.shortHash,
          reintroducedSubject: commit.subject,
          deletedIn: priorDeletion.commit,
          deletedSubject: priorDeletion.subject
        });
      }
    }

    if (deletedInCommit > 0 && /duplicate|duplicad|unify|unifica|remove|elimina|borra|depura/i.test(commit.subject)) {
      highSignalDeletionCommits.set(commit.shortHash, {
        commit: commit.shortHash,
        subject: commit.subject,
        deleted: deletedInCommit
      });
    }
  }

  return {
    added,
    deleted,
    reintroducedLocalIds,
    highSignalDeletionCommits: [...highSignalDeletionCommits.values()]
  };
}

function eventSummary(event) {
  return {
    id: Number(event.id),
    title: event.title,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    performances: event.performances || []
  };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
