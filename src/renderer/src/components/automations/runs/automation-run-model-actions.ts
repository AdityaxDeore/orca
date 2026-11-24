import { useEffect, useRef } from 'react'
import type { Bot } from '../../../../../shared/bot-types'
import { automationRowHostId } from '../automations-page-navigation'
import {
  automationActionAvailability,
  capturedAutomationOwner
} from '../hosts/automation-captured-owner'
import { recoverOwnedAutomationModel } from '../hosts/automation-owner-action-runner'
import { toDispatchResult } from '../hosts/automation-row-action-dispatch'
import type { AutomationsPageController } from '../use-automations-page-controller'
import {
  showAutomationModelRecoveryResult,
  type AutomationRunModelOption
} from './automation-run-model-fix'

export function useAutomationRunModelActions(
  controller: AutomationsPageController,
  bots: readonly Bot[]
) {
  const {
    list: { selectedRow, selected },
    setup: { selectedAutomationRunPage },
    local,
    store,
    destination
  } = controller
  const hostId = automationRowHostId(selectedRow)
  const botId = selected?.bot?.botId
  const availability = selectedRow
    ? automationActionAvailability(
        capturedAutomationOwner(
          destination.automationDispatchContext.capturedOwners,
          selectedRow.key
        ),
        'run'
      )
    : null
  const bot =
    availability?.kind === 'owned'
      ? (bots.find((entry) => entry.id === botId && entry.hostId === (hostId ?? 'local')) ?? null)
      : null

  const activeRun =
    local.pageView === 'run' && selectedRow && selectedAutomationRunPage
      ? JSON.stringify([selectedRow.key, selectedAutomationRunPage.id])
      : null
  const currentRun = useRef(activeRun)
  useEffect(() => {
    currentRun.current = activeRun
    return () => {
      currentRun.current = null
    }
  }, [activeRun])

  const onPickModel = async (model: AutomationRunModelOption): Promise<void> => {
    if (!selectedRow || !selectedAutomationRunPage || !botId || availability?.kind !== 'owned') {
      return
    }
    const automationId = selectedRow.automation.id
    const outcome = await recoverOwnedAutomationModel(availability, {
      id: automationId,
      runId: selectedAutomationRunPage.id,
      botId,
      model: model.id
    })
    if (outcome.status === 'uncaptured') {
      return
    }
    const result = toDispatchResult(outcome)
    if (!result.ok) {
      if (result.notice.severity === 'owner') {
        destination.reportOwnerAction(selectedRow.key, result.notice)
      } else {
        showAutomationModelRecoveryResult({ status: 'unconfirmed' }, model.label)
      }
      return
    }

    destination.reportOwnerAction(selectedRow.key, null)
    if (result.value.status !== 'changed' && result.value.status !== 'busy') {
      destination.invalidateRowHost(selectedRow.key, 'definition')
    }
    showAutomationModelRecoveryResult(result.value, model.label)
    if (result.value.status === 'queued' && activeRun && currentRun.current === activeRun) {
      store.setPendingAutomationRunNavigation({
        automationId,
        runId: result.value.runId,
        hostId,
        origin: local.runPageOrigin
      })
    }
  }

  return { bot, onPickModel }
}
