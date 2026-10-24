import type { TaskEvent } from "@afterhours/contracts";
import type { Db } from "./db";
import { iso, newId } from "./util";

export function addEvent(
  db: Db,
  taskId: string,
  revision: number,
  type: TaskEvent["type"],
  stage: TaskEvent["stage"],
  message: string,
  now: Date,
): void {
  db.prepare(
    "INSERT INTO task_events (id, task_id, revision, type, stage, message, created_at) VALUES (?,?,?,?,?,?,?)",
  ).run(newId(), taskId, revision, type, stage, message.slice(0, 1000), iso(now));
}
