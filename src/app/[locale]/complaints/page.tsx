import { LegalPage } from "@/components/site/LegalPage";
import { pageMetadata } from "@/lib/seo";

export const generateMetadata = () => pageMetadata("complaints", "/complaints");

export default function Page() {
  return <LegalPage doc="complaints" />;
}
