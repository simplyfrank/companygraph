import type { JourneyData } from "../components/JourneyCanvas";

export interface UserStory {
  id: string;
  narrative: string;
  activityId: string;
  activityName: string;
  roleId?: string;
  roleName?: string;
  systemIds: string[];
  locationId?: string;
  locationName?: string;
}

function storyId(activityId: string): string {
  return `us_${activityId}`;
}

function goalPhrase(journeyName: string): string {
  return `the ${journeyName.toLowerCase()} workflow completes`;
}

export function formulateUserStories(data: JourneyData, journeyName: string): UserStory[] {
  const stories: UserStory[] = [];

  for (const activity of data.activities) {
    const roles = data.roles.filter((r) => r.columns.includes(activity.column));
    const systems = data.systems.filter((s) => s.usages.some((u) => u.column === activity.column));
    const locs = data.locations.filter((l) => l.columns.includes(activity.column));

    const primaryRole = roles[0];
    const primaryLoc = locs[0];

    const persona = primaryRole?.name ?? "user";
    const action = activity.name;
    const benefit = goalPhrase(journeyName);

    const narrative = `As a ${persona}, I want to ${action}, so that ${benefit}.`;

    const story: UserStory = {
      id: storyId(activity.id),
      narrative,
      activityId: activity.id,
      activityName: activity.name,
      systemIds: systems.map((s) => s.id),
    };
    if (primaryRole?.id) { story.roleId = primaryRole.id; story.roleName = primaryRole.name; }
    if (primaryLoc?.id) { story.locationId = primaryLoc.id; story.locationName = primaryLoc.name; }
    stories.push(story);
  }

  return stories;
}
