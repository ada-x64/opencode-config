---
limit: 20
mapWithTag: false
icon: pencil
tagNames:
excludes:
extends:
savedViews:
  - name: default
    children: []
    sorters:
      - id: Draft____status
        name: status
        direction: asc
        priority: 1
        customOrder: []
      - id: Draft____date
        name: date
        direction: desc
        priority: 2
        customOrder: []
    filters:
      - id: Draft____file
        name: file
        query: ""
        customFilter: ""
      - id: Draft____scope
        name: scope
        query: ""
      - id: Draft____status
        name: status
        query: ""
      - id: Draft____date
        name: date
        query: ""
    columns:
      - id: Draft____file
        name: file
        hidden: false
        position: 0
      - id: Draft____scope
        name: scope
        hidden: false
        position: 1
      - id: Draft____status
        name: status
        hidden: false
        position: 2
      - id: Draft____date
        name: date
        hidden: false
        position: 3
  - name: active
    children: []
    sorters:
      - id: Draft____date
        name: date
        direction: desc
        priority: 1
        customOrder: []
    filters:
      - id: Draft____file
        name: file
        query: ""
        customFilter: ""
      - id: Draft____scope
        name: scope
        query: ""
        customFilter: ""
      - id: Draft____status
        name: status
        query: 📝 draft
        customFilter: ""
      - id: Draft____date
        name: date
        query: ""
        customFilter: ""
    columns:
      - id: Draft____file
        name: file
        hidden: false
        position: 1
      - id: Draft____scope
        name: scope
        hidden: false
        position: 2
      - id: Draft____status
        name: status
        hidden: false
        position: 0
      - id: Draft____date
        name: date
        hidden: false
        position: 3
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
        "1": 📤 promoted
  - name: date
    type: Date
    id: date
    options: {}
filesPaths:
  - drafts
bookmarksGroups:
favoriteView:
fieldsOrder:
  - scope
  - status
  - date
version: "2.6"
---
