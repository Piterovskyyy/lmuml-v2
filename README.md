# LMuML

A full-stack app for predicting football scores with friends. Players can submit their picks for a whole round, track their points, and compare results in the standings. The backend enforces the deadline separately for each match.

## See it in action

[![LMuML home screen with the active round and player standings](docs/demo/gallery/desktop/player-home.webp)](docs/demo/gallery/desktop/player-home.webp)

[Watch a prediction being saved and the standings opened](docs/demo/przebieg-gracza.webp).

## Application gallery

Compare 31 screens and interaction states in desktop and mobile layouts. Expand each workflow and select any preview to see the full image. The captures use fictional clubs, players, and results. The interface is in Polish.

[Matchday and predictions](#matchday-and-predictions) · [Fixtures and match centre](#fixtures-and-match-centre) · [Rankings and statistics](#rankings-and-statistics) · [Account and accessibility](#account-and-accessibility) · [Administration](#administration)

### Matchday and predictions

Open the active round from the home screen, enter scores, and see the save confirmation.

<details open>
<summary>Home, quick picks, and saved predictions</summary>

<table>
  <thead>
    <tr><th>Desktop</th><th>Mobile</th></tr>
  </thead>
  <tbody>
    <tr><td colspan="2"><strong>Home dashboard</strong> · Active round, upcoming matches, and shortcuts to standings.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/player-home.webp"><img src="docs/demo/gallery/desktop/player-home.webp" width="510" alt="Home dashboard on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/player-home.webp"><img src="docs/demo/gallery/mobile/player-home.webp" width="200" alt="Home dashboard on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Quick picks</strong> · The full prediction round opened directly from the home screen.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/player-quick-picks.webp"><img src="docs/demo/gallery/desktop/player-quick-picks.webp" width="510" alt="Quick picks on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/player-quick-picks.webp"><img src="docs/demo/gallery/mobile/player-quick-picks.webp" width="200" alt="Quick picks on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>My predictions</strong> · Saved picks and match deadlines in the round editor.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/player-predictions.webp"><img src="docs/demo/gallery/desktop/player-predictions.webp" width="510" alt="My predictions on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/player-predictions.webp"><img src="docs/demo/gallery/mobile/player-predictions.webp" width="200" alt="My predictions on mobile"></a></td>
    </tr>
  </tbody>
</table>

</details>

### Fixtures and match centre

Switch between league and knockout views, then open a match for the score, timeline, lineups, and statistics.

<details>
<summary>Schedule, table, bracket, and match details</summary>

<table>
  <thead>
    <tr><th>Desktop</th><th>Mobile</th></tr>
  </thead>
  <tbody>
    <tr><td colspan="2"><strong>Season schedule</strong> · Grouped fixtures, search, and filters.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/fixtures-schedule.webp"><img src="docs/demo/gallery/desktop/fixtures-schedule.webp" width="510" alt="Season schedule on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/fixtures-schedule.webp"><img src="docs/demo/gallery/mobile/fixtures-schedule.webp" width="200" alt="Season schedule on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>League table</strong> · Club standings with qualification cutoffs.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/fixtures-league-table.webp"><img src="docs/demo/gallery/desktop/fixtures-league-table.webp" width="510" alt="League table on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/fixtures-league-table.webp"><img src="docs/demo/gallery/mobile/fixtures-league-table.webp" width="200" alt="League table on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Knockout bracket</strong> · Round progression and scores in individual legs.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/fixtures-knockout-bracket.webp"><img src="docs/demo/gallery/desktop/fixtures-knockout-bracket.webp" width="510" alt="Knockout bracket on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/fixtures-knockout-bracket.webp"><img src="docs/demo/gallery/mobile/fixtures-knockout-bracket.webp" width="200" alt="Knockout bracket on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Match overview dialog</strong> · Score and match status in the details dialog.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/fixtures-match-overview.webp"><img src="docs/demo/gallery/desktop/fixtures-match-overview.webp" width="510" alt="Match overview dialog on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/fixtures-match-overview.webp"><img src="docs/demo/gallery/mobile/fixtures-match-overview.webp" width="200" alt="Match overview dialog on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Match timeline</strong> · Goals, cards, and substitutions in match order.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/fixtures-match-timeline.webp"><img src="docs/demo/gallery/desktop/fixtures-match-timeline.webp" width="510" alt="Match timeline on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/fixtures-match-timeline.webp"><img src="docs/demo/gallery/mobile/fixtures-match-timeline.webp" width="200" alt="Match timeline on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Team statistics</strong> · Side-by-side team measures with the result still visible.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/fixtures-team-statistics.webp"><img src="docs/demo/gallery/desktop/fixtures-team-statistics.webp" width="510" alt="Team statistics on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/fixtures-team-statistics.webp"><img src="docs/demo/gallery/mobile/fixtures-team-statistics.webp" width="200" alt="Team statistics on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Player statistics</strong> · Individual performances within the match details.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/fixtures-player-statistics.webp"><img src="docs/demo/gallery/desktop/fixtures-player-statistics.webp" width="510" alt="Player statistics on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/fixtures-player-statistics.webp"><img src="docs/demo/gallery/mobile/fixtures-player-statistics.webp" width="200" alt="Player statistics on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Lineups and formation</strong> · Both starting elevens on a shared pitch, with player ratings and events.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/fixtures-lineups.webp"><img src="docs/demo/gallery/desktop/fixtures-lineups.webp" width="510" alt="Lineups and formation on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/fixtures-lineups.webp"><img src="docs/demo/gallery/mobile/fixtures-lineups.webp" width="200" alt="Lineups and formation on mobile"></a></td>
    </tr>
  </tbody>
</table>

</details>

### Rankings and statistics

Compare players by round or season, then explore individual results and club progress. The game scores predictions against the result after 90 minutes plus stoppage time. [Scoring and deadlines](docs/decisions/0007-prediction-score-and-deadline.md).

<details>
<summary>Leaderboards, revealed predictions, and charts</summary>

<table>
  <thead>
    <tr><th>Desktop</th><th>Mobile</th></tr>
  </thead>
  <tbody>
    <tr><td colspan="2"><strong>Rankings</strong> · Season positions and points from completed rounds.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/player-rankings.webp"><img src="docs/demo/gallery/desktop/player-rankings.webp" width="510" alt="Rankings on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/player-rankings.webp"><img src="docs/demo/gallery/mobile/player-rankings.webp" width="200" alt="Rankings on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Round and player selection</strong> · Choose a completed round and find a participant.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/player-shared-selection.webp"><img src="docs/demo/gallery/desktop/player-shared-selection.webp" width="510" alt="Round and player selection on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/player-shared-selection.webp"><img src="docs/demo/gallery/mobile/player-shared-selection.webp" width="200" alt="Round and player selection on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Revealed player picks</strong> · A participant's predictions and points for a completed round.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/player-shared-picks.webp"><img src="docs/demo/gallery/desktop/player-shared-picks.webp" width="510" alt="Revealed player picks on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/player-shared-picks.webp"><img src="docs/demo/gallery/mobile/player-shared-picks.webp" width="200" alt="Revealed player picks on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Game statistics</strong> · Round-by-round results across the prediction game.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/player-stats-overview.webp"><img src="docs/demo/gallery/desktop/player-stats-overview.webp" width="510" alt="Game statistics on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/player-stats-overview.webp"><img src="docs/demo/gallery/mobile/player-stats-overview.webp" width="200" alt="Game statistics on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Personal statistics</strong> · Signed-in player's results and points by round.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/player-stats-personal.webp"><img src="docs/demo/gallery/desktop/player-stats-personal.webp" width="510" alt="Personal statistics on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/player-stats-personal.webp"><img src="docs/demo/gallery/mobile/player-stats-personal.webp" width="200" alt="Personal statistics on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Club progress</strong> · Cumulative league points by matchday for a selected club.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/player-stats-league.webp"><img src="docs/demo/gallery/desktop/player-stats-league.webp" width="510" alt="Club progress on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/player-stats-league.webp"><img src="docs/demo/gallery/mobile/player-stats-league.webp" width="200" alt="Club progress on mobile"></a></td>
    </tr>
  </tbody>
</table>

</details>

### Account and accessibility

See the account flow and how larger text looks with comfort mode enabled.

<details>
<summary>Account screens, password reset, and comfort mode</summary>

<table>
  <thead>
    <tr><th>Desktop</th><th>Mobile</th></tr>
  </thead>
  <tbody>
    <tr><td colspan="2"><strong>Sign in</strong> · Email and password form.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/account-sign-in.webp"><img src="docs/demo/gallery/desktop/account-sign-in.webp" width="510" alt="Sign in on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/account-sign-in.webp"><img src="docs/demo/gallery/mobile/account-sign-in.webp" width="200" alt="Sign in on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Registration</strong> · New account form and required fields.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/account-registration.webp"><img src="docs/demo/gallery/desktop/account-registration.webp" width="510" alt="Registration on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/account-registration.webp"><img src="docs/demo/gallery/mobile/account-registration.webp" width="200" alt="Registration on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Forgot password</strong> · Request a reset link by email.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/account-password-recovery.webp"><img src="docs/demo/gallery/desktop/account-password-recovery.webp" width="510" alt="Forgot password on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/account-password-recovery.webp"><img src="docs/demo/gallery/mobile/account-password-recovery.webp" width="200" alt="Forgot password on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Set a new password</strong> · The form opened from a reset link delivered to the local test inbox.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/account-password-reset-form.webp"><img src="docs/demo/gallery/desktop/account-password-reset-form.webp" width="510" alt="Set a new password on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/account-password-reset-form.webp"><img src="docs/demo/gallery/mobile/account-password-reset-form.webp" width="200" alt="Set a new password on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Signed-in profile</strong> · Account details and player shortcuts.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/account-profile.webp"><img src="docs/demo/gallery/desktop/account-profile.webp" width="510" alt="Signed-in profile on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/account-profile.webp"><img src="docs/demo/gallery/mobile/account-profile.webp" width="200" alt="Signed-in profile on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Change password</strong> · Password change form for an authenticated player.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/account-change-password.webp"><img src="docs/demo/gallery/desktop/account-change-password.webp" width="510" alt="Change password on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/account-change-password.webp"><img src="docs/demo/gallery/mobile/account-change-password.webp" width="200" alt="Change password on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Appearance dialog</strong> · The comfort mode control and its effect.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/appearance-comfort-dialog.webp"><img src="docs/demo/gallery/desktop/appearance-comfort-dialog.webp" width="510" alt="Appearance dialog on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/appearance-comfort-dialog.webp"><img src="docs/demo/gallery/mobile/appearance-comfort-dialog.webp" width="200" alt="Appearance dialog on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Comfort mode in use</strong> · A larger-text reading view with more space between controls.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/appearance-comfort-view.webp"><img src="docs/demo/gallery/desktop/appearance-comfort-view.webp" width="510" alt="Comfort mode in use on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/appearance-comfort-view.webp"><img src="docs/demo/gallery/mobile/appearance-comfort-view.webp" width="200" alt="Comfort mode in use on mobile"></a></td>
    </tr>
  </tbody>
</table>

</details>

### Administration

Manage the active season, check import health, and publish rounds from a dedicated workspace.

<details>
<summary>Admin access, season controls, and round publication</summary>

<table>
  <thead>
    <tr><th>Desktop</th><th>Mobile</th></tr>
  </thead>
  <tbody>
    <tr><td colspan="2"><strong>Admin sign in</strong> · Dedicated access to administration.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/admin-sign-in.webp"><img src="docs/demo/gallery/desktop/admin-sign-in.webp" width="510" alt="Admin sign in on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/admin-sign-in.webp"><img src="docs/demo/gallery/mobile/admin-sign-in.webp" width="200" alt="Admin sign in on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Active season and synchronization</strong> · Current season selection and data sync status.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/admin-season-and-sync.webp"><img src="docs/demo/gallery/desktop/admin-season-and-sync.webp" width="510" alt="Active season and synchronization on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/admin-season-and-sync.webp"><img src="docs/demo/gallery/mobile/admin-season-and-sync.webp" width="200" alt="Active season and synchronization on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Round builder</strong> · Matchday blocks and the round draft.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/admin-round-builder.webp"><img src="docs/demo/gallery/desktop/admin-round-builder.webp" width="510" alt="Round builder on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/admin-round-builder.webp"><img src="docs/demo/gallery/mobile/admin-round-builder.webp" width="200" alt="Round builder on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Saved rounds</strong> · Previously published rounds and their match selections.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/admin-saved-rounds.webp"><img src="docs/demo/gallery/desktop/admin-saved-rounds.webp" width="510" alt="Saved rounds on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/admin-saved-rounds.webp"><img src="docs/demo/gallery/mobile/admin-saved-rounds.webp" width="200" alt="Saved rounds on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Active season confirmation</strong> · Review a season change before applying it.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/admin-active-season-dialog.webp"><img src="docs/demo/gallery/desktop/admin-active-season-dialog.webp" width="510" alt="Active season confirmation on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/admin-active-season-dialog.webp"><img src="docs/demo/gallery/mobile/admin-active-season-dialog.webp" width="200" alt="Active season confirmation on mobile"></a></td>
    </tr>
    <tr><td colspan="2"><strong>Round publication confirmation</strong> · Review the matchday selection before publishing.</td></tr>
    <tr>
      <td><a href="docs/demo/gallery/desktop/admin-publish-round-dialog.webp"><img src="docs/demo/gallery/desktop/admin-publish-round-dialog.webp" width="510" alt="Round publication confirmation on desktop"></a></td>
      <td><a href="docs/demo/gallery/mobile/admin-publish-round-dialog.webp"><img src="docs/demo/gallery/mobile/admin-publish-round-dialog.webp" width="200" alt="Round publication confirmation on mobile"></a></td>
    </tr>
  </tbody>
</table>

</details>

## Run the demo

With Docker and Compose running, use these commands from the repository root:

```sh
docker compose -f deploy/rehearsal/compose.yaml build
docker compose -f deploy/rehearsal/compose.yaml up --detach --wait
```

Open [localhost:8443](https://localhost:8443). The demo has an isolated database, fictional fixtures, and a local HTTPS certificate. Register an address under `example.test`, select **Moje typy** (My predictions), and save a score. The walkthrough covers local certificate trust and an automated end-to-end check. [Deployment rehearsal](docs/operations/rehearsal.md).

## Architecture

| Area | Responsibility |
| --- | --- |
| [`frontend/`](frontend/) | React and TypeScript, feature-based modules, shadcn/ui, and Zod validation |
| [`backend/`](backend/) | Java 25, Spring Boot, feature packages, JdbcClient queries, and Flyway migrations |
| [`scripts/`](scripts/) | Local database setup, diagnostics, and the fixture import cycle |
| [`deploy/rehearsal/`](deploy/rehearsal/) | Flyway, demo data, and the application behind Caddy |

After an import, Spring sends the new fixture revision over WebSocket. React fetches the updated data through REST. PostgreSQL is the source of truth, and Redis caches the public fixture catalog. [Architecture guide](docs/architecture.md) · [Architecture decisions](docs/decisions/README.md).

## Quality checks

[CI](.github/workflows/ci.yml) checks the frontend, Node scripts, and backend with PostgreSQL and Redis in Testcontainers. It then builds both images and verifies signup, prediction persistence, and WSS over HTTPS. The application is available as a local demo. [Documentation index](docs/README.md).
