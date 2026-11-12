import { EvalWizard } from "@/components/EvalWizard";
import { readOnly } from "@/server/mode";

export const dynamic = "force-dynamic";

export default function EvalPage() {
  return (
    <main>
      <EvalWizard readOnly={readOnly()} />
    </main>
  );
}
