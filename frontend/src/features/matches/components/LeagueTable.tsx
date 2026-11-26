import { useState } from "react";
import { TeamCrest } from "@/components/football/TeamCrest";
import { Button } from "@/components/ui/button";
import { FormResult } from "../api/season-matches";
import type { LeagueTableModel } from "../model/league-table";
import "./league-table-zones.css";

const qualificationZones = [
  { id: "direct", from: 1, to: 8, label: "Bezpośrednio do 1/8 finału" },
  { id: "play-off", from: 9, to: 24, label: "Baraże o 1/8 finału" },
  { id: "eliminated", from: 25, to: 36, label: "Poza fazą pucharową" },
] as const;

const formLabels = {
  [FormResult.Win]: { short: "W", label: "wygrana" },
  [FormResult.Draw]: { short: "R", label: "remis" },
  [FormResult.Loss]: { short: "P", label: "przegrana" },
};

export function LeagueTable({ table }: { table: LeagueTableModel }) {
  const [showBalance, setShowBalance] = useState(false);
  const teamsAtPosition = new Map<number, number>();
  for (const { position } of table.rows) {
    teamsAtPosition.set(position, (teamsAtPosition.get(position) ?? 0) + 1);
  }
  const rows = table.rows.map((row) => {
    const lastSharedPosition = row.position + (teamsAtPosition.get(row.position) ?? 1) - 1;
    const zone = qualificationZones.find(
      ({ from, to }) => row.position >= from && lastSharedPosition <= to,
    );
    return { ...row, zone };
  });

  return (
    <section className="competition-panel" aria-labelledby="league-table-heading">
      <header className="competition-panel-heading">
        <div>
          <h2 id="league-table-heading">Tabela fazy ligowej</h2>
          <p>
            {table.isFinal
              ? "Końcowa klasyfikacja"
              : "Klasyfikacja na podstawie dostępnych wyników"}
            {table.capturedAt ? " · API-Football" : " · Obliczona z wyników meczów"}
          </p>
        </div>
        <Button
          variant="outline"
          className="league-table-toggle"
          aria-expanded={showBalance}
          aria-controls="league-table"
          onClick={() => setShowBalance(!showBalance)}
        >
          {showBalance ? "Ukryj bilans" : "Pokaż bilans"}
        </Button>
      </header>
      {table.sharedPositions && (
        <p className="competition-panel-note">
          Przy równych wynikach dostępnych kryteriów drużyny dzielą miejsce.
          {rows.some((row) => !row.zone) && " Remis na granicy strefy pozostaje nierozstrzygnięty."}
        </p>
      )}
      <ul className="league-zone-legend" aria-label="Strefy awansu" role="list">
        {qualificationZones.map((zone) => (
          <li key={zone.id} data-qualification-zone={zone.id}>
            <strong>
              {zone.from}–{zone.to}
            </strong>
            <span>{zone.label}</span>
          </li>
        ))}
      </ul>
      {!table.isFinal && (
        <p className="league-zone-projection">Strefy są orientacyjne do końca fazy ligowej.</p>
      )}
      {rows.some((row) => row.form?.length) && (
        <p className="competition-panel-note">
          Ostatnie mecze: W – wygrana, R – remis, P – przegrana.
        </p>
      )}
      <table id="league-table" className="league-table" data-show-balance={showBalance}>
        <caption className="sr-only">Klasyfikacja drużyn w fazie ligowej</caption>
        <thead>
          <tr>
            <th scope="col">
              <span aria-hidden="true">#</span>
              <span className="sr-only">Pozycja</span>
            </th>
            <th scope="col">Drużyna</th>
            <th scope="col">Mecze</th>
            <th scope="col" className="league-table-wide">
              Wygrane
            </th>
            <th scope="col" className="league-table-wide">
              Remisy
            </th>
            <th scope="col" className="league-table-wide">
              Przegrane
            </th>
            <th scope="col" className="league-table-balance">
              Bilans
            </th>
            <th scope="col">Pkt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.team.id}
              data-qualification-zone={row.zone?.id}
              data-zone-start={index > 0 && !!row.zone && row.zone !== rows[index - 1].zone}
            >
              <td className="league-zone-position">
                <span>{row.position}</span>
                <span className="sr-only">
                  {row.zone
                    ? `, ${table.isFinal ? "" : "prognoza: "}${row.zone.label}`
                    : ", strefa nierozstrzygnięta"}
                </span>
              </td>
              <th scope="row">
                <span className="league-table-team">
                  <TeamCrest name={row.team.name} logoUrl={row.team.logoUrl} />
                  <span>
                    {row.team.name}
                    {!!row.form?.length && (
                      <span className="league-team-form">
                        <span className="sr-only">
                          {row.form.map((result) => formLabels[result].label).join(", ")}
                        </span>
                        {row.form.map((result, index) => (
                          <span key={index} data-result={result} aria-hidden="true">
                            {formLabels[result].short}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </span>
              </th>
              <td>{row.played}</td>
              <td className="league-table-wide">{row.won}</td>
              <td className="league-table-wide">{row.drawn}</td>
              <td className="league-table-wide">{row.lost}</td>
              <td className="league-table-balance">
                {row.goalsFor}:{row.goalsAgainst}
                <span className="league-table-difference">
                  {row.goalDifference > 0 ? "+" : ""}
                  {row.goalDifference}
                </span>
              </td>
              <td className="league-table-points">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
