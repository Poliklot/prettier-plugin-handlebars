import fs from 'node:fs';
import path from 'node:path';

export const pluginPackageName = '@poliklot/prettier-plugin-handlebars';
export const handlebarsParserName = 'handlebars';

const defaultConfigFileName = '.prettierrc.json';
const handlebarsOverride = {
  files: ['*.hbs', '*.handlebars'],
  options: {
    parser: handlebarsParserName,
  },
};

const configCandidates = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.json5',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  '.prettierrc.yml',
  '.prettierrc.yaml',
  '.prettierrc.toml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'package.json',
];

export type InitChangeKind = 'create' | 'update';
export type InitWarningKind = 'unsupported-config' | 'prettierignore' | 'dependency' | 'invalid-config';

export interface InitChange {
  kind: InitChangeKind;
  filePath: string;
  relativePath: string;
  message: string;
  content: string;
}

export interface InitWarning {
  kind: InitWarningKind;
  filePath?: string;
  relativePath?: string;
  message: string;
  checkFailure: boolean;
}

export interface InitPlan {
  cwd: string;
  configPath?: string;
  configRelativePath?: string;
  changes: InitChange[];
  warnings: InitWarning[];
  alreadyConfigured: boolean;
  installCommand?: string;
}

interface LocatedConfig {
  filePath: string;
  relativePath: string;
  kind: 'json' | 'package-json' | 'unsupported';
}

interface EnsureResult {
  value: Record<string, unknown>;
  changed: boolean;
  messages: string[];
  warnings: InitWarning[];
}

export function createInitPlan(cwd = process.cwd()): InitPlan {
  const root = path.resolve(cwd);
  const changes: InitChange[] = [];
  const warnings: InitWarning[] = [];
  const installCommand = getInstallCommand(root);
  const locatedConfig = findPrettierConfig(root);

  if (!hasLocalDependency(root, 'prettier')) {
    warnings.push({
      kind: 'dependency',
      relativePath: 'package.json',
      filePath: path.join(root, 'package.json'),
      message: `Install Prettier locally: ${installCommand}`,
      checkFailure: true,
    });
  }

  if (!hasLocalDependency(root, pluginPackageName)) {
    warnings.push({
      kind: 'dependency',
      relativePath: 'package.json',
      filePath: path.join(root, 'package.json'),
      message: `Install the Handlebars plugin locally: ${installCommand}`,
      checkFailure: true,
    });
  }

  if (locatedConfig) {
    if (locatedConfig.kind === 'unsupported') {
      if (!unsupportedConfigLooksConfigured(locatedConfig.filePath)) {
        warnings.push({
          kind: 'unsupported-config',
          filePath: locatedConfig.filePath,
          relativePath: locatedConfig.relativePath,
          message: `Detected ${locatedConfig.relativePath}. This init command does not rewrite JS/JSON5/YAML/TOML configs automatically. Add ${pluginPackageName} and the *.hbs override manually, or use ${defaultConfigFileName}.`,
          checkFailure: true,
        });
      }
    } else {
      const configChange = planSupportedConfigUpdate(root, locatedConfig);
      warnings.push(...configChange.warnings);
      if (configChange.change) {
        changes.push(configChange.change);
      }
    }
  } else {
    const filePath = path.join(root, defaultConfigFileName);
    changes.push({
      kind: 'create',
      filePath,
      relativePath: defaultConfigFileName,
      message: `Create ${defaultConfigFileName} with the plugin and explicit Handlebars parser override.`,
      content: `${JSON.stringify(createRecommendedPrettierConfig(), null, 2)}\n`,
    });
  }

  warnings.push(...findPrettierIgnoreWarnings(root));

  return {
    cwd: root,
    configPath: locatedConfig?.filePath,
    configRelativePath: locatedConfig?.relativePath,
    changes,
    warnings,
    alreadyConfigured: changes.length === 0 && warnings.every((warning) => !warning.checkFailure),
    installCommand,
  };
}

export function applyInitPlan(plan: InitPlan): void {
  for (const change of plan.changes) {
    fs.writeFileSync(change.filePath, change.content, 'utf8');
  }
}

export function hasCheckFailures(plan: InitPlan): boolean {
  return plan.changes.length > 0 || plan.warnings.some((warning) => warning.checkFailure);
}

export function renderInitPlan(plan: InitPlan, mode: 'dry-run' | 'write' | 'check'): string {
  const lines: string[] = [];
  lines.push('@poliklot/prettier-plugin-handlebars init');
  lines.push(`Project: ${plan.cwd}`);
  lines.push(`Mode: ${mode}`);
  lines.push('');

  if (plan.configRelativePath) {
    lines.push(`Detected Prettier config: ${plan.configRelativePath}`);
  } else {
    lines.push(`Detected Prettier config: none`);
  }

  lines.push('');

  if (plan.changes.length === 0) {
    lines.push('Config changes: none');
  } else {
    lines.push('Config changes:');
    for (const change of plan.changes) {
      lines.push(`- ${change.kind.toUpperCase()} ${change.relativePath}: ${change.message}`);
    }
  }

  if (plan.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of plan.warnings) {
      const location = warning.relativePath ? `${warning.relativePath}: ` : '';
      lines.push(`- ${location}${warning.message}`);
    }
  }

  lines.push('');

  if (mode === 'dry-run') {
    if (plan.changes.length > 0) {
      lines.push('Run with --write to apply these config changes.');
    } else {
      lines.push('No config writes are needed.');
    }
  } else if (mode === 'write') {
    lines.push(plan.changes.length > 0 ? 'Applied config changes.' : 'No config writes were needed.');
  } else if (mode === 'check') {
    lines.push(hasCheckFailures(plan) ? 'Check failed: setup is incomplete.' : 'Check passed: setup looks ready.');
  }

  if (plan.installCommand && plan.warnings.some((warning) => warning.kind === 'dependency')) {
    lines.push(`Install command: ${plan.installCommand}`);
  }

  return `${lines.join('\n')}\n`;
}

function findPrettierConfig(cwd: string): LocatedConfig | undefined {
  for (const candidate of configCandidates) {
    const filePath = path.join(cwd, candidate);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    if (candidate === 'package.json') {
      const packageJson = readJsonFile(filePath);
      if (packageJson && isRecord(packageJson) && isRecord(packageJson.prettier)) {
        return {
          filePath,
          relativePath: candidate,
          kind: 'package-json',
        };
      }
      continue;
    }

    if (candidate === '.prettierrc' || candidate.endsWith('.json')) {
      return {
        filePath,
        relativePath: candidate,
        kind: 'json',
      };
    }

    return {
      filePath,
      relativePath: candidate,
      kind: 'unsupported',
    };
  }

  return undefined;
}

function planSupportedConfigUpdate(root: string, locatedConfig: LocatedConfig): { change?: InitChange; warnings: InitWarning[] } {
  const warnings: InitWarning[] = [];
  const source = fs.readFileSync(locatedConfig.filePath, 'utf8');
  const parsed = parseJson(source, locatedConfig.filePath);

  if (!isRecord(parsed)) {
    return {
      warnings: [
        {
          kind: 'invalid-config',
          filePath: locatedConfig.filePath,
          relativePath: locatedConfig.relativePath,
          message: `Could not parse ${locatedConfig.relativePath} as a JSON object. Add the plugin config manually.`,
          checkFailure: true,
        },
      ],
    };
  }

  if (locatedConfig.kind === 'package-json') {
    const packageJson = cloneRecord(parsed);
    const prettierConfig = isRecord(packageJson.prettier) ? cloneRecord(packageJson.prettier) : {};
    const ensured = ensureRecommendedConfig(prettierConfig, root, locatedConfig.relativePath);
    warnings.push(...ensured.warnings);

    if (!ensured.changed) {
      return { warnings };
    }

    packageJson.prettier = ensured.value;

    return {
      warnings,
      change: {
        kind: 'update',
        filePath: locatedConfig.filePath,
        relativePath: locatedConfig.relativePath,
        message: ensured.messages.join(' '),
        content: `${JSON.stringify(packageJson, null, 2)}\n`,
      },
    };
  }

  const config = cloneRecord(parsed);
  const ensured = ensureRecommendedConfig(config, root, locatedConfig.relativePath);
  warnings.push(...ensured.warnings);

  if (!ensured.changed) {
    return { warnings };
  }

  return {
    warnings,
    change: {
      kind: 'update',
      filePath: locatedConfig.filePath,
      relativePath: locatedConfig.relativePath,
      message: ensured.messages.join(' '),
      content: `${JSON.stringify(ensured.value, null, 2)}\n`,
    },
  };
}

function ensureRecommendedConfig(config: Record<string, unknown>, cwd: string, relativePath: string): EnsureResult {
  const value = cloneRecord(config);
  const messages: string[] = [];
  const warnings: InitWarning[] = [];
  let changed = false;

  if (value.plugins === undefined) {
    value.plugins = [pluginPackageName];
    messages.push(`Added ${pluginPackageName} to plugins.`);
    changed = true;
  } else if (Array.isArray(value.plugins)) {
    if (!value.plugins.includes(pluginPackageName)) {
      value.plugins = [...value.plugins, pluginPackageName];
      messages.push(`Added ${pluginPackageName} to plugins.`);
      changed = true;
    }
  } else {
    warnings.push({
      kind: 'invalid-config',
      relativePath,
      filePath: path.join(cwd, relativePath),
      message: '`plugins` exists but is not an array. Add the Handlebars plugin manually.',
      checkFailure: true,
    });
  }

  if (value.overrides === undefined) {
    value.overrides = [handlebarsOverride];
    messages.push('Added explicit *.hbs / *.handlebars parser override.');
    changed = true;
  } else if (Array.isArray(value.overrides)) {
    const overrideResult = ensureHandlebarsOverride(value.overrides);
    if (overrideResult.changed) {
      value.overrides = overrideResult.overrides;
      messages.push(overrideResult.message);
      changed = true;
    }
    warnings.push(...overrideResult.warnings.map((warning) => ({ ...warning, filePath: path.join(cwd, relativePath), relativePath })));
  } else {
    warnings.push({
      kind: 'invalid-config',
      relativePath,
      filePath: path.join(cwd, relativePath),
      message: '`overrides` exists but is not an array. Add the Handlebars parser override manually.',
      checkFailure: true,
    });
  }

  return {
    value,
    changed,
    messages,
    warnings,
  };
}

function ensureHandlebarsOverride(overrides: unknown[]): {
  overrides: unknown[];
  changed: boolean;
  message: string;
  warnings: InitWarning[];
} {
  const nextOverrides = overrides.map((override) => (isRecord(override) ? cloneRecord(override) : override));
  const warnings: InitWarning[] = [];
  let changed = false;
  let message = '';

  const matchingIndex = nextOverrides.findIndex(
    (override) => isRecord(override) && fileSpecContainsHandlebars(override.files),
  );

  if (matchingIndex === -1) {
    nextOverrides.push(handlebarsOverride);
    return {
      overrides: nextOverrides,
      changed: true,
      message: 'Added explicit *.hbs / *.handlebars parser override.',
      warnings,
    };
  }

  const matchingOverride = nextOverrides[matchingIndex];
  if (!isRecord(matchingOverride)) {
    return {
      overrides: nextOverrides,
      changed,
      message,
      warnings,
    };
  }

  const options = isRecord(matchingOverride.options) ? cloneRecord(matchingOverride.options) : {};
  if (options.parser === handlebarsParserName) {
    return {
      overrides: nextOverrides,
      changed,
      message,
      warnings,
    };
  }

  if (options.parser === undefined) {
    options.parser = handlebarsParserName;
    matchingOverride.options = options;
    nextOverrides[matchingIndex] = matchingOverride;
    changed = true;
    message = 'Added parser: "handlebars" to the existing Handlebars override.';
  } else {
    nextOverrides.push(handlebarsOverride);
    changed = true;
    message = 'Added a later explicit Handlebars override because an existing *.hbs override uses another parser.';
    warnings.push({
      kind: 'invalid-config',
      message: `An existing *.hbs override uses parser ${JSON.stringify(options.parser)}. The init command appended a later handlebars override so Prettier resolves *.hbs files correctly.`,
      checkFailure: false,
    });
  }

  return {
    overrides: nextOverrides,
    changed,
    message,
    warnings,
  };
}

function createRecommendedPrettierConfig(): Record<string, unknown> {
  return {
    plugins: [pluginPackageName],
    overrides: [handlebarsOverride],
  };
}

function findPrettierIgnoreWarnings(cwd: string): InitWarning[] {
  const filePath = path.join(cwd, '.prettierignore');
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const warnings: InitWarning[] = [];
  const lines = source.split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
      return;
    }

    if (ignorePatternContainsHandlebars(trimmed)) {
      warnings.push({
        kind: 'prettierignore',
        filePath,
        relativePath: '.prettierignore',
        message: `Line ${index + 1} may skip Handlebars files: ${trimmed}`,
        checkFailure: true,
      });
    }
  });

  return warnings;
}

function ignorePatternContainsHandlebars(pattern: string): boolean {
  const normalized = pattern.replace(/\\/g, '/').toLowerCase();
  return normalized.includes('.hbs') || normalized.includes('*.hbs') || normalized.includes('handlebars');
}

function unsupportedConfigLooksConfigured(filePath: string): boolean {
  const source = fs.readFileSync(filePath, 'utf8').toLowerCase();
  return (
    source.includes(pluginPackageName.toLowerCase()) &&
    source.includes(handlebarsParserName) &&
    (source.includes('.hbs') || source.includes('*.hbs') || source.includes('handlebars'))
  );
}

function fileSpecContainsHandlebars(files: unknown): boolean {
  if (typeof files === 'string') {
    return files.toLowerCase().includes('.hbs') || files.toLowerCase().includes('handlebars');
  }

  if (Array.isArray(files)) {
    return files.some((file) => fileSpecContainsHandlebars(file));
  }

  return false;
}

function hasLocalDependency(cwd: string, dependencyName: string): boolean {
  const packagePath = path.join(cwd, 'package.json');
  const packageJson = readJsonFile(packagePath);
  if (!isRecord(packageJson)) {
    return false;
  }

  return [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
    packageJson.optionalDependencies,
  ].some((dependencies) => isRecord(dependencies) && typeof dependencies[dependencyName] === 'string');
}

function getInstallCommand(cwd: string): string {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) {
    return `pnpm add -D prettier ${pluginPackageName}`;
  }

  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) {
    return `yarn add -D prettier ${pluginPackageName}`;
  }

  if (fs.existsSync(path.join(cwd, 'bun.lockb')) || fs.existsSync(path.join(cwd, 'bun.lock'))) {
    return `bun add -d prettier ${pluginPackageName}`;
  }

  return `npm install --save-dev prettier ${pluginPackageName}`;
}

function readJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  return parseJson(fs.readFileSync(filePath, 'utf8'), filePath);
}

function parseJson(source: string, filePath: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    return undefined;
  }
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  return { ...record };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
