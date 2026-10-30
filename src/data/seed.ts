import type { Attachment, Comment, Page, PageVersion, Space } from "../types";

/** Browser-only demonstration content. Never inserted into SharePoint. */
export function createSeed(): {
  spaces: Space[];
  pages: Page[];
  versions: PageVersion[];
  comments: Comment[];
  attachments: Record<string, Attachment[]>;
} {
  const ago = (hours: number) =>
    new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const spaces: Space[] = [
    {
      Id: 1,
      Title: "Metrology & Lab Ops",
      Slug: "metrology-lab-ops",
      Description:
        "Calibration practice, measurement assurance, and everyday lab knowledge. Demo workspace.",
      IconName: "FlaskConical",
      AccentColor: "#207de9",
      SortOrder: 1,
      IsArchived: false,
    },
    {
      Id: 2,
      Title: "Engineering",
      Slug: "engineering",
      Description:
        "Architecture decisions, technical references, and practical guides. Demo workspace.",
      IconName: "Workflow",
      AccentColor: "#22a885",
      SortOrder: 2,
      IsArchived: false,
    },
    {
      Id: 3,
      Title: "Modernization",
      Slug: "modernization",
      Description:
        "Project context, implementation notes, and lessons learned. Demo workspace.",
      IconName: "Rocket",
      AccentColor: "#dd8c16",
      SortOrder: 3,
      IsArchived: false,
    },
    {
      Id: 4,
      Title: "Onboarding & SOPs",
      Slug: "onboarding-sops",
      Description:
        "A clear starting point for new teammates and shared procedures. Demo workspace.",
      IconName: "GraduationCap",
      AccentColor: "#8b5cf6",
      SortOrder: 4,
      IsArchived: false,
    },
  ];
  const page = (
    Id: number,
    Title: string,
    SpaceId: number,
    Summary: string,
    Content: string,
    extra: Partial<Page> = {},
  ): Page => ({
    Id,
    Title,
    SpaceId,
    Summary,
    Content,
    ParentPageId: null,
    Tags: [],
    Status: "Published",
    IsPinned: false,
    TemplateType: "blank",
    VersionCount: 1,
    etag: '"1"',
    AuthorId: 1,
    AuthorName: "Demo Editor",
    LastEditorName: "Demo Editor",
    Created: ago(240 + Id),
    Modified: ago(Id * 3),
    ...extra,
  });
  const pages: Page[] = [
    page(
      1,
      "Welcome to the knowledge hub",
      4,
      "One place for the knowledge that keeps our labs and projects moving.",
      `> [!INFO]\n> You are exploring demonstration content stored in this browser. These examples are not approved procedures and are never uploaded automatically to SharePoint.\n\n## A shared source of understanding\n\nUse this hub to capture the context behind our work: the procedure that saves an hour, the decision behind a design, and the lesson that should not need to be learned twice.\n\n## Find your way around\n\n| Space | What belongs here |\n| --- | --- |\n| Metrology & Lab Ops | Measurement practice, calibration references, lab routines |\n| Engineering | Architecture, troubleshooting, technical decisions |\n| Modernization | Project context, progress notes, lessons learned |\n| Onboarding & SOPs | Getting started and repeatable team procedures |\n\n## Make knowledge useful\n\n- Give each page a clear title and a short summary.\n- Start with an existing template when a structure helps.\n- Add tags so teammates can discover related work.\n- Record a change note when you publish an update.\n\n> [!TIP]\n> Press **Ctrl+K** or **Cmd+K** to search titles, content, tags, and authors.\n\n## Your first contribution\n\n- [ ] Find your team's space.\n- [ ] Create a draft using a starter template.\n- [ ] Add the context someone else will need.\n- [ ] Review and publish when it is ready.`,
      { IsPinned: true, Tags: ["getting-started", "knowledge-sharing"] },
    ),
    page(
      2,
      "Measurement readiness checklist",
      1,
      "An example pre-measurement checklist for consistent setup and traceable records.",
      `> [!WARNING]\n> Demonstration checklist only. Use the current approved laboratory procedure and instrument instructions for actual work.\n\n## Purpose\n\nCapture the checks that make a measurement session reproducible before data collection begins.\n\n## Before setup\n\n- [ ] Confirm the current approved procedure and revision.\n- [ ] Verify instrument identification and calibration status.\n- [ ] Record relevant environmental observations.\n- [ ] Confirm required accessories, fixtures, and software versions.\n\n## Establish the measurement record\n\n| Record | Example entry |\n| --- | --- |\n| Procedure | Approved procedure identifier and revision |\n| Equipment | Asset identifier and calibration due date |\n| Environment | Observed conditions and applicable limits |\n| Operator | Authorized operator and session date |\n\n### Independent review\n\nAsk a qualified teammate to review unusual configurations before proceeding. Capture the reasoning for any approved deviation in the measurement record.\n\n## Closeout\n\n- [ ] Preserve raw data with the session record.\n- [ ] Note any anomalous observations.\n- [ ] Return equipment to the defined storage condition.\n\n> [!TIP]\n> A short setup photograph can make a future repeat measurement much easier to reconstruct.`,
      {
        IsPinned: true,
        Tags: ["sop", "measurement", "quality"],
        TemplateType: "sop",
      },
    ),
    page(
      3,
      "Documenting an uncertainty budget",
      1,
      "A practical example of recording assumptions, contributors, and review context.",
      `> [!INFO]\n> Illustrative guidance for the demo. Follow the approved uncertainty methodology for your measurement.\n\n## Start with the measurand\n\nState what is being measured, the relevant conditions, and the measurement model. A reviewer should understand the result without reconstructing the original session.\n\n## Record each contributor\n\n| Contributor | Source | Record alongside the value |\n| --- | --- | --- |\n| Reference standard | Calibration certificate | Certificate identifier and validity |\n| Repeatability | Observed measurements | Dataset, method, and sample count |\n| Resolution | Instrument specification | Setting and applicable model |\n| Environment | Measurement conditions | Observation and correction rationale |\n\n### Make assumptions visible\n\nDocument distributions, degrees of freedom where applicable, sensitivity coefficients, and correlations. Avoid silently treating contributors as independent.\n\n## Review and preserve\n\nKeep the calculation, source references, and review note together. When a source changes, identify which results need reassessment.\n\n> [!DECISION]\n> Example documentation choice: record the rationale beside each contributor rather than in a separate informal message.`,
      { ParentPageId: 2, Tags: ["uncertainty", "measurement", "review"] },
    ),
    page(
      4,
      "Troubleshooting unexpected drift",
      1,
      "A structured example for capturing symptoms, testing hypotheses, and recording resolution.",
      `> [!WARNING]\n> Example only. Stop work and follow your laboratory's approved escalation process when measurement validity is uncertain.\n\n## Describe the symptom\n\nRecord what changed, when it was first observed, and the evidence supporting the observation. Separate the observed behavior from a proposed explanation.\n\n## Gather evidence\n\n- Instrument and reference identifiers\n- Recent calibration and maintenance history\n- Environmental observations over the same period\n- Raw data, setup photographs, and configuration changes\n\n## Test one hypothesis at a time\n\n| Hypothesis | Investigation record | Outcome |\n| --- | --- | --- |\n| Setup changed | Compare configuration with the last accepted session | Pending review |\n| Environment changed | Compare logged observations | Pending review |\n| Reference behavior changed | Follow the approved check method | Pending review |\n\n### Preserve the original evidence\n\nRetain the initial dataset before making changes. Note the time and reason for each intervention.\n\n## Resolution and follow-up\n\nRecord the confirmed cause, corrective action, reviewer, and any required impact assessment. Link the final record from the affected procedure or equipment page.`,
      { Tags: ["troubleshooting", "quality"], TemplateType: "troubleshooting" },
    ),
    page(
      5,
      "Knowledge hub architecture",
      2,
      "How the single-file application, SharePoint Lists, and browser demo fit together.",
      `> [!INFO]\n> This example describes the application at a high level. See the repository README for deployment instructions.\n\n## A portable frontend\n\nThe application is bundled into one HTML file. React, styles, and icons ship with the document, so the interface does not need external JavaScript or CSS downloads.\n\n## A familiar backend\n\nSharePoint Lists store spaces, pages, revision snapshots, and comments. Page attachments stay on the corresponding page list item.\n\n| Collection | Responsibility |\n| --- | --- |\n| Spaces | Workspace directory and presentation |\n| Pages | Article content, hierarchy, status, and metadata |\n| Versions | Published save snapshots and change notes |\n| Comments | Page-level discussions |\n\n### Local development\n\nOutside a SharePoint context, demonstration data is saved to browser local storage. Changes in this mode are local to the browser.\n\n\`\`\`bash\nnpm ci\nnpm run dev\nnpm run build\n\`\`\`\n\n## Operational boundaries\n\nSharePoint permissions remain the authority for who can read or change data. Page status organizes the workflow; it is not an access-control boundary.`,
      {
        IsPinned: true,
        Tags: ["architecture", "sharepoint"],
        TemplateType: "project",
      },
    ),
    page(
      6,
      "Pilot rollout: decisions and open questions",
      3,
      "Example project context for introducing a shared knowledge workflow.",
      `> [!INFO]\n> Sample project record. Dates, decisions, and actions here are illustrative.\n\n## Outcome\n\nMake the most-used team knowledge easy to find, keep current, and hand over.\n\n## Pilot scope\n\nStart with a small set of frequently referenced procedures and technical notes. Assign an owner to each page and agree on what review means for that content.\n\n> [!DECISION]\n> Example decision: begin with one pilot space before expanding the directory.\n\n## Open questions\n\n- Which existing documents should remain the authoritative source?\n- Who reviews procedural updates before publication?\n- What signals will tell us search and navigation are working?\n\n## Next steps\n\n- [ ] Identify pilot contributors.\n- [ ] Choose the first reference pages.\n- [ ] Review permissions with the site owner.\n- [ ] Gather feedback after the first working week.`,
      { Tags: ["modernization", "decisions"], TemplateType: "project" },
    ),
    page(
      7,
      "Team knowledge review — working notes",
      3,
      "A sample draft for capturing discussion, decisions, and assigned follow-up.",
      `> [!INFO]\n> Demo working draft. Replace this example with your team's actual meeting record.\n\n## Agenda\n\n1. Review the most frequently requested references.\n2. Identify pages that need clearer ownership.\n3. Agree the next documentation priorities.\n\n## Discussion\n\nCapture enough context that a teammate who missed the conversation can understand the decision.\n\n## Decisions\n\nNo decisions recorded yet.\n\n## Action items\n\n| Action | Owner | Due |\n| --- | --- | --- |\n| Identify the highest-value reference pages | To assign | To agree |\n| Review the onboarding path | To assign | To agree |\n\n- [ ] Add meeting attendees and date.\n- [ ] Confirm decisions with participants.\n- [ ] Publish reviewed notes.`,
      {
        Status: "Draft",
        Tags: ["meeting-notes", "review"],
        TemplateType: "meeting",
      },
    ),
    page(
      8,
      "Your first week: a reference map",
      4,
      "A sample onboarding guide that connects people, tools, and essential reading.",
      `> [!INFO]\n> Example onboarding map. Your team should replace this with current contacts and approved references.\n\n## Get oriented\n\nStart with the team mission, the work you will support, and the people who can help. Ask your onboarding contact which references are required for your role.\n\n## Find your tools\n\n| Tool or reference | What to learn |\n| --- | --- |\n| Knowledge hub | Find a space, search, and contribute a draft |\n| Modernization Tracker | Understand project context and current work |\n| Metrology Workbench | Locate the approved workflow for your role |\n| Team procedures | Find current revisions and review requirements |\n\n## Build a useful reading list\n\nPin the pages you return to most often. Add a question in the comments when an explanation is missing or unclear.\n\n### Before independent work\n\nConfirm required training, authorization, and supervision with your manager or designated technical lead.\n\n## Improve the path\n\nNew teammates notice gaps that experienced colleagues no longer see. Keep a short list of confusing terms and missing references, then turn those observations into documentation improvements.`,
      { ParentPageId: 1, Tags: ["onboarding", "getting-started"] },
    ),
  ];
  const versions: PageVersion[] = pages.map((p) => ({
    Id: p.Id,
    PageId: p.Id,
    VersionNumber: 1,
    TitleSnapshot: p.Title,
    ContentSnapshot: p.Content,
    ChangeNote: "Initial demonstration content",
    EditedBy: "Demo Editor",
    Created: p.Modified,
  }));
  const comments: Comment[] = [
    {
      Id: 1,
      PageId: 1,
      CommentBody:
        "Example discussion: use page comments to suggest a clarification or ask where a reference belongs.",
      AuthorName: "Demo Editor",
      Created: ago(1),
    },
    {
      Id: 2,
      PageId: 2,
      CommentBody:
        "Example review note: link the current approved procedure before using this page as a working checklist.",
      AuthorName: "Demo Editor",
      Created: ago(4),
    },
  ];
  return { spaces, pages, versions, comments, attachments: {} };
}
