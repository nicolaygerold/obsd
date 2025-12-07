# obsman

CLI tool for managing Obsidian projects, areas, and resources.

## Installation

```bash
cd obsman
bun install
bun run build

# Link globally
bun link
```

## Setup

Edit `templates.yml` in the obsman repo to configure your vault path and customize templates.

## Usage

### Create new entities

```bash
# Create a new project
obsman new project "My Website"

# Create with area and dependencies
obsman new project "API Rewrite" --area "Engineering" --deps "project-a,project-b"

# Create a new area
obsman new area "Health"

# Create a blog post
obsman new post "How to Build CLIs" --area personal_blog

# Create a resource note
obsman new resource "Git Worktrees Guide"
```

### Archive entities

```bash
obsman archive project my-website
obsman archive area health
```

## Configuration

Edit `templates.yml` in the repo:

```yaml
vaultPath: /path/to/vault
areasRoot: 01_areas
projectsRoot: 00_projects
resourcesRoot: 02_resources

templates:
  post:
    filePath: "01_areas/{{area}}/{{slug}}.md"
    template: |
      ---
      created_date: {{date}}
      tags:
        - content
      ---
      
      {{cursor}}
      
      ## Backmatter
      - see::
  
  resource:
    filePath: "02_resources/{{slug}}.md"
    template: |
      ---
      created_date: {{date}}
      tags:
        - note
      ---
```

## Raycast Integration

Create a Raycast Script Command:

```bash
#!/bin/bash
# @raycast.title New Project
# @raycast.mode fullOutput
# @raycast.argument1 { "type": "text", "placeholder": "Title" }

obsman new project "$1"
```
