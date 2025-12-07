#!/usr/bin/env node

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  readdirSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import YAML from "yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TemplateFile {
  name: string;
  template: string;
}

interface EntityTemplate {
  folderPattern?: string;
  filePath?: string;
  files?: TemplateFile[];
  template?: string;
}

interface Config {
  vaultPath: string;
  areasRoot: string;
  projectsRoot: string;
  resourcesRoot: string;
  archiveAreasRoot: string;
  archiveProjectsRoot: string;
  archiveResourcesRoot: string;
  templates: {
    [key: string]: EntityTemplate;
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function renderTemplate(tmpl: string, vars: Record<string, string>): string {
  const VAR_PATTERN = /\{\{([^}]+)\}\}/g;
  return tmpl.replace(VAR_PATTERN, (_, rawKey) => {
    const [key, def] = rawKey.split("|").map((s) => s.trim());
    const val = vars[key];
    return val ?? def ?? "";
  });
}

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function generateUniquePrefix(config: any): string {
  const existingPrefixes = new Set<string>();

  // Collect existing prefixes from projects
  const projectsDir = join(config.vaultPath, config.projectsRoot);
  if (existsSync(projectsDir)) {
    const projectDirs = readdirSync(projectsDir);
    for (const dir of projectDirs) {
      if (dir.includes("_")) {
        existingPrefixes.add(dir.substring(0, 2));
      }
    }
  }

  // Collect existing prefixes from areas
  const areasDir = join(config.vaultPath, config.areasRoot);
  if (existsSync(areasDir)) {
    const areaDirs = readdirSync(areasDir);
    for (const dir of areaDirs) {
      if (dir.includes("_")) {
        existingPrefixes.add(dir.substring(0, 2));
      }
    }
  }

  // Generate random prefix until we find a unique one
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let prefix: string;
  do {
    prefix =
      chars[Math.floor(Math.random() * chars.length)] +
      chars[Math.floor(Math.random() * chars.length)];
  } while (existingPrefixes.has(prefix));

  return prefix;
}

function findTemplatesPath(): string {
  // Try relative to the script location (for installed package)
  const installedPath = join(__dirname, "templates.yml");
  if (existsSync(installedPath)) {
    return installedPath;
  }

  // Try in current working directory (for development)
  const cwdPath = join(process.cwd(), "templates.yml");
  if (existsSync(cwdPath)) {
    return cwdPath;
  }

  console.error("Templates file not found!");
  console.error("Tried:");
  console.error(`  - ${installedPath}`);
  console.error(`  - ${cwdPath}`);
  process.exit(1);
}

function createEntity(type: string, title: string, options: any = {}) {
  const templatesPath = findTemplatesPath();

  const templatesContent = readFileSync(templatesPath, "utf-8");
  const config = YAML.parse(templatesContent);

  const template = config.templates[type];
  if (!template) {
    console.error(`Template '${type}' not found in templates.yml`);
    process.exit(1);
  }

  const slug = slugify(title);
  const now = new Date();
  const date = now.toISOString().split("T")[0];

  // Auto-generate prefix if needed for project or area
  let prefix = options.prefix;
  if ((type === "project" || type === "area") && !prefix) {
    prefix = generateUniquePrefix(config);
    console.log(`Generated prefix: ${prefix}`);
  }

  const vars: Record<string, string> = {
    title,
    slug,
    date,
    status: type === "project" ? "Planned" : "Active",
    area: options.area || "personal_blog",
    dependencies: options.dependencies || "none",
    prefix: prefix || "",
    folder: options.folder || "",
  };

  // Handle single-file templates (post, resource)
  if (template.filePath) {
    const filePath = join(
      config.vaultPath,
      renderTemplate(template.filePath, vars),
    );
    const fileDir = dirname(filePath);
    ensureDir(fileDir);

    let content = renderTemplate(template.template!, vars);
    content = content.replace("{{cursor}}", "");

    writeFileSync(filePath, content);
    console.log(`✓ Created ${type}: ${title}`);
    console.log(`  ${filePath}`);
    return;
  }

  // Handle multi-file templates (area, project)
  const folderPath = join(
    config.vaultPath,
    renderTemplate(template.folderPattern!, vars),
  );
  ensureDir(folderPath);

  for (const fileDef of template.files!) {
    const filePath = join(folderPath, fileDef.name);
    const fileDir = dirname(filePath);
    ensureDir(fileDir);

    let content = renderTemplate(fileDef.template, vars);
    content = content.replace("{{cursor}}", "");

    writeFileSync(filePath, content);
  }

  console.log(`✓ Created ${type}: ${title}`);
  console.log(`  ${folderPath}`);
}

function archiveEntity(
  type: "project" | "area" | "resource",
  folderName: string,
) {
  const templatesPath = findTemplatesPath();
  const config = YAML.parse(readFileSync(templatesPath, "utf-8"));

  const rootMap = {
    project: config.projectsRoot,
    area: config.areasRoot,
    resource: config.resourcesRoot,
  };

  const archiveMap = {
    project: config.archiveProjectsRoot,
    area: config.archiveAreasRoot,
    resource: config.archiveResourcesRoot,
  };

  const sourcePath = join(config.vaultPath, rootMap[type], folderName);
  const targetPath = join(config.vaultPath, archiveMap[type], folderName);

  if (!existsSync(sourcePath)) {
    console.error(`Folder not found: ${sourcePath}`);
    process.exit(1);
  }

  ensureDir(dirname(targetPath));
  renameSync(sourcePath, targetPath);

  console.log(`✓ Archived ${type}: ${folderName}`);
  console.log(`  ${targetPath}`);
}

function initVault() {
  const templatesPath = findTemplatesPath();
  const config = YAML.parse(readFileSync(templatesPath, "utf-8"));

  // Collect all directories to create from config
  const dirsToCreate = new Set<string>();

  // Add root directories
  [
    config.projectsRoot,
    config.areasRoot,
    config.resourcesRoot,
    config.archiveProjectsRoot,
    config.archiveAreasRoot,
    config.archiveResourcesRoot,
  ].forEach((dir) => {
    if (dir) dirsToCreate.add(dir);
  });

  // Add journal directories
  const journalDirs = ["04_journal", "04_journal/daily", "04_journal/weeklies", "04_journal/experiments"];
  journalDirs.forEach((dir) => dirsToCreate.add(dir));

  // Create all directories
  let createdCount = 0;
  for (const dir of dirsToCreate) {
    const fullPath = join(config.vaultPath, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      console.log(`✓ Created ${dir}`);
      createdCount++;
    }
  }

  if (createdCount === 0) {
    console.log("All directories already exist.");
  } else {
    console.log(`\n✓ Vault initialized with ${createdCount} new directories`);
    console.log(`Vault location: ${config.vaultPath}`);
  }

  // Create or update AGENTS.md
  const agentsMdPath = join(config.vaultPath, "AGENTS.md");
  const agentsContent = generateAgentsMd();

  if (existsSync(agentsMdPath)) {
    // Read existing content to preserve anything before our marker
    const existing = readFileSync(agentsMdPath, "utf-8");
    if (existing.includes("## obsd Commands")) {
      // Update existing obsd section
      const beforeObsd = existing.split("## obsd Commands")[0];
      writeFileSync(agentsMdPath, beforeObsd + agentsContent);
    } else {
      // Append our section
      writeFileSync(agentsMdPath, existing + "\n" + agentsContent);
    }
  } else {
    writeFileSync(agentsMdPath, agentsContent);
  }

  console.log("✓ Created/updated AGENTS.md");
}

function generateAgentsMd(): string {
  return `## obsd Commands

Use \`obsd\` to create and manage notes in the vault using the PARA method (Projects, Areas, Resources, Archives).

### Quick Reference

\`\`\`bash
obsd new project "Title"                    # Creates 00_projects/<prefix>_<slug>/
obsd new area "Title"                       # Creates 01_areas/<prefix>_<slug>/
obsd new post "Title" --area <prefix>       # Creates <area>/post.md
obsd new resource "Title"                   # Creates 02_resources/resource.md
obsd new scratch "Title" --prefix <xx>      # Creates <prefix>_folder/notes/dated-note.md

obsd archive project <prefix>_<slug>        # Move to 03_archive/projects/
obsd archive area <prefix>_<slug>           # Move to 03_archive/areas/
obsd archive resource <slug>                # Move to 03_archive/resources/
\`\`\`

### Options

- \`--prefix <xx>\` — 2-character prefix (auto-generated for project/area, required for scratch)
- \`--area <name>\` — Area prefix for posts
`;
}

function printUsage() {
  console.log(`
Usage: obsd <command> [options]

Commands:
  init                    Initialize vault folders
  new <type> [title]      Create new entity (defaults to "Untitled")
  archive <type> <name>   Archive entity folder

Types:
  project                 Creates a project folder with index and notes
  area                    Creates an area folder with index and notes/
  post                    Creates a blog post in 01_areas/<area>
  resource                Creates a resource note in 02_resources
  scratch                 Creates a scratch note in a project or area (requires --prefix)
  daily                   Creates a daily note for today in 04_journal/daily/
  weekly                  Creates a weekly note in 04_journal/weeklies/
  quote                   Creates a quote note in 02_resources
  experiment              Creates an experiment note in 04_journal/experiments/

Examples:
  obsman new project "My New App"              # auto-generates prefix
  obsman new project "My New App" --prefix ab  # custom prefix
  obsman new area "Health"                     # auto-generates prefix
  obsman new post "How to Build CLIs" --area pb
  obsman new resource "Git Worktrees Guide"
  obsman new scratch "Initial thoughts" --prefix ab
  obsman new daily                             # creates daily note for today
  obsman new weekly                            # creates weekly note
  obsman new quote "Always bet on text"
  obsman new experiment "Testing new workflow"
  obsman archive project ab_my-new-app

Options:
  --prefix <xx>          Two-character prefix (auto-generated for project/area, required for scratch)
  --area <name>          Set area for post (use prefix, e.g. pb for personal_blog)
  --deps <deps>          Set dependencies for project (comma-separated)
`);
}

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "help" || command === "--help") {
  printUsage();
  process.exit(0);
}

if (command === "init") {
  initVault();
  process.exit(0);
}

if (command === "new") {
  const type = args[1];
  let title = args[2];

  if (!type) {
    console.error("Usage: obsman new <type> [title]");
    process.exit(1);
  }

  // Default to "Untitled" if no title provided
  if (!title || title.startsWith("--")) {
    title = "Untitled";
  }

  const options: any = {};
  const startIndex = args[2] && !args[2].startsWith("--") ? 3 : 2;

  for (let i = startIndex; i < args.length; i++) {
    if (args[i] === "--area") {
      options.area = args[++i];
    } else if (args[i] === "--deps") {
      options.dependencies = args[++i];
    } else if (args[i] === "--prefix" || args[i] === "--project") {
      const prefixValue = args[++i];
      if (prefixValue.length !== 2) {
        console.error("Error: --prefix must be exactly 2 characters");
        process.exit(1);
      }

      // For scratch notes, find the folder with this prefix
      if (type === "scratch") {
        const templatesPath = findTemplatesPath();
        const config = YAML.parse(readFileSync(templatesPath, "utf-8"));

        // Check projects first
        const projectsDir = join(config.vaultPath, config.projectsRoot);
        if (existsSync(projectsDir)) {
          const projectDirs = readdirSync(projectsDir);
          const projectDir = projectDirs.find((d) =>
            d.startsWith(prefixValue + "_"),
          );
          if (projectDir) {
            options.folder = join(config.projectsRoot, projectDir);
            continue;
          }
        }

        // Check areas
        const areasDir = join(config.vaultPath, config.areasRoot);
        if (existsSync(areasDir)) {
          const areaDirs = readdirSync(areasDir);
          const areaDir = areaDirs.find((d) => d.startsWith(prefixValue + "_"));
          if (areaDir) {
            options.folder = join(config.areasRoot, areaDir);
            continue;
          }
        }

        console.error(
          `Error: No project or area found with prefix '${prefixValue}'`,
        );
        process.exit(1);
      } else {
        // For projects and areas, just store the prefix
        options.prefix = prefixValue;
      }
    }
  }

  if (type === "scratch" && !options.folder) {
    console.error("Error: --prefix required for scratch type");
    console.error('Usage: obsman new scratch "Title" --prefix ab');
    process.exit(1);
  }

  createEntity(type, title, options);
  process.exit(0);
}

if (command === "archive") {
  const type = args[1] as "project" | "area" | "resource";
  const name = args[2];

  if (!type || !name) {
    console.error("Usage: obsman archive <type> <name>");
    process.exit(1);
  }

  archiveEntity(type, name);
  process.exit(0);
}

console.error("Unknown command:", command);
printUsage();
process.exit(1);
