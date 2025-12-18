#!/usr/bin/env node

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  readdirSync,
  unlinkSync,
} from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import YAML from "yaml";
import { Command } from "commander";

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
  inboxRoot: string;
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

function validatePrefixUnique(prefix: string, config: any): boolean {
  // Check if prefix exists in projects
  const projectsDir = join(config.vaultPath, config.projectsRoot);
  if (existsSync(projectsDir)) {
    const projectDirs = readdirSync(projectsDir);
    if (projectDirs.some((dir) => dir.startsWith(prefix + "_"))) {
      return false;
    }
  }

  // Check if prefix exists in areas
  const areasDir = join(config.vaultPath, config.areasRoot);
  if (existsSync(areasDir)) {
    const areaDirs = readdirSync(areasDir);
    if (areaDirs.some((dir) => dir.startsWith(prefix + "_"))) {
      return false;
    }
  }

  return true;
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

  // For episode type with --solo flag, use solo_episode template
  let actualType = type === "episode" && options.solo ? "solo_episode" : type;

  // For scratch type with --at-root flag, use scratch_root template
  if (type === "scratch" && options.atRoot) {
    actualType = "scratch_root";
  }

  // For resource type with --prefix flag, use resource_folder template
  if (type === "resource" && options.prefix) {
    actualType = "resource_folder";
  }

  const template = config.templates[actualType];
  if (!template) {
    console.error(`Template '${actualType}' not found in templates.yml`);
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

  // Validate prefix uniqueness for custom prefixes
  if ((type === "project" || type === "area") && prefix && options.prefix) {
    if (!validatePrefixUnique(prefix, config)) {
      console.error(`Error: Prefix '${prefix}' already exists in projects or areas`);
      process.exit(1);
    }
  }

  // Generate unique prefix for work items (per project/area)
  let workItemPrefix = "";
  if (type === "work") {
    const existingWorkPrefixes = new Set<string>();
    const folderPath = join(config.vaultPath, options.folder);
    const workPath = join(folderPath, "work");
    
    if (existsSync(workPath)) {
      const statusFolders = ["backlog", "active", "review", "done"];
      for (const statusFolder of statusFolders) {
        const statusPath = join(workPath, statusFolder);
        if (existsSync(statusPath)) {
          const files = readdirSync(statusPath);
          for (const file of files) {
            const match = file.match(/^([a-z]{2})_/);
            if (match) {
              existingWorkPrefixes.add(match[1]);
            }
          }
        }
      }
    }

    // Generate random prefix until we find a unique one
    const chars = "abcdefghijklmnopqrstuvwxyz";
    do {
      workItemPrefix =
        chars[Math.floor(Math.random() * chars.length)] +
        chars[Math.floor(Math.random() * chars.length)];
    } while (existingWorkPrefixes.has(workItemPrefix));
  }

  // Generate unique 3-letter prefix for posts (per area)
  let postPrefix = "";
  let resolvedArea = options.area || "pb_personal_blog";
  if (type === "post") {
    // Resolve area prefix to full folder name
    const areaPrefix = options.area || "pb";
    const areasDir = join(config.vaultPath, config.areasRoot);
    if (existsSync(areasDir)) {
      const areaDirs = readdirSync(areasDir);
      const areaDir = areaDirs.find((d) => d.startsWith(areaPrefix + "_"));
      if (areaDir) {
        resolvedArea = areaDir;
      } else {
        console.error(`Error: No area found with prefix '${areaPrefix}'`);
        process.exit(1);
      }
    }

    const existingPostPrefixes = new Set<string>();
    const areaPath = join(config.vaultPath, config.areasRoot, resolvedArea);
    
    if (existsSync(areaPath)) {
      const statusFolders = ["backlog", "active", "review", "done"];
      for (const statusFolder of statusFolders) {
        const statusPath = join(areaPath, statusFolder);
        if (existsSync(statusPath)) {
          const files = readdirSync(statusPath);
          for (const file of files) {
            const match = file.match(/^([a-z]{3})_/);
            if (match) {
              existingPostPrefixes.add(match[1]);
            }
          }
        }
      }
    }

    // Generate random 3-letter prefix until we find a unique one
    const chars = "abcdefghijklmnopqrstuvwxyz";
    do {
      postPrefix =
        chars[Math.floor(Math.random() * chars.length)] +
        chars[Math.floor(Math.random() * chars.length)] +
        chars[Math.floor(Math.random() * chars.length)];
    } while (existingPostPrefixes.has(postPrefix));
  }



  const vars: Record<string, string> = {
    title,
    slug,
    date,
    status: type === "project" ? "Planned" : "Active",
    area: type === "post" ? resolvedArea : (options.area || "pb_personal_blog"),
    dependencies: options.dependencies || "none",
    type: options.type || "task",
    content: options.content || "",
    prefix: type === "work" ? workItemPrefix : type === "post" ? postPrefix : (prefix || ""),
    folder: options.folder || "",
  };

  // Handle single-file templates (post, resource)
  if (template.filePath) {
    const filePath = join(
      config.vaultPath,
      renderTemplate(template.filePath, vars),
    );

    if (existsSync(filePath)) {
      console.error(`✗ File already exists: ${filePath}`);
      process.exit(1);
    }

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

  if (existsSync(folderPath)) {
    console.error(`✗ Folder already exists: ${folderPath}`);
    process.exit(1);
  }

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

function markPost(areaPrefix: string, postPrefix: string, status: string) {
  const templatesPath = findTemplatesPath();
  const config = YAML.parse(readFileSync(templatesPath, "utf-8"));

  const validStatuses = ["backlog", "active", "review", "done"];
  if (!validStatuses.includes(status.toLowerCase())) {
    console.error(
      `Invalid status: ${status}. Valid statuses: ${validStatuses.join(", ")}`,
    );
    process.exit(1);
  }

  const statusLower = status.toLowerCase();
  let sourcePath: string | null = null;
  let sourceFolder: string | null = null;
  let fileName: string | null = null;

  // Search in areas for the post
  const areasDir = join(config.vaultPath, config.areasRoot);
  if (existsSync(areasDir)) {
    const areaDirs = readdirSync(areasDir);
    const areaDir = areaDirs.find((d) => d.startsWith(areaPrefix + "_"));
    if (areaDir) {
      const areaPath = join(config.vaultPath, config.areasRoot, areaDir);
      for (const stat of ["backlog", "active", "review", "done"]) {
        const statusPath = join(areaPath, stat);
        if (existsSync(statusPath)) {
          const files = readdirSync(statusPath);
          const found = files.find((f) => f.startsWith(postPrefix + "_"));
          if (found) {
            sourceFolder = join(config.areasRoot, areaDir);
            fileName = found;
            sourcePath = join(statusPath, found);
            break;
          }
        }
      }
    }
  }

  if (!sourcePath) {
    console.error(
      `Post not found: ${areaPrefix}_*/${postPrefix}_* in any area`,
    );
    process.exit(1);
  }

  // Construct target path - remove prefix from filename when done
  let targetFileName = fileName!;
  if (statusLower === "done") {
    targetFileName = targetFileName.replace(`${postPrefix}_`, "");
  }

  const targetPath = join(
    config.vaultPath,
    sourceFolder!,
    statusLower,
    targetFileName,
  );

  // Ensure target directory exists
  ensureDir(dirname(targetPath));

  // Read the file to update frontmatter
  let content = readFileSync(sourcePath, "utf-8");

  // Update status tag in frontmatter
  if (statusLower === "done") {
    content = content.replace(/\n\s*- status\/[^\n]+/, "");
  } else {
    content = content.replace(
      /- status\/[^\n]+/,
      `- status/${statusLower}`,
    );
  }

  // Move file and write updated content
  try {
    writeFileSync(targetPath, content);
    unlinkSync(sourcePath);
  } catch (e) {
    console.error(`Error moving file: ${e}`);
    process.exit(1);
  }

  console.log(`✓ Marked post as ${statusLower}`);
  console.log(`  ${targetPath}`);
}

function markWork(folderPrefix: string, itemPrefix: string, status: string) {
  const templatesPath = findTemplatesPath();
  const config = YAML.parse(readFileSync(templatesPath, "utf-8"));

  const validStatuses = ["backlog", "active", "review", "done"];
  if (!validStatuses.includes(status.toLowerCase())) {
    console.error(
      `Invalid status: ${status}. Valid statuses: ${validStatuses.join(", ")}`,
    );
    process.exit(1);
  }

  const statusLower = status.toLowerCase();
  let sourcePath: string | null = null;
  let sourceFolder: string | null = null;
  let fileName: string | null = null;

  // Search in projects first
  const projectsDir = join(config.vaultPath, config.projectsRoot);
  if (existsSync(projectsDir)) {
    const projectDirs = readdirSync(projectsDir);
    const projectDir = projectDirs.find((d) => d.startsWith(folderPrefix + "_"));
    if (projectDir) {
      const workPath = join(config.vaultPath, config.projectsRoot, projectDir, "work");
      if (existsSync(workPath)) {
        for (const stat of ["backlog", "active", "review", "done"]) {
          const statusPath = join(workPath, stat);
          if (existsSync(statusPath)) {
            const files = readdirSync(statusPath);
            const found = files.find((f) => f.startsWith(itemPrefix + "_"));
            if (found) {
              sourceFolder = join(config.projectsRoot, projectDir);
              fileName = found;
              sourcePath = join(statusPath, found);
              break;
            }
          }
        }
      }
    }
  }

  // Search in areas if not found in projects
  if (!sourcePath) {
    const areasDir = join(config.vaultPath, config.areasRoot);
    if (existsSync(areasDir)) {
      const areaDirs = readdirSync(areasDir);
      const areaDir = areaDirs.find((d) => d.startsWith(folderPrefix + "_"));
      if (areaDir) {
        const workPath = join(config.vaultPath, config.areasRoot, areaDir, "work");
        if (existsSync(workPath)) {
          for (const stat of ["backlog", "active", "review", "done"]) {
            const statusPath = join(workPath, stat);
            if (existsSync(statusPath)) {
              const files = readdirSync(statusPath);
              const found = files.find((f) => f.startsWith(itemPrefix + "_"));
              if (found) {
                sourceFolder = join(config.areasRoot, areaDir);
                fileName = found;
                sourcePath = join(statusPath, found);
                break;
              }
            }
          }
        }
      }
    }
  }

  if (!sourcePath) {
    console.error(
      `Work item not found: ${folderPrefix}_*/${itemPrefix}_* in any project or area work folder`,
    );
    process.exit(1);
  }

  // Construct target path - remove prefix from filename when done
  let targetFileName = fileName!;
  if (statusLower === "done") {
    targetFileName = targetFileName.replace(`${itemPrefix}_`, "");
  }
  
  const targetPath = join(
    config.vaultPath,
    sourceFolder!,
    "work",
    statusLower,
    targetFileName,
  );

  // Ensure target directory exists
  ensureDir(dirname(targetPath));

  // Read the file to update frontmatter
  let content = readFileSync(sourcePath, "utf-8");

  // Update status in frontmatter
  const statusMap: Record<string, string> = {
    backlog: "Backlog",
    active: "Active",
    review: "Review",
    done: "Done",
  };

  const newStatus = statusMap[statusLower];
  content = content.replace(/^status: .+$/m, `status: ${newStatus}`);
  
  if (statusLower === "done") {
    // Remove the status tag entirely when done
    content = content.replace(/\n\s*- status\/[^\n]+/, "");
  } else {
    content = content.replace(
      /tags:\n([\s\S]*?)- status\/[^\n]+/,
      `tags:\n$1- status/${statusLower}`,
    );
  }

  // Move file and write updated content
  try {
    writeFileSync(targetPath, content);
    unlinkSync(sourcePath);
  } catch (e) {
    console.error(`Error moving file: ${e}`);
    process.exit(1);
  }

  console.log(`✓ Marked work item as ${statusLower}`);
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
    config.inboxRoot,
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
obsd new project "Title"                           # Creates 00_projects/<prefix>_<slug>/ with work folders
obsd new area "Title"                              # Creates 01_areas/<prefix>_<slug>/ with work folders
obsd new post "Title" --area <prefix>              # Creates <area>/post.md
obsd new resource "Title"                          # Creates 02_resources/resource.md
obsd new resource "Title" --prefix <xx>            # Creates resource inside 02_resources/<prefix>_<slug>/
obsd new recipe "Title"                            # Creates 02_resources/re_<slug>.md (prefix: re)
obsd new recipe "Title" --prefix <xx>              # Creates 02_resources/<prefix>_<slug>.md
obsd new inbox "Title"                             # Creates 05_inbox/dated-note.md
obsd new inbox "Title" "Content"                   # Creates with content (second arg)
obsd new scratch "Title" --prefix <xx>             # Creates <prefix>_folder/notes/dated-note.md
obsd new scratch "Title" --prefix <xx> --at-root   # Creates at folder root
obsd new work "Title" --prefix <xx> --item <id>    # Creates <prefix>_folder/work/backlog/<prefix>_<item>.md
obsd new episode "Guest Name"                      # Creates interview episode in ha_howaiisbuilt/guests/
obsd new episode "Topic" --solo                    # Creates solo episode in ha_howaiisbuilt/

obsd mark work --prefix <xx> --item <id> --status <status>  # Move work item between statuses

obsd archive project <prefix>_<slug>               # Move to 03_archive/projects/
obsd archive area <prefix>_<slug>                  # Move to 03_archive/areas/
obsd archive resource <prefix>_<slug>              # Move to 03_archive/resources/
\`\`\`

### Work Item Workflow

Work items live in project/area folders and flow through: \`backlog\` → \`active\` → \`review\` → \`done\`

Each work item gets a unique 2-letter prefix within its project/area.

\`\`\`bash
obsd new work "Build dashboard" --prefix am              # Creates xy_build-dashboard.md in am_amp/work/backlog/
obsd mark work --prefix am --item xy --status active     # Move am_*/xy_* to active
obsd mark work --prefix am --item xy --status review     # Move am_*/xy_* to review
obsd mark work --prefix am --item xy --status done       # Mark am_*/xy_* as complete
\`\`\`

### Options

- \`--prefix <xx>\` — 2-character prefix (auto-generated for project/area, required for scratch/resource/work)
- \`--item <id>\` — Item identifier (required for work items)
- \`--status <status>\` — Status for mark command (backlog, active, review, done)
- \`--area <name>\` — Area prefix for posts
- \`--solo\` — For episode type, creates a solo episode instead of interview
- \`--at-root\` — For scratch type, creates file at folder root (not in notes/)
`;
}

const program = new Command();

program
  .name("obsd")
  .description("Manage notes in your Obsidian vault using PARA method")
  .version("1.0.0");

// Init command
program
  .command("init")
  .description("Initialize vault folders")
  .action(() => {
    initVault();
  });

// New command with subcommand approach
program
  .command("new <type> [title]")
  .description("Create new entity (defaults to 'Untitled')")
  .option("--prefix <xx>", "Two-character prefix for project/area/scratch/resource/work")
  .option("--item <name>", "Item identifier for work items")
  .option("--area <name>", "Area prefix for posts (e.g., pb)")
  .option("--deps <deps>", "Dependencies for project (comma-separated)")
  .option("--type <type>", "Type for inbox (task, link, idea, etc.)")
  .option("--content <text>", "Content for inbox item")
  .option("--solo", "For episode type, creates solo episode instead of interview")
  .option("--at-root", "For scratch type, creates file at folder root (not in notes/)")
  .action(async (type: string, title: string | undefined, opts: any) => {
    let actualTitle = title || "Untitled";

    // For work, require prefix
    if (type === "work") {
      if (!opts.prefix) {
        console.error("Error: --prefix required for work type");
        console.error(`Usage: obsd new work "Title" --prefix ab`);
        process.exit(1);
      }

      if (opts.prefix.length !== 2) {
        console.error("Error: --prefix must be exactly 2 characters");
        process.exit(1);
      }

      // Find the folder with this prefix
      const prefix = opts.prefix;
      const templatesPath = findTemplatesPath();
      const config = YAML.parse(readFileSync(templatesPath, "utf-8"));

      // Check projects first
      const projectsDir = join(config.vaultPath, config.projectsRoot);
      if (existsSync(projectsDir)) {
        const projectDirs = readdirSync(projectsDir);
        const projectDir = projectDirs.find((d) =>
          d.startsWith(prefix + "_"),
        );
        if (projectDir) {
          opts.folder = join(config.projectsRoot, projectDir);
          createEntity(type, actualTitle, opts);
          return;
        }
      }

      // Check areas
      const areasDir = join(config.vaultPath, config.areasRoot);
      if (existsSync(areasDir)) {
        const areaDirs = readdirSync(areasDir);
        const areaDir = areaDirs.find((d) => d.startsWith(prefix + "_"));
        if (areaDir) {
          opts.folder = join(config.areasRoot, areaDir);
          createEntity(type, actualTitle, opts);
          return;
        }
      }

      console.error(
        `Error: No project or area found with prefix '${prefix}'`,
      );
      process.exit(1);
    }

    // For scratch, validate prefix
    if (type === "scratch") {
      const prefix = opts.prefix;
      if (!prefix && !opts.atRoot) {
        console.error(`Error: --prefix required for ${type} type`);
        console.error(`Usage: obsd new ${type} "Title" --prefix ab`);
        process.exit(1);
      }

      if (prefix && prefix.length !== 2) {
        console.error("Error: --prefix must be exactly 2 characters");
        process.exit(1);
      }

      // Find the folder with this prefix
      if (prefix) {
        const templatesPath = findTemplatesPath();
        const config = YAML.parse(readFileSync(templatesPath, "utf-8"));

        // Check projects first
        const projectsDir = join(config.vaultPath, config.projectsRoot);
        if (existsSync(projectsDir)) {
          const projectDirs = readdirSync(projectsDir);
          const projectDir = projectDirs.find((d) =>
            d.startsWith(prefix + "_"),
          );
          if (projectDir) {
            opts.folder = join(config.projectsRoot, projectDir);
            createEntity(type, actualTitle, opts);
            return;
          }
        }

        // Check areas
        const areasDir = join(config.vaultPath, config.areasRoot);
        if (existsSync(areasDir)) {
          const areaDirs = readdirSync(areasDir);
          const areaDir = areaDirs.find((d) => d.startsWith(prefix + "_"));
          if (areaDir) {
            opts.folder = join(config.areasRoot, areaDir);
            createEntity(type, actualTitle, opts);
            return;
          }
        }

        console.error(
          `Error: No project or area found with prefix '${prefix}'`,
        );
        process.exit(1);
      }
    }

    // For resource, resolve prefix to resource folder
    if (type === "resource" && opts.prefix) {
      const prefix = opts.prefix;
      if (prefix.length !== 2) {
        console.error("Error: --prefix must be exactly 2 characters");
        process.exit(1);
      }

      const templatesPath = findTemplatesPath();
      const config = YAML.parse(readFileSync(templatesPath, "utf-8"));

      // Check if resource folder with this prefix exists
      const resourcesDir = join(config.vaultPath, config.resourcesRoot);
      let resourceDir: string | undefined;
      
      if (existsSync(resourcesDir)) {
        const resourceDirs = readdirSync(resourcesDir);
        resourceDir = resourceDirs.find((d) =>
          d.startsWith(prefix + "_"),
        );
      }

      if (resourceDir) {
        // Found existing resource folder - create single file resource directly in folder
        const actualSlug = slugify(actualTitle);
        const filePath = join(
          config.vaultPath,
          config.resourcesRoot,
          resourceDir,
          `${actualSlug}.md`,
        );

        if (existsSync(filePath)) {
          console.error(`✗ File already exists: ${filePath}`);
          process.exit(1);
        }

        const fileDir = dirname(filePath);
        if (!existsSync(fileDir)) {
          mkdirSync(fileDir, { recursive: true });
        }

        const template = YAML.parse(readFileSync(templatesPath, "utf-8"))
          .templates.resource.template;
        const vars: Record<string, string> = {
          title: actualTitle,
          slug: actualSlug,
          date: new Date().toISOString().split("T")[0],
          status: "Active",
          area: opts.area || "pb_personal_blog",
          dependencies: opts.dependencies || "none",
          type: opts.type || "task",
          content: opts.content || "",
          prefix: prefix,
          folder: opts.folder || "",
        };

        let content = template;
        const VAR_PATTERN = /\{\{([^}]+)\}\}/g;
        content = content.replace(VAR_PATTERN, (_, rawKey) => {
          const [key, def] = rawKey.split("|").map((s: string) => s.trim());
          const val = vars[key];
          return val ?? def ?? "";
        });
        content = content.replace("{{cursor}}", "");

        writeFileSync(filePath, content);
        console.log(`✓ Created resource: ${actualTitle}`);
        console.log(`  ${filePath}`);
        return;
      }

      // If no existing resource folder found, create a new resource_folder
      opts.prefix = prefix; // ensure prefix is set
      createEntity("resource_folder", actualTitle, opts);
      return;
    }

    // For recipe, set default prefix if not provided
    if (type === "recipe") {
      if (!opts.prefix) {
        opts.prefix = "re";
      }
      if (opts.prefix.length !== 2) {
        console.error("Error: --prefix must be exactly 2 characters");
        process.exit(1);
      }
    }

    createEntity(type, actualTitle, opts);
  });

// Archive command
program
  .command("archive <type> <name>")
  .description("Archive entity folder")
  .action((type: string, name: string) => {
    const validTypes = ["project", "area", "resource"];
    if (!validTypes.includes(type)) {
      console.error(`Invalid type: ${type}`);
      console.error(`Valid types: ${validTypes.join(", ")}`);
      process.exit(1);
    }
    // Note: resource type works for both single files and resource folders
    archiveEntity(type as "project" | "area" | "resource", name);
  });

// Mark command for work items and posts
program
  .command("mark <type>")
  .requiredOption("--prefix <xx>", "Two-character project/area prefix")
  .requiredOption("--item <xxx>", "Work item prefix (2 chars) or post prefix (3 chars)")
  .requiredOption("--status <status>", "Status (backlog, active, review, done)")
  .description("Move work item or post between status folders")
  .action((type: string, opts: any) => {
    if (type !== "work" && type !== "post") {
      console.error(`mark command only supports 'work' and 'post' types`);
      process.exit(1);
    }

    if (opts.prefix.length !== 2) {
      console.error("Error: --prefix must be exactly 2 characters");
      process.exit(1);
    }

    if (type === "work") {
      if (opts.item.length !== 2) {
        console.error("Error: --item must be exactly 2 characters for work items");
        process.exit(1);
      }
      markWork(opts.prefix, opts.item, opts.status);
    } else if (type === "post") {
      if (opts.item.length !== 3) {
        console.error("Error: --item must be exactly 3 characters for posts");
        process.exit(1);
      }
      markPost(opts.prefix, opts.item, opts.status);
    }
  });

program.parse();
