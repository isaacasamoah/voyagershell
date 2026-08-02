import { runTopicBackfill } from '@/lib/agents/cartographer/backfill'

const main = async (): Promise<void> => {
  const result = await runTopicBackfill()
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

void main()
