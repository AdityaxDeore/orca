export type AutomationModelRecoveryInput = {
  id: string
  runId: string
  botId: string
  model: string
}

export type AutomationModelRecoveryResult =
  | { status: 'changed' | 'busy' | 'unconfirmed' }
  | { status: 'saved'; rerun: 'skipped' | 'unconfirmed' }
  | { status: 'queued'; runId: string; newerModel?: true }
