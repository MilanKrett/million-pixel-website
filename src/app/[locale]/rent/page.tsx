import { underConstructionMetadata } from "@/components/site/page-metadata";
import { UnderConstruction } from "@/components/site/UnderConstruction";

export const generateMetadata = () => underConstructionMetadata("rent");

export default function Page() {
  return <UnderConstruction page="rent" phase={2} />;
}
