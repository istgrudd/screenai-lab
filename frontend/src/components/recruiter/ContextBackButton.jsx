import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getReturnLabel,
  getSafeReturnPath,
  isInternalPath,
} from "@/lib/navigationContext";

export default function ContextBackButton({
  fallback = "/recruiter/candidates",
  fallbackLabel = "Kembali",
  className,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const label = getReturnLabel(location.state, fallbackLabel);

  const goBack = () => {
    const from = location.state?.from;
    if (isInternalPath(from)) {
      navigate(getSafeReturnPath(location.state, fallback));
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(fallback);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={goBack}
      className={className}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
