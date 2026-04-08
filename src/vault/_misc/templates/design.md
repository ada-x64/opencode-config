# Design Document Format

Design documents capture high-level thinking: architecture explorations, trade-off
analyses, roadmaps, and cross-cutting concerns. This is a suggested format — adapt
the structure to fit the document, but always include the required sections.

## Header

```markdown
# <Descriptive title>

**Date:** YYYY-MM-DD
**Scope:** `<repo1>`, `<repo2>` (or "cross-cutting", "system-wide", etc.)
**Status:** draft | active | superseded
```

## Context

What prompted this design work. Reference the problem, opportunity, or question
that led here. Link to related schemas, issues, or prior design docs if they
exist.

```markdown
## Context

<Why does this document exist? What question are we answering or what
decision are we making?>
```

## Thesis

The core idea, position, or proposal. State it clearly and concisely — a reader
should understand the direction from this section alone.

```markdown
## Thesis

<The central claim, proposal, or design direction.>
```

## Research

**Required.** A narrative account of what was explored during the design process
and what was learned. Link to existing vault notes using Obsidian wiki-links
(`[[path/to/note]]`). This section tells the story of the investigation — what
you looked at, what you found, and how it informed the design.

```markdown
## Research

Explored the tag resolution system in zutils. The current implementation
walks all tags linearly — see [[notes/nanvix/zutils/internals]] for
the full architecture. The sysroot layout constrains where tag metadata
can live.

Reviewed Python's AST module for the parser redesign. The `NodeVisitor`
pattern would simplify our transform pipeline significantly.
```

## Analysis

The body of the design work. Structure this however best communicates the
thinking — subsections, comparison tables, diagrams, prose. Cite sources
inline using markdown footnote references (`[^N]`) that point to entries
in the Bibliography.

```markdown
## Analysis

The current tag resolution is O(n) over all tags[^1], which becomes a
bottleneck when the tag namespace exceeds ~500 entries. The `NodeVisitor`
pattern[^2] would let us decouple traversal from transformation.
```

## Bibliography

**Required.** A flat list of every source referenced in the document. Each
entry is a markdown footnote definition (`[^N]:`) with the source path or URL
and a brief annotation describing what was learned. Footnotes are referenced
inline throughout the document using `[^N]`.

For vault content, include both a wiki-link and the footnote so the reference
works in Obsidian navigation and in rendered markdown:

```markdown
## Bibliography

[^1]:
    `nanvix/zutils/src/tag.py:42-58` — Tag resolution logic; linear
    search through all tags.

[^2]:
    https://docs.python.org/3/library/ast.html — Python AST module;
    `NodeVisitor` pattern for tree traversal.

[^3]:
    [[notes/nanvix/zutils/internals]] — Sysroot layout and
    cross-compilation constraints.
```

## Design decisions

**Required.** An explicit record of decisions made during this design, with
rationale. Each decision should be independently understandable. Include
alternatives considered and why they were rejected.

```markdown
## Design decisions

### <Decision title>

**Decision:** <What was decided.>
**Rationale:** <Why this choice over alternatives.>
**Alternatives considered:**

- <Alternative A> — rejected because <reason>
- <Alternative B> — rejected because <reason>
```

## History

**Required.** A changelog for the document itself. Newest entries first. Record
when the document was created, when significant revisions were made, and what
changed.

```markdown
## History

| Date       | Change                                                 |
| ---------- | ------------------------------------------------------ |
| YYYY-MM-DD | Initial draft                                          |
| YYYY-MM-DD | Added comparison of approach A vs B after benchmarking |
| YYYY-MM-DD | Revised thesis based on feedback from @user            |
```

---

## Variants

The sections above work for most design documents. Adapt them for specific
document types:

### Architecture document

Add a **Current state** section before Analysis to describe the system as it
exists today. In Analysis, focus on proposed structural changes and their
implications. Consider adding diagrams (ASCII or Mermaid).

### Trade-off analysis

Structure the Analysis section around a comparison table or matrix. Clearly
state the evaluation criteria upfront. The Thesis becomes the recommended
option.

### Roadmap

Replace Analysis with a **Phases** section containing ordered milestones.
Each phase should have a scope description and dependencies on prior phases.
The Thesis becomes the overall vision or destination.

### Exploration / research notes

The Thesis may be a question rather than a claim. Analysis becomes findings.
Add an **Open questions** section at the end for unresolved items. These
documents may not have firm Design decisions — that's fine.
