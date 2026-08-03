import { getModels } from '@earendil-works/pi-ai/compat'
import type { ModelOption, ProviderView } from '../shared/types'
import type { AppStore, StoredProvider } from './store'
import { SecretStore } from './secrets'

const BUILTIN_PROVIDERS = [
  { id: 'deepseek', name: 'DeepSeek', kind: 'deepseek' as const },
  { id: 'openai', name: 'OpenAI', kind: 'openai' as const },
]

function modelKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`
}

export function flattenModelOptions(
  providerId: string,
  providerName: string,
  models: Array<{ id: string; name?: string; reasoning?: boolean; contextWindow?: number }>,
): ModelOption[] {
  return models.map((model) => ({
    key: modelKey(providerId, model.id),
    providerId,
    providerName,
    modelId: model.id,
    name: model.name || model.id,
    reasoning: model.reasoning,
    contextWindow: model.contextWindow,
  }))
}

export function parseModelKey(key: string): { providerId: string; modelId: string } {
  const separator = key.indexOf('::')
  if (separator < 1 || separator === key.length - 2) throw new Error('Invalid model selection')
  return { providerId: key.slice(0, separator), modelId: key.slice(separator + 2) }
}

function builtinModels(providerId: string, providerName: string): ModelOption[] {
  try {
    return flattenModelOptions(providerId, providerName, getModels(providerId as any).map((model) => ({
      id: model.id,
      name: model.name,
      reasoning: model.reasoning,
      contextWindow: model.contextWindow,
    })))
  } catch {
    return []
  }
}

function customModels(provider: StoredProvider): ModelOption[] {
  return flattenModelOptions(provider.id, provider.name, provider.models ?? [])
}

export function buildProviderViews(store: AppStore, secrets: SecretStore): ProviderView[] {
  const configured = new Map(store.providers.map((provider) => [provider.id, provider]))
  const views: ProviderView[] = []

  for (const provider of BUILTIN_PROVIDERS) {
    views.push({
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      configured: secrets.has(provider.id),
      requiresBaseUrl: false,
      models: secrets.has(provider.id) ? builtinModels(provider.id, provider.name) : [],
    })
  }

  for (const provider of store.providers.filter((item) => item.kind === 'custom')) {
    views.push({
      id: provider.id,
      name: provider.name,
      kind: 'custom',
      configured: secrets.has(provider.id),
      requiresBaseUrl: true,
      baseUrl: provider.baseUrl,
      models: secrets.has(provider.id) ? customModels(provider) : [],
    })
  }

  return views
}
