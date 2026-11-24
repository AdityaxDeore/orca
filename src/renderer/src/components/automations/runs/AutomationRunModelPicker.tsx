// The failure banner's model picker: the models the editor's Agent field offers for this agent.
import React, { useId } from 'react'
import { useBotAgentMenu } from '@/components/bots/use-bot-agent-choices'
import { useAgentLaunchPickerInventory } from '@/components/agent/use-agent-launch-picker-inventory'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useTranslate } from '@/i18n/use-translate'
import { agentPickerModels } from '../../../../../shared/agent-launch/picker/agent-launch-picker-catalog'
import type { AgentPickerEntry } from '../../../../../shared/agent-launch/picker/agent-launch-picker'
import { automationRunModelParam } from '../../../../../shared/automations/history/automation-run-failure-copy'
import type { Bot, BotAgent } from '../../../../../shared/bot-types'
import { folderWorkspaceKey } from '../../../../../shared/workspace/identity/workspace-scope'

import type { AutomationRunModelOption } from './automation-run-model-fix'

/** What the picker lists, or null while it can't say (still reading, failed, or nothing offered):
 *  then the banner shows no picker and Edit is the way to change the model. */
export function automationRunModelOptions(
  entries: readonly AgentPickerEntry[],
  agent: BotAgent
): AutomationRunModelOption[] | null {
  const entry = entries.find((candidate) => candidate.agent === agent)
  if (
    !entry ||
    !entry.surfaces.includes('chat') ||
    (entry.catalogRead !== undefined && entry.catalogRead !== 'settled')
  ) {
    return null
  }
  const models = agentPickerModels(entry, 'chat')
    .filter((model) => !model.hidden)
    .map((model) => ({ id: model.id, label: model.label || model.id }))
  return models.length ? models : null
}

function useAutomationRunModelOptions(
  bot: Pick<Bot, 'hostId' | 'folderWorkspaceId'>,
  agent: BotAgent
): AutomationRunModelOption[] | null {
  // As the editor's bot Agent field reads them: the bot's host menu, in the bot's folder workspace.
  const menu = useBotAgentMenu(bot.hostId, true, agent)
  const entries = useAgentLaunchPickerInventory(
    folderWorkspaceKey(bot.folderWorkspaceId),
    menu.model,
    true,
    agent
  )
  return menu.choices.includes(agent) ? automationRunModelOptions(entries, agent) : null
}

function isFailedModel(id: string, failedModel?: string): boolean {
  return failedModel !== undefined && automationRunModelParam(id) === failedModel
}

export function AutomationRunModelSelect({
  options,
  failedModel,
  disabled,
  defaultOpen,
  onPick
}: {
  options: readonly AutomationRunModelOption[]
  /** Fixtures show the list open. */
  defaultOpen?: boolean
  failedModel?: string
  disabled: boolean
  onPick: (model: AutomationRunModelOption) => void
}): React.JSX.Element {
  const t = useTranslate()
  const nameId = useId()
  const valueId = useId()
  const failedLabel =
    options.find((option) => isFailedModel(option.id, failedModel))?.label ?? failedModel
  return (
    <Select
      value=""
      disabled={disabled}
      defaultOpen={defaultOpen}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.id === next)
        if (option && !isFailedModel(next, failedModel)) {
          onPick(option)
        }
      }}
    >
      <SelectTrigger
        size="xs"
        variant="destructive"
        aria-labelledby={`${nameId} ${valueId}`}
        title={failedLabel}
        className="max-w-[45%] min-w-0 @max-[33rem]:max-w-none"
      >
        <span id={nameId} className="sr-only">
          {t('automations.runModelFix.model', 'Model')}
        </span>
        <SelectValue
          id={valueId}
          placeholder={failedLabel ?? t('automations.runModelFix.pickModel', 'Pick a model')}
        />
      </SelectTrigger>
      <SelectContent position="popper" side="bottom" align="end">
        {failedModel ? (
          <SelectItem value={failedModel} disabled>
            {failedLabel}{' '}
            <span className="text-foreground">{t('automations.runModelFix.failed', 'Failed')}</span>
          </SelectItem>
        ) : null}
        {options
          .filter((option) => !isFailedModel(option.id, failedModel))
          .map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  )
}

export function AutomationRunModelPicker({
  bot,
  agent,
  failedModel,
  disabled,
  renderNotice,
  onPick
}: {
  bot: Pick<Bot, 'hostId' | 'folderWorkspaceId'>
  agent: BotAgent
  failedModel?: string
  disabled: boolean
  renderNotice: (picker?: React.ReactNode) => React.JSX.Element
  onPick: (model: AutomationRunModelOption) => void
}): React.JSX.Element {
  const options = useAutomationRunModelOptions(bot, agent)
  return renderNotice(
    options?.some((option) => !isFailedModel(option.id, failedModel)) ? (
      <AutomationRunModelSelect
        options={options}
        failedModel={failedModel}
        disabled={disabled}
        onPick={onPick}
      />
    ) : undefined
  )
}
