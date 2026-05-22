# Flight Tracker

Look up and track flight status (BKK <-> SG primarily).

## Telegram Commands

- `/flight <number>` -- Look up a flight (e.g., `/flight SQ713`)
- `/flight list` -- Show tracked flights
- `/flight track <number>` -- Add to tracked flights
- `/flight untrack <number>` -- Remove from tracked flights

## API

Uses AviationStack free tier (500 calls/month) when `AVIATIONSTACK_API_KEY` is set. Falls back to basic cached info without a key.

## Data Storage

Tracked flights stored in `~/.claude-relay/tracked-flights.json`.

## After Running

Show flight status and offer to track/untrack or refresh.
