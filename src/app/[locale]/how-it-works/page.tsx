import { underConstructionMetadata } from "@/components/site/page-metadata";
import { UnderConstruction } from "@/components/site/UnderConstruction";

export const generateMetadata = () => underConstructionMetadata("how");

export default function Page() {
  return <UnderConstruction page="how" phase={4} />;
}
