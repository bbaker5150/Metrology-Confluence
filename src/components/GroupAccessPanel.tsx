import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Users } from "lucide-react";
import { service } from "../services/sharepointService";
import type { GroupAccessReport } from "../services/groupAccess";
import Modal from "./Modal";
import "./group-access.css";

export default function GroupAccessPanel({
  onBusyChange,
}: {
  onBusyChange?: (busy: boolean) => void;
}) {
  const [report, setReport] = useState<GroupAccessReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  const [review, setReview] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pending = useRef(false);

  async function check() {
    if (pending.current) return;
    pending.current = true;
    setChecking(true);
    setError("");
    setSuccess("");
    try {
      setReport(await service.checkGroupAccess());
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      pending.current = false;
      setChecking(false);
    }
  }

  useEffect(() => {
    void check();
  }, []);

  async function apply() {
    if (pending.current || !report?.canRepair) return;
    pending.current = true;
    setApplying(true);
    onBusyChange?.(true);
    setError("");
    setSuccess("");
    try {
      const verified = await service.repairGroupAccess();
      setReport(verified);
      setReview(false);
      if (verified.ready)
        setSuccess(
          "Shared reading and editing access is ready for Metrology App User.",
        );
      else
        setError(
          "Some access settings still need attention. Review the checks below before trying again.",
        );
    } catch (e) {
      setReview(false);
      setReport(null);
      setError(
        `${e instanceof Error ? e.message : String(e)} Check access again to review the current settings before retrying.`,
      );
    } finally {
      pending.current = false;
      setApplying(false);
      onBusyChange?.(false);
    }
  }

  const busy = checking || applying;
  return (
    <section className="team-access" aria-label="Team access" aria-busy={busy}>
      <div className="team-access-heading">
        <Users size={18} aria-hidden="true" />
        <h3>Team access</h3>
      </div>
      <p>
        <strong>Metrology App User</strong> members need access to all four app
        lists to read, create, and edit shared pages. This check includes
        existing items with separate permissions.
      </p>
      {checking && <p role="status">Checking group and list access…</p>}
      {report?.lists.map((list) => (
        <div className="setup-row" key={list.key}>
          <div>
            <strong>{list.title}</strong>
            {list.issues.length ? (
              <ul className="team-access-issues">
                {list.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <small>Shared reading and editing are available</small>
            )}
            {list.uniqueItemCount > 0 && (
              <small>
                {list.uniqueItemCount} item
                {list.uniqueItemCount === 1 ? "" : "s"} with separate
                permissions checked
              </small>
            )}
            {list.notices.map((notice) => (
              <small key={notice}>{notice}</small>
            ))}
          </div>
          <span className={`badge ${list.ready ? "published" : "draft"}`}>
            {list.ready ? "Ready" : "Needs attention"}
          </span>
        </div>
      ))}
      {report && report.blockingIssues.length > 0 && (
        <div className="error-message" role="alert">
          {report.blockingIssues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="notice" role="status">
          {success}
        </p>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void check()}
        >
          Check team access
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy || !report?.canRepair || report.ready}
          onClick={() => setReview(true)}
        >
          <ShieldCheck size={16} />
          {applying
            ? "Applying permissions…"
            : report?.ready
              ? "Team access ready"
              : "Repair team access"}
        </button>
      </div>
      {review && report && (
        <Modal
          title="Repair team access"
          onClose={() => {
            if (!applying) setReview(false);
          }}
        >
          <p>
            Grant the existing <strong>Metrology App User</strong> group
            Contribute access to the four app lists and their existing items
            with separate permissions.
          </p>
          <ul className="team-access-issues">
            <li>
              Allow members to read and edit all items, including shared drafts.
            </li>
            <li>
              Preserve existing owner access and other permission assignments.
            </li>
            <li>Apply changes only to this app’s lists and items.</li>
          </ul>
          <p className="notice">
            Delete page is restricted to the creator inside this app.
            SharePoint’s Contribute permission also allows deletion outside the
            app.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="button"
              disabled={applying}
              onClick={() => setReview(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button primary"
              disabled={applying}
              onClick={() => void apply()}
            >
              {applying ? "Applying and verifying…" : "Apply shared access"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
