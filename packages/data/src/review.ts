import type { TaskSummary, WorkAnswer, WorkQuestion } from "@afterhours/contracts";
import type { Db } from "./db";
import { DomainError, badRequest, invalidTransition, staleRevision } from "./errors";
import { getTaskSummary } from "./queries";
import { addEvent, getTaskRow, setStatus } from "./tasks";
import { iso, newId, parseJson } from "./util";

/** Answers for a needs_input task: validates, archives, bumps revision, queues a new job. */
export function submitAnswers(
  db: Db, taskId: string, revision: number, answers: WorkAnswer[], now: Date,
): TaskSummary {
  db.transaction(() => {
    const task = getTaskRow(db, taskId);
    if (task.revision !== revision) throw staleRevision(task.revision);
    if (task.status !== "needs_input") throw invalidTransition(task.status, "queued");
    const questions = parseJson<WorkQuestion[]>(task.questions_json, []);
    const known = new Map(questions.map((q) => [q.id, q]));
    const seen = new Set<string>();
    const cleaned: WorkAnswer[] = [];
    for (const a of answers) {
      if (!known.has(a.questionId)) throw badRequest(`Unknown question: ${a.questionId}`);
      if (seen.has(a.questionId)) throw badRequest(`Duplicate answer for question: ${a.questionId}`);
      seen.add(a.questionId);
      const text = a.answer.trim();
      if (text === "") {
        if (known.get(a.questionId)!.required) throw badRequest(`Answer required for question: ${a.questionId}`);
        continue;
      }
      if (text.length > 5000) throw badRequest("Answers are limited to 5000 characters.");
      cleaned.push({ questionId: a.questionId, answer: text });
    }
    for (const q of questions) {
      if (q.required && !cleaned.some((a) => a.questionId === q.id)) {
        throw badRequest(`Answer required for question: ${q.id}`);
      }
    }
    const t = iso(now);
    const ins = db.prepare(
      "INSERT INTO answer_history (task_id, revision, question_id, question, answer, created_at) VALUES (?,?,?,?,?,?)",
    );
    for (const a of cleaned) ins.run(taskId, task.revision, a.questionId, known.get(a.questionId)!.question, a.answer, t);

    const merged = new Map(parseJson<WorkAnswer[]>(task.answers_json, []).map((a) => [a.questionId, a]));
    for (const a of cleaned) merged.set(a.questionId, a);
    const next = task.revision + 1;
    db.prepare(
      "UPDATE tasks SET revision=?, answers_json=?, questions_json='[]', error_json=NULL, updated_at=? WHERE id=?",
    ).run(next, JSON.stringify([...merged.values()]), t, taskId);
    setStatus(db, task, "queued", now);
    db.prepare(
      `INSERT INTO jobs (id, task_id, revision, status, attempts, available_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(newId(), taskId, next, "queued", 0, t, t, t);
    addEvent(db, taskId, next, "status", "intake", "Answers received; queued for another pass.", now);
  }).immediate();
  return getTaskSummary(db, taskId);
}

/** Manual retry: failed only. Creates a new revision and job. */
export function retryFailedTask(db: Db, taskId: string, revision: number, now: Date): TaskSummary {
  db.transaction(() => {
    const task = getTaskRow(db, taskId);
    if (task.revision !== revision) throw staleRevision(task.revision);
    if (task.status !== "failed") throw invalidTransition(task.status, "queued");
    const next = task.revision + 1;
    const t = iso(now);
    db.prepare("UPDATE tasks SET revision=?, error_json=NULL, updated_at=? WHERE id=?").run(next, t, taskId);
    setStatus(db, task, "queued", now);
    db.prepare(
      `INSERT INTO jobs (id, task_id, revision, status, attempts, available_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(newId(), taskId, next, "queued", 0, t, t, t);
    addEvent(db, taskId, next, "status", "intake", "Manual retry requested; queued.", now);
  }).immediate();
  return getTaskSummary(db, taskId);
}

/** Record the user's review decision. "approve" only from ready; "dismiss" per the state machine. */
export function markReviewed(
  db: Db, taskId: string, revision: number, action: "approve" | "dismiss", now: Date,
): TaskSummary {
  db.transaction(() => {
    const task = getTaskRow(db, taskId);
    if (task.revision !== revision) throw staleRevision(task.revision);
    const to = action === "approve" ? "approved" : "dismissed";
    if (action === "approve" && task.status !== "ready") {
      throw new DomainError("INVALID_TRANSITION", `Only a ready task can be marked reviewed (this one is ${task.status}).`, 409);
    }
    setStatus(db, task, to, now);
    addEvent(db, taskId, revision, "review", "review",
      action === "approve" ? "Marked reviewed. Nothing was sent." : "Dismissed.", now);
  }).immediate();
  return getTaskSummary(db, taskId);
}
