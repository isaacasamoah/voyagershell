import type { TaskProgress } from '@/components/chat'

export interface RunningTask {
  id: string
  task: string
  progress?: TaskProgress
}
