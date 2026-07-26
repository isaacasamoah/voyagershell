import { useEffect, useMemo, useState } from 'react'
import type { RunningTask } from '../voyager-types'
import { useRealtimeSubscription } from './useRealtimeSubscription'

export const useRunningTasks = (
  conversationId: string | null,
  isAuthenticated: boolean,
): RunningTask[] => {
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([])
  const callbacks = useMemo(() => ({
    onTaskInsert: (task: RunningTask) => {
      setRunningTasks((previous) => [...previous, task])
    },
    onTaskUpdate: (
      taskId: string,
      taskStatus: string,
      data: Record<string, unknown>,
    ) => {
      if (taskStatus === 'running') {
        setRunningTasks((previous) => previous.map((task) => (
          task.id === taskId
            ? { ...task, progress: data.progress as RunningTask['progress'] }
            : task
        )))
      } else if (taskStatus === 'failed') {
        setRunningTasks((previous) => (
          previous.filter((task) => task.id !== taskId)
        ))
      }
    },
    onTaskComplete: (taskId: string) => {
      setRunningTasks((previous) => (
        previous.filter((task) => task.id !== taskId)
      ))
    },
  }), [])
  useRealtimeSubscription(conversationId, isAuthenticated, callbacks)
  useEffect(() => setRunningTasks([]), [conversationId])
  return runningTasks
}
