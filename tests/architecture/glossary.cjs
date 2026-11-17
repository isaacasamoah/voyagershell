const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("./yaml.cjs");
const { nested } = require("./owners.cjs");
const { phrases, tracked, isText } = require("./vocabulary.cjs");

const DOCS = {
  glossary: "docs/glossary.md",
  map: "docs/context-map.md",
};
const SOURCE = "tests/architecture/vocabulary.yaml";
const TABLE_PREFIX = "tests/architecture/";
const GENERATE = "npm run vocabulary:generate";

function model(table) {
  const contexts = table.contexts ?? [];
  const terms = table.terms ?? [];
  const retired = table.retired ?? [];
  return { contexts, terms, retired };
}

function owns(entry, names) {
  return names.filter((name) =>
    entry.endsWith("/") ? name.startsWith(entry) : name === entry,
  );
}

function validate(table, repository, names = tracked(repository)) {
  const { contexts, terms, retired } = model(table);
  const problems = [];
  const contextIds = new Set();
  const claimed = new Map();
  for (const context of contexts) {
    for (const key of ["id", "name", "summary", "guide"])
      if (!context[key]) problems.push(`context ${context.id} needs ${key}`);
    if (contextIds.has(context.id))
      problems.push(`context ${context.id} is defined twice`);
    contextIds.add(context.id);
    if (!(context.owns ?? []).length)
      problems.push(`context ${context.id} owns no files`);
    if (context.guide && !names.includes(context.guide))
      problems.push(`context ${context.id} guide ${context.guide} is missing`);
    for (const entry of context.owns ?? []) {
      if (!owns(entry, names).length)
        problems.push(`context ${context.id} owns ${entry}, which has no file`);
      if (claimed.has(entry))
        problems.push(
          `${entry} is owned by ${claimed.get(entry)} and ${context.id}`,
        );
      claimed.set(entry, context.id);
    }
  }
  problems.push(...nested(contexts));
  const byName = new Map();
  for (const term of terms) {
    for (const key of ["term", "context", "meaning"])
      if (!term[key]) problems.push(`term ${term.term} needs ${key}`);
    const key = String(term.term).toLowerCase();
    if (byName.has(key)) problems.push(`term ${term.term} is defined twice`);
    byName.set(key, term);
    if (!contextIds.has(term.context))
      problems.push(`term ${term.term} names unknown context ${term.context}`);
    if (term.meaning && !/[.!?]$/.test(term.meaning))
      problems.push(`term ${term.term} meaning must end with a period`);
  }
  for (const context of contexts)
    for (const used of context.uses ?? []) {
      const term = byName.get(String(used).toLowerCase());
      if (!term)
        problems.push(`context ${context.id} uses unknown term ${used}`);
      else if (term.context === context.id)
        problems.push(`context ${context.id} lists its own term ${used}`);
    }
  for (const entry of retired)
    if (!byName.has(String(entry.term).toLowerCase()))
      problems.push(`retired ${entry.id} names unknown term ${entry.term}`);
  const sources = names.filter(
    (name) =>
      !name.startsWith("docs/") &&
      !name.startsWith("experiments/") &&
      !name.startsWith(TABLE_PREFIX),
  );
  const text = sources
    .map((name) => fs.readFileSync(path.join(repository, name), "utf8"))
    .filter(isText)
    .join("\n");
  for (const term of terms)
    for (const code of term.code ?? [])
      if (!new RegExp(`\\b${code}\\b`).test(text))
        problems.push(`term ${term.term} names code ${code}, which is gone`);
  return problems;
}

function retiredUse(rules, table) {
  const { terms } = model(table);
  const problems = [];
  for (const term of terms)
    for (const rule of rules)
      for (const field of ["term", "meaning"])
        if (phrases(rule, "", String(term[field])).length)
          problems.push(
            `term ${term.term} uses the retired word "${rule.words.join(" ")}" in its ${field}`,
          );
  return problems;
}

function glossary(table) {
  const { terms, retired, contexts } = model(table);
  const name = new Map(contexts.map((context) => [context.id, context.name]));
  const lines = [
    "# Glossary",
    "",
    `Generated from \`${SOURCE}\` by \`${GENERATE}\`. Edit the table, then regenerate.`,
    "",
    "Each word has one meaning and one owning context. Use these words in code,",
    "docs and UI. The [context map](context-map.md) lists the files each context owns.",
    "Retired words fail `npm run vocabulary:check`.",
    "",
    "| Word | Meaning | Owner | Retired words |",
    "| --- | --- | --- | --- |",
  ];
  for (const term of [...terms].sort((a, b) => a.term.localeCompare(b.term))) {
    const old = retired
      .filter((entry) => entry.term === term.term)
      .map((entry) => `\`${entry.words}\``)
      .join(", ");
    lines.push(
      `| ${term.term} | ${term.meaning} | ${name.get(term.context)} | ${old} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function contextMap(table) {
  const { terms, contexts } = model(table);
  const lines = [
    "# Context map",
    "",
    `Generated from \`${SOURCE}\` by \`${GENERATE}\`. Edit the table, then regenerate.`,
    "",
    "Each bounded context owns the files and the words listed here. A context",
    "defines its own words and may use the words of another context that it lists.",
    "The [glossary](glossary.md) defines every word.",
  ];
  for (const context of contexts) {
    const own = terms.filter((term) => term.context === context.id);
    lines.push(
      "",
      `## ${context.name}`,
      "",
      context.summary,
      "",
      `Its guide is [${context.guide}](${path.posix.relative("docs", context.guide)}).`,
      "",
      "Owns files:",
      "",
      ...context.owns.map((entry) => `- \`${entry}\``),
      "",
      own.length
        ? `It owns the words ${own.map((term) => term.term).join(", ")}.`
        : "It owns no words.",
      "",
      context.uses?.length
        ? `It uses the words ${context.uses.join(", ")}.`
        : "It uses no words.",
    );
  }
  return `${lines.join("\n")}\n`;
}

function documents(table) {
  return new Map([
    [DOCS.glossary, glossary(table)],
    [DOCS.map, contextMap(table)],
  ]);
}

function stale(table, repository) {
  return [...documents(table)]
    .filter(([name, text]) => {
      const file = path.join(repository, name);
      return !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text;
    })
    .map(([name]) => `${name} is stale, run ${GENERATE}`);
}

function generate(table, repository) {
  for (const [name, text] of documents(table))
    fs.writeFileSync(path.join(repository, name), text);
}

function check(table, repository, retired) {
  const names = tracked(repository);
  return [
    ...validate(table, repository, names),
    ...retiredUse(retired, table),
    ...stale(table, repository),
  ];
}

function load(file) {
  return parse(fs.readFileSync(file, "utf8"));
}

module.exports = { check, generate, validate, stale, retiredUse, load };
