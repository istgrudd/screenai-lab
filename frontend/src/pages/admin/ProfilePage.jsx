import StaffProfileSummary from "@/components/StaffProfileSummary";

export default function AdminProfilePage() {
  return (
    <StaffProfileSummary
      title="Super Admin Profile"
      description="Account summary for the current super admin."
      editPath="/admin/profile/edit"
    />
  );
}
