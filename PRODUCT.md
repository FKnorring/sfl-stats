# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

SFL CS2 players and teams, plus fans and colleagues who want to follow a player's company team. Players and teams use the product to understand performance and scout or compare players, teams, and opponents.

## Product Purpose

Help people follow and scout the Svenska Företagsligan (SFL) CS2 league through performance data derived from parsed demos, team and player views, standings, match history, and comparisons. Success means making it easier to understand how players and teams are performing and to compare them while following the league.

## Positioning

The product turns SFL CS2 demo data into player and team performance views and opponent comparisons. It grounds player statistics in verified in-game identities, with scraped roster data connecting those identities to league teams and Faceit data providing supplementary context.

## Operating Context

People use a public web dashboard to follow teams and players, review standings and match/demo history, and compare performance or opponents. Some visitors are SFL participants scouting; others are fans or colleagues following a player's company team. Team-follow preferences are stored in the current browser, not tied to an account or synchronized across devices.

## Capabilities and Constraints

- The app presents SFL CS2 standings, player and team statistics, player/team pages, team comparisons, match schedules and ingested-demo history, and browser-local team following.
- Parsed `.dem` files are the source of in-game statistics. Roster nicknames are claims that must be matched to verified in-game player identities; uncertain matches may need human review, and demo parsing or attribution can be imperfect.
- SFL Rating v2 is a versioned, provisional custom performance score, not an official HLTV rating. It uses validated participated rounds and a frozen SFL reference corpus whose v2 values are scaled from v1 corpus data. Unreliable or incomplete demos are unrated; profile and roster averages are participated-round weighted and show rated-demo coverage.
- Faceit statistics are supplementary context, not the source of SFL league statistics or SFL Rating.
- The public app is read-only with respect to the database. Data is populated and enriched by separate ingestion and sync processes; schedule, roster, and demo data may be incomplete or stale between updates.
- The relationship between a Demo (one parsed file) and a Match (a league game) is not confirmed, particularly for playoff series. Do not treat every demo as a definitive match or series result. A displayed official result may represent a series result rather than the score of that demo.

## Brand Commitments

The product is named `sfl-stats` and is about the Svenska Företagsligan (SFL) CS2 league. Do not imply that SFL Rating is an official HLTV rating or that supplementary Faceit data is an official SFL statistic.

## Evidence on Hand

- Parsed SFL CS2 demo data and derived player/round statistics in the configured database.
- Scraped SFL roster and schedule data, plus supplementary Faceit data for players matched to Steam identities.
- The product's standings, leaderboard, player/team views, comparisons, and demo-history pages are demonstrations of the current product. Available data depends on the configured database and upstream source freshness.
- No confirmed testimonials, independent endorsements, or official status for SFL Rating are established here; do not invent them.

## Product Principles

- Ground player statistics in verified in-game identities; preserve uncertainty where matching is unresolved.
- Help participants compare performance and scout opponents while also serving people following a company team.
- Keep demo-derived league statistics distinct from supplementary Faceit data and official tournament results.
- Communicate the provisional nature and coverage limits of custom ratings; do not present them as official HLTV ratings.
- Preserve incomplete or uncertain source data transparently rather than guessing.
