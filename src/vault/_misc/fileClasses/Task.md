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
        position: 5
      - id: Task____branch
        name: branch
        hidden: false
        position: 6
      - id: Task____date
        name: date
        hidden: false
        position: 7
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
        position: 5
      - id: Task____branch
        name: branch
        hidden: true
        position: 7
      - id: Task____date
        name: date
        hidden: true
        position: 6
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
fields:
  - name: task
    type: Input
    id: task
    options: {}
  - name: repo
    type: Input
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
        "2": 🔍 local-review
        "3": 📤 peer-review
        "4": ✅ complete
        "5": 🚫 closed
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
  - repo
version: "2.8"
---
