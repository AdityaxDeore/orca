import { isDeepStrictEqual } from 'node:util'
import type { AutomationBotTarget } from '../../../../shared/automations/automation-definition'
import type {
  AutomationModelRecoveryInput,
  AutomationModelRecoveryResult
} from '../../../../shared/automations/history/automation-model-recovery'
import type { AutomationOwnerPrecondition } from '../../../../shared/automations/ownership/automation-owner-precondition'
import { automationRunModelParam } from '../../../../shared/automations/history/automation-run-failure-copy'
import { BotLaunchSchema } from '../../../../shared/bots/bot-launch'
import {
  resolveBotAutomationRunTarget,
  type AutomationBotRunTarget
} from '../../../automations/bot-run-target'
import type { AutomationService } from '../../../automations/automation-service'
import type { RuntimeStore } from '../../construction/runtime-store-contract'
import type { RuntimeAutomationController } from './runtime-automation-controller'

type RecoveryStore = Pick<
  RuntimeStore,
  'getFolderWorkspaces' | 'getBots' | 'updateAutomation' | 'flushPendingOrThrowAsync'
> &
  Pick<Parameters<typeof resolveBotAutomationRunTarget>[0], 'getSettings'>

function recoveryTarget(bot: AutomationBotTarget, resolved: AutomationBotRunTarget) {
  const { agentSetup: _setup, ...delivery } = bot
  return {
    delivery,
    cwd: resolved.cwd,
    workspaceId: resolved.workspaceId,
    agent: resolved.bot.agent,
    options: resolved.bot.launch?.options,
    permissionMode: resolved.bot.permissionMode
  }
}

export async function recoverAutomationModel(
  pending: Set<string>,
  controller: Pick<RuntimeAutomationController, 'assertOwner' | 'show' | 'listRuns'>,
  store: RecoveryStore | null,
  service: Pick<AutomationService, 'runNow'> | null,
  { id, runId, botId, model }: AutomationModelRecoveryInput,
  expectedOwner?: AutomationOwnerPrecondition
): Promise<AutomationModelRecoveryResult> {
  if (pending.has(id)) {
    return { status: 'busy' }
  }
  pending.add(id)
  try {
    const getFolders = store?.getFolderWorkspaces?.bind(store)
    const flush = store?.flushPendingOrThrowAsync?.bind(store)
    if (!store?.updateAutomation || !getFolders || !flush || !service) {
      throw new Error('runtime_unavailable')
    }
    const resolve = (target: AutomationBotTarget) =>
      resolveBotAutomationRunTarget(
        {
          getSettings: () => store.getSettings(),
          getBots: () => store.getBots?.() ?? [],
          getFolderWorkspaces: getFolders
        },
        target
      )

    controller.assertOwner(id, expectedOwner, 'mutate')
    const target = controller.show(id).bot
    const failed = controller.listRuns(id).find((run) => run.id === runId)
    if (
      target?.botId !== botId ||
      target.runsIn !== 'new' ||
      failed?.status !== 'dispatch_failed' ||
      failed.errorCode !== 'agentModelUnavailable' ||
      failed.errorParams?.model === automationRunModelParam(model)
    ) {
      return { status: 'changed' }
    }
    const resolved = resolve(target)
    if (!resolved.ok || failed.errorParams?.agent !== resolved.bot.agent) {
      return { status: 'changed' }
    }
    const launch = BotLaunchSchema.parse({ ...resolved.bot.launch, model })
    const bot = { ...target, agentSetup: { agent: resolved.bot.agent, launch } }
    const expected = structuredClone(recoveryTarget(bot, resolved))
    // Keep the read and write synchronous so the other bot settings come from the same record.
    store.updateAutomation(id, { bot, agentId: resolved.bot.agent }, { expectedOwner })
    try {
      await flush({ drainToStableGeneration: false })
    } catch {
      return { status: 'unconfirmed' }
    }

    let newerModel: boolean
    try {
      controller.assertOwner(id, expectedOwner, 'execute')
      const current = controller.show(id).bot
      if (!current || current.runsIn !== 'new') {
        return { status: 'saved', rerun: 'skipped' }
      }
      const runTarget = resolve(current)
      if (!runTarget.ok || !isDeepStrictEqual(expected, recoveryTarget(current, runTarget))) {
        return { status: 'saved', rerun: 'skipped' }
      }
      newerModel = runTarget.bot.launch?.model !== model
    } catch {
      return { status: 'saved', rerun: 'skipped' }
    }

    try {
      const run = await service.runNow(id)
      return { status: 'queued', runId: run.id, ...(newerModel ? { newerModel: true } : {}) }
    } catch {
      return { status: 'saved', rerun: 'unconfirmed' }
    }
  } finally {
    pending.delete(id)
  }
}
