---
limit: 20
mapWithTag: false
icon: kanban
tagNames:
excludes:
  - README
extends:
savedViews:
  - name: default
    children: []
    sorters:
      - id: Project____repo
        name: repo
        direction: asc
        priority: 1
        customOrder: []
    filters:
      - id: Project____file
        name: file
        query: ""
        customFilter: ""
      - id: Project____repo
        name: repo
        query: ""
      - id: Project____backend
        name: backend
        query: ""
      - id: Project____last_synced
        name: last_synced
        query: ""
      - id: Project____stale_after_hours
        name: stale_after_hours
        query: ""
    columns:
      - id: Project____file
        name: file
        hidden: false
        position: 0
      - id: Project____repo
        name: repo
        hidden: false
        position: 1
      - id: Project____backend
        name: backend
        hidden: false
        position: 2
      - id: Project____last_synced
        name: last_synced
        hidden: false
        position: 3
      - id: Project____stale_after_hours
        name: stale_after_hours
        hidden: false
        position: 4
  - name: all
    children: []
    sorters:
      - id: Project____repo
        name: repo
        direction: asc
        priority: 1
        customOrder: []
    filters:
      - id: Project____file
        name: file
        query: ""
        customFilter: ""
    columns:
      - id: Project____file
        name: file
        hidden: false
        position: 0
      - id: Project____repo
        name: repo
        hidden: false
        position: 1
      - id: Project____backend
        name: backend
        hidden: false
        position: 2
      - id: Project____last_synced
        name: last_synced
        hidden: false
        position: 3
      - id: Project____stale_after_hours
        name: stale_after_hours
        hidden: true
        position: 4
fields:
  - name: repo
    type: Input
    id: repo
    options: {}
  - name: backend
    type: Select
    id: backend
    options:
      sourceType: ValuesList
      valuesList:
        "0": github
        "1": local
  - name: last_synced
    type: DateTime
    id: last_synced
    options: {}
  - name: stale_after_hours
    type: Number
    id: stale_after_hours
    options: {}
filesPaths:
  - projects
bookmarksGroups:
favoriteView:
fieldsOrder:
  - repo
  - backend
  - last_synced
  - stale_after_hours
version: "2.5"
---
