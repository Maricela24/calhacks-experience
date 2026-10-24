"use client";
import { use } from "react";
import { TaskDetailView } from "@/components/task-detail";

export default function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TaskDetailView id={id} />;
}
