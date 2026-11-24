import { expect, it } from 'vitest'
import type {
  Automation,
  AutomationBotTarget
} from '../../../../shared/automations/automation-definition'
import type { AutomationRun } from '../../../../shared/automations/history/automation-run'
import type { FolderWorkspace } from '../../../../shared/folder-workspaces/folder-workspace-types'
import { makeTestBot } from '../../../bots/bot.test-fixture'
import { recoverAutomationModel } from './runtime-automation-model-recovery'

function beginRecovery() {
  let automation = {
    id: 'automation',
    agentId: 'codex',
    bot: { botId: 'bot-1', runsIn: 'new', resultsTo: 'none' }
  } as Automation
  const failed = {
    id: 'failed',
    status: 'dispatch_failed',
    errorCode: 'agentModelUnavailable',
    errorParams: { agent: 'codex', model: 'old-model' }
  } as AutomationRun
  const persisted = Promise.withResolvers<void>()
  const recovery = recoverAutomationModel(
    new Set<string>(),
    { assertOwner: () => {}, show: () => automation, listRuns: () => [failed] },
    {
      getSettings: () => ({ botsEnabled: true }),
      getBots: () => [makeTestBot({ launch: { model: 'old-model', options: { effort: 'high' } } })],
      getFolderWorkspaces: () => [{ id: 'w1', folderPath: '/fixture/sample' } as FolderWorkspace],
      updateAutomation: (_id, patch) => (automation = { ...automation, ...patch }),
      flushPendingOrThrowAsync: () => persisted.promise
    },
    { runNow: async () => ({ ...failed, id: 'queued', status: 'pending' }) },
    { id: 'automation', runId: 'failed', botId: 'bot-1', model: 'replacement' }
  )

  return {
    recovery,
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
