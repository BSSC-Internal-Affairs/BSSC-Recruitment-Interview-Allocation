import { MailCheck, ShieldCheck } from "lucide-react";
export function InvitationGate({
  checking,
  error,
  onRetry,
}: {
  checking: boolean;
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="invitation-gate">
      <span className="login-icon">
        <MailCheck size={30} />
      </span>
      <div className="eyebrow">A PERSONAL INVITATION</div>
      <h2>
        {checking
          ? "Checking your invitation…"
          : "Your invitation starts here."}
      </h2>
      <p>
        Registration is open to participants registered by the BSSC committee.
        Open the private invitation link the committee shared with you.
      </p>
      {error && (
        <>
          <p className="alert" role="alert">
            {error}
          </p>
          <button className="btn secondary" onClick={onRetry}>
            Check invitation again
          </button>
        </>
      )}
      <p className="invitation-note">
        <ShieldCheck size={17} /> One invitation. One interview response.
      </p>
    </div>
  );
}
