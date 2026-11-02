export const templates: Record<string, { title: string; body: string }> = {
  blank: { title: "Blank page", body: "" },
  sop: {
    title: "SOP / Runbook",
    body: "## Purpose\n\nDescribe the outcome and when to use this procedure.\n\n## Scope & prerequisites\n\n- Required equipment\n- Responsible owner\n\n> [!WARNING]\n> Confirm equipment is safe and within its calibration interval before proceeding.\n\n## Procedure\n\n1. Prepare the work area.\n2. Verify the reference standard.\n3. Perform and document the measurement.\n\n## Acceptance criteria\n\n| Check | Requirement | Result |\n| --- | --- | --- |\n| Reference validity | In date | Pending |\n\n## Records & review\n\n- [ ] Save the measurement record\n- [ ] Request an independent review",
  },
  troubleshooting: {
    title: "Troubleshooting & root cause",
    body: "## Symptoms\n\nDescribe the observed behavior and impact.\n\n## Initial checks\n\n- [ ] Record equipment identity and configuration\n- [ ] Confirm the reference and environment\n\n## Diagnosis\n\n| Observation | Possible cause | Next check |\n| --- | --- | --- |\n| Unexpected result | To investigate | Repeat independently |\n\n## Root cause\n\nDocument the evidence supporting the cause.\n\n> [!TIP]\n> Change one variable at a time and record each result.\n\n## Resolution & prevention\n\n1. Apply the verified correction.\n2. Confirm the original symptom is resolved.",
  },
  project: {
    title: "Project / architecture overview",
    body: "## Overview\n\nExplain the problem, goals, and intended users.\n\n## Scope\n\n### In scope\n\n- Deliverable\n\n### Out of scope\n\n- Deferred work\n\n## Architecture\n\nDescribe the components and their interfaces.\n\n> [!DECISION]\n> Record an architecture decision and its rationale.\n\n## Milestones\n\n| Milestone | Owner | Target |\n| --- | --- | --- |\n| Design review | Unassigned | TBD |\n\n## Risks & open questions\n\n- [ ] Resolve the outstanding dependency",
  },
  meeting: {
    title: "Meeting notes & action items",
    body: "## Meeting details\n\n**Date:**\n\n**Participants:**\n\n## Agenda\n\n1. Progress since last meeting\n2. Decisions and blockers\n3. Next steps\n\n## Discussion\n\nCapture the key context.\n\n> [!DECISION]\n> Summarize the agreed decision.\n\n## Action items\n\n- [ ] Action — owner — due date\n\n## Next meeting\n\nDate and proposed topics.",
  },
};

const additions: [string, string, string, string][] = [
  [
    "calibration",
    "Calibration procedure",
    "Lab & quality",
    `## Purpose & measurand
Define the quantity, instrument family, range, and intended use.

## References & traceability
| Reference standard | Identifier | Calibration due | Traceability record |
| --- | --- | --- | --- |
| Add standard | | | |

## Environment & preparation
- [ ] Confirm temperature and humidity requirements
- [ ] Record equipment configuration and warm-up time
- [ ] Inspect connections and complete safety checks

> [!WARNING]
> Use approved limits and safety instructions for the specific equipment. This template is a starting point, not an approved procedure.

## Measurement sequence
1. Record the as-found condition.
2. Collect readings at each required test point.
3. Document adjustments and repeat as-left measurements if applicable.

| Test point | Reference value | Indication | Error | Uncertainty | Result |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## Decision rule & acceptance
State the approved tolerance, decision rule, and treatment of uncertainty.

## Records & approval
- [ ] Attach raw data and uncertainty calculation
- [ ] Record deviations and equipment disposition
- [ ] Obtain technical review and authorization`,
  ],
  [
    "uncertainty",
    "Measurement uncertainty study",
    "Lab & quality",
    `## Measurement objective
Define the measurand, units, range, and reporting conditions.

## Measurement model
State the model equation, input quantities, and assumptions.

## Uncertainty budget
| Input | Estimate | Distribution | Divisor | Standard uncertainty | Sensitivity | Contribution |
| --- | --- | --- | --- | --- | --- | --- |
| Reference | | | | | | |
| Repeatability | | | | | | |
| Resolution | | | | | | |

## Correlation & degrees of freedom
Document correlations, effective degrees of freedom, and supporting evidence.

## Combined & expanded uncertainty
Record the combined standard uncertainty, coverage factor, and coverage probability with justification.

## Validation & review
- [ ] Verify units and sensitivity coefficients
- [ ] Compare against check standards or independent results
- [ ] Document limitations, reviewer, and next review date`,
  ],
  [
    "equipment",
    "Equipment knowledge card",
    "Lab & quality",
    `## Equipment identity
| Field | Value |
| --- | --- |
| Manufacturer / model | |
| Serial / asset number | |
| Location / custodian | |
| Calibration interval | |

## Capabilities & limitations
List ranges, interfaces, approved uses, and known restrictions.

## Setup & daily checks
1. Inspect the instrument.
2. Confirm calibration status.
3. Run the documented readiness checks.

## Maintenance & known issues
| Date | Observation / work performed | Owner | Follow-up |
| --- | --- | --- | --- |
| | | | |

## References
Link the manual, calibration procedure, and service records.`,
  ],
  [
    "nonconformance",
    "Nonconformance & corrective action",
    "Lab & quality",
    `## Issue & impact
Record the discovery date, affected work, and objective evidence.

## Immediate containment
- [ ] Identify and isolate affected equipment or results
- [ ] Notify the responsible owner
- [ ] Assess previously released work

## Root cause analysis
Describe the investigation, alternatives considered, and evidence supporting the cause.

## Corrective actions
| Action | Owner | Due date | Evidence | Status |
| --- | --- | --- | --- | --- |
| | | | | |

## Effectiveness check
Define measurable success criteria, verification date, and reviewer.

## Closure
Record approval and any procedure or training updates.`,
  ],
  [
    "requirements",
    "Requirements & acceptance plan",
    "Projects & engineering",
    `## Problem & users
Describe the need and the people affected.

## Goals & success measures
| Outcome | Measure | Target |
| --- | --- | --- |
| | | |

## Requirements
| ID | Requirement | Priority | Acceptance evidence | Owner |
| --- | --- | --- | --- | --- |
| REQ-001 | | | | |

## Constraints & dependencies
List interfaces, resources, schedule constraints, and assumptions.

## Acceptance plan
- [ ] Review requirements with stakeholders
- [ ] Define test cases and pass/fail criteria
- [ ] Record results and approval

## Open questions
| Question | Owner | Decision needed by |
| --- | --- | --- |
| | | |`,
  ],
  [
    "decision",
    "Architecture decision record",
    "Projects & engineering",
    `## Decision summary
**Status:** Proposed · **Owner:** · **Date:**

## Context
Explain the problem, constraints, and decision drivers.

## Options considered
| Option | Benefits | Trade-offs | Evidence |
| --- | --- | --- | --- |
| Option A | | | |
| Option B | | | |

> [!DECISION]
> State the selected approach and why it best fits the constraints.

## Consequences
Describe operational impact, cost, migration, and known limitations.

## Validation & revisit triggers
Define how the decision will be checked and what would prompt reconsideration.`,
  ],
  [
    "testplan",
    "Test & validation plan",
    "Projects & engineering",
    `## Objective & scope
Define what is being verified and the release or configuration under test.

## Environment & prerequisites
- [ ] Identify test equipment and reference data
- [ ] Confirm environment and access
- [ ] Record configuration and version

## Test cases
| ID | Scenario | Steps | Expected result | Actual result | Status |
| --- | --- | --- | --- | --- | --- |
| TEST-001 | | | | | |

## Defects & retesting
Link failures to corrective actions and repeat affected tests.

## Exit criteria & approval
Record coverage, unresolved issues, limitations, and approver.`,
  ],
  [
    "release",
    "Release & change notes",
    "Projects & engineering",
    `## Release overview
**Version:** · **Release date:** · **Owner:**

## What changed
### New capabilities
- Describe the user-facing improvement.

### Fixes
- Describe the problem and corrected behavior.

## Deployment & migration
1. Confirm prerequisites and backups.
2. Apply the release.
3. Verify key workflows.

> [!WARNING]
> Document breaking changes, required actions, and compatibility limits.

## Rollback plan
Describe the trigger, owner, and steps to restore the previous version.

## Known issues & support
List remaining limitations and the contact for help.`,
  ],
  [
    "handover",
    "Project handover",
    "Projects & engineering",
    `## Handover summary
**Outgoing owner:** · **Incoming owner:** · **Effective date:**

## Current state
Summarize completed work, active commitments, and upcoming milestones.

## Ownership & contacts
| Area | Owner | Backup | Reference |
| --- | --- | --- | --- |
| | | | |

## Operating guidance
Link procedures, architecture, maintenance, and support information.

## Open work & risks
| Item | Next action | Owner | Due date |
| --- | --- | --- | --- |
| | | | |

## Acceptance checklist
- [ ] Verify access and documentation
- [ ] Walk through routine and exception workflows
- [ ] Confirm ownership and escalation paths`,
  ],
  [
    "incident",
    "Incident review / postmortem",
    "Team & operations",
    `## Incident summary
**Date:** · **Owner:** · **Severity:** · **Duration:**

## Impact
Describe affected users, systems, or measurement results.

## Timeline
| Time | Event | Evidence |
| --- | --- | --- |
| | | |

## Contributing factors
Focus on system conditions and evidence, without assigning blame.

## Response review
### What worked
- Record effective actions.

### What could improve
- Record opportunities.

## Follow-up actions
| Action | Owner | Due date | Success measure |
| --- | --- | --- | --- |
| | | | |`,
  ],
  [
    "onboarding",
    "Team onboarding guide",
    "Team & operations",
    `## Welcome & team purpose
Describe the team’s mission and how this role contributes.

## Before day one
- [ ] Confirm account and workspace access
- [ ] Assign a buddy and training owner
- [ ] Prepare equipment and orientation schedule

## First week
| Day / milestone | Activity | Contact | Completed |
| --- | --- | --- | --- |
| Day 1 | Orientation | | |
| Week 1 | Core workflow walkthrough | | |

## Essential references
Link procedures, team agreements, safety guidance, and support contacts.

## First 30 days
- [ ] Complete required training
- [ ] Perform a supervised task
- [ ] Review progress and open questions with the owner`,
  ],
  [
    "weekly",
    "Weekly team update",
    "Team & operations",
    `## Week at a glance
**Week of:** · **Team:** · **Author:**

## Completed
- Outcome and evidence.

## In progress
| Work item | Owner | Status | Next milestone |
| --- | --- | --- | --- |
| | | | |

## Blockers & decisions needed
| Issue | Impact | Help needed | Needed by |
| --- | --- | --- | --- |
| | | | |

## Next week
- [ ] Priority and owner

## Recognition & lessons
Capture a useful lesson or acknowledge a contribution.`,
  ],
  [
    "retrospective",
    "Team retrospective",
    "Team & operations",
    `## Session details
**Period reviewed:** · **Facilitator:** · **Participants:**

## What went well
- Observation with an example.

## What was difficult
- Observation and impact.

## Ideas to try
| Experiment | Expected benefit | Owner | Review date |
| --- | --- | --- | --- |
| | | | |

> [!DECISION]
> Choose a small number of improvements the team can follow through on.

## Commitments
- [ ] Assign and schedule the agreed actions
- [ ] Review the previous retrospective’s actions`,
  ],
  [
    "howto",
    "How-to guide",
    "Knowledge & reference",
    `## What you’ll accomplish
State the outcome and intended audience.

## Before you start
List required access, tools, knowledge, and estimated time.

## Steps
1. Describe the first action and expected result.
2. Describe the next action.
3. Verify the outcome.

> [!TIP]
> Add a shortcut or helpful example.

## If something goes wrong
| Symptom | Likely cause | What to do |
| --- | --- | --- |
| | | |

## Related information
Link deeper references and the content owner.`,
  ],
  [
    "faq",
    "FAQ & reference",
    "Knowledge & reference",
    `## About this reference
Describe the topic, intended readers, and content owner.

## Frequently asked questions
### What is this for?
Provide a concise answer and link supporting guidance.

### How do I get started?
List the first steps.

### Where can I get help?
Name the support path and information to include.

## Glossary
| Term | Definition |
| --- | --- |
| | |

## Sources & review
List authoritative references, last review date, and next review owner.`,
  ],
];
for (const [key, title, , body] of additions) templates[key] = { title, body };
export const templateGroups = [
  { name: "Start here", keys: ["blank"] },
  {
    name: "Lab & quality",
    keys: [
      "sop",
      "troubleshooting",
      ...additions.filter((x) => x[2] === "Lab & quality").map((x) => x[0]),
    ],
  },
  {
    name: "Projects & engineering",
    keys: [
      "project",
      ...additions
        .filter((x) => x[2] === "Projects & engineering")
        .map((x) => x[0]),
    ],
  },
  {
    name: "Team & operations",
    keys: [
      "meeting",
      ...additions.filter((x) => x[2] === "Team & operations").map((x) => x[0]),
    ],
  },
  {
    name: "Knowledge & reference",
    keys: additions
      .filter((x) => x[2] === "Knowledge & reference")
      .map((x) => x[0]),
  },
];
