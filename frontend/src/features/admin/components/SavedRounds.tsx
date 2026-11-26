import { ClipboardList } from "lucide-react";
import { RoundStatus, type RoundWorkspace } from "../api/admin-rounds";
import { ConfirmAction } from "./ConfirmAction";

export type RoundAction =
  | { kind: "publish" | "discard"; id: string }
  | { kind: "attachFinal"; id: string; matchId: string };

export function SavedRounds({
  workspace,
  busy,
  onAction,
}: {
  workspace: RoundWorkspace;
  busy: boolean;
  onAction: (action: RoundAction) => void;
}) {
  const groupLabels = new Map(workspace.groups.map((group) => [group.key, group.label]));
  return (
    <section className="admin-panel admin-rounds" aria-labelledby="saved-rounds-title">
      <h2 id="saved-rounds-title">
        <ClipboardList size={20} aria-hidden="true" /> Zapisane rundy
      </h2>
      {workspace.rounds.length === 0 && (
        <p className="admin-muted">W tym sezonie nie zapisano jeszcze żadnej rundy.</p>
      )}
      <ul>
        {workspace.rounds.map((round) => {
          const final = round.pendingFinalMatch;
          const draft = round.status === RoundStatus.Draft;
          return (
            <li key={round.id} className="admin-saved-round">
              <div className="admin-saved-heading">
                <h3>{round.name}</h3>
                <span className="admin-round-badge" data-published={!draft}>
                  {draft ? "Szkic" : "Opublikowana"}
                </span>
              </div>
              <p className="admin-muted">
                {round.matchCount} spotk. ·{" "}
                {round.groupKeys.map((key) => groupLabels.get(key) ?? key).join(", ")}
              </p>
              {round.awaitingFinal && (
                <p className="admin-final-note">
                  {final
                    ? `Finał do dodania: ${final.homeTeam} – ${final.awayTeam}`
                    : "Zarezerwowano finał. Czekamy na spotkanie w terminarzu."}
                </p>
              )}
              <div className="admin-round-actions">
                {draft && (
                  <>
                    <ConfirmAction
                      label="Opublikuj rundę"
                      description={`Opublikujesz rundę ${round.number} z ${round.matchCount} spotkaniami. Wybrane bloki i mecze zostaną zapisane jako jej skład.`}
                      busy={busy}
                      onConfirm={() => onAction({ kind: "publish", id: round.id })}
                    />
                    <ConfirmAction
                      label="Usuń szkic"
                      description={`Usuniesz szkic „${round.name}” i zwolnisz przypisane bloki.`}
                      busy={busy}
                      destructive
                      onConfirm={() => onAction({ kind: "discard", id: round.id })}
                    />
                  </>
                )}
                {round.awaitingFinal && final && (
                  <ConfirmAction
                    label="Dodaj finał"
                    description={`Dodasz mecz ${final.homeTeam} – ${final.awayTeam} do rundy ${round.number}.`}
                    busy={busy}
                    onConfirm={() =>
                      onAction({ kind: "attachFinal", id: round.id, matchId: final.id })
                    }
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
