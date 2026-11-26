import { useId, useState, type FormEvent } from "react";
import { CalendarDays, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminRound, MatchGroup, RoundWorkspace, SaveDraft } from "../api/admin-rounds";

const polishDate = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeZone: "Europe/Warsaw",
});
const polishKickoff = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Warsaw",
});

function GroupChoice({
  group,
  selected,
  assignedRound,
  busy,
  onSelect,
}: {
  group: MatchGroup;
  selected: boolean;
  assignedRound?: AdminRound;
  busy: boolean;
  onSelect: (key: string, selected: boolean) => void;
}) {
  const choiceId = useId();
  const dates = [
    ...new Set(
      group.matches.flatMap((match) =>
        match.kickoffAt ? [polishDate.format(new Date(match.kickoffAt))] : [],
      ),
    ),
  ];
  return (
    <div className="admin-group" data-selected={selected}>
      <label className="admin-group-choice">
        <input
          type="checkbox"
          checked={selected}
          disabled={busy || !!group.assignedRoundId}
          aria-labelledby={`${choiceId}-title`}
          aria-describedby={`${choiceId}-description`}
          onChange={(event) => onSelect(group.key, event.target.checked)}
        />
        <span>
          <strong id={`${choiceId}-title`}>{group.label}</strong>
          <span className="admin-group-meta" id={`${choiceId}-description`}>
            {group.assignedRoundId
              ? assignedRound
                ? `Przypisany do rundy ${assignedRound.number}`
                : "Blok przypisany do rundy"
              : group.matches.length === 0
                ? "Rezerwacja finału. Spotkanie dodasz, gdy pojawi się w terminarzu."
                : `${group.matches.length} spotk. · ${dates.join(", ") || "Termin do ustalenia"}`}
          </span>
        </span>
      </label>
      {group.matches.length > 0 && (
        <details className="admin-fixtures">
          <summary>Podgląd spotkań</summary>
          <ul>
            {group.matches.map((match) => (
              <li key={match.id}>
                <span>
                  {match.homeTeam} – {match.awayTeam}
                </span>
                {match.kickoffAt ? (
                  <time dateTime={match.kickoffAt}>
                    {polishKickoff.format(new Date(match.kickoffAt))}
                  </time>
                ) : (
                  <span className="admin-muted">Termin do ustalenia</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function RoundBuilder({
  workspace,
  busy,
  onSave,
}: {
  workspace: RoundWorkspace;
  busy: boolean;
  onSave: (draft: SaveDraft) => void;
}) {
  const [number, setNumber] = useState(String(workspace.nextNumber));
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const groups = workspace.groups.filter((group) => selectedKeys.includes(group.key));
  const matchCount = groups.reduce((total, group) => total + group.matches.length, 0);
  const selectedNumber = Number(number);
  const validNumber =
    Number.isInteger(selectedNumber) && selectedNumber >= 1 && selectedNumber <= 9999;
  const numberTaken = workspace.rounds.some((round) => round.number === selectedNumber);
  const canSave = !busy && validNumber && !numberTaken && matchCount > 0;

  function selectGroup(key: string, selected: boolean) {
    setSelectedKeys((keys) => (selected ? [...keys, key] : keys.filter((item) => item !== key)));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) return;
    onSave({
      seasonCode: workspace.season.code,
      number: selectedNumber,
      groups: groups.map((group) => ({
        key: group.key,
        matchIds: group.matches.map((match) => match.id),
      })),
    });
  }

  return (
    <form
      className="admin-panel admin-builder"
      onSubmit={submit}
      aria-labelledby="round-builder-title"
    >
      <h2 id="round-builder-title">
        <CalendarDays size={20} aria-hidden="true" /> Nowa runda
      </h2>
      <p className="admin-muted">
        Wybierz jeden lub kilka całych bloków. Możesz przejrzeć mecze przed zapisem. Bloki dwumeczów
        pojawiają się, gdy terminarz zawiera wszystkie pary i oba spotkania.
      </p>
      <label className="admin-field admin-round-number">
        Numer rundy
        <Input
          type="number"
          min={1}
          max={9999}
          value={number}
          required
          disabled={busy}
          aria-invalid={numberTaken || undefined}
          aria-describedby={numberTaken ? "round-number-error" : undefined}
          onChange={(event) => setNumber(event.target.value)}
        />
      </label>
      {numberTaken && (
        <p className="admin-error" id="round-number-error">
          Ten numer jest już używany.
        </p>
      )}
      <fieldset className="admin-groups">
        <legend>Bloki meczowe</legend>
        {workspace.groups.length === 0 && <p>Brak bloków do wyboru w tym sezonie.</p>}
        {workspace.groups.map((group) => (
          <GroupChoice
            key={group.key}
            group={group}
            selected={selectedKeys.includes(group.key)}
            assignedRound={workspace.rounds.find((round) => round.id === group.assignedRoundId)}
            busy={busy}
            onSelect={selectGroup}
          />
        ))}
      </fieldset>
      <div className="admin-builder-footer">
        <p role="status">
          <strong>{groups.length}</strong> bloków · <strong>{matchCount}</strong> spotkań
          {groups.length > 0 && matchCount === 0 && (
            <span className="admin-group-meta">Dodaj też blok z zaplanowanym spotkaniem.</span>
          )}
        </p>
        <Button type="submit" disabled={!canSave}>
          <CircleCheck aria-hidden="true" /> Zapisz szkic
        </Button>
      </div>
    </form>
  );
}
