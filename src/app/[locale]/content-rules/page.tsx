import { underConstructionMetadata } from "@/components/site/page-metadata";
import { UnderConstruction } from "@/components/site/UnderConstruction";

export const generateMetadata = () => underConstructionMetadata("rules");

export default function Page() {
  return <UnderConstruction page="rules" phase={4} />;
}
