import { underConstructionMetadata } from "@/components/site/page-metadata";
import { UnderConstruction } from "@/components/site/UnderConstruction";

export const generateMetadata = () => underConstructionMetadata("latest");

export default function Page() {
  return <UnderConstruction page="latest" phase={4} />;
}
