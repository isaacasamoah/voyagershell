import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

interface SourceEntry { file: string; source: string }
const GENERATION_APIS = new Set(['generateObject', 'generateText', 'streamObject', 'streamText'])
const EMBEDDING_APIS = new Set(['embed', 'embedMany'])
const EXPECTED_GENERATION = [
  'lib/agents/cartographer/extractor.ts|generateObject|model',
  'lib/agents/cartographer/extractor.ts|generateObject|model',
  'lib/agents/cartographer/relation-judge.ts|generateObject|model',
  'lib/agents/cartographer/relation-judge.ts|generateObject|model',
  'lib/agents/cartographer/topic-matcher.ts|generateObject|model',
  'lib/agents/deep-retrieval.ts|generateText|resolved.model',
  'lib/harness/run-turn.ts|streamText|chatModel',
  'recipes/experiments/relation-conflict-harness.ts|generateObject|model',
  'recipes/experiments/relation-conflict-harness.ts|generateObject|model',
]
const EXPECTED_EXTRACTOR_HANDOFF = ['lib/agents/cartographer.ts|extractKnowledge|resolved.model']
const EXPECTED_TOPIC_MATCHER_HANDOFF = [
  'lib/agents/cartographer/backfill.ts|matchKnowledgeTopics|resolved.model', 'lib/agents/cartographer/topic-pipeline.ts|matchKnowledgeTopics|input.model']
const EXPECTED_OPENAI_EMBEDDINGS = [
  "lib/agents/cartographer/apply.ts|getOpenAI().embeddings.create|'text-embedding-3-small'",
  "lib/agents/cartographer/preference-superseding.ts|getOpenAI().embeddings.create|'text-embedding-3-small'",
  "lib/agents/cartographer/preference-superseding.ts|getOpenAI().embeddings.create|'text-embedding-3-small'",
  "lib/agents/cartographer/topics.ts|getOpenAI().embeddings.create|'text-embedding-3-small'",
  "lib/agents/cartographer/topics.ts|getOpenAI().embeddings.create|'text-embedding-3-small'",
  "lib/knowledge/event-storage.ts|getOpenAI().embeddings.create|'text-embedding-3-small'",
  "lib/knowledge/search-embedding.ts|getOpenAI().embeddings.create|'text-embedding-3-small'",
  'recipes/experiments/relation-conflict-harness-support.ts|getOpenAI().embeddings.create|relationContract.blocking.embeddingModel',
]

const trackedTypeScript = (): string[] => [
  ...execFileSync('git', ['ls-files', '*.ts', '*.tsx'], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean),
  ...execFileSync(
    'git', ['ls-files', '--others', '--exclude-standard', '*.ts', '*.tsx'],
    { encoding: 'utf8' },
  ).trim().split('\n').filter(Boolean),
]

const productionEntries = (): SourceEntry[] => trackedTypeScript()
  .filter((file) => (
    !file.startsWith('.claude/')
    && !file.startsWith('scripts/')
    && !file.endsWith('.test.ts')
    && !file.endsWith('.contract.test.ts')
    && !file.includes('-test-fixture')
  ))
  .map((file) => ({ file, source: readFileSync(file, 'utf8') }))

const normalized = (node: ts.Node, sourceFile: ts.SourceFile): string => (
  node.getText(sourceFile).replace(/\s+/g, '')
)

const modelArgument = (
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
): string => {
  const options = call.arguments[0]
  if (!options || !ts.isObjectLiteralExpression(options)) return '<missing>'
  for (const property of options.properties) {
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === 'model') {
      return property.name.text
    }
    if (ts.isPropertyAssignment(property) && property.name.getText(sourceFile) === 'model') {
      return normalized(property.initializer, sourceFile)
    }
  }
  return '<missing>'
}

const aiBindings = (sourceFile: ts.SourceFile) => {
  const named = new Map<string, string>()
  const namespaces = new Set<string>()
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)
      || statement.moduleSpecifier.getText(sourceFile) !== "'ai'") continue
    const bindings = statement.importClause?.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        named.set(element.name.text, element.propertyName?.text ?? element.name.text)
      }
    }
  }
  return { named, namespaces }
}

const importedApi = (
  expression: ts.LeftHandSideExpression,
  bindings: ReturnType<typeof aiBindings>,
): string | null => {
  if (ts.isIdentifier(expression)) return bindings.named.get(expression.text) ?? null
  if (ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && bindings.namespaces.has(expression.expression.text)) {
    return expression.name.text
  }
  return null
}

const aiCallSites = (entries: SourceEntry[], apis: Set<string>): string[] => {
  const sites: string[] = []
  for (const entry of entries) {
    const sourceFile = ts.createSourceFile(
      entry.file,
      entry.source,
      ts.ScriptTarget.Latest,
      true,
      entry.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const bindings = aiBindings(sourceFile)
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const api = importedApi(node.expression, bindings)
        if (api && apis.has(api)) {
          sites.push(`${entry.file}|${api}|${modelArgument(node, sourceFile)}`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return sites.sort()
}

const namedCallSites = (entries: SourceEntry[], name: string): string[] => {
  const sites: string[] = []
  for (const entry of entries) {
    const sourceFile = ts.createSourceFile(
      entry.file,
      entry.source,
      ts.ScriptTarget.Latest,
      true,
      entry.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === name
        && node.arguments[0]) {
        sites.push(`${entry.file}|${name}|${normalized(node.arguments[0], sourceFile)}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return sites.sort()
}

const openAIEmbeddingSites = (entries: SourceEntry[]): string[] => {
  const sites: string[] = []
  for (const entry of entries) {
    const sourceFile = ts.createSourceFile(
      entry.file,
      entry.source,
      ts.ScriptTarget.Latest,
      true,
      entry.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'create'
        && ts.isPropertyAccessExpression(node.expression.expression)
        && node.expression.expression.name.text === 'embeddings') {
        const client = normalized(node.expression.expression.expression, sourceFile)
        sites.push(`${entry.file}|${client}.embeddings.create|${modelArgument(node, sourceFile)}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  return sites.sort()
}

const assertGenerationContract = (entries: SourceEntry[]): void => {
  if (JSON.stringify(aiCallSites(entries, GENERATION_APIS))
    !== JSON.stringify(EXPECTED_GENERATION)) {
    throw new Error('generation lane changed')
  }
}

const assertEmbeddingContract = (entries: SourceEntry[]): void => {
  const sdkChanged = aiCallSites(entries, EMBEDDING_APIS).length > 0
  const clientChanged = JSON.stringify(openAIEmbeddingSites(entries))
    !== JSON.stringify(EXPECTED_OPENAI_EMBEDDINGS)
  const helper = entries.find(({ file }) => file === 'lib/agents/cartographer/embeddings.ts')?.source
  const sharedClientRedirected = !helper
    || !/new\s+OpenAI\s*\(\s*\)/.test(helper)
  if (sdkChanged || clientChanged || sharedClientRedirected) {
    throw new Error('embedding lane changed')
  }
}

describe('model lane contract', () => {
  it('keeps each generation call and extractor handoff on the resolved model', () => {
    const entries = productionEntries()
    expect(aiCallSites(entries, GENERATION_APIS)).toEqual(EXPECTED_GENERATION)
    expect(namedCallSites(entries, 'extractKnowledge')).toEqual(EXPECTED_EXTRACTOR_HANDOFF)
    expect(namedCallSites(entries, 'matchKnowledgeTopics')).toEqual(EXPECTED_TOPIC_MATCHER_HANDOFF)
  })
  it('rejects a bypass added inside an already-known generation file', () => {
    const entries = productionEntries()
    const mutated = entries.map((entry) => entry.file === 'lib/agents/deep-retrieval.ts'
      ? {
          ...entry,
          source: `${entry.source}
generateText({ model: bypassModel, prompt: 'mutation fixture' })`,
        }
      : entry)
    expect(() => assertGenerationContract(mutated)).toThrow('generation lane changed')
  })

  it('keeps embeddings on the exact OpenAI API-key call sites', () => {
    const entries = productionEntries()
    expect(aiCallSites(entries, EMBEDDING_APIS)).toEqual([])
    expect(openAIEmbeddingSites(entries)).toEqual(EXPECTED_OPENAI_EMBEDDINGS)
    expect(() => assertEmbeddingContract(entries)).not.toThrow()
  })

  it('rejects both embed and embedMany on a Codex model', () => {
    const entries = productionEntries()
    const mutated = entries.map((entry) => entry.file === 'lib/models/codex.ts'
      ? {
          ...entry,
          source: `${entry.source}
import { embed, embedMany } from 'ai'
embed({ model: createCodexModel(fakeCredential), value: 'mutation fixture' })
embedMany({ model: createCodexModel(fakeCredential), values: ['mutation fixture'] })`,
        }
      : entry)
    expect(aiCallSites(mutated, EMBEDDING_APIS)).toEqual([
      'lib/models/codex.ts|embedMany|createCodexModel(fakeCredential)',
      'lib/models/codex.ts|embed|createCodexModel(fakeCredential)',
    ])
    expect(() => assertEmbeddingContract(mutated)).toThrow('embedding lane changed')
    const cartographerMutated = entries.map((entry) => (
      entry.file === 'lib/agents/cartographer.ts'
        ? {
            ...entry,
            source: `${entry.source}
import { embed } from 'ai'
embed({ model: resolved.model, value: 'mutation fixture' })`,
          }
        : entry
    ))
    expect(() => assertEmbeddingContract(cartographerMutated)).toThrow('embedding lane changed')
    const helperMutated = entries.map((entry) => (
      entry.file === 'lib/agents/cartographer/embeddings.ts'
        ? { ...entry, source: entry.source.replace('new OpenAI()', 'new OpenAI({ baseURL })') }
        : entry
    ))
    expect(() => assertEmbeddingContract(helperMutated)).toThrow('embedding lane changed')
  })
})
