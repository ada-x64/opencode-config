---
limit: 50
mapWithTag: false
icon: bell
tagNames:
excludes:
  - README
extends:
savedViews:
  - name: default
    children: []
    sorters:
      - id: Activity____status
        name: status
        direction: asc
        priority: 1
        customOrder: []
      - id: Activity____date
        name: date
        direction: desc
        priority: 2
        customOrder: []
    filters:
      - id: Activity____file
        name: file
        query: ""
        customFilter: ""
      - id: Activity____type
        name: type
        query: ""
      - id: Activity____agent
        name: agent
        query: ""
      - id: Activity____task
        name: task
        query: ""
      - id: Activity____repo
        name: repo
        query: ""
      - id: Activity____headline
        name: headline
        query: ""
      - id: Activity____status
        name: status
        query: ""
      - id: Activity____date
        name: date
        query: ""
      - id: Activity____severity
        name: severity
        query: ""
    columns:
      - id: Activity____file
        name: file
        hidden: false
        position: 0
      - id: Activity____status
        name: status
        hidden: false
        position: 1
      - id: Activity____type
        name: type
        hidden: false
        position: 2
      - id: Activity____headline
        name: headline
        hidden: false
        position: 3
      - id: Activity____agent
        name: agent
        hidden: false
        position: 4
      - id: Activity____task
        name: task
        hidden: false
        position: 5
      - id: Activity____repo
        name: repo
        hidden: false
        position: 6
      - id: Activity____date
        name: date
        hidden: false
        position: 7
      - id: Activity____severity
        name: severity
        hidden: true
        position: 8
  - name: pending
    children: []
    sorters:
      - id: Activity____severity
        name: severity
        direction: desc
        priority: 1
        customOrder:
          - high
          - medium
          - low
          - info
      - id: Activity____date
        name: date
        direction: desc
        priority: 2
        customOrder: []
    filters:
      - id: Activity____file
        name: file
        query: ""
        customFilter: ""
      - id: Activity____status
        name: status
        query: "⏳ pending"
    columns:
      - id: Activity____file
        name: file
        hidden: false
        position: 0
      - id: Activity____type
        name: type
        hidden: false
        position: 1
      - id: Activity____headline
        name: headline
        hidden: false
        position: 2
      - id: Activity____severity
        name: severity
        hidden: false
        position: 3
      - id: Activity____task
        name: task
        hidden: false
        position: 4
      - id: Activity____date
        name: date
        hidden: false
        position: 5
      - id: Activity____status
        name: status
        hidden: true
        position: 6
      - id: Activity____agent
        name: agent
        hidden: true
        position: 7
      - id: Activity____repo
        name: repo
        hidden: true
        position: 8
fields:
  - name: type
    type: Select
    id: type
    options:
      sourceType: ValuesList
      valuesList:
        "0": activity
        "1": run-summary
        "2": escalation
        "3": design-question
        "4": handoff
        "5": permissions-request
  - name: agent
    type: Input
    id: agent
    options: {}
  - name: task
    type: Input
    id: task
    options: {}
  - name: repo
    type: Input
    id: repo
    options: {}
  - name: headline
    type: Input
    id: headline
    options: {}
  - name: status
    type: Select
    id: status
    options:
      sourceType: ValuesList
      valuesList:
        "0": ⏳ pending
        "1": ✅ addressed
        "2": 🚫 dismissed
  - name: date
    type: Date
    id: date
    options: {}
  - name: severity
    type: Select
    id: severity
    options:
      sourceType: ValuesList
      valuesList:
        "0": info
        "1": low
        "2": medium
        "3": high
filesPaths:
  - _misc/activity
bookmarksGroups:
favoriteView:
fieldsOrder:
  - status
  - type
  - headline
  - agent
  - task
  - repo
  - date
  - severity
version: "2.5"
---
