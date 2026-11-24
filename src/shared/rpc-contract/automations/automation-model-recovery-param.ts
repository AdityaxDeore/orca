import * as z from 'zod'
import { requiredString, OptionalString } from '../rpc-param-primitives'
import { AutomationId } from './automation-params'

export const AutomationRecoverModel = AutomationId.extend({
  runId: requiredString('Missing run id'),
  botId: requiredString('Missing bot id'),
  model: z.string().min(1).max(512),
  callerSessionId: OptionalString
})
