---
limit: 20
mapWithTag: false
icon: compass
tagNames:
excludes:
  - README
extends:
savedViews:
  - name: default
    children: []
    sorters:
      - id: Design____status
        name: status
        direction: asc
        priority: 1
        customOrder: []
      - id: Design____date
        name: date
        direction: desc
        priority: 2
        customOrder: []
    filters:
      - id: Design____file
        name: file
        query: ""
        customFilter: ""
      - id: Design____scope
        name: scope
        query: ""
      - id: Design____status
        name: status
        query: ""
      - id: Design____date
        name: date
        query: ""
      - id: Design____tags
        name: tags
        query: ""
    columns:
      - id: Design____file
        name: file
        hidden: false
        position: 0
      - id: Design____scope
        name: scope
        hidden: false
        position: 1
      - id: Design____status
        name: status
        hidden: false
        position: 2
      - id: Design____date
        name: date
        hidden: false
        position: 3
      - id: Design____tags
        name: tags
        hidden: false
        position: 4
  - name: active
    children: []
    sorters:
      - id: Design____date
        name: date
        direction: desc
        priority: 1
        customOrder: []
    filters:
      - id: Design____file
        name: file
        query: ""
        customFilter: ""
      - id: Design____status
        name: status
        query: "📝 draft, 🟢 active"
    columns:
      - id: Design____file
        name: file
        hidden: false
        position: 0
      - id: Design____scope
        name: scope
        hidden: false
        position: 1
      - id: Design____status
        name: status
        hidden: false
        position: 2
      - id: Design____date
        name: date
        hidden: false
        position: 3
      - id: Design____tags
        name: tags
        hidden: false
        position: 4
fields:
  - name: scope
    type: Input
    id: scope
    options: {}
  - name: status
    type: Select
    id: status
    options:
      sourceType: ValuesList
      valuesList:
        "0": 📝 draft
        "1": 🟢 active
        "2": ✅ complete
        "3": 📦 archived
  - name: date
    type: Date
    id: date
    options: {}
  - name: tags
    type: Multi
    id: tags
    options: {}
filesPaths:
  - designs
bookmarksGroups:
favoriteView:
fieldsOrder:
  - scope
  - status
  - date
  - tags
version: "2.5"
---
