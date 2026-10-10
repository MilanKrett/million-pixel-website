import { underConstructionMetadata } from "@/components/site/page-metadata";
import { UnderConstruction } from "@/components/site/UnderConstruction";

export const generateMetadata = () => underConstructionMetadata("privacy");

export default function Page() {
  return <UnderConstruction page="privacy" phase={4} />;
}
