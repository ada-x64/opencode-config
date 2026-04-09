---
limit: 20
mapWithTag: false
icon: shield
tagNames:
excludes:
  - README
extends:
savedViews:
  - name: default
    children: []
    sorters:
      - id: Audit____date
        name: date
        direction: desc
        priority: 1
        customOrder: []
    filters:
      - id: Audit____file
        name: file
        query: ""
        customFilter: ""
      - id: Audit____repo
        name: repo
        query: ""
      - id: Audit____date
        name: date
        query: ""
      - id: Audit____label
        name: label
        query: ""
      - id: Audit____scope
        name: scope
        query: ""
      - id: Audit____status
        name: status
        query: ""
      - id: Audit____agent
        name: agent
        query: ""
      - id: Audit____focus
        name: focus
        query: ""
    columns:
      - id: Audit____file
        name: file
        hidden: false
        position: 0
      - id: Audit____repo
        name: repo
        hidden: false
        position: 1
      - id: Audit____label
        name: label
        hidden: false
        position: 2
      - id: Audit____status
        name: status
        hidden: false
        position: 3
      - id: Audit____date
        name: date
        hidden: false
        position: 4
      - id: Audit____scope
        name: scope
        hidden: false
        position: 5
      - id: Audit____focus
        name: focus
        hidden: false
        position: 6
      - id: Audit____agent
        name: agent
        hidden: true
        position: 7
  - name: active
    children: []
    sorters:
      - id: Audit____date
        name: date
        direction: desc
        priority: 1
        customOrder: []
    filters:
      - id: Audit____file
        name: file
        query: ""
        customFilter: ""
      - id: Audit____status
        name: status
        query: "🔨 in-progress"
    columns:
      - id: Audit____file
        name: file
        hidden: false
        position: 0
      - id: Audit____repo
        name: repo
        hidden: false
        position: 1
      - id: Audit____label
        name: label
        hidden: false
        position: 2
      - id: Audit____status
        name: status
        hidden: false
        position: 3
      - id: Audit____date
        name: date
        hidden: false
        position: 4
      - id: Audit____focus
        name: focus
        hidden: false
        position: 5
      - id: Audit____scope
        name: scope
        hidden: true
        position: 6
      - id: Audit____agent
        name: agent
        hidden: true
        position: 7
fields:
  - name: repo
    type: Input
    id: repo
    options: {}
  - name: date
    type: Date
    id: date
    options: {}
  - name: label
    type: Input
    id: label
    options: {}
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
        "0": 🔨 in-progress
        "1": ✅ complete
  - name: agent
    type: Input
    id: agent
    options: {}
  - name: focus
    type: Input
    id: focus
    options: {}
filesPaths:
  - audits
bookmarksGroups:
favoriteView:
fieldsOrder:
  - repo
  - label
  - status
  - date
  - scope
  - focus
  - agent
version: "2.5"
---
