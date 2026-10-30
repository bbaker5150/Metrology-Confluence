export type ListKey = "Spaces" | "Pages" | "Versions" | "Comments";
export interface FieldDefinition {
  name: string;
  type: "Text" | "Note" | "Number" | "Boolean" | "Choice";
  indexed?: boolean;
  choices?: string[];
}
const field = (
  name: string,
  type: FieldDefinition["type"],
  indexed = false,
): FieldDefinition => ({ name, type, indexed });
export const listSchema: Record<
  ListKey,
  { title: string; aliases: string[]; fields: FieldDefinition[] }
> = {
  Spaces: {
    title: "Metrology-Confluence - Spaces",
    aliases: ["KB_Spaces"],
    fields: [
      field("Slug", "Text", true),
      field("Description", "Note"),
      field("IconName", "Text"),
      field("AccentColor", "Text"),
      field("SortOrder", "Number"),
      field("IsArchived", "Boolean"),
    ],
  },
  Pages: {
    title: "Metrology-Confluence - Pages",
    aliases: ["KB_Pages"],
    fields: [
      field("SpaceId", "Number", true),
      field("ParentPageId", "Number", true),
      field("Content", "Note"),
      field("Summary", "Note"),
      field("Tags", "Text"),
      {
        name: "Status",
        type: "Choice",
        indexed: true,
        choices: ["Draft", "Published", "Archived"],
      },
      field("IsPinned", "Boolean"),
      field("TemplateType", "Text"),
      field("VersionCount", "Number"),
      field("AuthorName", "Text"),
      field("LastEditorName", "Text"),
    ],
  },
  Versions: {
    title: "Metrology-Confluence - Versions",
    aliases: ["KB_Versions"],
    fields: [
      field("PageId", "Number", true),
      field("VersionNumber", "Number"),
      field("TitleSnapshot", "Text"),
      field("ContentSnapshot", "Note"),
      field("ChangeNote", "Text"),
      field("EditedBy", "Text"),
    ],
  },
  Comments: {
    title: "Metrology-Confluence - Comments",
    aliases: ["KB_Comments"],
    fields: [
      field("PageId", "Number", true),
      field("CommentBody", "Note"),
      field("AuthorName", "Text"),
    ],
  },
};
const xmlEscape = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
export function fieldXml(f: FieldDefinition) {
  const attributes = `Type="${f.type}" Name="${f.name}" StaticName="${f.name}" DisplayName="${f.name}"${f.indexed ? ' Indexed="TRUE"' : ""}${f.type === "Note" ? ' NumLines="12" RichText="FALSE" AppendOnly="FALSE"' : ""}${f.type === "Text" ? ' MaxLength="255"' : ""}`;
  return `<Field ${attributes}>${f.choices ? `<CHOICES>${f.choices.map((c) => `<CHOICE>${xmlEscape(c)}</CHOICE>`).join("")}</CHOICES>` : ""}</Field>`;
}
