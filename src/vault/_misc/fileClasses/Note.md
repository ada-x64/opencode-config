---
limit: 20
mapWithTag: false
icon: book-open
tagNames:
excludes:
  - README
extends:
savedViews:
  - name: default
    children: []
    sorters:
      - id: Note____date
        name: date
        direction: desc
        priority: 1
        customOrder: []
    filters:
      - id: Note____file
        name: file
        query: ""
        customFilter: ""
      - id: Note____repo
        name: repo
        query: ""
      - id: Note____date
        name: date
        query: ""
    columns:
      - id: Note____file
        name: file
        hidden: false
        position: 0
      - id: Note____repo
        name: repo
        hidden: false
        position: 1
      - id: Note____date
        name: date
        hidden: false
        position: 2
  - name: recent
    children: []
    sorters:
      - id: Note____date
        name: date
        direction: desc
        priority: 1
        customOrder: []
    filters:
      - id: Note____file
        name: file
        query: ""
        customFilter: ""
    columns:
      - id: Note____file
        name: file
        hidden: false
        position: 0
      - id: Note____repo
        name: repo
        hidden: false
        position: 1
      - id: Note____date
        name: date
        hidden: false
        position: 2
fields:
  - name: repo
    type: Input
    id: repo
    options: {}
  - name: date
    type: Date
    id: date
    options: {}
filesPaths:
  - notes
bookmarksGroups:
favoriteView:
fieldsOrder:
  - repo
  - date
version: "2.5"
---
