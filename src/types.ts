export type PageStatus = "Draft" | "Published" | "Archived";
export interface Space {
  Id: number;
  Title: string;
  Slug: string;
  Description: string;
  IconName: string;
  AccentColor: string;
  SortOrder: number;
  IsArchived: boolean;
}
export interface Page {
  Id: number;
  Title: string;
  SpaceId: number;
  ParentPageId: number | null;
  Content: string;
  Summary: string;
  Tags: string[];
  Status: PageStatus;
  IsPinned: boolean;
  TemplateType: string;
  VersionCount: number;
  /** SharePoint's built-in Created By user ID; never supplied by an editor. */
  AuthorId?: number;
  AuthorName: string;
  LastEditorName: string;
  Modified: string;
  Created: string;
  etag?: string;
}
export interface PageVersion {
  Id: number;
  PageId: number;
  VersionNumber: number;
  TitleSnapshot: string;
  ContentSnapshot: string;
  ChangeNote: string;
  EditedBy: string;
  Created: string;
}
export interface Comment {
  Id: number;
  PageId: number;
  CommentBody: string;
  AuthorName: string;
  Created: string;
}
export interface Attachment {
  FileName: string;
  ServerRelativeUrl: string;
  Size?: number;
  MimeType?: string;
}
export type PageInput = Partial<Page> &
  Pick<Page, "Title" | "SpaceId" | "Content">;
export interface SetupCheck {
  title: string;
  exists: boolean;
  missingFields: string[];
}

/** Images selected in the editor; these are uploaded only when the page is saved. */
export interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
}
