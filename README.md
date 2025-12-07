# obsd — Opinionated Obsidian CLI

`obsd` is a CLI to manage my PARA knowledge base in obsidian. Instead of fighting Obsidian plugins, I made a cli that my coding agent and I can use together.

This is not a general purpose cli. This is purpose-built for my workflow, my setup and my needs. But it should be pretty easy to adapt if you choose to do it.

## Why I built this

Obsidian's a solid editor, but the plugin system is a pain, I always had to do 3 clicks to test a new update in dev.

I am working on [Amp](https://ampcode.com) - a coding agent. Naturally, I want it to do the work of managing my Obsidian. The best tools for humans and coding agents to use together are clis; this is how `obsd` came to be.

I have not written a single line of code myself, but have only used the Amp free mode.

## PARA — The System I Use

**PARA** (Projects, Areas, Resources, Archives) is just a framework for keeping your brain organized:

| Layer         | What it is                           | How long it lasts      |
| ------------- | ------------------------------------ | ---------------------- |
| **Projects**  | Stuff with a deadline                | Until it's done        |
| **Areas**     | Things I care about long-term        | Indefinite             |
| **Resources** | Info I might need later              | As long as it's useful |
| **Archives**  | Old projects and stuff I'm done with | Just for reference     |

I map this directly into my vault structure:

```
vault/
├── 00_projects/        # Time-bound outcomes
│   ├── ab_website/
│   └── cd_api-redesign/
├── 01_areas/           # Ongoing responsibility areas
│   ├── en_engineering/
│   └── pb_personal-blog/
├── 02_resources/       # Reference notes, quotes, learnings
│   ├── git-worktrees-guide.md
│   └── async-rust.md
├── 03_archive/         # Completed projects/areas
├── 04_journal/         # Daily/weekly reflections, experiments
│   ├── daily/
│   ├── weeklies/
│   └── experiments/
```

**This is just my setup.** You can customize all the folder names, prefixes, and templates in `templates.yml`. Want to call your projects folder something else? Use different numbering? Change how notes are structured? Just edit the config and you're done.

## What I'm Going For

1. **Opinionated** — I don't want to think about where to put things. Folders are set.
2. **Terminal-first** — Typing `obsd new project "x"` is faster than clicking through dialogs.
3. **Consistent templates** — Every note has the same structure and frontmatter.
4. **Prefixes for quick access** — Projects and areas get auto-generated 2-letter codes (`ab`, `en`) so I can reference them easily.

## Installation

```bash
bun run setup
```

This builds and globally links the `obsd` command.

## Usage

### First time setup

```bash
obsd init
```

This creates all the required folders in your vault based on `templates.yml`. Run this once after configuring your vault path.

### Create new entities

```bash
# Create a new project (auto-generates 2-char prefix)
obsd new project "My Website"

# Create with custom prefix
obsd new project "API Rewrite" --prefix ab

# Create a new area
obsd new area "Health"

# Create a blog post
obsd new post "How to Build CLIs" --area personal_blog

# Create a resource note
obsd new resource "Git Worktrees Guide"

# Create a scratch note in a project/area
obsd new scratch "Quick thoughts" --prefix ab

# Create a daily journal note
obsd new daily

# Create a weekly review note
obsd new weekly

# Create a quote
obsd new quote "Always bet on text"

# Create an experiment
obsd new experiment "Morning Movement Reset"

# Create a podcast episode (interview)
obsd new episode "Guest Name"

# Create a solo podcast episode
obsd new episode "My Episode Title" --solo
```

### Archive entities

```bash
obsd archive project ab_my-website
obsd archive area xy_health
obsd archive resource git-worktrees-guide
```

## Entity Types

| Type           | Location                                        | Structure                                             | Purpose                                                    |
| -------------- | ----------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| **project**    | `00_projects/<prefix>_<slug>/`                  | Folder: index.md, quicklinks.md                       | Deliverable with deadline                                  |
| **area**       | `01_areas/<prefix>_<slug>/`                     | Folder: index.md, quicklinks.md, resources.md, notes/ | Ongoing responsibility                                     |
| **post**       | `01_areas/<area>/`                              | Single file                                           | Article/blog post in an area                               |
| **resource**   | `02_resources/`                                 | Single file                                           | Reference note, guide, or learning                         |
| **scratch**    | `<project\|area>/notes/`                        | Single dated file                                     | Temporary notes within a project/area                      |
| **daily**      | `04_journal/daily/`                             | Single dated file                                     | Daily reflection and planning                              |
| **weekly**     | `04_journal/weeklies/`                          | Single dated file                                     | Weekly review and retrospective                            |
| **quote**      | `02_resources/`                                 | Single file                                           | Memorable quote with metadata                              |
| **experiment** | `04_journal/experiments/`                       | Single file                                           | Structured experiment log (hypothesis, actions, learnings) |
| **episode**    | `01_areas/<area>/guests/` or `01_areas/<area>/` | Single file                                           | Podcast episode (interview by default, solo with --solo)   |

## Configuration

Edit `templates.yml` in the obsd repo:

```yaml
vaultPath: /path/to/obsidian/vault
areasRoot: 01_areas
projectsRoot: 00_projects
resourcesRoot: 02_resources
archiveAreasRoot: 03_archive/areas
archiveProjectsRoot: 03_archive/projects
archiveResourcesRoot: 03_archive/resources

templates:
  project:
    folderPattern: "00_projects/{{prefix}}_{{slug}}"
    files:
      - name: "index.md"
        template: |
          ---
          title: {{title}}
          type: Project
          status: {{status|Planned}}
          prefix: {{prefix}}
          created_date: {{date}}
          ---

          ## Outcome
          - {{cursor}}
```

### Template Variables

- `{{title}}` — Entity title
- `{{slug}}` — URL-safe slug (lowercase, hyphens)
- `{{date}}` — Today's date (YYYY-MM-DD)
- `{{prefix}}` — 2-character prefix (projects/areas only)
- `{{area}}` — Area name/prefix (for posts)
- `{{status}}` — Default status (Planned for projects, Active for areas)
- `{{cursor}}` — Removed after rendering (for editor positioning)

## Options

```
--prefix <xx>    Two-character prefix (auto-generated for project/area, required for scratch)
--area <name>    Set area/folder for post (use prefix, e.g. pb for personal_blog)
--deps <deps>    Dependencies (comma-separated, projects only)
--solo           For episode type, creates solo episode instead of interview
```

## How It Works

1. **Templates live in `templates.yml`** in the obsd repo
2. Variables are replaced at runtime based on your config
3. Multi-file templates (project, area) create folders with structured contents
4. Single-file templates (post, resource) create individual markdown files
5. Prefixes are auto-generated to be unique and prevent conflicts
6. All paths are absolute and derived from your `vaultPath`

## Real Workflow

```bash
# Start a new project
obsd new project "Website Redesign"
# → Creates 00_projects/xy_website-redesign/ with index.md and quicklinks.md

# Jot down a quick idea for the project
obsd new scratch "Start with design system" --prefix xy
# → Creates 00_projects/xy_website-redesign/notes/2025-12-07-start-with-design-system.md

# Write a blog post documenting the journey
obsd new post "Building a Design System" --area pb
# → Creates 01_areas/pb/building-a-design-system.md

# When the project's done, move it to archive
obsd archive project xy_website-redesign
# → Moves to 03_archive/projects/xy_website-redesign/
```
