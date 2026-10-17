export type Team = { id: number; name: string; description: string | null; createdAt: string; updatedAt: string; memberCount?: number };

export async function loadTeamOptions(): Promise<Team[]> {
 const teams: Team[] = [];
 for (let offset = 0; ; offset += 500) {
  const response = await fetch(`/v1/teams?limit=500&offset=${offset}&sortBy=name`);
  if (!response.ok) throw new Error('Unable to load teams.');
  const payload = await response.json() as { data: Team[]; meta: { total: number } };
  teams.push(...payload.data);
  if (teams.length >= payload.meta.total) return teams;
  if (!payload.data.length) throw new Error('Incomplete teams.');
 }
}
