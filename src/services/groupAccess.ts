import type { SharePointClient } from "./sharepointService";
import { listSchema, type ListKey } from "./schema";

export const APP_USER_GROUP = "Metrology App User";
const MANAGE_LISTS = 2048n;
const MANAGE_PERMISSIONS = 33554432n;
const MANAGE_WEB = 1073741824n;
const PRIVILEGED = MANAGE_LISTS | MANAGE_PERMISSIONS | MANAGE_WEB;
const ESSENTIAL_CONTRIBUTE = 15n; // View, Add, Edit, Delete list items.
const keys = Object.keys(listSchema) as ListKey[];

export interface GroupAccessListReport {
  key: ListKey;
  title: string;
  ready: boolean;
  readSecurity?: number;
  writeSecurity?: number;
  draftVisibility?: number;
  moderationEnabled?: boolean;
  hasUniquePermissions?: boolean;
  groupHasContribute: boolean;
  groupCanRead: boolean;
  groupCanCreate: boolean;
  groupCanEdit: boolean;
  groupCanDelete: boolean;
  existingGrantNames: string[];
  uniqueItemCount: number;
  uniqueItemsMissingGrant: number;
  issues: string[];
  notices: string[];
}
export interface GroupAccessReport {
  groupName: string;
  groupId?: number;
  roleName?: string;
  ready: boolean;
  canRepair: boolean;
  checkedAt: string;
  lists: GroupAccessListReport[];
  issues: string[];
  blockingIssues: string[];
  notices: string[];
}
interface Mask {
  low: bigint;
  high: bigint;
}
interface Role {
  Id: number;
  Name: string;
  RoleTypeKind: number;
  BasePermissions: unknown;
}
interface ListInfo {
  Title: string;
  BaseTemplate: number;
  HasUniqueRoleAssignments: boolean;
  ReadSecurity: number;
  WriteSecurity: number;
  DraftVersionVisibility: number;
  EnableModeration: boolean;
}
interface Plan {
  path: string;
  metadata: ListInfo;
  needsListGrant: boolean;
  originalListRoleIds: number[];
  itemPathsNeedingGrant: { path: string; originalRoleIds: number[] }[];
  report: GroupAccessListReport;
}
interface Inspection {
  report: GroupAccessReport;
  plans: Plan[];
  role?: Role;
  groupId?: number;
}
const unwrap = <T>(value: unknown): T =>
  ((value as { d?: T })?.d ?? value) as T;
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const is404 = (error: unknown) =>
  Boolean(
    error &&
    typeof error === "object" &&
    "status" in error &&
    error.status === 404,
  );
const identifier = (value: unknown) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new Error("SharePoint returned an invalid permission identifier.");
  return value;
};
function mask(value: unknown): Mask {
  if (!value || typeof value !== "object")
    throw new Error("SharePoint returned incomplete role permissions.");
  const read = (key: "Low" | "High") => {
    const part = (value as Record<string, unknown>)[key];
    if (
      (typeof part !== "string" && typeof part !== "number") ||
      !/^\d+$/.test(String(part))
    )
      throw new Error("SharePoint returned invalid role permissions.");
    const result = BigInt(part);
    if (result > 4294967295n)
      throw new Error("SharePoint returned invalid role permissions.");
    return result;
  };
  return { low: read("Low"), high: read("High") };
}
const contains = (actual: Mask, required: Mask) =>
  (actual.low & required.low) === required.low &&
  (actual.high & required.high) === required.high;
function emptyList(key: ListKey, message: string): GroupAccessListReport {
  return {
    key,
    title: listSchema[key].title,
    ready: false,
    groupHasContribute: false,
    groupCanRead: false,
    groupCanCreate: false,
    groupCanEdit: false,
    groupCanDelete: false,
    existingGrantNames: [],
    uniqueItemCount: 0,
    uniqueItemsMissingGrant: 0,
    issues: [message],
    notices: [],
  };
}
async function bindingIds(
  client: SharePointClient,
  path: string,
  groupId: number,
): Promise<number[]> {
  try {
    const rows = await client.collection<{ Id: number }>(
      `${path}/roleassignments/getbyprincipalid(${groupId})/roledefinitionbindings?$select=Id`,
    );
    return rows.map((row) => identifier(row.Id));
  } catch (error) {
    if (is404(error)) return [];
    throw error;
  }
}
async function bindings(
  client: SharePointClient,
  path: string,
  groupId: number,
  roles: Role[],
) {
  const ids = await bindingIds(client, path, groupId);
  const permissions: Mask = { low: 0n, high: 0n };
  const names: string[] = [];
  for (const roleId of ids) {
    const role = roles.find((candidate) => candidate.Id === roleId);
    if (!role)
      throw new Error(
        "A group role binding could not be verified against the site's permission levels.",
      );
    const granted = mask(role.BasePermissions);
    permissions.low |= granted.low;
    permissions.high |= granted.high;
    names.push(role.Name);
  }
  return { permissions, names, ids };
}
async function inspectList(
  client: SharePointClient,
  key: ListKey,
  groupId: number,
  roles: Role[],
  required: Mask,
): Promise<Plan> {
  const path = await client.resolve(key);
  const [raw, grant, items] = await Promise.all([
    client.get(
      `${path}?$select=Title,BaseTemplate,HasUniqueRoleAssignments,ReadSecurity,WriteSecurity,DraftVersionVisibility,EnableModeration`,
    ),
    bindings(client, path, groupId, roles),
    client.collection<{ Id: number; HasUniqueRoleAssignments: boolean }>(
      `${path}/items?$select=Id,HasUniqueRoleAssignments&$top=5000`,
    ),
  ]);
  const metadata = unwrap<ListInfo>(raw);
  if (
    !metadata ||
    metadata.BaseTemplate !== 100 ||
    typeof metadata.Title !== "string" ||
    typeof metadata.HasUniqueRoleAssignments !== "boolean" ||
    ![1, 2].includes(metadata.ReadSecurity) ||
    ![1, 2, 4].includes(metadata.WriteSecurity) ||
    ![0, 1, 2].includes(metadata.DraftVersionVisibility) ||
    typeof metadata.EnableModeration !== "boolean"
  )
    throw new Error("SharePoint did not return complete list access settings.");
  for (const item of items) {
    identifier(item.Id);
    if (typeof item.HasUniqueRoleAssignments !== "boolean")
      throw new Error(
        "SharePoint did not identify whether an existing item has unique permissions.",
      );
  }
  const unique = items.filter((item) => item.HasUniqueRoleAssignments);
  const itemPathsNeedingGrant: { path: string; originalRoleIds: number[] }[] =
    [];
  let higherItemGrants = 0;
  // Bound parallel calls on lists with many unique permission scopes.
  for (let start = 0; start < unique.length; start += 4) {
    const chunk = unique.slice(start, start + 4);
    const checked = await Promise.all(
      chunk.map(async (item) => {
        const itemPath = `${path}/items(${item.Id})`;
        return {
          itemPath,
          grant: await bindings(client, itemPath, groupId, roles),
        };
      }),
    );
    for (const result of checked) {
      if (!contains(result.grant.permissions, required))
        itemPathsNeedingGrant.push({
          path: result.itemPath,
          originalRoleIds: result.grant.ids,
        });
      if ((result.grant.permissions.low & PRIVILEGED) !== 0n)
        higherItemGrants++;
    }
  }
  const issues: string[] = [];
  const notices: string[] = [];
  const needsListGrant = !contains(grant.permissions, required);
  if (needsListGrant)
    issues.push("The group needs Contribute access on this list.");
  if (metadata.ReadSecurity !== 1)
    issues.push("Reading is restricted to the item's creator.");
  if (metadata.WriteSecurity !== 1)
    issues.push(
      "Shared creation and editing are restricted by this list's item settings.",
    );
  if (metadata.DraftVersionVisibility !== 0)
    issues.push(
      "Draft visibility is restricted; team readers need access to all app content.",
    );
  if (itemPathsNeedingGrant.length)
    issues.push(
      `${itemPathsNeedingGrant.length} existing item(s) with unique permissions need group access.`,
    );
  if (metadata.EnableModeration)
    notices.push(
      "SharePoint content approval is enabled and will remain enabled.",
    );
  if ((grant.permissions.low & PRIVILEGED) !== 0n)
    notices.push(
      "The group already has elevated list permissions; repair preserves existing grants rather than downgrading them.",
    );
  if (higherItemGrants)
    notices.push(
      `${higherItemGrants} existing item(s) already grant the group elevated permissions; those grants are preserved.`,
    );
  const report: GroupAccessListReport = {
    key,
    title: metadata.Title,
    ready: issues.length === 0,
    readSecurity: metadata.ReadSecurity,
    writeSecurity: metadata.WriteSecurity,
    draftVisibility: metadata.DraftVersionVisibility,
    moderationEnabled: metadata.EnableModeration,
    hasUniquePermissions: metadata.HasUniqueRoleAssignments,
    groupHasContribute: !needsListGrant,
    groupCanRead: (grant.permissions.low & 1n) !== 0n,
    groupCanCreate: (grant.permissions.low & 2n) !== 0n,
    groupCanEdit: (grant.permissions.low & 4n) !== 0n,
    groupCanDelete: (grant.permissions.low & 8n) !== 0n,
    existingGrantNames: grant.names,
    uniqueItemCount: unique.length,
    uniqueItemsMissingGrant: itemPathsNeedingGrant.length,
    issues,
    notices,
  };
  return {
    path,
    metadata,
    needsListGrant,
    originalListRoleIds: grant.ids,
    itemPathsNeedingGrant,
    report,
  };
}
async function inspect(client: SharePointClient): Promise<Inspection> {
  const report: GroupAccessReport = {
    groupName: APP_USER_GROUP,
    ready: false,
    canRepair: false,
    checkedAt: new Date().toISOString(),
    lists: [],
    issues: [],
    blockingIssues: [],
    notices: [],
  };
  client.clearNames();
  const [groupResult, rolesResult, actorResult] = await Promise.allSettled([
    client.get(
      "/_api/web/sitegroups/getbyname('Metrology%20App%20User')?$select=Id,Title",
    ),
    client.collection<Role>(
      "/_api/web/roledefinitions?$select=Id,Name,RoleTypeKind,BasePermissions",
    ),
    client.get("/_api/web/EffectiveBasePermissions"),
  ]);
  let groupId: number | undefined;
  let roles: Role[] = [];
  let role: Role | undefined;
  let required: Mask | undefined;
  let actorCanRepair = false;
  try {
    if (groupResult.status === "rejected") {
      if (is404(groupResult.reason))
        throw new Error(
          `The existing SharePoint group “${APP_USER_GROUP}” was not found. No substitute group will be created.`,
        );
      throw groupResult.reason;
    }
    const group = unwrap<{ Id: number; Title: string }>(groupResult.value);
    groupId = identifier(group?.Id);
    if (group.Title !== APP_USER_GROUP)
      throw new Error("SharePoint returned a different group than requested.");
    report.groupId = groupId;
  } catch (error) {
    report.blockingIssues.push(`Group: ${errorText(error)}`);
  }
  try {
    if (rolesResult.status === "rejected") throw rolesResult.reason;
    roles = rolesResult.value;
    const contributors = roles.filter(
      (candidate) => candidate.RoleTypeKind === 3,
    );
    if (contributors.length !== 1)
      throw new Error(
        "The site's built-in Contribute permission level could not be identified uniquely.",
      );
    role = contributors[0];
    identifier(role.Id);
    if (typeof role.Name !== "string")
      throw new Error("SharePoint returned an invalid permission-level name.");
    required = mask(role.BasePermissions);
    if (
      (required.low & ESSENTIAL_CONTRIBUTE) !== ESSENTIAL_CONTRIBUTE ||
      (required.low & PRIVILEGED) !== 0n
    )
      throw new Error(
        "The site's Contribute role has been modified or contains administrative permissions. Review that role before granting app access.",
      );
    report.roleName = role.Name;
  } catch (error) {
    report.blockingIssues.push(`Permission level: ${errorText(error)}`);
  }
  try {
    if (actorResult.status === "rejected") throw actorResult.reason;
    const raw = unwrap<{
      Low?: unknown;
      High?: unknown;
      EffectiveBasePermissions?: unknown;
    }>(actorResult.value);
    const actor = mask(raw?.EffectiveBasePermissions ?? raw);
    actorCanRepair =
      (actor.low & (MANAGE_LISTS | MANAGE_PERMISSIONS)) ===
      (MANAGE_LISTS | MANAGE_PERMISSIONS);
    if (!actorCanRepair)
      throw new Error(
        "Repair requires site-level Manage Permissions and Manage Lists access.",
      );
  } catch (error) {
    report.blockingIssues.push(`Owner access: ${errorText(error)}`);
  }
  const plans: Plan[] = [];
  if (groupId && role && required) {
    const listResults = await Promise.allSettled(
      keys.map((key) => inspectList(client, key, groupId!, roles, required!)),
    );
    listResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        plans.push(result.value);
        report.lists.push(result.value.report);
      } else {
        const message = errorText(result.reason);
        report.lists.push(emptyList(keys[index], message));
        report.blockingIssues.push(
          `${listSchema[keys[index]].title}: ${message}`,
        );
      }
    });
  }
  report.ready =
    report.lists.length === keys.length &&
    report.lists.every((list) => list.ready);
  report.canRepair =
    actorCanRepair &&
    report.blockingIssues.length === 0 &&
    plans.length === keys.length;
  report.issues = [
    ...report.blockingIssues,
    ...report.lists.flatMap((list) =>
      list.issues.map((issue) => `${list.title}: ${issue}`),
    ),
  ];
  report.notices = report.lists.flatMap((list) =>
    list.notices.map((notice) => `${list.title}: ${notice}`),
  );
  return { report, plans, role, groupId };
}

/** Read-only preview. Failed or incomplete permission metadata never appears ready. */
export async function inspectGroupAccess(
  client: SharePointClient,
): Promise<GroupAccessReport> {
  return (await inspect(client)).report;
}

/** Repairs only the app lists and existing unique item scopes, preserving all other ACLs. */
export async function repairGroupAccess(
  client: SharePointClient,
  ownerCheck: () => Promise<boolean>,
): Promise<GroupAccessReport> {
  if (!(await ownerCheck()))
    throw new Error(
      "Only a verified SharePoint site owner can repair team access.",
    );
  const checked = await inspect(client);
  if (!checked.report.canRepair || !checked.role || !checked.groupId)
    throw new Error(
      `Team access could not be repaired. ${checked.report.blockingIssues.join(" ") || "Permission inspection was incomplete."}`,
    );
  const grant = async (path: string, originalRoleIds: number[]) => {
    await client.write(
      `${path}/roleassignments/addroleassignment(principalid=${checked.groupId},roledefid=${checked.role!.Id})`,
    );
    const after = await bindingIds(client, path, checked.groupId!);
    if (originalRoleIds.some((roleId) => !after.includes(roleId)))
      throw new Error(
        "An existing group role binding changed unexpectedly. Further permission changes have stopped; a site owner should review this scope.",
      );
    if (!after.includes(checked.role!.Id))
      throw new Error(
        "The Contribute grant could not be verified after SharePoint accepted the request.",
      );
  };
  try {
    for (const plan of checked.plans) {
      if (plan.needsListGrant) {
        if (!plan.metadata.HasUniqueRoleAssignments)
          await client.write(
            `${plan.path}/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=false)`,
          );
        await grant(plan.path, plan.originalListRoleIds);
      }
      const settings: Record<string, number> = {};
      if (plan.metadata.ReadSecurity !== 1) settings.ReadSecurity = 1;
      if (plan.metadata.WriteSecurity !== 1) settings.WriteSecurity = 1;
      if (plan.metadata.DraftVersionVisibility !== 0)
        settings.DraftVersionVisibility = 0;
      if (Object.keys(settings).length)
        await client.write(plan.path, settings, "MERGE");
      for (const item of plan.itemPathsNeedingGrant)
        await grant(item.path, item.originalRoleIds);
    }
  } catch (error) {
    throw new Error(
      `Team access repair stopped: ${errorText(error)} Some earlier changes may have completed. Check access again before applying another repair.`,
    );
  }
  const verified = await inspectGroupAccess(client);
  if (!verified.ready)
    throw new Error(
      `Team access repair did not verify as complete. Check access again. ${verified.issues.join(" ")}`,
    );
  return verified;
}
