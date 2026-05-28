import StaffProfileSummary from "@/components/StaffProfileSummary";

export default function RecruiterProfilePage() {
  return (
    <StaffProfileSummary
      title="Recruiter Profile"
      description="Account summary for the current recruiter."
      editPath="/recruiter/profile/edit"
    />
  );
}
