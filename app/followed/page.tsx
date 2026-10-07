import { FollowedTeamPicker } from "@/components/followed-team-picker"

export default function FollowedPage() {
  return (
    <div className="flex min-h-svh flex-col gap-4 p-6">
      <h1 className="font-heading text-lg font-medium">Followed teams</h1>
      <p className="text-sm text-muted-foreground">
        Choose a team to open its dashboard. Your favorite becomes your home
        page.
      </p>
      <FollowedTeamPicker />
    </div>
  )
}
