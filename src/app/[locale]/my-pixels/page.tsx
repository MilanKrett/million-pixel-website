import { underConstructionMetadata } from "@/components/site/page-metadata";
import { UnderConstruction } from "@/components/site/UnderConstruction";

export const generateMetadata = () => underConstructionMetadata("mine");

export default function Page() {
  return <UnderConstruction page="mine" phase={3} />;
}
