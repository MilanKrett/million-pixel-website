import { LegalPage } from "@/components/site/LegalPage";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = () => pageMetadata("rules", "/content-rules");

export default function Page() {
  return <LegalPage doc="rules" />;
}
