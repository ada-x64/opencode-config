---
limit: 50
mapWithTag: false
icon: check-square
tagNames:
excludes:
extends:
savedViews:
  - name: default
    children: []
    sorters:
      - id: Task____task
        name: task
        direction: asc
        priority: 1
        customOrder: []
      - id: Task____status
        name: status
        direction: asc
        priority: 2
        customOrder: []
    filters:
      - id: Task____file
        name: file
        query: ""
        customFilter: ""
      - id: Task____task
        name: task
        query: ""
      - id: Task____issue
        name: issue
        query: ""
      - id: Task____branch
        name: branch
        query: ""
      - id: Task____date
        name: date
        query: ""
      - id: Task____status
        name: status
        query: ""
      - id: Task____repo
        name: repo
        query: ""
      - id: Task____priority
        name: priority
        query: ""
      - id: Task____tags
        name: tags
        query: ""
      - id: Task____estimate
        name: estimate
        query: ""
    columns:
      - id: Task____file
        name: file
        hidden: false
        position: 0
      - id: Task____task
        name: task
        hidden: false
        position: 1
      - id: Task____issue
        name: issue
        hidden: false
        position: 7
      - id: Task____branch
        name: branch
        hidden: false
        position: 8
      - id: Task____date
        name: date
        hidden: false
        position: 9
      - id: Task____status
        name: status
        hidden: false
        position: 3
      - id: Task____repo
        name: repo
        hidden: false
        position: 2
      - id: Task____priority
        name: priority
        hidden: false
        position: 4
      - id: Task____estimate
        name: estimate
        hidden: false
        position: 5
      - id: Task____tags
        name: tags
        hidden: false
        position: 6
  - name: active
    children: []
    sorters:
      - id: Task____status
        name: status
        direction: asc
        priority: 2
        customOrder:
          - 🔨 in-progress
          - 📋 todo
      - id: Task____priority
        name: priority
        direction: asc
        priority: 1
        customOrder:
          - 🔥 critical
          - 🔴 high
          - 🟡 medium
          - 🟢 low
    filters:
      - id: Task____file
        name: file
        query: schema
        customFilter: ""
      - id: Task____task
        name: task
        query: ""
        customFilter: ""
      - id: Task____issue
        name: issue
        query: ""
        customFilter: ""
      - id: Task____branch
        name: branch
        query: ""
        customFilter: ""
      - id: Task____date
        name: date
        query: ""
        customFilter: ""
      - id: Task____status
        name: status
        query: 🔨 in-progress, 📋 todo
        customFilter: ""
      - id: Task____priority
        name: priority
        query: ""
        customFilter: ""
      - id: Task____repo
        name: repo
        query: ""
        customFilter: ""
      - id: Task____tags
        name: tags
        query: ""
        customFilter: ""
      - id: Task____estimate
        name: estimate
        query: ""
        customFilter: ""
    columns:
      - id: Task____file
        name: file
        hidden: false
        position: 0
      - id: Task____task
        name: task
        hidden: false
        position: 3
      - id: Task____issue
        name: issue
        hidden: false
        position: 7
      - id: Task____branch
        name: branch
        hidden: true
        position: 9
      - id: Task____date
        name: date
        hidden: true
        position: 8
      - id: Task____status
        name: status
        hidden: false
        position: 2
      - id: Task____priority
        name: priority
        hidden: false
        position: 1
      - id: Task____repo
        name: repo
        hidden: false
        position: 4
      - id: Task____estimate
        name: estimate
        hidden: false
        position: 5
      - id: Task____tags
        name: tags
        hidden: false
        position: 6
fields:
  - name: task
    type: Input
    id: task
    options: {}
  - name: repo
    type: Multi
    id: repo
    options: {}
  - name: status
    type: Select
    id: status
    options:
      sourceType: ValuesList
      valuesList:
        "0": 📋 todo
        "1": 🔨 in-progress
        "2": 🔍 in-review
        "3": ✅ complete
        "4": 🚫 closed
  - name: priority
    type: Select
    id: priority
    options:
      sourceType: ValuesList
      valuesList:
        "0": 🔥 critical
        "1": 🔴 high
        "2": 🟡 medium
        "3": 🟢 low
        "4": 🟣 non-work
  - name: estimate
    type: Select
    id: estimate
    options:
      sourceType: ValuesList
      valuesList:
        "0": XS
        "1": S
        "2": M
        "3": L
        "4": XL
  - name: date
    type: Date
    id: date
    options: {}
  - name: branch
    type: Input
    id: branch
    options: {}
  - name: issue
    type: Input
    id: issue
    options: {}
  - name: tags
    type: Multi
    id: tags
    options: {}
filesPaths:
  - tasks
bookmarksGroups:
favoriteView:
fieldsOrder:
  - task
  - issue
  - branch
  - date
  - status
  - priority
  - estimate
  - repo
  - tags
version: "2.9"
---
