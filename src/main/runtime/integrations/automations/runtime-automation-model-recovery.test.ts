import { expect, it } from 'vitest'
import type {
  Automation,
  AutomationBotTarget
} from '../../../../shared/automations/automation-definition'
import type { AutomationRun } from '../../../../shared/automations/history/automation-run'
import type { AutomationModelRecoveryInput } from '../../../../shared/automations/history/automation-model-recovery'
import type { FolderWorkspace } from '../../../../shared/folder-workspaces/folder-workspace-types'
import { makeTestBot } from '../../../bots/bot.test-fixture'
import { recoverAutomationModel } from './runtime-automation-model-recovery'

type RecoveryOptions = {
  run?: Partial<AutomationRun>
  target?: Partial<AutomationBotTarget>
  input?: Partial<AutomationModelRecoveryInput>
  refuseRerun?: boolean
}

function beginRecovery(options: RecoveryOptions = {}) {
  let automation: Automation = {
    id: 'automation',
    name: 'Sample automation',
    prompt: 'Summarize sample notes',
    precheck: null,
    agentId: 'codex',
    bot: { botId: 'bot-1', runsIn: 'new', resultsTo: 'none', ...options.target },
    projectId: '',
    executionTargetType: 'local',
    executionTargetId: 'local',
    schedulerOwner: 'local_host_service',
    workspaceMode: 'existing',
    workspaceId: null,
    baseBranch: null,
    reuseSession: false,
    timezone: 'UTC',
    rrule: 'FREQ=DAILY',
    dtstart: 1,
    enabled: true,
    nextRunAt: 2,
    missedRunPolicy: 'run_once_within_grace',
    missedRunGraceMinutes: 30,
    createdAt: 1,
    updatedAt: 1
  }
  const failed: AutomationRun = {
    id: 'failed',
    automationId: automation.id,
    title: 'Sample automation',
    status: 'dispatch_failed',
    trigger: 'manual',
    workspaceId: null,
    sessionKind: 'chat',
    chatSessionId: null,
    terminalSessionId: null,
    terminalPaneKey: null,
    terminalPtyId: null,
    outputSnapshot: null,
    precheckResult: null,
    usage: null,
    error: 'Model unavailable',
    errorCode: 'agentModelUnavailable',
    errorParams: { agent: 'codex', model: 'old-model' },
    scheduledFor: 1,
    startedAt: null,
    dispatchedAt: null,
    createdAt: 1,
    ...options.run
  }
  const folder: FolderWorkspace = {
    id: 'w1',
    projectGroupId: 'sample-group',
    name: 'Sample folder',
    folderPath: '/fixture/sample',
    linkedTask: null,
    comment: '',
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    createdAt: 1,
    updatedAt: 1
  }
  const persisted = Promise.withResolvers<void>()
  const pending = new Set<string>()
  const recover = () =>
    recoverAutomationModel(
      pending,
      { assertOwner: () => {}, show: () => automation, listRuns: () => [failed] },
      {
        getSettings: () => ({ botsEnabled: true }),
        getBots: () => [
          makeTestBot({ launch: { model: 'old-model', options: { effort: 'high' } } })
        ],
        getFolderWorkspaces: () => [folder],
        updateAutomation: (_id, { bot, agentId }) =>
          (automation = { ...automation, bot, agentId: agentId ?? automation.agentId }),
        flushPendingOrThrowAsync: () => persisted.promise
      },
      {
        runNow: async () => {
          if (options.refuseRerun) {
            throw new Error('Queue acknowledgement lost')
          }
          return { ...failed, id: 'queued', status: 'pending' }
        }
      },
      { id: 'automation', runId: 'failed', botId: 'bot-1', model: 'replacement', ...options.input }
    )

  return {
    recovery: recover(),
    recover,
    acceptSave: persisted.resolve,
    rejectSave: persisted.reject,
    get target() {
      return automation.bot
    },
    editTarget: (bot: AutomationBotTarget) => {
      automation = { ...automation, bot }
      persisted.resolve()
    }
  }
}

it('preserves an intervening destination edit and skips delivery after saving the model', async () => {
  const pending = beginRecovery()
  pending.editTarget({ ...pending.target!, resultsTo: 'chat' })

  await expect(pending.recovery).resolves.toEqual({ status: 'saved', rerun: 'skipped' })
  expect(pending.target).toEqual({
    botId: 'bot-1',
    runsIn: 'new',
    resultsTo: 'chat',
    agentSetup: { agent: 'codex', launch: { model: 'replacement', options: { effort: 'high' } } }
  })
})

const invalidRecoveries: (RecoveryOptions & { description: string })[] = [
  { description: 'an unclassified run', run: { errorCode: undefined } },
  { description: 'a completed run', run: { status: 'completed' } },
  { description: 'a chat destination', target: { runsIn: 'chat' } },
  { description: 'a different bot', input: { botId: 'previous-bot' } },
  {
    description: 'a different agent',
    run: { errorParams: { agent: 'claude', model: 'old-model' } }
  },
  { description: 'the failed model', input: { model: 'old-model' } },
  {
    description: 'a failed model with a bounded history ID',
    run: { errorParams: { agent: 'codex', model: 'x'.repeat(120) } },
    input: { model: 'x'.repeat(130) }
  }
]

it.each(invalidRecoveries)(
  'leaves the automation unchanged when recovering $description',
  async (options) => {
    const pending = beginRecovery(options)
    pending.acceptSave()

    await expect(pending.recovery).resolves.toEqual({ status: 'changed' })
    expect(pending.target?.agentSetup).toBeUndefined()
  }
)

it('prevents another recovery during an unacknowledged write', async () => {
  const pending = beginRecovery()
  await expect(pending.recover()).resolves.toEqual({ status: 'busy' })

  pending.rejectSave(new Error('Write acknowledgement lost'))
  await expect(pending.recovery).resolves.toEqual({ status: 'unconfirmed' })
})

it('reports an uncertain queue acknowledgement and retains the saved model', async () => {
  const pending = beginRecovery({ refuseRerun: true })
  pending.acceptSave()

  await expect(pending.recovery).resolves.toEqual({ status: 'saved', rerun: 'unconfirmed' })
  expect(pending.target?.agentSetup?.launch?.model).toBe('replacement')
})

it('admits a rerun with a newer model saved for the same destination', async () => {
  const pending = beginRecovery()
  pending.editTarget({
    ...pending.target!,
    agentSetup: { agent: 'codex', launch: { model: 'newer-model', options: { effort: 'high' } } }
  })

  await expect(pending.recovery).resolves.toEqual({
    status: 'queued',
    runId: 'queued',
    newerModel: true
  })
  expect(pending.target?.agentSetup?.launch?.model).toBe('newer-model')
})
